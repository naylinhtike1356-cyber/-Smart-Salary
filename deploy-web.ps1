param([switch]$Preview, [switch]$Stage)
$ErrorActionPreference = 'Stop'
if ($Preview -and $Stage) { throw 'Choose Preview or Stage, not both.' }
Set-Location -LiteralPath $PSScriptRoot

& node scripts/production-integrity.mjs preflight
if ($LASTEXITCODE -ne 0) { throw 'PRODUCTION ALERT: Smart Salary identity check failed. No deployment was started.' }

# Keep the existing public link and prevent deployment to a different project.
$project = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'web_dist\.vercel\project.json') -Raw | ConvertFrom-Json
if ($project.projectId -ne 'prj_l4sGH6geD7HZuALGXmSXWTOA7JCR' -or $project.orgId -ne 'team_DL04XbV2Wiyt4AsfEPU1SPVb') {
    throw 'The linked Vercel project differs from the existing SalaryTracker website. Deployment stopped.'
}
$webHtml = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'web_dist\index.html') -Raw
$release = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'web_dist\release.json') -Raw | ConvertFrom-Json
if ($webHtml -notmatch 'Smart Salary Tracker' -or $webHtml -match 'VoiceBrainLive' -or
    $release.apkUrl -ne 'https://webdist-puce.vercel.app/SmartSalaryTracker.apk') {
    throw 'Deployment stopped: website or release metadata belongs to a different application.'
}
$apkHash = (Get-FileHash -LiteralPath (Join-Path $PSScriptRoot 'web_dist\SmartSalaryTracker.apk') -Algorithm SHA256).Hash
if ($apkHash -ne $release.sha256) {
    throw 'Deployment stopped: Smart Salary APK does not match release metadata.'
}
& node --test tests/web-login.test.cjs tests/web-backup.test.cjs tests/production-integrity.test.mjs
if ($LASTEXITCODE -ne 0) { throw 'Login regression checks failed.' }
Push-Location -LiteralPath (Join-Path $PSScriptRoot 'web_dist')
try {
    if ($Preview) {
        $deploymentOutput = & vercel.cmd deploy --yes --scope $project.orgId
    } elseif ($Stage) {
        $deploymentOutput = & vercel.cmd deploy --prod --skip-domain --yes --scope $project.orgId
    } else {
        $deploymentOutput = & vercel.cmd deploy --prod --skip-domain --yes --scope $project.orgId
    }
    if ($LASTEXITCODE -ne 0) { throw 'Vercel deployment failed. The public website has not been confirmed updated.' }
    Write-Output $deploymentOutput
    $deploymentUrl = $null
    try {
        $deploymentUrl = (($deploymentOutput -join "`n") | ConvertFrom-Json).deployment.url
    } catch { }
    if (-not $deploymentUrl) {
        $deploymentUrl = $deploymentOutput | Where-Object { $_ -match '^https://webdist-[a-z0-9]+-naylin\.vercel\.app/?$' } | Select-Object -Last 1
    }
    if ($deploymentUrl -notmatch '^https://webdist-[a-z0-9]+-naylin\.vercel\.app/?$') {
        throw 'PRODUCTION ALERT: deployment URL is not verified. Original public alias was not assigned.'
    }
    New-Item -ItemType Directory -Path ../scratch -Force | Out-Null
    # Values in this command are validated above; the file paths are fixed.
    # cmd preserves the curl separator which PowerShell removes in native calls.
    $verifyCommand = "vercel.cmd curl / --deployment $deploymentUrl --scope $($project.orgId) -- -sS -o ../scratch/deploy-verification.html -D ../scratch/deploy-verification-headers.txt"
    & $env:ComSpec /d /s /c $verifyCommand
    if ($LASTEXITCODE -ne 0) { throw 'PRODUCTION ALERT: could not fetch the staged build. Original public alias was not assigned.' }
    & node ../scripts/production-integrity.mjs snapshot ../scratch/deploy-verification.html ../scratch/deploy-verification-headers.txt
    if ($LASTEXITCODE -ne 0) { throw 'PRODUCTION ALERT: staged content failed verification. Original public alias was not assigned.' }
    if (-not $Preview -and -not $Stage) {
        & vercel.cmd promote $deploymentUrl --scope $project.orgId --yes
        if ($LASTEXITCODE -ne 0) { throw 'PRODUCTION ALERT: promotion failed; verify the public site before reporting success.' }
        & vercel.cmd alias set $deploymentUrl webdist-puce.vercel.app --scope $project.orgId
        if ($LASTEXITCODE -ne 0) { throw 'PRODUCTION ALERT: the original public alias update failed.' }
        & node ../scripts/production-integrity.mjs record $deploymentUrl
        if ($LASTEXITCODE -ne 0) { throw 'PRODUCTION ALERT: https://webdist-puce.vercel.app failed public verification. The previous verified receipt was preserved. Notify the user immediately.' }
    }
} finally {
    Pop-Location
}
if ($Stage) {
    Write-Host 'Staged HTML and headers verified. The reserved public alias was not assigned. A manual promotion still requires public verification and recording the release.'
} elseif ($Preview) {
    Write-Host 'Preview deployed. The original public link has NOT been updated. Use the preview URL above to test before production.'
    Write-Host 'Google sign-in on the preview requires that exact origin in your Google OAuth web client.'
} else {
    Write-Host 'Deployment completed. Open https://webdist-puce.vercel.app and verify Google sign-in.'
}
