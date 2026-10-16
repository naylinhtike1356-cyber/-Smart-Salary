import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const campaignDir = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(campaignDir, '..', '..');
const imageDir = path.join(campaignDir, 'assets', 'images');
const frameDir = path.join(campaignDir, 'assets', 'video-frames');
const videoDir = path.join(campaignDir, 'assets', 'videos');
const iconPath = path.join(repoDir, 'app', 'src', 'main', 'res', 'mipmap-xxxhdpi', 'ic_launcher.webp');

for (const dir of [imageDir, frameDir, videoDir]) fs.mkdirSync(dir, { recursive: true });

const iconPngPath = path.join(campaignDir, 'assets', 'app-icon.png');
const iconConvert = spawnSync('magick', [iconPath, iconPngPath], { encoding: 'utf8' });
if (iconConvert.status !== 0) {
  throw new Error(`App icon conversion failed\n${iconConvert.stdout}\n${iconConvert.stderr}`);
}
const iconData = `data:image/png;base64,${fs.readFileSync(iconPngPath).toString('base64')}`;
const colors = {
  blue: '#1769E0', navy: '#0B1736', cyan: '#19C7C9', amber: '#FFB547',
  green: '#16A36A', coral: '#FF6B5D', ink: '#172033', muted: '#65738A',
  pale: '#F5F8FC', white: '#FFFFFF', line: '#DCE5F0', lavender: '#7567E8'
};

const posts = [
  { id: '01-brand-launch', kicker: 'SMART SALARY TRACKER', title: ['အလုပ်ချိန်ကိုမှတ်', 'လစာကိုသိ'], sub: ['ကိုရီးယားရှိ မြန်မာအလုပ်သမားများအတွက်', 'နေ့စဉ်အလုပ်ချိန်နှင့် လစာမှတ်တမ်း App'], accent: colors.blue, scene: 'dashboard', badge: 'WEB + ANDROID' },
  { id: '02-no-more-guessing', kicker: 'မှတ်စုတွေ မပျောက်တော့ဘူး', title: ['မှန်းဆမနေပါနဲ့', 'မှတ်တမ်းနဲ့သိပါ'], sub: ['အလုပ်ဝင်/ဆင်းချိန်၊ OT နဲ့ ညဆိုင်းကို', 'တစ်နေရာတည်းမှာ စနစ်တကျသိမ်းပါ'], accent: colors.coral, scene: 'compare', badge: 'PROBLEM → SOLUTION' },
  { id: '03-setup-rates', kicker: 'အသုံးပြုနည်း ၁', title: ['ကိုယ့်လစာနှုန်းထား', 'အရင်သတ်မှတ်ပါ'], sub: ['အခြေခံလစာ • OT • ညဆိုင်း', 'ပိတ်ရက်နှုန်းထားကို စာချုပ်အတိုင်းထည့်ပါ'], accent: colors.amber, scene: 'settings', badge: 'STEP 01' },
  { id: '04-daily-entry', kicker: 'အသုံးပြုနည်း ၂', title: ['နေ့စဉ် ၁ မိနစ်', 'အလုပ်ချိန်မှတ်ပါ'], sub: ['ရက်စွဲရွေး • အချိန်ထည့် • သိမ်း', 'လကုန်မှ ပြန်ရှာစရာမလိုတော့ပါ'], accent: colors.green, scene: 'entry', badge: 'STEP 02' },
  { id: '05-calendar-overview', kicker: 'လစဉ်အခြေအနေ တစ်ချက်ကြည့်', title: ['အလုပ်ရက်နဲ့ OT ကို', 'Calendar မှာကြည့်ပါ'], sub: ['အလုပ်လုပ်ခဲ့တဲ့ရက်၊ နာရီနဲ့', 'ခန့်မှန်းလစာကို လစဉ်စုစည်းကြည့်နိုင်ပါတယ်'], accent: colors.cyan, scene: 'calendar', badge: 'MONTHLY VIEW' },
  { id: '06-overtime-types', kicker: 'အလုပ်ချိန်တိုင်းရဲ့ တန်ဖိုး', title: ['OT • ညဆိုင်း', 'ပိတ်ရက်အလုပ်'], sub: ['အလုပ်အမျိုးအစားအလိုက် ခွဲမှတ်ပြီး', 'ကိုယ့်နှုန်းထားနဲ့ ခန့်မှန်းတွက်ချက်ပါ'], accent: colors.lavender, scene: 'types', badge: 'SMART CALCULATION' },
  { id: '07-monthly-payslip', kicker: 'လကုန်မတိုင်ခင် ကြိုမြင်ပါ', title: ['လစဉ်လစာရှင်းတမ်း', 'တစ်နေရာတည်းမှာ'], sub: ['ဝင်ငွေ၊ OT၊ ဖြတ်တောက်မှုနဲ့', 'ခန့်မှန်းအသားတင်လစာကို စုစည်းကြည့်ပါ'], accent: colors.blue, scene: 'payslip', badge: 'PAYSLIP' },
  { id: '08-backup-restore', kicker: 'ကိုယ့်မှတ်တမ်းကို ကာကွယ်ပါ', title: ['Backup သိမ်းပါ', 'လိုအပ်ရင် Restore'], sub: ['ဖုန်းပြောင်းလဲရင်လည်း မှတ်တမ်းတွေ', 'ပြန်ယူနိုင်ဖို့ လစဉ် Backup လုပ်ထားပါ'], accent: colors.green, scene: 'backup', badge: 'DATA SAFETY' },
  { id: '09-multilingual', kicker: 'ဘာသာစကား ၆ မျိုး', title: ['မြန်မာလိုလွယ်ကူ', 'ကိုရီးယားနဲ့လည်းကိုက်'], sub: ['MY • KO • EN • TH • VI • ID', 'လုပ်ဖော်ကိုင်ဖက်တွေနဲ့လည်း မျှဝေသုံးနိုင်ပါတယ်'], accent: colors.coral, scene: 'languages', badge: '6 LANGUAGES' },
  { id: '10-download-cta', kicker: 'ဒီနေ့ကစပြီး မှတ်တမ်းတင်ပါ', title: ['Web မှာစသုံးပါ', 'Android မှာသွင်းပါ'], sub: ['webdist-puce.vercel.app', 'Smart Salary Tracker — ကိုယ့်လစာကို ကိုယ်သိပါ'], accent: colors.amber, scene: 'download', badge: 'START FREE' }
];

function esc(value) {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
}

function textLines(lines, x, y, size, color, weight = 700, gap = 1.28, anchor = 'start') {
  return lines.map((line, i) => `<text x="${x}" y="${y + i * size * gap}" text-anchor="${anchor}" font-family="Myanmar Text, Noto Sans Myanmar, Malgun Gothic, sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}">${esc(line)}</text>`).join('\n');
}

function iconMark(x, y, size) {
  const cx = x + size * 0.5;
  const cy = y + size * 0.5;
  return `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${size * 0.23}" fill="#fff" stroke="${colors.line}" stroke-width="2"/>
  <circle cx="${cx - size * 0.08}" cy="${cy}" r="${size * 0.29}" fill="#E9F2FF" stroke="${colors.blue}" stroke-width="${Math.max(3, size * 0.055)}"/>
  <line x1="${cx - size * 0.08}" y1="${cy}" x2="${cx - size * 0.08}" y2="${cy - size * 0.17}" stroke="${colors.navy}" stroke-width="${Math.max(3, size * 0.045)}" stroke-linecap="round"/>
  <line x1="${cx - size * 0.08}" y1="${cy}" x2="${cx + size * 0.06}" y2="${cy + size * 0.08}" stroke="${colors.navy}" stroke-width="${Math.max(3, size * 0.045)}" stroke-linecap="round"/>
  <circle cx="${cx - size * 0.08}" cy="${cy}" r="${Math.max(3, size * 0.045)}" fill="${colors.cyan}"/>
  <circle cx="${cx + size * 0.24}" cy="${cy + size * 0.2}" r="${size * 0.19}" fill="${colors.amber}" stroke="#D99420" stroke-width="${Math.max(2, size * 0.028)}"/>
  <text x="${cx + size * 0.24}" y="${cy + size * 0.27}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${size * 0.23}" font-weight="800" fill="${colors.navy}">₩</text>`;
}

function header(w, compact = false) {
  const size = compact ? 62 : 72;
  const x = compact ? 72 : 70;
  const y = compact ? 68 : 64;
  return `${iconMark(x, y, size)}
    <text x="${x + size + 18}" y="${y + 27}" font-family="Arial, sans-serif" font-size="${compact ? 22 : 24}" font-weight="800" fill="${colors.navy}">SMART SALARY</text>
    <text x="${x + size + 18}" y="${y + 53}" font-family="Arial, sans-serif" font-size="${compact ? 18 : 20}" font-weight="700" fill="${colors.blue}">TRACKER</text>
    <line x1="${w - 210}" y1="${y + 30}" x2="${w - 70}" y2="${y + 30}" stroke="${colors.line}" stroke-width="3"/>
    <circle cx="${w - 70}" cy="${y + 30}" r="7" fill="${colors.cyan}"/>`;
}

function phoneShell(content, x = 620, y = 235, w = 360, h = 710, accent = colors.blue) {
  return `<rect x="${x - 14}" y="${y - 14}" width="${w + 28}" height="${h + 28}" rx="54" fill="${colors.navy}" opacity="0.12"/>
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="45" fill="${colors.navy}"/>
  <rect x="${x + 14}" y="${y + 14}" width="${w - 28}" height="${h - 28}" rx="34" fill="#F8FAFD"/>
  <rect x="${x + w / 2 - 47}" y="${y + 24}" width="94" height="10" rx="5" fill="#253558"/>
  <rect x="${x + 30}" y="${y + 54}" width="${w - 60}" height="56" rx="15" fill="${accent}"/>
  <text x="${x + 48}" y="${y + 89}" font-family="Myanmar Text, sans-serif" font-size="18" font-weight="700" fill="#fff">လစာမှတ်တမ်း</text>
  ${content(x + 30, y + 130, w - 60, h - 170, accent)}`;
}

function dashboardScene(x, y, w, h, accent) {
  return `<text x="${x}" y="${y + 12}" font-family="Myanmar Text, sans-serif" font-size="14" font-weight="700" fill="${colors.muted}">အောက်တိုဘာ အကျဉ်းချုပ်</text>
  <rect x="${x}" y="${y + 32}" width="${w}" height="118" rx="18" fill="#fff" stroke="${colors.line}"/>
  <text x="${x + 20}" y="${y + 65}" font-family="Myanmar Text, sans-serif" font-size="13" fill="${colors.muted}">ခန့်မှန်းလစာ</text>
  <text x="${x + 20}" y="${y + 105}" font-family="Arial, sans-serif" font-size="29" font-weight="800" fill="${colors.navy}">₩ 2,840,000</text>
  <rect x="${x + 20}" y="${y + 120}" width="${w - 40}" height="8" rx="4" fill="#DCEBFF"/><rect x="${x + 20}" y="${y + 120}" width="${(w - 40) * .72}" height="8" rx="4" fill="${accent}"/>
  ${metricCard(x, y + 170, 140, '22', 'အလုပ်ရက်', colors.cyan)}${metricCard(x + 160, y + 170, 140, '31.5', 'OT နာရီ', colors.amber)}
  <rect x="${x}" y="${y + 290}" width="${w}" height="150" rx="18" fill="#fff" stroke="${colors.line}"/>
  <polyline points="${x + 20},${y + 405} ${x + 72},${y + 370} ${x + 124},${y + 382} ${x + 176},${y + 325} ${x + 228},${y + 345} ${x + 280},${y + 310}" fill="none" stroke="${accent}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="${x + w / 2}" y="${y + 485}" text-anchor="middle" font-family="Myanmar Text, sans-serif" font-size="13" font-weight="700" fill="${colors.muted}">နေ့စဉ်မှတ် • လစဉ်သိ</text>`;
}

function metricCard(x, y, w, value, label, accent) {
  return `<rect x="${x}" y="${y}" width="${w}" height="92" rx="16" fill="#fff" stroke="${colors.line}"/><rect x="${x}" y="${y}" width="8" height="92" rx="4" fill="${accent}"/><text x="${x + 24}" y="${y + 39}" font-family="Arial, sans-serif" font-size="27" font-weight="800" fill="${colors.navy}">${value}</text><text x="${x + 24}" y="${y + 67}" font-family="Myanmar Text, sans-serif" font-size="13" fill="${colors.muted}">${label}</text>`;
}

function compareScene(x, y, w, h) {
  return `<rect x="${x}" y="${y}" width="${w}" height="154" rx="18" fill="#FFF4F2" stroke="#FFD4CF"/>
  <text x="${x + 18}" y="${y + 36}" font-family="Myanmar Text, sans-serif" font-size="14" font-weight="700" fill="${colors.coral}">အရင်က</text>
  <line x1="${x + 24}" y1="${y + 68}" x2="${x + w - 24}" y2="${y + 68}" stroke="#E5A9A2" stroke-width="3" stroke-dasharray="9 9"/>
  <line x1="${x + 24}" y1="${y + 98}" x2="${x + w - 75}" y2="${y + 98}" stroke="#E5A9A2" stroke-width="3" stroke-dasharray="9 9"/>
  <line x1="${x + 24}" y1="${y + 128}" x2="${x + w - 45}" y2="${y + 128}" stroke="#E5A9A2" stroke-width="3" stroke-dasharray="9 9"/>
  <rect x="${x}" y="${y + 180}" width="${w}" height="270" rx="18" fill="#F0FAF6" stroke="#BFE8D5"/>
  <text x="${x + 18}" y="${y + 218}" font-family="Myanmar Text, sans-serif" font-size="14" font-weight="700" fill="${colors.green}">အခု</text>
  ${metricCard(x + 18, y + 240, w - 36, '08:00 - 18:30', 'အလုပ်ဝင် / ဆင်း', colors.green)}
  ${metricCard(x + 18, y + 347, w - 36, '2.5 hr', 'OT မှတ်တမ်း', colors.amber)}
  <text x="${x + w / 2}" y="${y + 494}" text-anchor="middle" font-family="Myanmar Text, sans-serif" font-size="13" font-weight="700" fill="${colors.green}">မှတ်တမ်းရှိတော့ စိတ်ချရပြီ</text>`;
}

function settingsScene(x, y, w, h) {
  const rows = [['အခြေခံလစာ', '₩ 2,300,000'], ['OT နှုန်း', '× 1.5'], ['ညဆိုင်းကြေး', '× 0.5'], ['ပိတ်ရက်', '× 2.0']];
  return `<text x="${x}" y="${y + 10}" font-family="Myanmar Text, sans-serif" font-size="14" font-weight="700" fill="${colors.muted}">လစာနှုန်းထား ဆက်တင်</text>${rows.map((r, i) => `<rect x="${x}" y="${y + 30 + i * 83}" width="${w}" height="66" rx="14" fill="#fff" stroke="${colors.line}"/><circle cx="${x + 28}" cy="${y + 63 + i * 83}" r="12" fill="${i === 0 ? colors.blue : colors.amber}"/><text x="${x + 50}" y="${y + 69 + i * 83}" font-family="Myanmar Text, sans-serif" font-size="14" font-weight="700" fill="${colors.ink}">${r[0]}</text><text x="${x + w - 15}" y="${y + 69 + i * 83}" text-anchor="end" font-family="Arial, sans-serif" font-size="14" font-weight="800" fill="${colors.blue}">${r[1]}</text>`).join('')}<rect x="${x}" y="${y + 382}" width="${w}" height="52" rx="14" fill="${colors.blue}"/><text x="${x + w / 2}" y="${y + 416}" text-anchor="middle" font-family="Myanmar Text, sans-serif" font-size="14" font-weight="700" fill="#fff">ဆက်တင် သိမ်းမည်</text>`;
}

function entryScene(x, y, w, h) {
  return `<text x="${x}" y="${y + 10}" font-family="Myanmar Text, sans-serif" font-size="14" font-weight="700" fill="${colors.muted}">ယနေ့အလုပ်မှတ်တမ်း</text>
  ${field(x, y + 32, w, 'ရက်စွဲ', '2026-10-16')}${field(x, y + 112, w, 'အလုပ်ဝင်ချိန်', '08:00')}${field(x, y + 192, w, 'အလုပ်ဆင်းချိန်', '18:30')}
  <rect x="${x}" y="${y + 272}" width="${w}" height="70" rx="14" fill="#fff" stroke="${colors.line}"/><text x="${x + 16}" y="${y + 299}" font-family="Myanmar Text, sans-serif" font-size="11" fill="${colors.muted}">အလုပ်အမျိုးအစား</text><rect x="${x + 16}" y="${y + 310}" width="92" height="24" rx="12" fill="#E9F2FF"/><text x="${x + 62}" y="${y + 327}" text-anchor="middle" font-family="Myanmar Text, sans-serif" font-size="10" font-weight="700" fill="${colors.blue}">ပုံမှန် + OT</text>
  <rect x="${x}" y="${y + 364}" width="${w}" height="52" rx="14" fill="${colors.green}"/><text x="${x + w / 2}" y="${y + 398}" text-anchor="middle" font-family="Myanmar Text, sans-serif" font-size="14" font-weight="700" fill="#fff">မှတ်တမ်းသိမ်းမည်</text>`;
}

function field(x, y, w, label, value) {
  return `<rect x="${x}" y="${y}" width="${w}" height="64" rx="14" fill="#fff" stroke="${colors.line}"/><text x="${x + 14}" y="${y + 24}" font-family="Myanmar Text, sans-serif" font-size="11" fill="${colors.muted}">${label}</text><text x="${x + 14}" y="${y + 49}" font-family="Arial, sans-serif" font-size="16" font-weight="800" fill="${colors.navy}">${value}</text>`;
}

function calendarScene(x, y, w, h, accent) {
  const cells = Array.from({ length: 35 }, (_, i) => {
    const cx = x + (i % 7) * 42;
    const cy = y + 92 + Math.floor(i / 7) * 48;
    const active = [8,9,10,11,12,15,16,17,18,19,22,23,24,25,26].includes(i);
    return `<rect x="${cx}" y="${cy}" width="34" height="34" rx="9" fill="${active ? accent : '#fff'}" stroke="${active ? accent : colors.line}"/><text x="${cx + 17}" y="${cy + 22}" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" font-weight="700" fill="${active ? '#fff' : colors.muted}">${i + 1}</text>`;
  }).join('');
  return `<text x="${x}" y="${y + 12}" font-family="Myanmar Text, sans-serif" font-size="14" font-weight="700" fill="${colors.muted}">အောက်တိုဘာ 2026</text><text x="${x + w}" y="${y + 12}" text-anchor="end" font-family="Myanmar Text, sans-serif" font-size="12" font-weight="700" fill="${accent}">22 အလုပ်ရက်</text>${['တ','န','အ','ဗ','က','သ','စ'].map((d,i)=>`<text x="${x + i * 42 + 17}" y="${y + 62}" text-anchor="middle" font-family="Myanmar Text, sans-serif" font-size="11" fill="${colors.muted}">${d}</text>`).join('')}${cells}<rect x="${x}" y="${y + 365}" width="${w}" height="64" rx="14" fill="#fff" stroke="${colors.line}"/><text x="${x + 16}" y="${y + 390}" font-family="Myanmar Text, sans-serif" font-size="11" fill="${colors.muted}">စုစုပေါင်းအချိန်</text><text x="${x + 16}" y="${y + 416}" font-family="Arial, sans-serif" font-size="18" font-weight="800" fill="${colors.navy}">196 hr + OT 31.5 hr</text>`;
}

function typesScene(x, y, w, h) {
  const rows = [['ပုံမှန်', '8 hr', colors.blue], ['OT', '2.5 hr', colors.amber], ['ညဆိုင်း', '1 hr', colors.lavender], ['ပိတ်ရက်', '8 hr', colors.coral]];
  return `<text x="${x}" y="${y + 10}" font-family="Myanmar Text, sans-serif" font-size="14" font-weight="700" fill="${colors.muted}">အလုပ်အမျိုးအစား</text>${rows.map((r,i)=>`<rect x="${x}" y="${y + 34 + i * 88}" width="${w}" height="70" rx="16" fill="#fff" stroke="${colors.line}"/><rect x="${x + 14}" y="${y + 49 + i * 88}" width="40" height="40" rx="12" fill="${r[2]}"/><text x="${x + 68}" y="${y + 77 + i * 88}" font-family="Myanmar Text, sans-serif" font-size="14" font-weight="700" fill="${colors.ink}">${r[0]}</text><text x="${x + w - 18}" y="${y + 77 + i * 88}" text-anchor="end" font-family="Arial, sans-serif" font-size="16" font-weight="800" fill="${r[2]}">${r[1]}</text>`).join('')}<text x="${x + w / 2}" y="${y + 427}" text-anchor="middle" font-family="Myanmar Text, sans-serif" font-size="13" font-weight="700" fill="${colors.muted}">အမျိုးအစားအလိုက် ခွဲမှတ်ပါ</text>`;
}

function payslipScene(x, y, w, h) {
  const rows = [['အခြေခံလစာ', '₩2,300,000'], ['OT', '+ ₩420,000'], ['ညဆိုင်း', '+ ₩120,000'], ['ဖြတ်တောက်မှု', '- ₩186,000']];
  return `<rect x="${x}" y="${y}" width="${w}" height="430" rx="20" fill="#fff" stroke="${colors.line}"/><text x="${x + w / 2}" y="${y + 42}" text-anchor="middle" font-family="Myanmar Text, sans-serif" font-size="16" font-weight="700" fill="${colors.navy}">အောက်တိုဘာ လစာရှင်းတမ်း</text><line x1="${x + 20}" y1="${y + 62}" x2="${x + w - 20}" y2="${y + 62}" stroke="${colors.line}" stroke-dasharray="5 7"/>${rows.map((r,i)=>`<text x="${x + 20}" y="${y + 102 + i * 55}" font-family="Myanmar Text, sans-serif" font-size="13" fill="${colors.muted}">${r[0]}</text><text x="${x + w - 20}" y="${y + 102 + i * 55}" text-anchor="end" font-family="Arial, sans-serif" font-size="14" font-weight="800" fill="${i===3 ? colors.coral : colors.ink}">${r[1]}</text>`).join('')}<rect x="${x + 18}" y="${y + 300}" width="${w - 36}" height="105" rx="16" fill="#EAF2FF"/><text x="${x + w / 2}" y="${y + 336}" text-anchor="middle" font-family="Myanmar Text, sans-serif" font-size="12" font-weight="700" fill="${colors.blue}">ခန့်မှန်းအသားတင်လစာ</text><text x="${x + w / 2}" y="${y + 380}" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" font-weight="800" fill="${colors.navy}">₩2,654,000</text>`;
}

function backupScene(x, y, w, h) {
  return `<circle cx="${x + w / 2}" cy="${y + 135}" r="94" fill="#E8F8F1"/><path d="M ${x + 86} ${y + 155} C ${x + 90} ${y + 116}, ${x + 122} ${y + 98}, ${x + 151} ${y + 109} C ${x + 167} ${y + 76}, ${x + 224} ${y + 83}, ${x + 234} ${y + 123} C ${x + 276} ${y + 120}, ${x + 291} ${y + 177}, ${x + 248} ${y + 191} L ${x + 105} ${y + 191} C ${x + 70} ${y + 188}, ${x + 60} ${y + 165}, ${x + 86} ${y + 155} Z" fill="${colors.green}"/><path d="M ${x + 166} ${y + 172} L ${x + 166} ${y + 124} L ${x + 145} ${y + 145} M ${x + 166} ${y + 124} L ${x + 187} ${y + 145}" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
  ${stepRow(x, y + 272, w, '1', 'Backup ဖိုင်ထုတ်ပါ', colors.green)}${stepRow(x, y + 352, w, '2', 'လုံခြုံတဲ့နေရာမှာသိမ်းပါ', colors.blue)}${stepRow(x, y + 432, w, '3', 'လိုအပ်ရင် Restore ပြန်လုပ်ပါ', colors.amber)}`;
}

function stepRow(x, y, w, num, label, accent) {
  return `<circle cx="${x + 24}" cy="${y}" r="22" fill="${accent}"/><text x="${x + 24}" y="${y + 7}" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" font-weight="800" fill="#fff">${num}</text><text x="${x + 60}" y="${y + 7}" font-family="Myanmar Text, sans-serif" font-size="14" font-weight="700" fill="${colors.ink}">${label}</text>`;
}

function languagesScene(x, y, w, h) {
  const langs = [['MY','မြန်မာ'],['KO','한국어'],['EN','English'],['TH','ไทย'],['VI','Tiếng Việt'],['ID','Indonesia']];
  return `<text x="${x}" y="${y + 8}" font-family="Myanmar Text, sans-serif" font-size="14" font-weight="700" fill="${colors.muted}">Language / ဘာသာစကား</text>${langs.map((r,i)=>{const col=i%2,row=Math.floor(i/2), bx=x+col*155,by=y+36+row*96;const ac=[colors.blue,colors.coral,colors.cyan,colors.amber,colors.green,colors.lavender][i];return `<rect x="${bx}" y="${by}" width="140" height="78" rx="16" fill="#fff" stroke="${colors.line}"/><rect x="${bx+12}" y="${by+17}" width="44" height="44" rx="12" fill="${ac}"/><text x="${bx+34}" y="${by+46}" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="800" fill="#fff">${r[0]}</text><text x="${bx+66}" y="${by+46}" font-family="Myanmar Text, Malgun Gothic, sans-serif" font-size="12" font-weight="700" fill="${colors.ink}">${r[1]}</text>`;}).join('')}<rect x="${x}" y="${y + 348}" width="${w}" height="78" rx="16" fill="#FFF5E7"/><text x="${x + w / 2}" y="${y + 380}" text-anchor="middle" font-family="Myanmar Text, sans-serif" font-size="13" font-weight="700" fill="${colors.ink}">ဘာသာစကားပြောင်းပြီး</text><text x="${x + w / 2}" y="${y + 405}" text-anchor="middle" font-family="Myanmar Text, sans-serif" font-size="13" font-weight="700" fill="${colors.coral}">အလွယ်တကူ အသုံးပြုပါ</text>`;
}

function downloadScene(x, y, w, h) {
  return `${iconMark(x + 82, y + 5, 138)}<text x="${x + w / 2}" y="${y + 184}" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" font-weight="800" fill="${colors.navy}">SMART SALARY TRACKER</text><rect x="${x}" y="${y + 222}" width="${w}" height="74" rx="18" fill="${colors.blue}"/><text x="${x + w / 2}" y="${y + 253}" text-anchor="middle" font-family="Myanmar Text, sans-serif" font-size="14" font-weight="700" fill="#fff">WebApp မှာ ချက်ချင်းစသုံးပါ</text><text x="${x + w / 2}" y="${y + 278}" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" font-weight="700" fill="#DDEBFF">webdist-puce.vercel.app</text><rect x="${x}" y="${y + 315}" width="${w}" height="74" rx="18" fill="${colors.navy}"/><text x="${x + w / 2}" y="${y + 360}" text-anchor="middle" font-family="Myanmar Text, sans-serif" font-size="14" font-weight="700" fill="#fff">Android APK ဒေါင်းလုပ်လုပ်ပါ</text><text x="${x + w / 2}" y="${y + 438}" text-anchor="middle" font-family="Myanmar Text, sans-serif" font-size="13" font-weight="700" fill="${colors.muted}">အလုပ်ချိန်ကိုမှတ် • လစာကိုသိ</text>`;
}

function sceneFor(post, x, y, w, h) {
  const scenes = {
    dashboard: dashboardScene,
    compare: compareScene,
    settings: settingsScene,
    entry: entryScene,
    calendar: calendarScene,
    types: typesScene,
    payslip: payslipScene,
    backup: backupScene,
    languages: languagesScene,
    download: downloadScene
  };
  return scenes[post.scene](x, y, w, h, post.accent);
}

function squareSvg(post) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <rect width="1080" height="1080" fill="${colors.pale}"/>
  <rect x="0" y="0" width="18" height="1080" fill="${post.accent}"/>
  <path d="M 35 1010 H 520" stroke="${post.accent}" stroke-width="10"/><path d="M 35 1038 H 340" stroke="${colors.navy}" stroke-width="4"/>
  ${header(1080)}
  <rect x="70" y="184" width="196" height="36" rx="18" fill="${post.accent}"/><text x="168" y="208" text-anchor="middle" font-family="Arial, Myanmar Text, sans-serif" font-size="14" font-weight="800" fill="#fff">${esc(post.badge)}</text>
  ${textLines(post.kicker.split('\n'), 70, 264, 22, post.accent, 800)}
  ${textLines(post.title, 70, 330, 50, colors.navy, 800, 1.22)}
  ${textLines(post.sub, 70, 485, 22, colors.muted, 600, 1.5)}
  <rect x="70" y="614" width="470" height="190" rx="24" fill="#fff" stroke="${colors.line}"/>
  <text x="102" y="658" font-family="Myanmar Text, sans-serif" font-size="15" font-weight="700" fill="${post.accent}">WHY IT MATTERS</text>
  ${textLines(benefitLines(post.scene), 102, 704, 20, colors.ink, 700, 1.55)}
  <rect x="70" y="852" width="470" height="70" rx="18" fill="${colors.navy}"/><text x="305" y="883" text-anchor="middle" font-family="Myanmar Text, sans-serif" font-size="15" font-weight="700" fill="#fff">စမ်းသုံးရန်</text><text x="305" y="907" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="${colors.cyan}">webdist-puce.vercel.app</text>
  ${phoneShell((x,y,w,h,a)=>sceneFor(post,x,y,w,h), 620, 212, 360, 744, post.accent)}
  </svg>`;
}

function benefitLines(scene) {
  const map = {
    dashboard: ['• နေ့စဉ်အလုပ်ချိန် စနစ်တကျ', '• လစဉ်လစာ ကြိုတင်ခန့်မှန်း', '• ကိုယ့်မှတ်တမ်း ကိုယ်ပိုင်ထားရှိ'],
    compare: ['• စာရွက်နဲ့ chat history မလို', '• ရက်စွဲအလိုက် ပြန်ရှာလွယ်', '• OT လွတ်သွားတာ လျော့နည်း'],
    settings: ['• စာချုပ်အလိုက် နှုန်းထားပြင်', '• တစ်ကြိမ်သတ်မှတ်ပြီး ဆက်သုံး', '• Payslip နဲ့ အမြဲတိုက်စစ်'],
    entry: ['• ရက်စွဲရွေး', '• ဝင်/ဆင်းချိန်ထည့်', '• အလုပ်အမျိုးအစားရွေးပြီး သိမ်း'],
    calendar: ['• အလုပ်ရက် တစ်ချက်ကြည့်', '• OT နာရီ စုစည်းကြည့်', '• လစဉ်အခြေအနေ သိရှိ'],
    types: ['• ပုံမှန် / OT', '• ညဆိုင်း / ပိတ်ရက်', '• လစာရခွင့်ရက်'],
    payslip: ['• ဝင်ငွေ စုစည်းချက်', '• ဖြတ်တောက်မှု မှတ်တမ်း', '• ခန့်မှန်း အသားတင်လစာ'],
    backup: ['• အနည်းဆုံး လစဉ်တစ်ကြိမ်', '• လုံခြုံတဲ့နေရာမှာ သိမ်း', '• ဖုန်းပြောင်းလည်း ပြန်ယူနိုင်'],
    languages: ['• မြန်မာ / ကိုရီးယား / အင်္ဂလိပ်', '• ထိုင်း / ဗီယက်နမ် / အင်ဒို', '• လုပ်ဖော်ကိုင်ဖက်နဲ့ မျှဝေသုံး'],
    download: ['• Browser မှာ ချက်ချင်းသုံး', '• Android APK ထည့်သုံး', '• မိတ်ဆွေတွေဆီ Share လုပ်']
  };
  return map[scene];
}

function verticalSvg(post, sequenceLabel) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  <rect width="1080" height="1920" fill="${colors.pale}"/><rect x="0" y="0" width="1080" height="22" fill="${post.accent}"/>
  ${header(1080, true)}
  <rect x="70" y="190" width="210" height="40" rx="20" fill="${post.accent}"/><text x="175" y="216" text-anchor="middle" font-family="Arial, sans-serif" font-size="15" font-weight="800" fill="#fff">${esc(post.badge)}</text>
  ${textLines(post.title, 70, 315, 64, colors.navy, 800, 1.25)}
  ${textLines(post.sub, 70, 505, 28, colors.muted, 600, 1.5)}
  ${phoneShell((x,y,w,h,a)=>sceneFor(post,x,y,w,h), 250, 680, 580, 900, post.accent).replaceAll('font-size="14"','font-size="18"').replaceAll('font-size="13"','font-size="17"').replaceAll('font-size="12"','font-size="16"').replaceAll('font-size="11"','font-size="15"').replaceAll('font-size="10"','font-size="14"')}
  <rect x="70" y="1660" width="940" height="112" rx="28" fill="${colors.navy}"/><text x="540" y="1705" text-anchor="middle" font-family="Myanmar Text, sans-serif" font-size="24" font-weight="700" fill="#fff">အလုပ်ချိန်ကိုမှတ် • လစာကိုသိ</text><text x="540" y="1746" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="${colors.cyan}">webdist-puce.vercel.app</text>
  <text x="70" y="1848" font-family="Arial, sans-serif" font-size="20" font-weight="700" fill="${colors.muted}">${esc(sequenceLabel)}</text><text x="1010" y="1848" text-anchor="end" font-family="Arial, sans-serif" font-size="20" font-weight="700" fill="${post.accent}">@SMART SALARY TRACKER</text>
  </svg>`;
}

function run(command, args, label) {
  const result = spawnSync(command, args, { cwd: campaignDir, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`${label} failed\n${result.stdout}\n${result.stderr}`);
  }
}

function renderSvg(svg, basePath) {
  const svgPath = `${basePath}.svg`;
  const pngPath = `${basePath}.png`;
  fs.writeFileSync(svgPath, svg, 'utf8');
  run('magick', ['-background', 'none', svgPath, pngPath], `Render ${path.basename(basePath)}`);
  return pngPath;
}

for (const post of posts) {
  renderSvg(squareSvg(post), path.join(imageDir, `post-${post.id}`));
}

const reelSpecs = [
  { name: 'reel-01-brand-overview', ids: [0, 1, 3, 6, 9], label: 'BRAND OVERVIEW' },
  { name: 'reel-02-how-to-use', ids: [2, 3, 4, 6, 7, 9], label: 'HOW TO USE' }
];

for (const reel of reelSpecs) {
  const reelFrameDir = path.join(frameDir, reel.name);
  fs.mkdirSync(reelFrameDir, { recursive: true });
  const rendered = reel.ids.map((postIndex, i) => renderSvg(verticalSvg(posts[postIndex], `${reel.label}  ${String(i + 1).padStart(2, '0')} / ${String(reel.ids.length).padStart(2, '0')}`), path.join(reelFrameDir, `frame-${String(i + 1).padStart(2, '0')}`)));
  const concatPath = path.join(reelFrameDir, 'concat.txt');
  const concat = rendered.flatMap(file => [`file '${file.replaceAll("'", "'\\''")}'`, 'duration 3.5']).concat(`file '${rendered.at(-1).replaceAll("'", "'\\''")}'`).join('\n');
  fs.writeFileSync(concatPath, concat, 'utf8');
  run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', concatPath, '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-movflags', '+faststart', path.join(videoDir, `${reel.name}.mp4`)], `Build ${reel.name}`);
  fs.copyFileSync(rendered[0], path.join(videoDir, `${reel.name}-cover.png`));
}

const postPngs = posts.map(post => path.join(imageDir, `post-${post.id}.png`));
run('magick', ['montage', ...postPngs, '-thumbnail', '320x320', '-tile', '5x2', '-geometry', '+16+16', '-background', colors.navy, path.join(campaignDir, 'assets', 'campaign-preview.jpg')], 'Build campaign preview');

console.log(`Generated ${posts.length} post images and ${reelSpecs.length} videos in ${path.join(campaignDir, 'assets')}`);
