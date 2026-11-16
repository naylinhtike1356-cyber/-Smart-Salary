const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const OCR = require('../app/src/main/assets/korean-payslip-ocr.js');
const Payroll = require('../app/src/main/assets/korean-payroll.js');
const table = require('../app/src/main/assets/korean-withholding-table.js');
const html = fs.readFileSync(path.join(__dirname, '../app/src/main/assets/index.html'), 'utf8');

test('Android-only Korean OCR reads Korean factory payslip items and amounts', () => {
    const raw = [
        ['기본급', '1,816,320', 50, 310],
        ['연장근로수당', '735,300', 50, 310],
        ['휴일수당(일반)', '448,920', 50, 310],
        ['휴일수당(연장)', '30,960', 50, 310],
        ['주휴수당(만근)', '330,240', 50, 310],
        ['직무수당', '200,000', 50, 310],
        ['기타수당', '261,670', 50, 310],
        ['건강보험', '137,450', 550, 850],
        ['장기요양보험', '18,060', 550, 850],
        ['고용보험', '34,410', 550, 850],
        ['소득세', '171,930', 550, 850],
        ['지방소득세', '17,190', 550, 850],
        ['지급액 계', '3,823,410', 50, 310],
        ['공제액 계', '379,040', 550, 850],
        ['실수령액(원)', '3,444,370', 550, 850],
    ];
    const lines = raw.flatMap(([label, value, xLabel, xAmount], i) => [
        { text: label, left: xLabel, top: 35 + i * 50 },
        { text: value, left: xAmount, top: 35 + i * 50 }
    ]);
    const result = OCR.parse({ imageWidth: 1000, lines });
    assert.equal(result.values.regularbasePay, 1816320);
    assert.equal(result.values.regularotPay, 735300);
    assert.equal(result.values.holidaybasePay, 448920);
    assert.equal(result.values.holidayotPay, 30960);
    assert.equal(result.values.weeklyHolidayPay, 330240);
    assert.equal(result.values.otherallowancePay, 200000);
    assert.equal(result.values.bonusPay, 261670);
    assert.equal(result.values.healthInsurance, 137450);
    assert.equal(result.values.longTermCareInsurance, 18060);
    assert.equal(result.values.employmentInsurance, 34410);
    assert.equal(result.values.incomeTax, 171930);
    assert.equal(result.values.localIncomeTax, 17190);
    assert.equal(result.values.gross, 3823410);
    assert.equal(result.values.deductions, 379040);
    assert.equal(result.values.net, 3444370);
});

test('OCR never guesses absent totals and warns when amounts disagree', () => {
    const missing = OCR.parse({ imageWidth: 1000, lines: [{ text: '기본급', left: 20, top: 10 }] });
    assert.deepEqual(missing.values, {});
    assert.ok(missing.warnings.length);
    const contradictory = OCR.parse({
        imageWidth: 1000,
        lines: ['지급액계 3,823,410', '공제액계 379,040', '실수령액 3,444,380']
            .map((text, i) => ({ text, left: 40, top: i * 50 }))
    });
    assert.ok(contradictory.warnings.some(x => x.includes('does not equal')));
});

test('mobile records stay in classic 7-column layout and OCR requires review before save', () => {
    assert.match(html, /id="th-parents-won"/);
    assert.match(html, /id="th-parents-local"/);
    assert.match(html, /id="th-payslip"/);
    assert.match(html, /korean-payslip-ocr.js/);
    assert.match(html, /window\.AndroidBridge\.recognizePayslip/);
    assert.match(html, /window\.onPayslipOcrResult/);
    assert.match(html, /field\.value !== ''/); // never overwrite existing entered amount
    assert.match(html, /getElement\('payroll-save-comparison'\)/);
    assert.doesNotMatch(html, /onPayslipOcrResult[\s\S]{0,3000}saveState\(\)/);
});

test('2026 factory payslip payroll engine computes deductions without override', () => {
    const result = Payroll.calculate(3823410, '2026-10', {
        national_pension: 0, dependents: 0
    });
    assert.equal(result.totalDeductions, 379040);
    assert.equal(result.incomeTax, 171930);
    assert.equal(result.localIncomeTax, 17190);
    assert.equal(3823410 - result.totalDeductions, 3444370);
    assert.ok(table.find(row => row[0] === 3820));
});
