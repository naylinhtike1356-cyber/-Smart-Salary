/* Android-only offline Korean factory payslip OCR mapping.
 * Recognition is a proposal, never a verified payroll statement.
 * The user must review and save suggested amounts.
 */
const KoreanPayslipOCR = (() => {
    const items = [
        ['regularbasePay', /^(?:기본급|기본\s*급)$/],
        ['regularotPay', /^(?:연장근로수당|연장\s*근로\s*수당)$/],
        ['holidayotPay', /^휴일수당\s*\(?연장\)?$/],
        ['holidaybasePay', /^휴일수당\s*\(?일반\)?$/],
        ['weeklyHolidayPay', /^주휴수당(?:\s*\(만근\))?$/],
        ['otherallowancePay', /^(?:직무수당|직무\s*수당)$/],
        ['bonusPay', /^(?:기타수당|상여금)$/],
        ['nationalPension', /^(?:국민연금|국민\s*연금)$/],
        ['healthInsurance', /^건강보험$/],
        ['longTermCareInsurance', /^장기요양보험$/],
        ['employmentInsurance', /^고용보험$/],
        ['incomeTax', /^소득세$/],
        ['localIncomeTax', /^지방소득세$/],
        ['gross', /^(?:지급액계|지급액합계|총지급액|지급합계)$/],
        ['deductions', /^(?:공제액계|공제액합계|총공제액|공제합계)$/],
        ['net', /^(?:실수령액|차인지급액|실지급액)$/]
    ];
    const normalize = value => String(value || '').replace(/\s+/g, '').replace(/[\[\]]/g, '');
    const moneyPattern = /(?:^|[^\d])(\d{1,3}(?:,\d{3})+|\d{4,10})(?!\d)/g;
    const findValue = text => {
        const matches = Array.from(String(text).matchAll(moneyPattern), m => Number(m[1].replace(/,/g, '')));
        return matches.length ? matches[matches.length - 1] : null;
    };
    const findKey = label => {
        const cleaned = normalize(label).replace(/[：:]/g, '').replace(/\(원\)$/g, '');
        return items.find(([, pattern]) => pattern.test(cleaned))?.[0] || null;
    };
    const parse = payload => {
        const source = typeof payload === 'string' ? JSON.parse(payload) : payload;
        const lines = Array.isArray(source?.lines) ? source.lines : [];
        const width = Number(source?.imageWidth) || 0;
        const zones = [];
        for (const line of lines) {
            if (!line || typeof line.text !== 'string') continue;
            const top = Number(line.top) || 0;
            const left = Number(line.left) || 0;
            const zone = width > 0 && left > width * 0.505 ? 'right' : 'left';
            let row = zones.find(r => r.zone === zone && Math.abs(r.top - top) <= 17);
            if (!row) {
                row = { zone, top, fragments: [] };
                zones.push(row);
            }
            row.fragments.push({ left, text: line.text.trim() });
        }
        const candidates = {};
        const warnings = [];
        const offer = (key, value, sourceText) => {
            if (!Number.isSafeInteger(value) || value < 0 || !key) return;
            if (Object.hasOwn(candidates, key) && candidates[key] !== value) {
                delete candidates[key];
                warnings.push('Different values detected for ' + key + '; review the photo.');
                return;
            }
            candidates[key] = value;
        };
        for (const row of zones) {
            row.fragments.sort((a, b) => a.left - b.left);
            const sentence = row.fragments.map(x => x.text).join(' ');
            const number = findValue(sentence);
            if (number === null) continue;
            // Prefer a category preceding the last monetary amount, not column headers.
            const moneyAt = sentence.search(moneyPattern);
            const label = (moneyAt < 0 ? sentence : sentence.slice(0, moneyAt)).trim();
            const key = findKey(label);
            if (key) offer(key, number, sentence);
        }
        // OCR sometimes puts the amount on the next text line. Restrict fallback
        // to adjacent fragments and never invent a number without OCR evidence.
        const ordered = lines.map(x => String(x?.text || '').trim()).filter(Boolean);
        for (let i = 0; i + 1 < ordered.length; i++) {
            const key = findKey(ordered[i]);
            if (key && !Object.hasOwn(candidates, key) &&
                /^\s*[\d,]{4,12}\s*$/.test(ordered[i + 1])) {
                offer(key, Number(ordered[i + 1].replace(/,/g, '')), ordered[i] + ' ' + ordered[i + 1]);
            }
        }
        if (Object.hasOwn(candidates, 'gross') && Object.hasOwn(candidates, 'deductions') &&
            Object.hasOwn(candidates, 'net') &&
            candidates.gross - candidates.deductions !== candidates.net) {
            warnings.push('Extracted gross minus deductions does not equal net; check OCR.');
        }
        if (!Object.hasOwn(candidates, 'gross') ||
            !Object.hasOwn(candidates, 'deductions') ||
            !Object.hasOwn(candidates, 'net')) {
            warnings.push('One or more totals were not read; enter them manually.');
        }
        if (Object.hasOwn(candidates, 'otherallowancePay') ||
            Object.hasOwn(candidates, 'bonusPay')) {
            warnings.push('Verify allowances: factory labels and App categories may differ.');
        }
        return { values: candidates, warnings, recognized: Object.keys(candidates).length, raw: String(source?.text || '') };
    };
    return { parse, findKey, findValue };
})();
if (typeof module !== 'undefined') module.exports = KoreanPayslipOCR;
