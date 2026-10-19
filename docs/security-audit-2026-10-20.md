# Web App Security Review - 2026-10-20

Production alias: `https://webdist-puce.vercel.app`

## Scope

- Public web source and browser storage behavior
- Google sign-in and Google Drive backup flow
- JSON import and work-note rendering
- Shared-browser account separation
- Public response headers and APK download behavior

## Fixed findings

1. Removed the hardcoded personal account and all saved-account suggestions from the public source.
2. Removed the email-only mock login. Full Mode now accepts verified Google OAuth sign-in only.
3. Removed the browser-only backup that was labeled as cloud backup. Cloud actions now require a verified Google session and use Google Drive App Data.
4. Isolated Web App state by verified Google account ID. Basic Mode remains explicitly device-local.
5. Rendered imported work notes with `textContent` instead of HTML in both the Web App and Android asset.
6. Removed the Web bridge's unscoped pending-backup copy and cleaned up storage left by the retired mock-login flow.
7. Added clickjacking, MIME sniffing, referrer, and browser-permission response headers.

## Data behavior

- Basic Mode data stays in the current browser/device.
- Full Mode data is stored in a browser key scoped to the verified Google account ID.
- Google Drive backup uses the app-specific data folder and is available only after Google OAuth verification.
- Legacy unscoped Web App data migrates to Basic Mode, where it can be exported and then imported into Full Mode if needed.

## Verification checklist

- Public HTML contains no personal default email or mock-login action.
- Inline JavaScript parses successfully.
- Malicious HTML in a work note is displayed as text.
- Basic and verified-account state use different storage keys.
- Production HTML and APK return HTTP 200.
- Production security and APK download headers are present.
