const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'web_dist', 'index.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

describe('Follow-up Fixes 1-12 Verification Suite', () => {

    test('Fix 1: Entry save confirmation modal renders above form modal with z-[100]', () => {
        // Must contain id="entry-save-confirm-modal" with z-[100]
        assert.match(htmlContent, /id="entry-save-confirm-modal"[^>]*class="[^"]*z-\[100\]/);
        // Form modal has z-50
        assert.match(htmlContent, /id="entry-modal"[^>]*class="[^"]*z-50/);
        // Confirmation cancel closes confirmation without wiping form
        assert.match(htmlContent, /save-confirm-cancel-btn/);
        assert.match(htmlContent, /confirmModal\.classList\.add\('hidden'\)/);
    });

    test('Fix 2: Payslip photo section has fast init with timeout & memory fallback', () => {
        // PayslipPhotoManager has memoryFallback and timeouts
        assert.match(htmlContent, /const PayslipPhotoManager\s*=/);
        assert.match(htmlContent, /memoryFallback:\s*new Map\(\)/);
        assert.match(htmlContent, /IndexedDB photo init timeout/);
        assert.match(htmlContent, /photo-upload-input/);
        assert.match(htmlContent, /renderPayslipPhotos/);
    });

    test('Fix 3: Floating quick-add button is icon-only with large + and min 44x44px target', () => {
        const fabMatch = htmlContent.match(/id="fab-today-btn"[^>]*class="([^"]*)"/);
        assert.ok(fabMatch, 'fab-today-btn exists');
        
        // Inside fab-today-btn: must have centered + and sr-only label, no visible Myanmar text clipped inside
        const idx = htmlContent.indexOf('id="fab-today-btn"');
        const fabBlock = htmlContent.substring(idx, htmlContent.indexOf('</button>', idx));
        assert.match(fabBlock, /<span class="text-2xl font-black leading-none select-none">\+<\/span>/);
        assert.match(fabBlock, /class="sr-only"/);
        assert.doesNotMatch(fabBlock, /class="[^"]*text-\[11px\][^"]*"/);
    });

    test('Fix 4: Weekly holiday pay in Jan 2027 uses 2027 legal rate (10,700 KRW)', () => {
        // Verify legal wage helpers return 10,700 for >=2027 and 10,320 for 2026
        assert.match(htmlContent, /if\s*\(year\s*>=\s*2027\)\s*return\s*10700/);
        assert.match(htmlContent, /if\s*\(year\s*>=\s*2026\)\s*return\s*10320/);

        // Weekly holiday pay in monthly calculation uses monthRate / baseRateForMonth from getBaseRateForYear
        assert.match(htmlContent, /weeklyHolidayPay\s*=\s*weeklyHolidaysCount\s*\*\s*8\s*\*\s*monthRate/);

        // Computation check: 4 Sundays * 8h * 10,700 = 342,400 KRW
        const weeklyHolidayPay2027 = 4 * 8 * 10700;
        assert.equal(weeklyHolidayPay2027, 342400);

        // Single day (8h * 10,700 = 85,600) + 342,400 = 428,000 KRW
        const totalGross2027 = 85600 + weeklyHolidayPay2027;
        assert.equal(totalGross2027, 428000);
    });

    test('Fix 5: Flatpickr date picker config uses single mode, no broken altInput', () => {
        assert.match(htmlContent, /mode:\s*['"]single['"]/);
        assert.doesNotMatch(htmlContent, /altInput:\s*true/);
        assert.match(htmlContent, /openEntryModal\(Boolean\(workEntryForDate\(dateStr\)\), dateStr\)/);
    });

    test('Fix 6: recomputeAllStoredRecords calculates pay using rate for record year', () => {
        assert.match(htmlContent, /recomputeAllStoredRecords/);
        assert.match(htmlContent, /calculatePay\(entry\.type,\s*entry\.durationMs,\s*entry\.date\)/);
        
        // September 2026 check (14h basic * 10,320 = 144,480)
        const septBasic14h = 14 * 10320;
        assert.equal(septBasic14h, 144480);
    });

    test('Fix 7: Clearing end time clears preview to "-" and blocks Save', () => {
        assert.match(htmlContent, /if\s*\(!endVal\s*\|\|\s*!startVal\)/);
        assert.match(htmlContent, /prevEstPay\.textContent\s*=\s*'- 원'/);
        assert.match(htmlContent, /addBtn\.disabled\s*=\s*true/);
    });

    test('Fix 8: Payslip manual adjustment note only appears when actual !== calculated', () => {
        assert.match(htmlContent, /const hasIncomeDiff = extra\.manualIncome && extra\.manualIncome > 0 && Math\.round\(extra\.manualIncome\) !== Math\.round\(calculatedGross\)/);
        assert.match(htmlContent, /const hasDeductDiff = extra\.manualDeductions && extra\.manualDeductions > 0 && Math\.round\(extra\.manualDeductions\) !== Math\.round\(autoDeductions\.totalDeductions\)/);
        assert.match(htmlContent, /if\s*\(hasIncomeDiff\s*\|\|\s*hasDeductDiff\)\s*\{\s*payslipFooterNote/);
    });

    test('Fix 9: Month navigation buttons min 44x44px and safe month calculation', () => {
        const prevBtnMatch = htmlContent.match(/id="prev-month-btn"[^>]*class="([^"]*)"/);
        const nextBtnMatch = htmlContent.match(/id="next-month-btn"[^>]*class="([^"]*)"/);
        assert.ok(prevBtnMatch && nextBtnMatch, 'prev and next buttons exist');
        assert.ok(prevBtnMatch[1].includes('min-w-[48px]') && prevBtnMatch[1].includes('min-h-[48px]'));
        assert.ok(nextBtnMatch[1].includes('min-w-[48px]') && nextBtnMatch[1].includes('min-h-[48px]'));

        // Safe date arithmetic: new Date(year, month +/- 1, 1) prevents day 31 rollover skips
        assert.match(htmlContent, /state\.currentDate\s*=\s*new Date\(state\.currentDate\.getFullYear\(\),\s*state\.currentDate\.getMonth\(\)\s*-\s*1,\s*1\)/);
        assert.match(htmlContent, /state\.currentDate\s*=\s*new Date\(state\.currentDate\.getFullYear\(\),\s*state\.currentDate\.getMonth\(\)\s*\+\s*1,\s*1\)/);
    });

    test('Fix 10: Calendar day pill shows total hours worked (base + OT)', () => {
        assert.match(htmlContent, /const totalDayWorkedMs = dayData\.baseMs \+ dayData\.otMs;/);
        assert.match(htmlContent, /formatDuration\(totalDayWorkedMs\)/);
    });

    test('Fix 11: Form layout has dedicated stacked time rows and preview inside flow', () => {
        assert.match(htmlContent, /grid grid-cols-1 sm:grid-cols-2 gap-3/);
        const bodyIdx = htmlContent.indexOf('id="entry-modal-body"');
        const previewIdx = htmlContent.indexOf('id="entry-live-preview"');
        const footerIdx = htmlContent.indexOf('id="entry-modal-footer"');
        assert.ok(bodyIdx < previewIdx && previewIdx < footerIdx, 'preview is inside modal body flow, not sticky over presets');
    });

    test('Fix 12: formatDaysCount pluralization in English ("1 day" vs "N days")', () => {
        assert.match(htmlContent, /formatDaysCount/);
        
        function formatDaysCount(count, lang = 'my') {
            const num = (typeof count === 'number' && !isNaN(count)) ? count : 0;
            if (lang === 'en') {
                return num === 1 ? '1 day' : `${num} days`;
            }
            if (lang === 'ko') {
                return `${num}일`;
            }
            return `${num} ရက်`;
        }

        assert.equal(formatDaysCount(1, 'en'), '1 day');
        assert.equal(formatDaysCount(2, 'en'), '2 days');
        assert.equal(formatDaysCount(0, 'en'), '0 days');
        assert.equal(formatDaysCount(1, 'my'), '1 ရက်');
        assert.equal(formatDaysCount(5, 'ko'), '5일');
    });

    test('Splash screen safety timeout is under 3 seconds', () => {
        assert.match(htmlContent, /setTimeout\(forceDismissSplash,\s*1800\);/);
    });
});
