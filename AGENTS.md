# Smart Salary public production rules

The user has explicitly reserved `https://webdist-puce.vercel.app` for Smart Salary. It is already used by the public. Treat a wrong-project release as a production incident.

## Mandatory boundaries

- This checkout is `C:/Users/nayli/AndroidStudioProjects/SalaryTracker`, repository `https://github.com/naylinhtike1356-cyber/-Smart-Salary.git`.
- Reserved Vercel project: `prj_l4sGH6geD7HZuALGXmSXWTOA7JCR`; owner/team: `team_DL04XbV2Wiyt4AsfEPU1SPVb` (`naylin`); public domain: `webdist-puce.vercel.app`.
- Only Smart Salary content may be assigned to this project or domain. Never reuse its `.vercel` configuration in another app. VoiceBrainLive and all other applications need separate projects and domains.
- Do not auto-link a directory, change these reserved targets, or silently override `production-policy.json`. A mismatch must stop work on the deployment and be reported to the user.
- For routine website releases use `./deploy-web.ps1`. Do not bypass its checks with raw `vercel --prod`, a guessed project, a copied configuration, or a direct alias assignment.
- Publish only work authorized in the current user request. Preparing a preview does not authorize updating production.

## Required release sequence

1. Run local identity checks and regression tests. Review the exact app, checkout, team, project, release metadata, and APK checksum. Reject unexpected deployment files or environment overrides.
2. Stage the production build without assigning the reserved public alias. Verify the staged HTML and security headers against the reviewed source.
3. Assign only that verified build to the original alias. Verify the public HTML, release metadata, APK endpoint, and headers before reporting success.
4. Update `production-receipt.json` only after the public verification passes. Never adopt an unexpected live page as the baseline to hide a failed check.
5. If any check fails, stop and clearly warn the user with the affected URL, failed boundary, and whether the public site changed. Keep evidence and the last verified deployment. Do not guess at a rollback or overwrite a newer valid release.

The approved APK checksum is pinned in `production-policy.json`. A new Android release requires verifying package `com.naylinhtike.salarytracker`, version, and signing certificate against the approved APK before deliberately updating that pin as part of the authorized release. Do not change the pin merely to make a test pass.

## Monitoring and privacy

- Read-only health check: `node scripts/production-integrity.mjs check`. A nonzero exit is an alert, including network/permission failures; never call an inconclusive check healthy.
- Scheduled monitoring must not deploy, roll back, alter DNS/aliases, change baselines, access private Google accounts, or message third parties. Report findings to the user in this thread.
- Do not claim instant or round-the-clock protection. Local scheduled checks require the machine and app to be running; the configured interval limits detection speed.
- Never publish personal sample emails, authentication tokens, `.vercel` credentials, monitoring evidence, or scratch files. Preserve salary data and existing unrelated user changes.
- These repository/script rules do not prevent an account owner from bypassing them in the Vercel dashboard or another CLI. State this limitation when relevant.
