import {readFileSync, readdirSync, realpathSync, writeFileSync, renameSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const sha256 = data => createHash('sha256').update(data).digest('hex');
const readJson = file => JSON.parse(readFileSync(path.join(root, file), 'utf8'));
const fail = (code, message) => {throw Object.assign(new Error(message), {code});};
const requireCheck = (ok, code, message) => {if (!ok) fail(code, message);};
const normalizePath = value => path.resolve(value).replaceAll('\\', '/').toLowerCase();
export const validDeploymentUrl = value => /^https:\/\/webdist-[a-z0-9]+-naylin\.vercel\.app\/?$/.test(value || '');
export const requiredHeaders = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'cross-origin-opener-policy': 'same-origin-allow-popups',
  'content-security-policy': "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; upgrade-insecure-requests"
};

export function validateHtml(html, expectedHash) {
  requireCheck(html.includes('Smart Salary Tracker') && !html.includes('VoiceBrainLive'), 'WRONG_APPLICATION', 'The public page does not identify Smart Salary exclusively.');
  requireCheck(!/[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/i.test(html), 'PUBLIC_EMAIL', 'An email address is embedded in the public page.');
  if (expectedHash) requireCheck(sha256(html) === expectedHash, 'HTML_CHANGED', 'HTML differs from the reviewed release; do not adopt it as the baseline.');
}

export function validateRelease(release, policy, expected) {
  requireCheck(release.apkUrl === new URL(policy.apkFile, policy.publicUrl).href && !release.app && !release.androidVersionCode,
    'WRONG_RELEASE', 'Release metadata points to a different application or APK.');
  requireCheck(release.sha256 === policy.approvedApkSha256, 'APK_CHANGED', 'APK checksum differs from the approved Smart Salary APK.');
  requireCheck(Number.isSafeInteger(release.versionCode) && release.versionCode > 0 && typeof release.versionName === 'string', 'WRONG_RELEASE', 'Invalid release version.');
  if (expected) requireCheck(release.versionCode === expected.versionCode && release.versionName === expected.versionName && release.sha256 === expected.apkSha256,
    'RELEASE_CHANGED', 'Release metadata differs from the last verified release.');
}

export function validateHeaders(headers) {
  for (const [key, value] of Object.entries(requiredHeaders)) {
    requireCheck(headers.get(key) === value, 'SECURITY_HEADERS_CHANGED', `Missing or changed security header: ${key}.`);
  }
}

export function validateLocal({policy, project, workspace, gitOrigin, gradle, html, release, apk, files, env = {}}) {
  requireCheck(normalizePath(workspace) === normalizePath(policy.workspaceRoot), 'WRONG_WORKSPACE', 'Use the reserved SalaryTracker checkout.');
  requireCheck(gitOrigin === policy.repository, 'WRONG_REPOSITORY', 'Repository origin is not Smart Salary.');
  requireCheck(project.projectId === policy.projectId && project.orgId === policy.teamId && project.projectName === policy.projectName,
    'WRONG_PROJECT', 'Linked Vercel project/team is not the reserved Smart Salary target.');
  for (const [key, value] of [['VERCEL_PROJECT_ID', policy.projectId], ['VERCEL_ORG_ID', policy.teamId]]) {
    requireCheck(!env[key] || env[key] === value, 'ENV_TARGET_OVERRIDE', `${key} overrides the reserved target.`);
  }
  requireCheck(gradle.includes(`applicationId = "${policy.applicationId}"`), 'WRONG_APPLICATION', 'Android package identity does not match Smart Salary.');
  validateHtml(html);
  validateRelease(release, policy);
  requireCheck(sha256(apk) === policy.approvedApkSha256, 'APK_CHANGED', 'Local APK is not the approved Smart Salary release.');
  for (const file of files) {
    requireCheck(/^(index\.html|iphone-install\.html|manifest\.webmanifest|release\.json|vercel\.json|SmartSalaryTracker\.apk|\.vercelignore|icons\/[a-z0-9-]+\.png)$/.test(file),
      'UNEXPECTED_DEPLOYMENT_FILE', `Unexpected deployable file: ${file}. Review it before changing the policy.`);
  }
}

function deploymentFiles(directory, prefix = '') {
  return readdirSync(directory, {withFileTypes:true}).flatMap(entry => {
    if (!prefix && ['.vercel', 'scratch'].includes(entry.name)) return [];
    requireCheck(!entry.isSymbolicLink(), 'UNEXPECTED_DEPLOYMENT_FILE', 'Symlinks are not allowed in the public distribution.');
    const name = prefix + entry.name;
    return entry.isDirectory() ? deploymentFiles(path.join(directory, entry.name), name + '/') : [name];
  });
}

export function localContext() {
  const policy = readJson('production-policy.json');
  const html = readFileSync(path.join(root, 'web_dist/index.html'), 'utf8');
  const release = readJson('web_dist/release.json');
  const apk = readFileSync(path.join(root, 'web_dist', policy.apkFile));
  return {policy, html, release, apk};
}

export function preflight() {
  const context = localContext();
  validateLocal({...context, project:readJson('web_dist/.vercel/project.json'), workspace:realpathSync(root),
    gitOrigin:execFileSync('git', ['-C', root, 'remote', 'get-url', 'origin'], {encoding:'utf8'}).trim(),
    gradle:readFileSync(path.join(root, 'app/build.gradle.kts'), 'utf8'), files:deploymentFiles(path.join(root, 'web_dist')), env:process.env});
  const ignore = readFileSync(path.join(root, 'web_dist/.vercelignore'), 'utf8');
  requireCheck(ignore.split(/\r?\n/).some(line => line.trim() === 'scratch/'), 'PUBLIC_SCRATCH', 'web_dist/scratch must remain excluded from deployment.');
  return context;
}

async function readLimited(response, limit) {
  const chunks = []; let total = 0;
  for await (const chunk of response.body) {
    total += chunk.length;
    requireCheck(total <= limit, 'UNEXPECTED_RESPONSE', 'Response exceeds the expected file size limit.');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function checkProduction({policy, expected, fetchImpl = fetch, verifyApkBytes = false}) {
  requireCheck(expected.applicationId === policy.applicationId && expected.publicUrl === policy.publicUrl && validDeploymentUrl(expected.deploymentUrl) && /^[a-f0-9]{64}$/.test(expected.htmlSha256),
    'INVALID_BASELINE', 'The verified production receipt is missing or invalid.');
  requireCheck(expected.apkSha256 === policy.approvedApkSha256, 'INVALID_BASELINE', 'Receipt APK checksum is not approved.');
  const request = async (url, method = 'GET') => {
    let response;
    try { response = await fetchImpl(url, {method, redirect:'manual', cache:'no-store', headers:{'Cache-Control':'no-cache'}, signal:AbortSignal.timeout(15000)}); }
    catch { fail('NETWORK_CHECK_FAILED', 'Could not reach production. Site identity is unconfirmed; this is not a healthy result.'); }
    requireCheck(response.status === 200, 'HTTP_CHECK_FAILED', `${method} ${new URL(url).pathname} returned HTTP ${response.status}.`);
    return response;
  };
  const [htmlResponse, releaseResponse, apkResponse] = await Promise.all([
    request(policy.publicUrl), request(new URL('release.json', policy.publicUrl)),
    request(new URL(policy.apkFile, policy.publicUrl), verifyApkBytes ? 'GET' : 'HEAD')
  ]);
  validateHeaders(htmlResponse.headers);
  validateHtml(await readLimited(htmlResponse, 2 * 1024 * 1024), expected.htmlSha256);
  let release;
  try { release = JSON.parse(await readLimited(releaseResponse, 65536)); }
  catch (error) { if (error.code) throw error; fail('WRONG_RELEASE', 'The public release feed is not valid JSON.'); }
  validateRelease(release, policy, expected);
  requireCheck(Number(apkResponse.headers.get('content-length')) === expected.apkBytes &&
    (apkResponse.headers.get('content-disposition') || '').includes(policy.apkFile), 'APK_ENDPOINT_CHANGED', 'APK download headers or size differ from the verified release.');
  if (verifyApkBytes) {
    const hash = createHash('sha256');
    let bytes = 0;
    for await (const chunk of apkResponse.body) {
      bytes += chunk.length;
      requireCheck(bytes <= expected.apkBytes, 'APK_ENDPOINT_CHANGED', 'The public APK exceeds the reviewed download size.');
      hash.update(chunk);
    }
    requireCheck(bytes === expected.apkBytes && hash.digest('hex') === expected.apkSha256,
      'APK_CHANGED', 'The public APK differs from the reviewed Android release.');
  }
  return {status:'ok', url:policy.publicUrl, application:policy.applicationName, deploymentUrl:expected.deploymentUrl, htmlSha256:expected.htmlSha256, checkedAt:new Date().toISOString()};
}

function candidate(context, deploymentUrl) {
  requireCheck(validDeploymentUrl(deploymentUrl), 'WRONG_DEPLOYMENT_URL', 'Deployment URL does not belong to naylin/web_dist.');
  return {applicationId:context.policy.applicationId, publicUrl:context.policy.publicUrl, deploymentUrl,
    htmlSha256:sha256(context.html), apkSha256:sha256(context.apk), apkBytes:context.apk.length,
    versionCode:context.release.versionCode, versionName:context.release.versionName, verifiedAt:new Date().toISOString()};
}

async function main(args) {
  const [command, ...options] = args;
  if (command === 'preflight') {
    preflight(); return {status:'ok', check:'local production identity'};
  }
  if (command === 'snapshot') {
    const context = preflight();
    validateHtml(readFileSync(options[0], 'utf8'), sha256(context.html));
    const headers = new Headers();
    for (const line of readFileSync(options[1], 'utf8').split(/\r?\n/)) {
      const colon = line.indexOf(':'); if (colon > 0) headers.set(line.slice(0, colon), line.slice(colon + 1).trim());
    }
    validateHeaders(headers); return {status:'ok', check:'staged HTML and security headers'};
  }
  if (command === 'check') {
    const policy = readJson('production-policy.json');
    return checkProduction({policy, expected:readJson('production-receipt.json')});
  }
  if (command === 'record') {
    const context = preflight();
    const receipt = candidate(context, options[0]);
    const result = await checkProduction({policy:context.policy, expected:receipt, verifyApkBytes:true});
    const file = path.join(root, 'production-receipt.json');
    writeFileSync(file + '.tmp', JSON.stringify(receipt, null, 2) + '\n');
    renameSync(file + '.tmp', file);
    return {...result, receipt:'production-receipt.json'};
  }
  fail('USAGE', 'Use preflight, snapshot <html-file> <headers-file>, check, or record <verified-deployment-url>.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(result => console.log(JSON.stringify(result))).catch(error => {
    console.error(JSON.stringify({status:'alert', code:error.code || 'CHECK_FAILED', message:error.message, checkedAt:new Date().toISOString()}));
    process.exitCode = 1;
  });
}
