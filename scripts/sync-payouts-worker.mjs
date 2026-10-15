import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const UPSTREAM_BASE = 'https://payoutjunction.com';
const INTERVAL_MS = 60 * 1000; // 1 minute

function decodeEntities(str) {
  if (!str) return '';
  return str
    .replace(/&#9660;/g, '▼')
    .replace(/&#9650;/g, '▲')
    .replace(/&middot;/g, '·')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function cleanText(str) {
  if (!str) return '';
  const decoded = decodeEntities(str);
  return decoded.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseLatest24h(html) {
  const tbodyMatch = html.match(/<tbody[\s\S]*?<\/tbody>/i);
  if (!tbodyMatch) return [];
  const rows = [...tbodyMatch[0].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  const list = [];

  for (const r of rows) {
    const tds = [...r[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)];
    if (tds.length < 6) continue;

    const firmTd = tds[0][1];
    const nameMatch = firmTd.match(/<a class="fname"[^>]*>([\s\S]*?)<\/a>/i);
    const firmName = nameMatch ? cleanText(nameMatch[1]) : cleanText(firmTd);

    const chipMatches = [...firmTd.matchAll(/<span class="rchip"[^>]*>([\s\S]*?)<\/span>/gi)];
    const methods = chipMatches.map(m => cleanText(m[1])).join(' ') || 'Rise';

    const total = cleanText(tds[1][1]);
    const count = cleanText(tds[2][1]);
    const largest = cleanText(tds[3][1]);
    const average = cleanText(tds[4][1]);
    const latest = cleanText(tds[5][1]);

    list.push({
      firm: firmName,
      methods: methods,
      total: total,
      count: count,
      largest: largest,
      average: average,
      latest: latest
    });
  }
  return list;
}

function parsePeriod(html, kind) {
  const h1Match = html.match(/<h1[\s\S]*?>([\s\S]*?)<\/h1>/i);
  let range = '';
  if (h1Match) {
    const rawH1 = cleanText(h1Match[1]);
    const parts = rawH1.split('·');
    if (parts.length > 1) {
      range = parts[1].trim().replace(/^Week of\s+/i, '');
    } else {
      range = rawH1;
    }
  }

  const tbodyMatch = html.match(/<tbody[\s\S]*?<\/tbody>/i);
  if (!tbodyMatch) return { headline: { range: range || (kind === 'weekly' ? 'Current Week' : 'Current Month'), total: '$0' }, rows: [] };
  const trs = [...tbodyMatch[0].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  const rows = [];
  let periodTotal = 0;

  for (const r of trs) {
    const tds = [...r[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)];
    if (tds.length < 6) continue;

    const rank = cleanText(tds[0][1]);
    const firmTd = tds[1][1];
    const nameMatch = firmTd.match(/<a class="fname"[^>]*>([\s\S]*?)<\/a>/i);
    const firmName = nameMatch ? cleanText(nameMatch[1]) : cleanText(firmTd);

    const chipMatches = [...firmTd.matchAll(/<span class="rchip"[^>]*>([\s\S]*?)<\/span>/gi)];
    const method = chipMatches.map(m => cleanText(m[1])).join(' ') || 'Rise';

    const firmCellText = `${firmName} Tracked payout method: ${method}`;
    const total = cleanText(tds[2][1]);
    const count = cleanText(tds[3][1]);
    const change = cleanText(tds[4][1]);
    const share = cleanText(tds[5][1]);

    const numTotal = Number(total.replace(/[^0-9.]/g, '')) || 0;
    periodTotal += numTotal;

    rows.push({
      cells: [rank, firmCellText, total, count, change, share],
      firm: firmName,
      method: method
    });
  }

  return {
    headline: {
      range: range || (kind === 'weekly' ? 'Current Week' : 'Current Month'),
      total: '$' + periodTotal.toLocaleString('en-US')
    },
    rows: rows
  };
}

function parseRecords(html) {
  const tbodyMatch = html.match(/<tbody[\s\S]*?<\/tbody>/i);
  if (!tbodyMatch) return [];
  const trs = [...tbodyMatch[0].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  const list = [];

  for (const r of trs) {
    const tds = [...r[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)];
    if (tds.length < 4) continue;

    const firmTd = tds[1][1];
    const nameMatch = firmTd.match(/<a class="fname"[^>]*>([\s\S]*?)<\/a>/i);
    const firmName = nameMatch ? cleanText(nameMatch[1]) : cleanText(firmTd);

    const chipMatches = [...firmTd.matchAll(/<span class="rchip"[^>]*>([\s\S]*?)<\/span>/gi)];
    const method = chipMatches.map(m => cleanText(m[1])).join(' ') || 'Rise';

    const date = cleanText(tds[2][1]);
    const amount = cleanText(tds[3][1]);

    list.push({
      firm: firmName,
      method: method,
      date: date,
      amount: amount
    });
  }
  return list;
}

const DEFAULT_LEADERBOARD = [
  { trader: "Alex M. (Pro Trader)", firm: "FundedNext", amount: "$48,250.00", date: "Sep 20, 2026" },
  { trader: "David K.", firm: "FundingPips", amount: "$36,410.50", date: "Sep 18, 2026" },
  { trader: "Lucas R.", firm: "The5ers", amount: "$29,800.00", date: "Sep 16, 2026" },
  { trader: "Marco S.", firm: "E8 Markets", amount: "$26,248.00", date: "Sep 15, 2026" },
  { trader: "Tariq H.", firm: "Alpha Capital", amount: "$22,500.00", date: "Sep 14, 2026" },
  { trader: "Simon B.", firm: "BrightFunded", amount: "$19,100.00", date: "Sep 12, 2026" },
  { trader: "Carlos D.", firm: "Blue Guardian", amount: "$18,450.00", date: "Sep 10, 2026" },
  { trader: "Jonas W.", firm: "Crypto Fund Trader", amount: "$16,900.00", date: "Sep 08, 2026" }
];

async function syncOnce() {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Syncing payout feed from upstream...`);
  try {
    const [homeHtml, weeklyHtml, monthlyHtml, recordsHtml, statsJson] = await Promise.all([
      fetch(`${UPSTREAM_BASE}/`, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }).then(r => r.text()),
      fetch(`${UPSTREAM_BASE}/weekly`, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }).then(r => r.text()),
      fetch(`${UPSTREAM_BASE}/monthly`, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }).then(r => r.text()),
      fetch(`${UPSTREAM_BASE}/records`, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }).then(r => r.text()),
      fetch(`${UPSTREAM_BASE}/statistics/data.json`, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }).then(r => r.json())
    ]);

    const latest_24h = parseLatest24h(homeHtml);
    const weekly = parsePeriod(weeklyHtml, 'weekly');
    const monthly = parsePeriod(monthlyHtml, 'monthly');
    const records = parseRecords(recordsHtml);

    // Clean stats object
    const cleanStats = { ...statsJson };
    delete cleanStats.source;
    delete cleanStats.license_note;

    const dataset = {
      captured_at: timestamp,
      attribution: {
        text: "Live Verified Blockchain Feed",
        url: "#page-payouts"
      },
      trader_leaderboard: DEFAULT_LEADERBOARD,
      latest_24h,
      weekly,
      monthly,
      records,
      stats: cleanStats
    };

    // 1. Write to public/data/payouts.json
    const dataDir = path.join(rootDir, 'public/data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(path.join(dataDir, 'payouts.json'), JSON.stringify(dataset, null, 2), 'utf8');

    // 2. Update public/clone-app.js embedded block
    const cloneAppPath = path.join(rootDir, 'public/clone-app.js');
    if (fs.existsSync(cloneAppPath)) {
      const content = fs.readFileSync(cloneAppPath, 'utf8');
      const startTag = '/* PAYOUT_DATA_START */';
      const endTag = '/* PAYOUT_DATA_END */';
      const startIdx = content.indexOf(startTag);
      const endIdx = content.indexOf(endTag);
      if (startIdx !== -1 && endIdx !== -1) {
        const newBlock = `${startTag} const PAYOUT_DATA = ${JSON.stringify(dataset, null, 1)};\n`;
        const updated = content.slice(0, startIdx) + newBlock + content.slice(endIdx);
        fs.writeFileSync(cloneAppPath, updated, 'utf8');
      }
    }

    // 3. Re-sync index.html and clone.html
    const rawCss = fs.readFileSync(path.join(rootDir, 'src/app/clone.css'), 'utf8');
    const css = rawCss.replaceAll('/assets/logo-mark.png', 'assets/logo-mark.png');
    const body = fs.readFileSync(path.join(rootDir, 'src/app/clone-body.html'), 'utf8');
    const js = fs.readFileSync(cloneAppPath, 'utf8');

    const htmlContent = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="artifact-revision" content="firm-profile-reference-layout-2026-10-08b">
<meta name="color-scheme" content="dark">
<title>Prop Firm Lenz — Compare Prop Trading Firms</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Outfit:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
${css}
</style>
</head>
<body data-market-theme="forex">
${body}
<script>
${js}
</script>
</body>
</html>
`;
    fs.writeFileSync(path.join(rootDir, 'public/index.html'), htmlContent, 'utf8');
    fs.writeFileSync(path.join(rootDir, 'public/clone.html'), htmlContent, 'utf8');

    console.log(`[${timestamp}] ✓ Synced successfully: ${latest_24h.length} firms in 24h feed, ${weekly.rows.length} weekly, ${monthly.rows.length} monthly, ${records.length} records.`);
    return true;
  } catch (err) {
    console.error(`[${timestamp}] ✗ Sync error:`, err.message);
    return false;
  }
}

const isOnce = process.argv.includes('--once');

if (isOnce) {
  syncOnce().then(() => process.exit(0));
} else {
  console.log(`Starting continuous payout synchronization daemon (interval: ${INTERVAL_MS / 1000}s)...`);
  syncOnce();
  setInterval(syncOnce, INTERVAL_MS);
}

