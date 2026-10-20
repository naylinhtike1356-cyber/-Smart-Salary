# Web and Android App Security Review - 2026-10-20

Production alias: `https://webdist-puce.vercel.app`

## Scope

- Public web source and browser storage behavior
- Google sign-in and Google Drive backup flow
- JSON import and work-note rendering
- Shared-browser account separation
- Public response headers and APK download behavior
- Android account-local storage and pending backups
- Android WebView exposure and exported components
- Direct-update metadata, checksum, package, version, and signer validation

## Fixed findings

1. Removed the hardcoded personal account and all saved-account suggestions from the public source.
2. Removed the email-only mock login. Full Mode now accepts verified Google OAuth sign-in only.
3. Removed the browser-only backup that was labeled as cloud backup. Cloud actions now require a verified Google session and use Google Drive App Data.
4. Isolated Web App state by verified Google account ID. Basic Mode remains explicitly device-local.
5. Rendered imported work notes with `textContent` instead of HTML in both the Web App and Android asset.
6. Removed the Web bridge's unscoped pending-backup copy and cleaned up storage left by the retired mock-login flow.
7. Added clickjacking, MIME sniffing, referrer, and browser-permission response headers.
8. Isolated Android WebView state and pending backup files by a hashed Google account ID; legacy data migrates only to Basic Mode.
9. Disabled Android system backups, made the salary data provider private, and restricted WebView navigation and mixed content.
10. Added an in-app update control under Settings. It accepts only HTTPS releases from the production host and verifies SHA-256, package name, a newer version code, and the installed app's signing certificate before opening Android's installer.
11. Removed static email placeholders from both public and embedded HTML. Runtime account details appear only for the user signed in on that device.

## Data behavior

- Basic Mode data stays in the current browser/device.
- Full Mode data is stored in a browser key scoped to the verified Google account ID.
- Google Drive backup uses the app-specific data folder and is available only after Google OAuth verification.
- Legacy unscoped Web App data migrates to Basic Mode, where it can be exported and then imported into Full Mode if needed.
- Android account data is separated with non-email hashed storage scopes. Signing out or switching accounts reloads the matching local state.
- Android update metadata is published at `/release.json`; the downloadable APK remains at `/SmartSalaryTracker.apk`.

## Verification checklist

- Public HTML contains no personal default email or mock-login action.
- Inline JavaScript parses successfully.
- Malicious HTML in a work note is displayed as text.
- Basic and verified-account state use different storage keys.
- Production HTML and APK return HTTP 200.
- Production security and APK download headers are present.
- Android unit tests and debug APK assembly pass.
- APK package/version are `com.naylinhtike.salarytracker` and `1.1.0 (2)`.
- APK signer SHA-256 is `1846c60e2c0b5be5f81d4320abab429694775de21ffe5e01d64548949ad8bc2e`, matching the previously published APK.
- Release APK SHA-256 is `a5d7404e83f2c6fbac542e07b7afabe17bb3f11789239215cf5dfad58c359ae8` and matches `release.json`.
