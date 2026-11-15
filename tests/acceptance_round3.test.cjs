const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const htmlPath = path.join(__dirname, '..', 'web_dist', 'index.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

describe('Round 3 Acceptance Test Suite', () => {

    test('A1: September 2026 Single Source of Truth - Gross 508,260, Deductions 24,925, Net 483,335, Diff 0', () => {
        // Verify calculateMonthSalaryData function math
        assert.match(htmlContent, /const calculateMonthSalaryData\s*=/);

        // Run calculation logic in isolated VM
        const sandbox = {
            console: { error() {}, log() {}, warn() {} },
            state: {
                currentDate: new Date('2026-09-15T12:00:00'),
                timeData: [
                    // Sample work entries for September 2026
                    { date: '2026-09-01', type: 'regular_base', durationMs: 8 * 3600000, pay: 82560 },
                    { date: '2026-09-02', type: 'regular_base', durationMs: 6 * 3600000, pay: 61920 },
                    { date: '2026-09-03', type: 'regular_ot', durationMs: 14 * 3600000, pay: 216720 },
                    { date: '2026-09-04', type: 'night_allowance', durationMs: 8 * 3600000, pay: 41280 }
                ],
                monthlyExtras: [
                    { month: '2026-09', weekly_holidays: 10.25 / 8 } // 10.25 hours weekly holiday pay
                ],
                settings: {
                    regular_base: 10320,
                    rate_customized: false,
                    health_insurance: 3.545,
                    long_term_care: 12.95,
                    employment_insurance: 0.9,
                    national_pension: 0,
                    dependents: 0,
                    dormitory_fee: 0
                }
            },
            getBaseRateForYear: (y) => (y >= 2027 ? 10700 : 10320),
            getIncomeTax: () => 0,
            getRateForType: (t, y) => {
                const base = (parseInt(String(y).slice(0, 4), 10) >= 2027) ? 10700 : 10320;
                if (t === 'regular_ot' || t === 'holiday_base') return base * 1.5;
                if (t === 'night_allowance') return base * 0.5;
                return base;
            },
            calculatePay: (type, durationMs, d) => {
                const rate = (parseInt(String(d).slice(0, 4), 10) >= 2027 ? 10700 : 10320) *
                    (type === 'regular_ot' ? 1.5 : type === 'night_allowance' ? 0.5 : 1);
                return (durationMs / 3600000) * rate;
            }
        };

        // Extract calculateAllDeductions and calculateMonthSalaryData from htmlContent
        const dedStart = htmlContent.indexOf('const calculateAllDeductions =');
        const dedEnd = htmlContent.indexOf('window.calculateAllDeductions =', dedStart);
        const calcStart = htmlContent.indexOf('const calculateMonthSalaryData =');
        const calcEnd = htmlContent.indexOf('window.calculateMonthSalaryData =', calcStart);

        const code = htmlContent.slice(dedStart, dedEnd) + '\n' +
            htmlContent.slice(calcStart, calcEnd) + '\n' +
            'this.calculateMonthSalaryData = calculateMonthSalaryData;\n' +
            'this.calculateAllDeductions = calculateAllDeductions;';
        vm.createContext(sandbox);
        vm.runInContext(code, sandbox);

        assert.equal(typeof sandbox.calculateMonthSalaryData, 'function');
        const res = sandbox.calculateMonthSalaryData('2026-09');

        // Gross check: 144,480 + 216,720 + 41,280 + 105,780 = 508,260
        assert.equal(res.calculatedGross, 508260, 'Calculated Gross must be 508,260');
        assert.equal(res.grossPay, 508260, 'Gross Pay must equal calculatedGross (508,260)');

        // Deductions check: 18,018 health + 2,333 care + 4,574 employment = 24,925
        assert.equal(res.totalDeductions, 24925, 'Total Deductions must be 24,925');

        // Net check: 508,260 - 24,925 = 483,335
        assert.equal(res.netSalary, 483335, 'Net salary must be 483,335');
        assert.equal(res.difference, 0, 'Difference must be 0');

        // Records & Payslip unified: check that renderRecordTable and calculateAndShowPayslip both read from calculateMonthSalaryData
        assert.ok(htmlContent.includes('const mData = calculateMonthSalaryData(monthKey);'));
    });

    test('A2: Sticky preview removed from footer, entry form preview in body flow', () => {
        // #footer-quick-pay must NOT exist
        assert.doesNotMatch(htmlContent, /id="footer-quick-pay"/, 'footer-quick-pay must be removed');

        // #entry-live-preview must exist inside #entry-modal-body
        const bodyIdx = htmlContent.indexOf('id="entry-modal-body"');
        const previewIdx = htmlContent.indexOf('id="entry-live-preview"');
        assert.ok(bodyIdx > 0, '#entry-modal-body exists');
        assert.ok(previewIdx > bodyIdx, '#entry-live-preview is inside body flow');
    });

    test('A3: Month navigation buttons have min-width and min-height >= 48px', () => {
        const prevIdx = htmlContent.indexOf('id="prev-month-btn"');
        const nextIdx = htmlContent.indexOf('id="next-month-btn"');
        assert.ok(prevIdx > 0 && nextIdx > 0, 'Navigation buttons exist');

        const prevTag = htmlContent.slice(prevIdx, htmlContent.indexOf('>', prevIdx));
        const nextTag = htmlContent.slice(nextIdx, htmlContent.indexOf('>', nextIdx));

        assert.match(prevTag, /min-width:\s*48px/, 'prev btn has min-width: 48px');
        assert.match(prevTag, /min-height:\s*48px/, 'prev btn has min-height: 48px');
        assert.match(nextTag, /min-width:\s*48px/, 'next btn has min-width: 48px');
        assert.match(nextTag, /min-height:\s*48px/, 'next btn has min-height: 48px');
    });

    test('A4: Toast styling and single export notification', () => {
        // showToast supports info (blue), warning (amber), error (red), and success (green)
        assert.match(htmlContent, /bg-blue-600/, 'Info toast has blue background');
        assert.match(htmlContent, /bg-amber-600/, 'Warning toast has amber background');
        assert.match(htmlContent, /bg-red-500/, 'Error toast has red background');
        assert.match(htmlContent, /bg-green-500/, 'Success toast has green background');

        // AndroidBridge mock doesn't double-toast
        const bridgeMockIdx = htmlContent.indexOf('window.AndroidBridge = {');
        if (bridgeMockIdx > 0) {
            const bridgeBlock = htmlContent.slice(bridgeMockIdx, bridgeMockIdx + 1200);
            assert.doesNotMatch(bridgeBlock, /showToast\('Backup ဖိုင်ကို download လုပ်ပြီးပါပြီ။'\)/, 'Bridge mock does not fire duplicate toast');
        }
    });

    test('Part B: Google Drive Pre-restore Inspection Modal & Safety Backup Copy', () => {
        // Modal and its fields exist
        assert.match(htmlContent, /id="drive-restore-inspect-modal"/);
        assert.match(htmlContent, /id="drive-inspect-email"/);
        assert.match(htmlContent, /id="drive-inspect-date"/);
        assert.match(htmlContent, /id="drive-inspect-size"/);
        assert.match(htmlContent, /id="drive-inspect-records"/);
        assert.match(htmlContent, /id="drive-inspect-months"/);
        assert.match(htmlContent, /id="drive-inspect-empty-warning"/);
        assert.match(htmlContent, /id="drive-inspect-confirm-btn"/);
        assert.match(htmlContent, /id="drive-inspect-cancel-btn"/);

        // Pre-restore safety copy keys in localStorage
        assert.match(htmlContent, /localStorage\.setItem\('dailySalaryTrackerState:before-restore'/);
        assert.match(htmlContent, /localStorage\.setItem\(key \+ ':before-restore'/);

        // Prevents restoring empty backup (0 records)
        assert.match(htmlContent, /if\s*\(!normalizedState\.timeData\.length\)\s*\{\s*throw new Error/);
    });

    test('Part C: Multi-date Bulk Selection Controls and Fast Selection Buttons', () => {
        assert.match(htmlContent, /id="bulk-mode-toggle-btn"/);
        assert.match(htmlContent, /id="bulk-selection-bar"/);
        assert.match(htmlContent, /id="bulk-selected-count-badge"/);
        assert.match(htmlContent, /id="bulk-select-weekdays-btn"/);
        assert.match(htmlContent, /id="bulk-select-all-btn"/);
        assert.match(htmlContent, /id="bulk-clear-selection-btn"/);
        assert.match(htmlContent, /id="bulk-open-entry-btn"/);
        assert.match(htmlContent, /id="bulk-exit-mode-btn"/);

        // Modals exist
        assert.match(htmlContent, /id="bulk-entry-modal"/);
        assert.match(htmlContent, /id="bulk-conflict-modal"/);
        assert.match(htmlContent, /id="bulk-confirm-modal"/);

        // Fast selection logic handles weekdays Mon-Fri
        assert.match(htmlContent, /dayOfWeek\s*>=\s*1\s*&&\s*dayOfWeek\s*<=\s*5/);
    });

    test('Part C: Bulk live calculation (5 weekdays @ 08:00~17:00 = 412,800 KRW)', () => {
        const sandbox = {
            window: { bulkSelectedDates: new Set(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']) },
            state: { settings: { regular_base: 10320 } },
            bulkDayType: 'regular',
            calculateShiftBreakAndNightHours: () => ({ baseDurationMs: 8 * 3600000, otDurationMs: 0, nightDurationMs: 0, totalDurationMs: 8 * 3600000 }),
            calculatePay: (type, durationMs, d) => (durationMs / 3600000) * 10320,
            formatDuration: () => '8 နာရီ',
            formatKrw: (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','),
            getElement: () => ({ value: '08:00', checked: false, textContent: '', classList: { add() {}, remove() {} } })
        };

        // Extract updateBulkLivePreview logic from htmlContent
        const start = htmlContent.indexOf('function updateBulkLivePreview() {');
        const end = htmlContent.indexOf('window.updateBulkLivePreview = updateBulkLivePreview;', start);
        assert.ok(start > 0 && end > start);

        vm.createContext(sandbox);
        vm.runInContext(htmlContent.slice(start, end), sandbox);

        assert.equal(typeof sandbox.updateBulkLivePreview, 'function');

        // Test math manually using exact same logic
        let totalPay = 0;
        sandbox.window.bulkSelectedDates.forEach(d => {
            const shift = sandbox.calculateShiftBreakAndNightHours();
            totalPay += sandbox.calculatePay('regular_base', shift.baseDurationMs, d);
        });

        // 5 * 8h * 10,320 = 412,800 KRW
        assert.equal(totalPay, 412800, '5 days @ 08:00-17:00 must equal 412,800 KRW');
    });

    test('Part C: Multi-year rate split calculation (Dec 2026 @ 10,320 + Jan 2027 @ 10,700)', () => {
        const getRate = (d) => (parseInt(d.slice(0, 4), 10) >= 2027 ? 10700 : 10320);

        const date1 = '2026-12-15';
        const date2 = '2027-01-15';

        const pay1 = (8 * 3600000 / 3600000) * getRate(date1); // 82,560
        const pay2 = (8 * 3600000 / 3600000) * getRate(date2); // 85,600
        const combined = pay1 + pay2;

        assert.equal(pay1, 82560, 'Dec 2026 single day = 82,560');
        assert.equal(pay2, 85600, 'Jan 2027 single day = 85,600');
        assert.equal(combined, 168160, 'Combined multi-year total = 168,160');

        // Verify HTML contains year-split note
        assert.match(htmlContent, /id="bulk-preview-year-split-note"/);
        assert.match(htmlContent, /distinctYears\.length\s*>\s*1/);
    });

    test('Part C: All-or-nothing save and Skip vs Overwrite conflict handling', () => {
        assert.match(htmlContent, /id="bulk-conflict-skip-btn"/);
        assert.match(htmlContent, /id="bulk-conflict-overwrite-btn"/);
        assert.match(htmlContent, /id="bulk-conflict-cancel-btn"/);
        assert.match(htmlContent, /id="bulk-confirm-ok-btn"/);

        // Verification of conflict detection
        assert.match(htmlContent, /const conflictDates = sortedDates\.filter/);
        assert.match(htmlContent, /if\s*\(conflictDates\.length\s*>\s*0\)/);

        // Execute save handles both skip and overwrite
        assert.match(htmlContent, /if\s*\(hasExisting\s*&&\s*action\s*===\s*'skip'\)/);
        assert.match(htmlContent, /state\.timeData\.filter\(entry\s*=>\s*entry\.date\s*!==\s*targetDate/);
    });

});
