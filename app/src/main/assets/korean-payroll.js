const KoreanPayroll = (() => {
    const table = typeof module === 'undefined'
        ? KOREAN_WITHHOLDING_TABLE
        : require('./korean-withholding-table.js');

    const insuranceDefaults = { health_insurance: 3.545, long_term_care: 12.95, employment_insurance: 0.9 };
    const insuranceFields = ['health_insurance', 'long_term_care', 'employment_insurance'];
    // NHIS employee contribution and the statutory long-term care / health rate ratio.
    // Health limits are the employee's half of MOHW Notices 2024-289 and 2025-222.
    const insuranceByYear = {
        2025: { healthRate: 3.545, healthMin: 9890, healthMax: 4504170, careRate: 9182, totalHealthRate: 70900 },
        2026: { healthRate: 3.595, healthMin: 10080, healthMax: 4591740, careRate: 9448, totalHealthRate: 71900 }
    };
    const deductionKeys = [
        'nationalPension', 'healthInsurance', 'longTermCareInsurance', 'employmentInsurance',
        'incomeTax', 'localIncomeTax', 'dormitoryFee'
    ];
    const highIncomeBands = [
        [87000000, 31034600, 4500], [45000000, 13394600, 4200], [30000000, 7394600, 4000],
        [28000000, 6610600, 3920], [14000000, 1397000, 3724], [10000000, 25000, 3430]
    ];

    const readWon = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
    const roundWon = value => Number.isFinite(value) ? Math.round(value) : 0;
    const truncateTen = (numerator, denominator = 1) => Math.floor(numerator / (denominator * 10)) * 10;
    const premium = (base, percentage) => truncateTen(base * Math.round(percentage * 1000), 100000);

    function insuranceOverride(settings, key) {
        const value = settings[key];
        if (!Number.isFinite(value) || value < 0 || value > 100) return null;
        if (!settings.insurance_rates_explicit && value === insuranceDefaults[key]) return null;
        return value;
    }

    function incomeTax(taxableWage, familySize, children, percentage, paymentDate) {
        if (taxableWage < table[0][0] * 1000) return 0;
        let low = 0;
        let high = table.length - 1;
        while (low < high) {
            const middle = Math.ceil((low + high) / 2);
            if (table[middle][0] * 1000 <= taxableWage) low = middle;
            else high = middle - 1;
        }
        const row = table[low];
        let baseTax = row[Math.min(11, familySize)];
        if (familySize > 11) baseTax -= (row[10] - row[11]) * (familySize - 11);
        const band = highIncomeBands.find(([threshold]) => taxableWage > threshold);
        const extraTax = band ? band[1] * 10000 + (taxableWage - band[0]) * band[2] : 0;
        // Decree 36129 was published February 27. Its Schedule 2 took effect March 1.
        const credits = paymentDate >= '2026-03-01' ? [20830, 45830, 33330] : [12500, 29160, 25000];
        const credit = children === 0 ? 0 : children === 1 ? credits[0] : credits[1] + (children - 2) * credits[2];
        const withheld = truncateTen(Math.max(0, (baseTax - credit) * 10000 + extraTax) * percentage, 1000000);
        return withheld < 1000 ? 0 : withheld;
    }

    function calculate(gross, month, settings, payroll = {}) {
        const paymentDate = payroll.paymentDate || month + '-01';
        const year = Number(month.slice(0, 4));
        const nonTaxable = readWon(payroll.nonTaxable) ?? 0;
        const taxableWage = Math.max(0, roundWon(gross) - nonTaxable);
        const familySize = Math.max(1, readWon(payroll.familySize) ?? (roundWon(settings.dependents) + 1));
        const children = Math.min(readWon(payroll.children) ?? 0, familySize - 1);
        const percentage = [80, 100, 120].includes(payroll.withholdingPercentage) ? payroll.withholdingPercentage : 100;

        const rules = insuranceByYear[year >= 2026 ? 2026 : 2025];
        const healthOverride = insuranceOverride(settings, 'health_insurance');
        const careOverride = insuranceOverride(settings, 'long_term_care');
        const employmentRate = insuranceOverride(settings, 'employment_insurance') ?? 0.9;
        const healthBase = readWon(payroll.healthBase) ?? taxableWage;
        const employmentBase = readWon(payroll.employmentBase) ?? taxableWage;
        const pensionBase = readWon(payroll.pensionBase) ?? taxableWage;
        const healthPremium = premium(healthBase, healthOverride ?? rules.healthRate);
        const healthInsurance = healthBase > 0 && healthOverride === null
            ? Math.max(rules.healthMin, Math.min(rules.healthMax, healthPremium)) : healthPremium;
        const longTermCareInsurance = careOverride === null
            ? truncateTen(healthInsurance * rules.careRate, rules.totalHealthRate)
            : premium(healthInsurance, careOverride);
        const employmentInsurance = premium(employmentBase, employmentRate);
        const pensionRate = Number.isFinite(settings.national_pension) ? settings.national_pension : 0;
        const pensionBounds = month >= '2026-07' ? [410000, 6590000]
            : month >= '2025-07' ? [400000, 6370000] : [390000, 6170000];
        const pensionAssessment = Math.max(pensionBounds[0], Math.min(pensionBounds[1], Math.floor(pensionBase / 1000) * 1000));
        const nationalPension = pensionBase > 0 ? premium(pensionAssessment, pensionRate) : 0;
        const nationalTax = incomeTax(taxableWage, familySize, children, percentage, paymentDate);
        const deductions = {
            nationalPension, healthInsurance, longTermCareInsurance, employmentInsurance,
            incomeTax: nationalTax, localIncomeTax: truncateTen(nationalTax, 10),
            dormitoryFee: Math.max(0, roundWon(settings.dormitory_fee))
        };
        const totalDeductions = deductionKeys.reduce((total, key) => total + deductions[key], 0);
        return { ...deductions, totalDeductions, taxableWage };
    }

    function compare(estimate, actual) {
        const keys = ['gross', 'deductions', 'net'];
        const differences = Object.fromEntries(keys.map(key => [
            key, Number.isSafeInteger(actual[key]) ? actual[key] - estimate[key] : null
        ]));
        const complete = keys.every(key => differences[key] !== null);
        const consistent = !complete || actual.gross - actual.deductions === actual.net;
        return { differences, complete, consistent, matches: complete && consistent && keys.every(key => differences[key] === 0) };
    }

    function validSnapshot(snapshot) {
        if (snapshot?.version !== 1 || readWon(snapshot.grossPay) === null ||
            !Number.isSafeInteger(snapshot.grossAdjustment) || !snapshot.payslip || !snapshot.calcDeductions) return false;
        const earnings = [
            'baseMs', 'overtimeMs', 'nightMs', 'holidayMs', 'holidayOvertimeMs', 'regularbasePay',
            'regularotPay', 'nightallowancePay', 'holidaybasePay', 'holidayotPay', 'bonusPay', 'otherallowancePay'
        ];
        const deductions = snapshot.calcDeductions;
        return earnings.every(key => Number.isFinite(snapshot.payslip[key])) &&
            Number.isFinite(snapshot.weeklyHolidayPay) && Number.isFinite(snapshot.weeklyHolidaysCount) &&
            deductionKeys.every(key => readWon(deductions[key]) !== null) &&
            deductions.totalDeductions === deductionKeys.reduce((sum, key) => sum + deductions[key], 0);
    }

    return { calculate, compare, validSnapshot, insuranceFields, insuranceOverride };
})();

if (typeof module !== 'undefined') module.exports = KoreanPayroll;
