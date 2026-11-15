const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const html = fs.readFileSync('web_dist/index.html', 'utf8');
const storage = () => {
    const values = new Map();
    return {values, getItem:k=>values.get(k) ?? null, setItem:(k,v)=>values.set(k,String(v)), removeItem:k=>values.delete(k)};
};
function helper(fetch) {
    const localStorage = storage(), sessionStorage = storage();
    localStorage.setItem('web_user_id', 'user-a');
    sessionStorage.setItem('web_google_access_token', 'fake-token');
    sessionStorage.setItem('web_google_token_user_id', 'user-a');
    sessionStorage.setItem('web_google_drive_granted', 'true');
    sessionStorage.setItem('web_google_token_expires_at', Date.now()+3600000);
    const c = vm.createContext({localStorage,sessionStorage,fetch,console:{error(){}},window:{},setTimeout:()=>1,clearTimeout(){}});
    const start = html.indexOf('const GoogleDriveWebHelper =');
    const end = html.indexOf('\n        };',start)+'\n        };'.length;
    vm.runInContext(html.slice(start,end)+'\nthis.helper = GoogleDriveWebHelper;',c);
    return c;
}
const response = (data,status=200) => ({ok:status>=200&&status<300,status,json:async()=>data,text:async()=>typeof data==='string'?data:JSON.stringify(data)});
const restore = c => new Promise((resolve,reject)=>c.helper.restore(resolve,error=>reject(new Error(error))));
test('missing backup performs only GET and never creates a new empty file',async()=>{
    const calls=[];
    const c=helper(async(url,opts)=>{calls.push([url,opts]);return response({files:[]});});
    await assert.rejects(restore(c));
    assert.equal(calls.length,1); assert.equal(calls[0][1].method,undefined);
});
test('Drive 401 clears expired token and never treats the error as a missing file',async()=>{
    let requests=0;
    const c=helper(async()=>{requests++;return response({error:{code:401}},401);});
    await assert.rejects(restore(c));
    assert.equal(requests,1);assert.equal(c.helper.accessToken,null);
    assert.equal(c.sessionStorage.getItem('web_google_access_token'),null);
});
test('Drive 403 is surfaced without creating a file',async()=>{
    let requests=0;
    const c=helper(async()=>{requests++;return response({},403);});
    await assert.rejects(restore(c),/403/); assert.equal(requests,1);
});
test('restore skips a newer empty file and downloads the latest nonempty backup',async()=>{
    const calls=[];
    const backup=JSON.stringify({timeData:[{date:'2026-09-12',type:'regular_base'}],settings:{}});
    const c=helper(async url=>{
        calls.push(url);
        return calls.length===1?response({files:[{id:'empty',size:'0'},{id:'valid',size:'123'}]}):response(backup);
    });
    assert.equal(await restore(c),backup);
    assert.ok(calls[0].includes('orderBy=modifiedTime%20desc'));
    assert.ok(calls[1].includes('/valid?alt=media'));
});
test('empty downloaded content is an error rather than a successful backup event',async()=>{
    let calls=0;
    const c=helper(async()=>++calls===1?response({files:[{id:'a'}]}):response(''));
    await assert.rejects(restore(c));
});
test('account change while downloading rejects the old restore result',async()=>{
    let calls=0;
    const c=helper(async()=>{
        if(++calls===1)return response({files:[{id:'a'}]});
        c.localStorage.setItem('web_user_id','user-b');
        return response(JSON.stringify({timeData:[{date:'2025-02-14'}],settings:{}}));
    });
    await assert.rejects(restore(c));
});
test('expired token requires reauthorization bound to the original account',async()=>{
    const c=helper(async()=>{throw new Error('must not fetch yet');});
    c.sessionStorage.removeItem('web_google_token_expires_at');
    let expected;
    c.helper.initTokenClient=(ok,fail,id)=>{expected=id;fail('needs reauthorization');};
    await assert.rejects(restore(c),/reauthorization/);assert.equal(expected,'user-a');
});
test('a token from another account cannot be used to restore current account data',async()=>{
    const c=helper(async()=>{throw new Error('must not fetch with another account token');});
    c.sessionStorage.setItem('web_google_token_user_id','user-b'); let expected;
    c.helper.initTokenClient=(ok,fail,id)=>{expected=id;fail('reauthorization required');};
    await assert.rejects(restore(c),/reauthorization/); assert.equal(expected,'user-a');
});
test('account switch during backup lookup prevents upload of the previous account salary',async()=>{
    const calls=[];
    const c=helper(async(url,opts)=>{
        calls.push([url,opts]); c.localStorage.setItem('web_user_id','user-b');
        return response({files:[{id:'old-account-file'}]});
    });
    await assert.rejects(new Promise((resolve,reject)=>c.helper.backup('{"private":"salary"}',resolve,message=>reject(new Error(message)))));
    assert.equal(calls.length,1); assert.equal(calls[0][1].method,undefined);
});
test('choosing another Google account during restore does not replace the signed-in identity',async()=>{
    const c=helper(async()=>{throw new Error('no fetch');});
    let config;
    c.google={accounts:{oauth2:{initTokenClient:opts=>{config=opts;return{requestAccessToken(){}};}}}};
    c.window.google=c.google;
    c.helper.fetchUserInfo=(token,ok)=>ok({sub:'user-b'});
    let error;
    c.helper.initTokenClient(()=>{throw new Error('must reject other account');},message=>error=message,'user-a');
    config.callback({access_token:'fake-other-token',expires_in:3600});
    assert.ok(error);assert.equal(c.localStorage.getItem('web_user_id'),'user-a');
    assert.equal(c.helper.accessToken,null);
});
function ui() {
    const localStorage=storage();
    localStorage.setItem('web_logged_in','true');localStorage.setItem('web_login_type','real');localStorage.setItem('web_user_id','user-a');
    const c=vm.createContext({localStorage,window:{AndroidBridge:{isWebMock:true}},state:{timeData:[{date:'2026-10-01',type:'regular_base'}],monthlyExtras:[],settings:{},currentDate:new Date(),viewingYear:2026},applyTranslations(){},toYyyyMmDd:d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'),render(){},console});
    const stateStart=html.indexOf('const LEGACY_STATE_STORAGE_KEY =');
    const stateEnd=html.indexOf('// --- FLATPICKR ---',stateStart);
    const restoreStart=html.indexOf('const robustParseAndNormalize =');
    const restoreEnd=html.indexOf('window.onCloudResult =',restoreStart);
    vm.runInContext(html.slice(stateStart,stateEnd)+html.slice(restoreStart,restoreEnd)+'\nthis.apply = applyRestoredBackup; this.key = getStateStorageKey();',c);
    c.localStorage.setItem(c.key,JSON.stringify(c.state));
    return c;
}
test('actual storage → restore → render path restores records and shows their month',()=>{
    const c=ui(),old=c.localStorage.getItem(c.key);
    let rendered;
    c.render=()=>rendered={month:c.state.currentDate.getMonth(),count:c.state.timeData.length};
    assert.equal(c.apply(JSON.stringify({timeData:[{date:'2025-02-14',type:'regular_base'}],settings:{}})),1);
    assert.equal(rendered.month,1);assert.equal(rendered.count,1);assert.equal(c.state.viewingYear,2025);
    assert.equal(c.localStorage.getItem(c.key+':before-restore'),old);
    assert.equal(c.localStorage.getItem('dailySalaryTrackerState:user:user-b'),null);
});
test('malformed, blank and empty-record backups leave existing data unchanged',()=>{
    for(const content of ['', '{', '[]','null','{"settings":null}',JSON.stringify({timeData:[{date:'bad'}],settings:{}}),JSON.stringify({timeData:[],settings:{}})]) {
        const c=ui(),old=c.localStorage.getItem(c.key);
        assert.throws(()=>c.apply(content));
        assert.equal(c.localStorage.getItem(c.key),old);
    }
});
test('render failure rolls back local storage and in-memory records',()=>{
    const c=ui(),old=c.localStorage.getItem(c.key);
    c.render=()=>{throw new Error('render failed');};
    assert.throws(()=>c.apply(JSON.stringify({timeData:[{date:'2025-02-14'}],settings:{}})),/render failed/);
    assert.equal(c.localStorage.getItem(c.key),old);assert.equal(c.state.timeData[0].date,'2026-10-01');
});
test('Basic mode writes only device data even when a previously signed-in account remains',()=>{
    const c=ui(); const accountData=c.localStorage.getItem(c.key);
    c.localStorage.setItem('web_entry_mode','BASIC');
    vm.runInContext('saveState()',c);
    assert.equal(c.localStorage.getItem(c.key),accountData);
    assert.equal(JSON.parse(c.localStorage.getItem('dailySalaryTrackerState:basic')).timeData.length,1);
});
test('account change cannot save the old in-memory salary under the new account',()=>{
    const c=ui(); let reloads=0; c.location={reload(){reloads++;}};
    vm.runInContext('loadState()',c);
    c.localStorage.setItem('web_user_id','user-b');
    vm.runInContext('saveState()',c);
    assert.equal(c.localStorage.getItem('dailySalaryTrackerState:user:user-b'),null);
    assert.equal(reloads,1);
});
test('Drive download → validation → account storage → rendering works together',async()=>{
    const u=ui();let calls=0,rendered=false;
    u.render=()=>{rendered=true;};
    const c=helper(async()=>++calls===1?response({files:[{id:'saved'}]}):response({timeData:[{date:'2025-02-14',type:'regular_base',pay:1000}],settings:{}}));
    await new Promise((resolve,reject)=>c.helper.restore(data=>{
        try{u.apply(data);resolve();}catch(error){reject(error);}
    },error=>reject(new Error(error))));
    assert.equal(calls,2);assert.equal(rendered,true);
    assert.equal(JSON.parse(u.localStorage.getItem(u.key)).timeData[0].pay,1000);
    assert.equal(u.state.currentDate.getFullYear(),2025);
});
test('iPhone manifest and PNG icons have valid sizes and a standalone start URL',()=>{
    const manifest=JSON.parse(fs.readFileSync('web_dist/manifest.webmanifest','utf8'));
    assert.equal(manifest.display,'standalone');assert.equal(manifest.start_url,'/');
    for(const [file,size] of [['icons/apple-touch-icon.png',180],['icons/icon-192.png',192],['icons/icon-512.png',512]]) {
        const bytes=fs.readFileSync('web_dist/'+file);
        assert.equal(bytes.subarray(1,4).toString(),'PNG');assert.equal(bytes.readUInt32BE(16),size);assert.equal(bytes.readUInt32BE(20),size);
    }
    assert.ok(html.includes('rel="apple-touch-icon"'));
    assert.ok(html.includes('rel="manifest"'));
    assert.ok(fs.readFileSync('web_dist/iphone-install.html','utf8').includes('Add to Home Screen'));
});
