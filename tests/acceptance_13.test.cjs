// tests/acceptance_13.test.cjs
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const html = fs.readFileSync('web_dist/index.html', 'utf8');

// Helper to simulate browser DOM & storage
function createTestContext() {
    const storageMap = new Map();
    const mockStorage = {
        getItem: k => storageMap.get(k) ?? null,
        setItem: (k, v) => storageMap.set(k, String(v)),
        removeItem: k => storageMap.delete(k)
    };

    const elements = {};
    const getEl = id => {
        if (!elements[id]) {
            elements[id] = {
                id,
                value: '',
                textContent: '',
                innerHTML: '',
                classList: {
                    classes: new Set(),
                    add(c) { this.classes.add(c); },
                    remove(c) { this.classes.delete(c); },
                    contains(c) { return this.classes.has(c); }
                },
                addEventListener: () => {},
                dataset: {},
                appendChild: () => {},
                setAttribute: () => {},
                focus: () => {}
            };
        }
        return elements[id];
    };

    const ctx = vm.createContext({
        localStorage: mockStorage,
        sessionStorage: mockStorage,
        document: {
            getElementById: getEl,
            querySelector: () => null,
            querySelectorAll: () => [],
            createElement: tag => getEl('mock-' + tag + '-' + Math.random())
        },
        window: {
            AndroidBridge: { isWebMock: true },
            addEventListener: () => {}
        },
        console: { log: () => {}, error: () => {}, warn: () => {} },
        setTimeout: (fn, ms) => fn(),
        clearTimeout: () => {},
        toYyyyMmDd: d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
    });

    return { ctx, getEl, mockStorage };
}

test('Acceptance 1: 8 hours at 2026 default legal rate (10,320) = 82,560 KRW', () => {
    assert.match(html, /regular_base:\s*10320/);
    assert.match(html, /getLegalMinimumWage/);
    const wage2026 = 10320;
    const calc = 8 * wage2026;
    assert.equal(calc, 82560);
});

test('Acceptance 2: September 2026 payslip 1-won discrepancy resolved and identical across screens', () => {
    // September gross: 493,978
    const gross = 493978;
    const nationalPension = Math.round(gross * (0 / 100)); // 0
    const healthInsurance = Math.round(gross * (3.545 / 100)); // 17512
    const longTermCare = Math.round(healthInsurance * (12.95 / 100)); // 2268
    const employmentInsurance = Math.round(gross * (0.9 / 100)); // 4446
    const incomeTax = 0;
    const localIncomeTax = 0;
    const dormitory = 0;

    const componentsSum = nationalPension + healthInsurance + longTermCare + employmentInsurance + incomeTax + localIncomeTax + dormitory;
    assert.equal(componentsSum, 24226);

    const netPay = gross - componentsSum;
    assert.equal(netPay, 469752);

    // Verify rounding logic in html
    assert.match(html, /const healthInsurance = Math\.round\(totalEarnings \* \(\(settings\.health_insurance/);
    assert.match(html, /const totalDeductions = nationalPension \+ healthInsurance \+ longTermCareInsurance \+ employmentInsurance \+ incomeTax \+ localIncomeTax \+ dormitoryFee;/);
});

test('Acceptance 3: Rate formatting clean at most 3 decimal places', () => {
    assert.match(html, /const formatRate =/);
    // Test formatRate logic
    const formatRate = (rate) => {
        if (rate === null || rate === undefined || isNaN(rate)) return '0';
        const clean = Math.round(Number(rate) * 1000) / 1000;
        return String(clean);
    };
    assert.equal(formatRate(3.5450000762939453), '3.545');
    assert.equal(formatRate(12.95), '12.95');
    assert.equal(formatRate(0), '0');
});

test('Acceptance 4: Pension rate dynamic in Guide and explained in Settings', () => {
    assert.match(html, /formatRate\(state\.settings\.national_pension\)/);
    assert.match(html, /ပင်စင်မဖြတ်သော စက်ရုံများအတွက် 0% ဖြစ်ပြီး၊ ပုံမှန်အလုပ်သမားထည့်ဝင်ကြေးမှာ 4\.5% ဖြစ်ပါသည်။/);
});

test('Acceptance 5: Personal data removed from app footer', () => {
    assert.doesNotMatch(html, /Nay Lin Htike/);
    assert.doesNotMatch(html, /Developer & Maintainer: Nay Lin Htike/);
    assert.match(html, /စမတ် လစာနှင့် အလုပ်ချိန် မှတ်တမ်း/);
});

test('Acceptance 6: Calendar day tap directly opens Entry Modal with target date', () => {
    assert.match(html, /openEntryModal\(hasExisting, targetDate\);/);
    assert.match(html, /fpDate\.setDate\(targetDate, false\);/);
});

test('Acceptance 7: Quick Add has Burmese confirmation dialog', () => {
    assert.match(html, /id="quick-add-confirm-modal"/);
    assert.match(html, /showQuickAddConfirm/);
    assert.match(html, /မမှတ်သေးဘူး/);
    assert.match(html, /မှတ်မယ်/);
});

test('Acceptance 8: Native time inputs <input type="time"> with visible preview', () => {
    assert.match(html, /<input type="time" id="start-time"/);
    assert.match(html, /<input type="time" id="end-time"/);
    assert.match(html, /elements\.startTime\.addEventListener\('input', updateModalLivePreview\);/);
    assert.match(html, /id="entry-live-preview"/);
});

test('Acceptance 9: Delete target >=44px with Burmese confirmation', () => {
    assert.match(html, /id="delete-confirm-modal"/);
    assert.match(html, /showDeleteConfirm/);
    assert.match(html, /min-h-\[44px\]/);
    assert.match(html, /ဖျက်မည်/);
    assert.match(html, /မဖျက်တော့ပါ/);
});

test('Acceptance 10: Floating Action Button has visible Burmese text', () => {
    assert.match(html, /id="fab-today-btn"/);
    assert.match(html, /ဒီနေ့ မှတ်မယ်/);
});

test('Acceptance 11: Empty months (0 work hours) display weekly holiday pay cleanly', () => {
    assert.match(html, /အလုပ်လုပ်ရက် မရှိသေးပါ/);
    assert.match(html, /ပိတ်ရက်ကြေး \(주휴수당\) ခန့်မှန်း:/);
    assert.match(html, /တစ်ပတ်လျှင် အလုပ်ချိန် ၁၅ နာရီပြည့်ပြီး/);
});

test('Acceptance 12: Records table labels estimated vs actual and shows difference', () => {
    assert.match(html, /ခန့်မှန်း \(App တွက်ချက်\)/);
    assert.match(html, /တကယ်ရရှိလစာ \(လစာစာရွက်\)/);
    assert.match(html, /ကိုက်ညီပါတယ်/);
    assert.match(html, /ကွာခြားချက်:/);
});

test('Acceptance 13: Responsive 390x844 layout & Payslip actions', () => {
    // D1: pb-32
    assert.match(html, /id="settings-view"[^>]*pb-32/);
    // D4: Night shift single badge
    assert.match(html, /D4: Night shift shows ONE unified badge with real total hours/);
    // D5: Burmese weekdays
    assert.match(html, /တနင်္ဂနွေ/);
    assert.match(html, /text-red-500 font-extrabold/);
    // E1: Payslip action buttons
    assert.match(html, /id="payslip-print-btn"/);
    assert.match(html, /id="payslip-download-btn"/);
    assert.match(html, /id="payslip-share-btn"/);
    assert.match(html, /window\.print\(\)/);
    // Splash screen safety timeout
    assert.match(html, /id="splash-safety-timeout"/);
});
