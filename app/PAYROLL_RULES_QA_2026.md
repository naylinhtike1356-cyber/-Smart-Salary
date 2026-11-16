# Smart Salary Android — Korean payroll rules and QA notes (2026)

This document applies only to the Android app (`app/**`). Web/PWA payroll and Vercel production were not changed.

## Protected gross calculations
- Existing base hourly wage, regular overtime, holiday base, holiday overtime, paid leave, and weekly paid holiday formulas remain unchanged in this branch.
- October 2026 reference at ₩10,320/hour: base 176h ₩1,816,320; regular overtime 47.5h ₩735,300; holiday base 29h ₩448,920; holiday overtime 1.5h ₩30,960; weekly holiday ₩330,240; allowances ₩461,670; gross ₩3,823,410.
- Work-hour coding must be verified independently; matching gross alone cannot verify which particular shifts were worked.

## Deduction rules and official information
- Employee health insurance (2026): 3.595% of eligible monthly remuneration (half of the statutory 7.19% total). Do not universally substitute gross salary for the assessed remuneration base.
  - NHIS https://edi.nhis.or.kr/portal/images/popup/20251204_pop01longdesc.html
- Long-term care (2026): 0.9448% of remuneration expressed as insurance rate, or health-insurance premium × 0.9448/7.19 (approximately 13.14%). Employee contribution derives from the assessed health-premium base.
  - MOHW https://m.korea.kr/briefing/pressReleaseView.do?newsId=156725039
- Employment insurance: employee 0.9% for applicable wage/employment eligibility. Source:
  - NPS 4-insurance table https://www.nps.or.kr/pnsinfo/ntpsklg/getOHAF0097M0.do
- National pension: 2026 combined 9.5%, employee portion 4.75% where applicable. From July 2026, assessed income floor ₩410,000 and cap ₩6,590,000; prior July 2025-June 2026 ₩400,000–₩6,370,000.
  - NPS https://www.nps.or.kr/pnsinfo/ntpsklg/getOHAF0038M0.do
- Income tax: the app includes a bundled 2026 Korean withholding table (647 bands, 11 family columns), and applies family/children/withholding selection. Payroll month, actual payment date and taxable income must be checked. Full verification requires matching the official 2026 notice, not just matching one example.
- Local income tax: calculated from national wage withholding using the app's stated truncation rule.

## Important estimates and exclusions
- Korean pension and employment insurance can depend on individual coverage, nationality, employer registration, status and exemptions. A settings value of 0% is **not** a verified legal exemption.
- Company-specific deductions (lodging/meals, special employer adjustments), non-taxable allowances, remuneration-base differences and exact rounding can prevent an exact estimate. Preserve a separate factory amount rather than forcing the formula to match.
- **Historical 2025 payroll tax**: bundled Korean withholding table is for 2026; do not represent 2025 income-tax estimates as conclusively verified without the proper 2025 official table.
- Year 2027+ rates/table are not in this release. User-facing results must remain estimated.
- October 2026 regression: gross ₩3,823,410 − deductions ₩379,040 = net ₩3,444,370 with a specified eligible family size 1, 100% withholding, no non-taxable allowances, and national pension 0% selected for this sample. This is a **test fixture**, not a universal employee rule.

## Comparison and OCR safeguards
- Difference convention: `App − Factory` for every amount, including net pay and CSV export.
- Totals and individual line items are separate; never label the entire statement verified because net alone matches.
- OCR is local ML Kit Korean recognition, proposed values are not automatically verified. Human review confirmation is required before storing review status.
- JPG/PNG/camera supported; PDF first page is converted on-device to a JPEG before OCR. Additional PDF pages require separate handling. HEIC conversion is device-dependent.
- Source documents and candidate amounts may contain personal payroll data; never send them to remote OCR/telemetry. Existing optional Google Drive backup remains separately controlled.
- Verify local photo retention and manual backup *with photos* prior to uninstalling the app. Standard cloud state JSON alone does not guarantee all IndexedDB photos are included.

## QA gates for release
1. Node Android payroll/OCR tests pass on the exact release commit.
2. Gradle debug and release APK builds pass; check manifest and Android runtime API support.
3. Instrumented camera, gallery, PDF, OCR, wrong-month, duplicate upload, restore, app restart, accessibility, and screen-size tests run on a real phone.
4. Compare installed APK signing-certificate SHA-256 with the new APK before attempting an in-place update. Repository currently configures debug-keystore signing; CI QA APK is not guaranteed to share the installed key.
5. No WebApp/Vercel deployment. Publish GitHub Android Release only after explicit approval and verified signing.
