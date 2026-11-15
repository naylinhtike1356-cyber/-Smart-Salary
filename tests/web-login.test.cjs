const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const html = fs.readFileSync('web_dist/index.html', 'utf8');
const helperStart = html.indexOf('const GoogleDriveWebHelper =');
const helperEnd = html.indexOf('\n        };', helperStart) + '\n        };'.length;
const flowStart = html.indexOf('window.startWebSignIn =');
const flowEnd = html.indexOf('\n        window.showWebLoginModal', flowStart);
test('all embedded and public JavaScript parses before deployment', () => {
    for (const file of ['web_dist/index.html', 'app/src/main/assets/index.html']) {
        for (const match of fs.readFileSync(file, 'utf8').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
            if (!/\bsrc\s*=/.test(match[1])) new vm.Script(match[2], {filename:file});
        }
    }
});
function setup() {
    const values = new Map();
    const storage = { getItem: k => values.get(k) || null, setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k) };
    const nodes = {};
    const element = () => ({ classList: { remove() {} }, setAttribute() {}, removeAttribute() {}, parentElement: { appendChild(n) { nodes[n.id] = n; } } });
    nodes['login-btn'] = element(); nodes['login-overlay'] = element();
    let config, requests = 0, reloads = 0;
    const timers = new Map(); let timerId = 0;
    const c = vm.createContext({ window: {}, document: { getElementById: id => nodes[id], createElement: element }, localStorage: storage, sessionStorage: storage, setTimeout: fn => {timers.set(++timerId,fn); return timerId;}, clearTimeout: id => timers.delete(id), location: { reload() { reloads++; } }, google: { accounts: { oauth2: { initTokenClient(opts) { config = opts; return { requestAccessToken(opts) { requests++; assert.equal(opts.prompt, 'select_account'); } }; } } } } });
    c.window.google = c.google;
    vm.runInContext(html.slice(helperStart, helperEnd) + '\n' + html.slice(flowStart, flowEnd) + '\nthis.helper = GoogleDriveWebHelper;', c);
    return { c, nodes, values, timers, config: () => config, requests: () => requests, reloads: () => reloads };
}
test('one click opens Google directly and repeated clicks do not create another popup', () => {
    const s = setup(); s.c.window.startWebSignIn(); s.c.window.startWebSignIn();
    assert.equal(s.requests(), 1); assert.equal(s.nodes['login-btn'].disabled, true);
});
test('uses the replacement OAuth client even when a browser saved an old override', () => {
    const s = setup();
    s.values.set('web_google_client_id', 'retired-client.apps.googleusercontent.com');
    s.c.window.startWebSignIn();
    assert.equal(s.config().client_id, '285974457673-fua82k83c0u3piev9gma842sth46rlc5.apps.googleusercontent.com');
    assert.equal(s.values.has('web_google_client_id'), false);
});
test('popup blocking and cancellation leave a visible retryable error', () => {
    for (const type of ['popup_failed_to_open', 'popup_closed']) {
        const s = setup(); s.c.window.startWebSignIn(); s.config().error_callback({type});
        assert.ok(s.nodes['web-sign-in-status'].textContent.length > 20);
        assert.equal(s.nodes['login-btn'].disabled, false); assert.equal(s.reloads(), 0);
        s.c.window.startWebSignIn(); assert.equal(s.requests(), 2);
    }
});
test('OAuth refusal stays on login without marking an account signed in', () => {
    const s = setup(); s.c.window.startWebSignIn(); s.config().callback({error:'access_denied'});
    assert.match(s.nodes['web-sign-in-status'].textContent, /access_denied/);
    assert.equal(s.values.has('web_logged_in'), false); assert.equal(s.reloads(), 0);
});
test('Google SDK unavailable gives a retryable error instead of a second modal', () => {
    const s = setup(); s.c.google = undefined; s.c.window.google = undefined; s.c.window.startWebSignIn();
    assert.equal(s.requests(), 0); assert.equal(s.nodes['login-btn'].disabled, false);
    assert.ok(s.nodes['web-sign-in-status'].textContent);
});
test('only verified account details unlock Full mode and reload once', () => {
    const s = setup();
    vm.runInContext("GoogleDriveWebHelper.fetchUserInfo = (token, ok) => ok({sub:'test-id',email:'test@example.test',name:'Test'});", s.c);
    s.c.window.startWebSignIn(); s.config().callback({access_token:'fake-test-token',expires_in:3600,scope:'openid email profile'});
    assert.equal(s.values.get('web_entry_mode'), 'FULL');
    assert.equal(s.values.get('web_user_id'), 'test-id'); assert.equal(s.reloads(), 1);
});
test('failed identity verification does not create a signed-in session', () => {
    const s = setup();
    vm.runInContext("GoogleDriveWebHelper.fetchUserInfo = (token, ok, fail) => fail('Identity verification failed');", s.c);
    s.c.window.startWebSignIn(); s.config().callback({access_token:'fake-test-token'});
    assert.equal(s.values.has('web_logged_in'), false); assert.equal(s.values.has('web_google_access_token'), false);
    assert.equal(s.reloads(), 0); assert.equal(s.nodes['login-btn'].disabled, false);
});

test('login requests profile access; Drive consent is requested only for cloud actions', () => {
    const s = setup(); s.c.window.startWebSignIn();
    assert.equal(s.config().scope.includes('drive.appdata'), false);
    s.config().error_callback({type:'popup_closed'});
    s.c.helper.initTokenClient(()=>{},()=>{},'user-a');
    assert.equal(s.config().scope.includes('drive.appdata'), true);
});
test('Facebook and Instagram browsers show external browser guidance without launching OAuth', () => {
    for (const userAgent of ['Mozilla/5.0 [FBAN/FB4A;FBAV/500]', 'Mozilla/5.0 Instagram 300']) {
        const s=setup(); s.c.window.navigator={userAgent}; s.c.window.startWebSignIn();
        assert.equal(s.requests(),0); assert.equal(s.nodes['login-btn'].disabled,false);
        assert.match(s.nodes['web-sign-in-status'].textContent,/Chrome.*Safari/);
    }
});
test('a missing access token never creates an account or changes mode', () => {
    const s=setup(); s.c.window.startWebSignIn(); s.config().callback({});
    assert.equal(s.values.has('web_logged_in'),false);
    assert.equal(s.values.has('web_google_access_token'),false);
    assert.equal(s.nodes['login-btn'].disabled,false);
});
test('timed out OAuth callbacks cannot sign in after a retry starts', () => {
    const s=setup(); s.c.helper.fetchUserInfo=(token,ok)=>ok({sub:'late-user'});
    s.c.window.startWebSignIn(); const old=s.config();
    s.timers.get(s.c.helper.authTimer)();
    assert.equal(s.nodes['login-btn'].disabled,false);
    s.c.window.startWebSignIn();
    old.callback({access_token:'late-token',expires_in:3600});
    assert.equal(s.values.has('web_user_id'),false); assert.equal(s.reloads(),0);
});
test('late userinfo responses cannot overwrite an account changed in another tab', () => {
    const s=setup(); let verify;
    s.c.helper.fetchUserInfo=(token,ok)=>{verify=ok;};
    s.c.window.startWebSignIn(); s.config().callback({access_token:'test-token',expires_in:3600});
    assert.equal(s.values.has('web_google_access_token'),false);
    s.values.set('web_user_id','user-b'); verify({sub:'user-a'});
    assert.equal(s.values.get('web_user_id'),'user-b');
    assert.equal(s.values.has('web_google_access_token'),false); assert.equal(s.reloads(),0);
});
test('denied Drive permission preserves the signed-in identity and does not run a cloud action', () => {
    const s=setup(); s.values.set('web_user_id','user-a'); let error,completed=false;
    s.c.helper.fetchUserInfo=(token,ok)=>ok({sub:'user-a'});
    s.c.helper.initTokenClient(()=>completed=true,message=>error=message,'user-a');
    s.config().callback({access_token:'profile-token',expires_in:3600,scope:'openid email profile'});
    assert.match(error,/Google Drive/); assert.equal(completed,false);
    assert.equal(s.values.get('web_user_id'),'user-a'); assert.equal(s.values.has('web_google_access_token'),false);
});
test('sign out invalidates pending login responses and preserves account salary data', () => {
    const s=setup(); s.values.set('dailySalaryTrackerState:user:user-a','saved-salary');
    const begin=html.indexOf('window.AndroidBridge = {');
    const end=html.indexOf('\n            };',begin)+'\n            };'.length;
    vm.runInContext(html.slice(begin,end),s.c);
    s.c.window.startWebSignIn(); const old=s.config();
    s.c.window.AndroidBridge.signOut();
    old.callback({access_token:'late-token',expires_in:3600});
    assert.equal(s.values.has('web_logged_in'),false); assert.equal(s.values.get('web_entry_mode'),'NONE');
    assert.equal(s.values.get('dailySalaryTrackerState:user:user-a'),'saved-salary'); assert.equal(s.reloads(),1);
});

test('Basic mode shows the top account card; Full mode replaces it with the signed-in profile', () => {
    const s = setup();
    const hidden = new Map();
    const elements = new Map();
    s.c.getElement = id => {
        if (!elements.has(id)) elements.set(id, {classList:{add(v){if(v==='hidden')hidden.set(id,true);},remove(v){if(v==='hidden')hidden.set(id,false);}}});
        return elements.get(id);
    };
    s.c.window.AndroidBridge = {getUserDisplayName:()=> 'Test',getUserEmail:()=> 'test@example.test'};
    const begin = html.indexOf('const applyBasicModeUI =');
    const end = html.indexOf("getElement('select-full-mode-btn').addEventListener", begin);
    vm.runInContext(html.slice(begin, end) + '\napplyBasicModeUI();', s.c);
    assert.equal(hidden.get('account-sign-in-card'), false);
    assert.equal(hidden.get('user-profile-section'), true);
    vm.runInContext('applyFullModeUI();', s.c);
    assert.equal(hidden.get('account-sign-in-card'), true);
    assert.equal(hidden.get('user-profile-section'), false);
});
