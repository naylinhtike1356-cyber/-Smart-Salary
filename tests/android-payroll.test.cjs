const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const payroll = require('../app/src/main/assets/korean-payroll.js');
const table = require('../app/src/main/assets/korean-withholding-table.js');
const androidHtml = fs.readFileSync(path.join(__dirname, '../app/src/main/assets/index.html'), 'utf8');

test('official table includes all 647 brackets and 11 family columns', () => {
    assert.equal(table.length, 647);
    assert.equal(table[0][0], 770);
    assert.equal(table.at(-1)[0], 10000);
    assert.ok(table.every((row, index) => row.length === 12 && (!index || row[0] > table[index - 1][0])));
});

test('October reference computes every deduction and net without a manual override', () => {
    const gross = 3823410;
    const result = payroll.calculate(gross, '2026-10', {
        national_pension: 0, health_insurance: 3.545, long_term_care: 12.95, employment_insurance: 0.9
    });
    assert.deepEqual(result, {
        nationalPension: 0, healthInsurance: 137450, longTermCareInsurance: 18060,
        employmentInsurance: 34410, incomeTax: 171930, localIncomeTax: 17190,
        dormitoryFee: 0, totalDeductions: 379040, taxableWage: 3823410
    });
    assert.equal(gross - result.totalDeductions, 3444370);
});

test('lower-inclusive tax bands use actual monthly taxable pay', () => {
    for (const [wage, expected] of [[500000, 0], [3500000, 127220], [3819999, 169260], [3820000, 171930], [3840000, 174600], [4000000, 195960]]) {
        assert.equal(payroll.calculate(wage, '2026-10', {}).incomeTax, expected, String(wage));
    }
    const result = payroll.calculate(4000000, '2026-10', {}, {
        nonTaxable: 200000, healthBase: 3000000, employmentBase: 2500000, pensionBase: 0
    });
    assert.equal(result.taxableWage, 3800000);
    assert.equal(result.incomeTax, 169260);
    assert.equal(result.healthInsurance, 107850);
    assert.equal(result.employmentInsurance, 22500);
    assert.equal(result.nationalPension, 0);
});

test('family sizes, child credits, payment date and withholding elections are independent', () => {
    const compute = (month, options) => payroll.calculate(3500000, month, {}, options).incomeTax;
    const twoChildren = { familySize: 4, children: 2 };
    assert.equal(compute('2025-12', twoChildren), 20180);
    assert.equal(compute('2026-02', { ...twoChildren, paymentDate: '2026-02-28' }), 20180);
    assert.equal(compute('2026-02', { ...twoChildren, paymentDate: '2026-03-01' }), 3510);
    assert.equal(compute('2026-10', { ...twoChildren, withholdingPercentage: 80 }), 2800);
    assert.equal(compute('2026-10', { ...twoChildren, withholdingPercentage: 120 }), 4210);
    assert.equal(compute('2026-10', { familySize: 6, children: 3 }), 0);
    assert.equal(payroll.calculate(3820000, '2026-10', {}, { familySize: 12 }).incomeTax, 12970);
    assert.equal(payroll.calculate(3500000, '2026-10', {}, { familySize: 11, children: 1 }).incomeTax, 0);
});

test('high-income formulas continue across the appendix thresholds', () => {
    for (const [wage, expected] of [
        [10000000, 1507400], [10000001, 1532400], [14000000, 2904400], [28000000, 8118000],
        [30000000, 8902000], [45000000, 14902000], [87000000, 32542000], [88000000, 32992000]
    ]) {
        assert.equal(payroll.calculate(wage, '2026-10', {}).incomeTax, expected, String(wage));
    }
});

test('insurance honors the payroll year, explicit exemptions and separate pension base', () => {
    assert.equal(payroll.calculate(3000000, '2025-10', {}).healthInsurance, 106350);
    assert.equal(payroll.calculate(3000000, '2026-10', {}).healthInsurance, 107850);
    assert.equal(payroll.calculate(100000, '2025-10', {}).healthInsurance, 9890);
    assert.equal(payroll.calculate(100000, '2026-10', {}).healthInsurance, 10080);
    assert.equal(payroll.calculate(200000000, '2025-10', {}).healthInsurance, 4504170);
    assert.equal(payroll.calculate(200000000, '2026-10', {}).healthInsurance, 4591740);
    const settings = { national_pension: 4.75 };
    assert.equal(payroll.calculate(600000, '2026-10', settings, { pensionBase: 503999 }).nationalPension, 23890);
    assert.equal(payroll.calculate(600000, '2026-06', settings, { pensionBase: 7500000 }).nationalPension, 302570);
    assert.equal(payroll.calculate(600000, '2026-07', settings, { pensionBase: 7500000 }).nationalPension, 313020);
    assert.equal(payroll.calculate(3000000, '2026-10', {}, { healthBase: 0 }).healthInsurance, 0);
    assert.equal(payroll.calculate(3000000, '2026-10', { insurance_rates_explicit: true, health_insurance: 3.545 }).healthInsurance, 106350);
});

test('reconciliation requires all three payslip values, accepts zero and shows actual minus estimate', () => {
    const estimate = { gross: 3823410, deductions: 332825, net: 3490585 };
    const actual = { gross: 3823410, deductions: 379040, net: 3444370 };
    assert.deepEqual(payroll.compare(estimate, actual), {
        differences: { gross: 0, deductions: 46215, net: -46215 }, complete: true, consistent: true, matches: false
    });
    assert.equal(payroll.compare(actual, { ...actual, net: null }).matches, false);
    assert.equal(payroll.compare(actual, { ...actual, net: actual.gross }).consistent, false);
    assert.equal(payroll.compare(actual, actual).matches, true);
    assert.equal(payroll.compare({ gross: 0, deductions: 0, net: 0 }, { gross: 0, deductions: 0, net: 0 }).matches, true);
});

test('Android automatic backup batches saves and discards a pending upload on account change', () => {
    const block = androidHtml.slice(androidHtml.indexOf('        let autoCloudBackupTimer;'), androidHtml.indexOf('        const loadState ='));
    const localWrites = [];
    const cloudWrites = [];
    const timers = new Map();
    let scope = 'user_a';
    let lastTimerId = 0;
    const state = { settings: {}, timeData: [], monthlyExtras: [] };
    const save = vm.runInNewContext(block + '\nsaveState', {
        state, loadedStateStorageKey: 'device', getStateStorageKey: () => 'device',
        localStorage: { setItem: (_key, json) => localWrites.push(JSON.parse(json)) },
        window: { AndroidBridge: {
            getStorageScope: () => scope, isLoggedIn: () => true,
            backupToCloud: json => cloudWrites.push(JSON.parse(json))
        } },
        setTimeout: fn => { timers.set(++lastTimerId, fn); return lastTimerId; },
        clearTimeout: id => timers.delete(id)
    });
    const flush = () => {
        for (const [id, callback] of timers) {
            timers.delete(id);
            callback();
        }
    };

    save();
    state.monthlyExtras.push({ month: '2026-10', payroll: { actual: { gross: 3000000 } } });
    save();
    assert.equal(timers.size, 1);
    flush();
    assert.equal(cloudWrites[0].monthlyExtras[0].payroll.actual.gross, 3000000);

    save();
    scope = 'user_b';
    flush();
    assert.equal(cloudWrites.length, 1);
    save(false);
    scope = 'basic';
    save();
    assert.equal(timers.size, 0);
    assert.equal(localWrites.length, 5);
});

test('Android leave summary counts unique annual leave dates in the displayed year', () => {
    const computation = androidHtml.match(/const totalUsedLeaveDays = [\s\S]*?;/)[0];
    const timeData = [
        { date: '2025-12-30', type: 'paid_leave' },
        { date: '2026-01-01', type: 'paid_public_holiday' },
        { date: '2026-02-03', type: 'paid_leave' },
        { date: '2026-02-03', type: 'paid_leave' },
        { date: '2026-10-07', type: 'paid_leave' },
        { date: '2026-10-08', type: 'unpaid_leave' }
    ];
    assert.equal(vm.runInNewContext(computation + '\ntotalUsedLeaveDays', { state: { timeData }, monthKey: '2026-10' }), 2);
});
