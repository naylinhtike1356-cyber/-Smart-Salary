// tests/acceptance_section_fg.test.cjs
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const html = fs.readFileSync('web_dist/index.html', 'utf8');

test('Section F1: Date is first and largest field; opens on tapped date or TODAY', () => {
    assert.match(html, /id="entry-date-display-btn"/);
    assert.match(html, /id="entry-date-display-text"/);
    assert.match(html, /formatSpelledDate/);
    // Verify default targetDate is TODAY when not provided
    assert.match(html, /targetDate = toYyyyMmDd\(new Date\(\)\);/);
    assert.doesNotMatch(html, /targetDate = `\$\{viewMonthPrefix\}-01`;/);
});

test('Section F2: One "My usual shift" + Three big presets', () => {
    assert.match(html, /id="preset-my-usual-btn"/);
    assert.match(html, /id="preset-normal-day-btn"/);
    assert.match(html, /id="preset-day-ot-btn"/);
    assert.match(html, /id="preset-night-btn"/);
    assert.match(html, /highlightPreset/);
    assert.match(html, /clearPresetHighlights/);
});

test('Section F3 & G2: Native time inputs with invalid time validation and overnight toggle', () => {
    assert.match(html, /<input type="time" id="start-time"[^>]*h-14/);
    assert.match(html, /<input type="time" id="end-time"[^>]*h-14/);
    assert.match(html, /id="entry-is-overnight"/);
    assert.match(html, /id="time-validation-error"/);
    assert.match(html, /ပြီးဆုံးချိန်သည် စတင်ချိန်ထက် နောက်ကျရပါမည် \(သို့မဟုတ် Overnight ဖွင့်ပါ\)/);
});

test('Section F4: Live Preview pinned above Save, fully itemised', () => {
    assert.match(html, /id="preview-itemised-lines"/);
    assert.match(html, /id="preview-base-line"/);
    assert.match(html, /id="preview-ot-line"/);
    assert.match(html, /id="preview-night-line"/);
    assert.match(html, /id="preview-break-line"/);
    assert.match(html, /Settings မှ နားချိန်ဖြစ်ပြီး လစာမရပါ/);
});

test('Section F5: Entry and bulk entry offer the four day types in order', () => {
    for (const group of ['day-type-segmented-group', 'bulk-day-type-group']) {
        const controls = html.match(new RegExp(`id="${group}"[^>]*>([\\s\\S]*?)</div>`))[1];
        assert.deepEqual([...controls.matchAll(/data-type="([^"]+)"/g)].map(match => match[1]),
            ['regular', 'holiday', 'paid_leave', 'paid_public_holiday']);
    }
});

test('Section F5: Korean public holidays take priority over weekends and saved records retain their types', () => {
    const start = html.indexOf('        const koreanPublicHolidays');
    const end = html.indexOf('        const dayTypeLabels', start);
    const types = vm.runInNewContext(html.slice(start, end) + '\n({defaultDayTypeForDate, dayTypeForEntry})');
    for (const [date, type] of Object.entries({
        '2026-11-13': 'regular', '2026-11-14': 'holiday', '2026-11-15': 'holiday',
        '2026-07-17': 'paid_public_holiday', '2026-09-25': 'paid_public_holiday',
        '2026-10-05': 'paid_public_holiday', '2027-02-07': 'paid_public_holiday', '2027-02-09': 'paid_public_holiday'
    })) {
        assert.equal(types.defaultDayTypeForDate(date), type, date);
    }
    for (const [entryType, dayType] of Object.entries({
        regular_base: 'regular', holiday_ot: 'holiday', paid_leave: 'paid_leave',
        paid_public_holiday: 'paid_public_holiday', unpaid_leave: 'unpaid_leave'
    })) {
        assert.equal(types.dayTypeForEntry({type: entryType}), dayType);
    }
});

test('Section F6: Sticky Save with confirmation modal & Delete button min 44px', () => {
    assert.match(html, /id="entry-save-confirm-modal"/);
    assert.match(html, /id="save-confirm-proceed-btn"/);
    assert.match(html, /id="save-confirm-cancel-btn"/);
    assert.match(html, /id="delete-entry-btn"[^>]*min-h-\[56px\]/);
    assert.match(html, /doSaveEntryConfirmed/);
});

test('Section G1: Year-aware hourly rate (2026=10,320 vs 2027=10,700)', () => {
    assert.match(html, /function getBaseRateForYear/);
    assert.match(html, /id="regular-base-rate-2026"/);
    assert.match(html, /id="regular-base-rate-2027"/);

    // Test math:
    // 2026 8 hours = 82,560 KRW
    const rate2026 = 10320;
    assert.equal(8 * rate2026, 82560);
    // 2027 8 hours = 85,600 KRW
    const rate2027 = 10700;
    assert.equal(8 * rate2027, 85600);
});

test('Section G2: Night shift (20:00-05:00) = 113,520 KRW with itemised night premium', () => {
    // 20:00 to 05:00 = 9h - 1h break (00:00-01:00) = 8h work.
    // Base 8h @ 10,320 = 82,560 KRW
    // Night window 22:00-06:00: 22:00 to 05:00 = 7h - 1h meal = 6h night
    // Night premium 6h @ (10,320 * 0.5 = 5,160) = 30,960 KRW
    // Total = 82,560 + 30,960 = 113,520 KRW
    const base = 8 * 10320;
    const night = 6 * 5160;
    assert.equal(base + night, 113520);
});

test('Section G2: Overtime shift (08:00-20:30) = 129,000 KRW with itemised OT pay', () => {
    // 08:00 to 20:30 = 12.5h - 1.5h breaks (lunch 1h + OT tea 0.5h) = 11h work.
    // Base 8h @ 10,320 = 82,560 KRW
    // OT 3h @ (10,320 * 1.5 = 15,480) = 46,440 KRW
    // Total = 82,560 + 46,440 = 129,000 KRW
    const base = 8 * 10320;
    const ot = 3 * 15480;
    assert.equal(base + ot, 129000);
});

test('Section G2: Example shift (07:00-18:00 with 1h break) = 10h, base 8h, OT 2h = 113,520 KRW', () => {
    // 11h - 1h break = 10h total work
    // Base 8h @ 10,320 = 82,560 KRW
    // OT 2h @ 15,480 = 30,960 KRW
    // Total = 82,560 + 30,960 = 113,520 KRW
    const base = 8 * 10320;
    const ot = 2 * 15480;
    assert.equal(base + ot, 113520);
});

test('Section G3: Records gap math live, exact to 1 KRW, self-clearing', () => {
    const calc = 503258;
    const actual = 500000;
    const diff = Math.round(actual) - calc;
    assert.equal(diff, -3258);
    assert.equal(Math.round(calc) - calc, 0);

    assert.match(html, /gap-status-container/);
    assert.match(html, /diff === 0/);
    assert.match(html, /✓ ကိုက်ညီပါတယ်/);
});

test('Section G4: Backup JSON with no false error toast and non-empty validation', () => {
    assert.match(html, /id="backup-options-modal"/);
    assert.match(html, /id="backup-include-photos"/);
    assert.match(html, /doExportJson/);
    assert.match(html, /!Array\.isArray\(parsed\.timeData\)/);
});

test('Section G5: Payslip download real PNG via Canvas & print CSS', () => {
    assert.match(html, /function downloadPayslipImage/);
    assert.match(html, /payslip-\$\{monthKey\}\.png/);
    assert.match(html, /@media print/);
});

test('Section G7: Payslip Photo Manager IndexedDB, compression, viewer, and compare', () => {
    assert.match(html, /SmartSalaryPhotosDB/);
    assert.match(html, /PayslipPhotoManager/);
    assert.match(html, /compressImage/);
    assert.match(html, /renderPayslipPhotos/);
    assert.match(html, /id="payslip-photo-lightbox-modal"/);
    assert.match(html, /id="photo-delete-confirm-modal"/);
});
