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

test('all embedded Android HTML JavaScript parses without syntax errors', () => {
    const vm = require('node:vm');
    const scripts = Array.from(html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi),
        match => match[1].trim()).filter(Boolean);
    assert.ok(scripts.length >= 1);
    for (const script of scripts) {
        assert.doesNotThrow(() => new vm.Script(script));
    }
});

test('OCR uses factory month and payment day and never accepts a conflicting value', () => {
    const result = OCR.parse({
        imageWidth: 1200,
        text: '귀속연월: 2026년 10월 지급일: 2026-11-15',
        lines: [
            {text: '기본급',left:40,top:10},{text:'1,816,320',left:310,top:10},
            {text: '기본급',left:40,top:80},{text:'1,816,999',left:310,top:80},
            {text: '지급총액',left:40,top:150},{text:'3,823,410',left:310,top:150},
            {text: '공제총액',left:650,top:220},{text:'379,040',left:900,top:220},
            {text: '실지급액',left:650,top:280},{text:'3,444,370',left:900,top:280}
        ]
    });
    assert.equal(result.period, '2026-10');
    assert.equal(result.paymentDate, '2026-11-15');
    assert.equal(result.values.regularbasePay, undefined);
    assert.equal(result.values.gross, 3823410);
    assert.equal(result.values.deductions, 379040);
    assert.equal(result.values.net, 3444370);
    assert.ok(result.warnings.some(x => x.includes('Different values')));
});
test('all differences use App minus Factory and preserve incomplete states', () => {
    const estimate = {gross: 3823410, deductions: 332825, net: 3490585};
    const factory = {gross: 3823410, deductions: 379040, net: 3444370};
    const comparison = Payroll.compare(estimate, factory);
    assert.equal(comparison.differences.deductions, -46215);
    assert.equal(comparison.differences.net, +46215);
    assert.equal(comparison.matches, false);
    assert.equal(Payroll.compare(estimate, {gross: null, deductions: 379040, net: null}).complete, false);
    assert.match(html, /ကွာဟချက် = App − စက်ရုံ/);
    assert.match(html, /data-comparison-overview/);
    assert.match(html, /periodMismatch/);
    assert.match(html, /payroll\.reviewedAt = reviewedComparison\.complete/);
    assert.match(html, /payroll\.ocrEvidence =/);
    assert.match(html, /applyRestoredBackup\(content\)/);
    assert.match(html, /prefers-reduced-motion/);
});

test('a newly uploaded factory slip invalidates old verification and OCR requires explicit review', () => {
    assert.match(html, /name="confirmFactoryStatement"/);
    assert.match(html, /form\.elements\.namedItem\('confirmFactoryStatement'\)\?\.checked === true/);
    assert.match(html, /form\.dataset\.reviewed = 'false'/);
    assert.match(html, /if \(confirmation\) confirmation\.checked = false/);
    assert.match(html, /newly attached or replaced image invalidates/);
    assert.match(html, /reviewedAt: null/);
    assert.match(html, /const reviewedComparison = KoreanPayroll\.compare/);
});
test('comparison rows animate without disabling accessibility', () => {
    assert.match(html, /prefers-reduced-motion:\s*reduce/);
    assert.match(html, /focus-visible/);
    assert.match(html, /data-comparison-overview/);
    assert.match(html, /App\s*[−-]\s*စက်ရုံ/);
});

test('Android PDF first-page support stays local and reviewed export is available', () => {
    const kotlin = fs.readFileSync(path.join(__dirname,
        '../app/src/main/java/com/naylinhtike/salarytracker/MainActivity.kt'), 'utf8');
    assert.match(kotlin, /fun renderPayslipPdf\(/);
    assert.match(kotlin, /PdfRenderer\(fd\)/);
    assert.match(html, /accept="image\/\*,application\/pdf"/);
    assert.match(html, /onPayslipPdfRendered/);
    assert.match(html, /function exportVerifiedSalaryComparison/);
    assert.match(html, /data-export-verified-comparison/);
    assert.match(html, /App_minus_Factory/);
    assert.match(html, /if \(!data\.extra\.payroll\?\.reviewedAt \|\| !data\.comparison\.complete\)/);
    assert.doesNotMatch(html, /fetch\([^\n]{0,80}PayslipPdf/);
});

test('comparison rows have text states, prevent wrong-period Save and invalidate replacement photo', () => {
    assert.match(html, /data-row-state/);
    assert.match(html, /DIFFERENT · UNVERIFIED/);
    assert.match(html, /'MATCHED'/);
    assert.match(html, /'MISSING'/);
    assert.match(html, /form\.dataset\.periodMismatch === 'true'/);
    assert.match(html, /nextPayroll = \{ \.\.\.existingExtra\.payroll, reviewedAt: null \}/);
    assert.match(html, /saveState\(false\)/);
});
test('Android supported document input stays scoped to image and PDF', () => {
    const kotlin = fs.readFileSync(path.join(__dirname, '../app/src/main/java/com/naylinhtike/salarytracker/MainActivity.kt'), 'utf8');
    assert.match(kotlin, /PdfRenderer/);
    assert.match(kotlin, /renderPayslipPdf/);
    assert.match(html, /application\/pdf/);
    assert.match(html, /window\.onPayslipPdfRendered/);
    assert.match(kotlin, /FileProvider\.getUriForFile/);
    assert.doesNotMatch(html, /https?:\/\/[^\s'"<>]+(?:ocr|recognition)\//i);
});
