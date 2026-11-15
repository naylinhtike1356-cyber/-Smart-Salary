import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateLocal, validateHtml, validateRelease, checkProduction, requiredHeaders, sha256} from '../scripts/production-integrity.mjs';

const policy = JSON.parse(readFileSync(new URL('../production-policy.json', import.meta.url)));
const html = '<!doctype html><title>Smart Salary Tracker</title>';
const apk = Buffer.from('fixture APK');
const fixturePolicy = {...policy, approvedApkSha256:sha256(apk)};
const release = {versionCode:2, versionName:'1.1.0', apkUrl:new URL(policy.apkFile, policy.publicUrl).href, sha256:sha256(apk)};
const fixture = () => ({policy:fixturePolicy, project:{projectId:policy.projectId,orgId:policy.teamId,projectName:policy.projectName},
  workspace:policy.workspaceRoot,gitOrigin:policy.repository,gradle:`applicationId = "${policy.applicationId}"`, html,release:{...release},apk,
  files:['index.html','release.json','SmartSalaryTracker.apk','icons/icon-192.png'],env:{}});
const expected = {applicationId:policy.applicationId,publicUrl:policy.publicUrl,deploymentUrl:'https://webdist-fixture-naylin.vercel.app',
  htmlSha256:sha256(html),apkSha256:sha256(apk),apkBytes:apk.length,versionCode:2,versionName:'1.1.0'};
function mockFetch(overrides={}) {
  return async (url, options) => {
    assert.equal(options.redirect,'manual');
    if (new URL(url).pathname === '/') return new Response(overrides.html ?? html,{status:overrides.status ?? 200,headers:overrides.headers ?? requiredHeaders});
    if (new URL(url).pathname === '/release.json') return new Response(JSON.stringify(overrides.release ?? release));
    assert.equal(options.method, overrides.apkMethod ?? 'HEAD');
    return new Response(options.method === 'GET' ? overrides.apkBody ?? apk : null,{status:200,headers:{'content-length':String(overrides.apkBytes ?? apk.length),'content-disposition':'attachment; filename=SmartSalaryTracker.apk'}});
  };
}
test('preflight accepts only the intended app, project, repository, and approved APK',()=>assert.doesNotThrow(()=>validateLocal(fixture())));
test('wrong Vercel project or team is rejected before deployment',()=>{
  for (const field of ['projectId','orgId']) {
    const value=fixture();value.project[field]='another-app';assert.throws(()=>validateLocal(value),{code:'WRONG_PROJECT'});
  }
});
test('wrong checkout, repository, and environment target overrides stop deployment',()=>{
  for (const [change,code] of [[{workspace:'C:/another-app'},'WRONG_WORKSPACE'],[{gitOrigin:'https://github.com/example/other.git'},'WRONG_REPOSITORY'],[{env:{VERCEL_PROJECT_ID:'other'}},'ENV_TARGET_OVERRIDE'],[{env:{VERCEL_ORG_ID:'other'}},'ENV_TARGET_OVERRIDE']]) {
    assert.throws(()=>validateLocal({...fixture(),...change}),{code});
  }
});
test('a different APK cannot pass merely by changing release metadata',()=>{
  const value=fixture();value.apk=Buffer.from('different APK');value.release.sha256=sha256(value.apk);
  assert.throws(()=>validateLocal(value),{code:'APK_CHANGED'});
});
test('foreign application files and foreign page content are rejected',()=>{
  const value=fixture();value.files.push('VoiceBrainLive.apk');assert.throws(()=>validateLocal(value),{code:'UNEXPECTED_DEPLOYMENT_FILE'});
  assert.throws(()=>validateHtml(html+'VoiceBrainLive'),{code:'WRONG_APPLICATION'});
});
test('public personal/sample email and unapproved HTML changes generate alerts',()=>{
  assert.throws(()=>validateHtml(html+' test@example.test'),{code:'PUBLIC_EMAIL'});
  assert.throws(()=>validateHtml(html+'changed',expected.htmlSha256),{code:'HTML_CHANGED'});
});
test('correct live page, feed, download endpoint, and headers produce a healthy result',async()=>{
  const result=await checkProduction({policy:fixturePolicy,expected,fetchImpl:mockFetch()}); assert.equal(result.status,'ok');
});
test('release verification checks APK content even when the download is the expected size', async () => {
  const options = {policy:fixturePolicy, expected, verifyApkBytes:true};
  const result = await checkProduction({...options, fetchImpl:mockFetch({apkMethod:'GET'})});
  assert.equal(result.status, 'ok');
  await assert.rejects(checkProduction({...options, fetchImpl:mockFetch({apkMethod:'GET', apkBody:Buffer.alloc(apk.length)})}), {code:'APK_CHANGED'});
});
test('a wrong application, HTTP failure, or changed live content cannot report healthy',async()=>{
  for (const [overrides,code] of [[{html:'VoiceBrainLive'},'WRONG_APPLICATION'],[{status:503},'HTTP_CHECK_FAILED'],[{html:html+'changed'},'HTML_CHANGED']]) {
    await assert.rejects(checkProduction({policy:fixturePolicy,expected,fetchImpl:mockFetch(overrides)}),{code});
  }
});
test('changed security headers, release versions, and APK size generate alerts',async()=>{
  for (const [overrides,code] of [[{headers:{}},'SECURITY_HEADERS_CHANGED'],[{release:{...release,versionCode:3}},'RELEASE_CHANGED'],[{apkBytes:999},'APK_ENDPOINT_CHANGED']]) {
    await assert.rejects(checkProduction({policy:fixturePolicy,expected,fetchImpl:mockFetch(overrides)}),{code});
  }
});
test('network failure and redirect responses are inconclusive alerts rather than healthy',async()=>{
  await assert.rejects(checkProduction({policy:fixturePolicy,expected,fetchImpl:async()=>{throw new Error('offline');}}),{code:'NETWORK_CHECK_FAILED'});
  await assert.rejects(checkProduction({policy:fixturePolicy,expected,fetchImpl:mockFetch({status:302})}),{code:'HTTP_CHECK_FAILED'});
});
test('monitor refuses an invalid baseline instead of learning the unexpected live page',async()=>{
  await assert.rejects(checkProduction({policy:fixturePolicy,expected:{...expected,applicationId:'other'},fetchImpl:mockFetch()}),{code:'INVALID_BASELINE'});
  assert.throws(()=>validateRelease({...release,apkUrl:'https://another-app.vercel.app/app.apk'},fixturePolicy),{code:'WRONG_RELEASE'});
});
