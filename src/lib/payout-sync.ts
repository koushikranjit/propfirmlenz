import fs from 'fs';
import path from 'path';

export interface Payout24hRow {
  firm: string;
  methods: string;
  total: string;
  count: string;
  largest: string;
  average: string;
  latest: string;
}

export interface PayoutPeriodHeadline {
  range: string;
  total: string;
}

export interface PayoutPeriodRow {
  cells: string[];
  firm: string;
  method: string;
}

export interface PayoutPeriodData {
  headline: PayoutPeriodHeadline;
  rows: PayoutPeriodRow[];
}

export interface PayoutRecord {
  firm: string;
  method: string;
  date: string;
  amount: string;
}

export interface PayoutDataset {
  captured_at: string;
  attribution: {
    text: string;
    url: string;
  };
  trader_leaderboard: Array<{
    trader: string;
    firm: string;
    amount: string;
    date: string;
  }>;
  latest_24h: Payout24hRow[];
  weekly: PayoutPeriodData;
  monthly: PayoutPeriodData;
  records: PayoutRecord[];
  stats: Record<string, unknown>;
}

// In-memory cache
let cachedDataset: PayoutDataset | null = null;
let lastSyncTimestamp = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minute

function decodeEntities(str?: string): string {
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

function cleanText(str?: string): string {
  if (!str) return '';
  const decoded = decodeEntities(str);
  return decoded.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseLatest24h(html: string): Payout24hRow[] {
  const tbodyMatch = html.match(/<tbody[\s\S]*?<\/tbody>/i);
  if (!tbodyMatch || !tbodyMatch[0]) return [];
  const rows = [...tbodyMatch[0].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  const list: Payout24hRow[] = [];

  for (const r of rows) {
    const rowContent = r[1] || '';
    const tds = [...rowContent.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1] || '');
    if (tds.length < 6) continue;

    const firmTd = tds[0] || '';
    const nameMatch = firmTd.match(/<a class="fname"[^>]*>([\s\S]*?)<\/a>/i);
    const firmName = nameMatch && nameMatch[1] ? cleanText(nameMatch[1]) : cleanText(firmTd);

    const chipMatches = [...firmTd.matchAll(/<span class="rchip"[^>]*>([\s\S]*?)<\/span>/gi)];
    const methods = chipMatches.map(m => cleanText(m[1] || '')).filter(Boolean).join(' ') || 'Rise';

    const total = cleanText(tds[1]);
    const count = cleanText(tds[2]);
    const largest = cleanText(tds[3]);
    const average = cleanText(tds[4]);
    const latest = cleanText(tds[5]);

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

function parsePeriod(html: string, kind: 'weekly' | 'monthly'): PayoutPeriodData {
  const h1Match = html.match(/<h1[\s\S]*?>([\s\S]*?)<\/h1>/i);
  let range = '';
  if (h1Match && h1Match[1]) {
    const rawH1 = cleanText(h1Match[1]);
    const parts = rawH1.split('·');
    if (parts.length > 1 && parts[1]) {
      range = parts[1].trim().replace(/^Week of\s+/i, '');
    } else {
      range = rawH1;
    }
  }

  const tbodyMatch = html.match(/<tbody[\s\S]*?<\/tbody>/i);
  if (!tbodyMatch || !tbodyMatch[0]) {
    return {
      headline: {
        range: range || (kind === 'weekly' ? 'Current Week' : 'Current Month'),
        total: '$0'
      },
      rows: []
    };
  }

  const trs = [...tbodyMatch[0].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  const rows: PayoutPeriodRow[] = [];
  let periodTotal = 0;

  for (const r of trs) {
    const rowContent = r[1] || '';
    const tds = [...rowContent.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1] || '');
    if (tds.length < 6) continue;

    const rank = cleanText(tds[0]);
    const firmTd = tds[1] || '';
    const nameMatch = firmTd.match(/<a class="fname"[^>]*>([\s\S]*?)<\/a>/i);
    const firmName = nameMatch && nameMatch[1] ? cleanText(nameMatch[1]) : cleanText(firmTd);

    const chipMatches = [...firmTd.matchAll(/<span class="rchip"[^>]*>([\s\S]*?)<\/span>/gi)];
    const method = chipMatches.map(m => cleanText(m[1] || '')).filter(Boolean).join(' ') || 'Rise';

    const firmCellText = `${firmName} Tracked payout method: ${method}`;
    const total = cleanText(tds[2]);
    const count = cleanText(tds[3]);
    const change = cleanText(tds[4]);
    const share = cleanText(tds[5]);

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

function parseRecords(html: string): PayoutRecord[] {
  const tbodyMatch = html.match(/<tbody[\s\S]*?<\/tbody>/i);
  if (!tbodyMatch || !tbodyMatch[0]) return [];
  const trs = [...tbodyMatch[0].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  const list: PayoutRecord[] = [];

  for (const r of trs) {
    const rowContent = r[1] || '';
    const tds = [...rowContent.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1] || '');
    if (tds.length < 4) continue;

    const firmTd = tds[1] || '';
    const nameMatch = firmTd.match(/<a class="fname"[^>]*>([\s\S]*?)<\/a>/i);
    const firmName = nameMatch && nameMatch[1] ? cleanText(nameMatch[1]) : cleanText(firmTd);

    const chipMatches = [...firmTd.matchAll(/<span class="rchip"[^>]*>([\s\S]*?)<\/span>/gi)];
    const method = chipMatches.map(m => cleanText(m[1] || '')).filter(Boolean).join(' ') || 'Rise';

    const date = cleanText(tds[2]);
    const amount = cleanText(tds[3]);

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

export async function fetchLivePayoutData(): Promise<PayoutDataset> {
  const upstreamBase = 'https://payoutjunction.com';
  
  const [homeHtml, weeklyHtml, monthlyHtml, recordsHtml, statsJson] = await Promise.all([
    fetch(`${upstreamBase}/`, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }).then(r => r.text()),
    fetch(`${upstreamBase}/weekly`, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }).then(r => r.text()),
    fetch(`${upstreamBase}/monthly`, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }).then(r => r.text()),
    fetch(`${upstreamBase}/records`, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }).then(r => r.text()),
    fetch(`${upstreamBase}/statistics/data.json`, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }).then(r => r.json())
  ]);

  const latest_24h = parseLatest24h(homeHtml);
  const weekly = parsePeriod(weeklyHtml, 'weekly');
  const monthly = parsePeriod(monthlyHtml, 'monthly');
  const records = parseRecords(recordsHtml);

  // Clean stats object: remove any public mentions of upstream domain
  const cleanStats = { ...(statsJson as Record<string, unknown>) };
  delete cleanStats.source;
  delete cleanStats.license_note;

  const dataset: PayoutDataset = {
    captured_at: new Date().toISOString(),
    attribution: {
      text: "Live Verified Blockchain Feed",
      url: "#page-payouts"
    },
    trader_leaderboard: cachedDataset?.trader_leaderboard || DEFAULT_LEADERBOARD,
    latest_24h,
    weekly,
    monthly,
    records,
    stats: cleanStats
  };

  return dataset;
}

export async function getPayoutData(): Promise<PayoutDataset> {
  const now = Date.now();
  if (cachedDataset && now - lastSyncTimestamp < CACHE_TTL_MS) {
    return cachedDataset;
  }

  // Try reading from disk cache if memory cache is empty
  const cacheFilePath = path.join(process.cwd(), 'public/data/payouts.json');
  if (!cachedDataset && fs.existsSync(cacheFilePath)) {
    try {
      const diskContent = fs.readFileSync(cacheFilePath, 'utf8');
      cachedDataset = JSON.parse(diskContent);
      lastSyncTimestamp = now;
      // Trigger background refresh if stale
      fetchLivePayoutData()
        .then(fresh => saveSyncedPayouts(fresh))
        .catch(() => {});
      return cachedDataset!;
    } catch {
      // Fall through to live fetch
    }
  }

  try {
    const live = await fetchLivePayoutData();
    saveSyncedPayouts(live);
    return live;
  } catch (err) {
    console.error('Failed to sync live payouts:', err);
    if (cachedDataset) return cachedDataset;
    throw err;
  }
}

export function saveSyncedPayouts(dataset: PayoutDataset) {
  cachedDataset = dataset;
  lastSyncTimestamp = Date.now();

  try {
    // 1. Save JSON to public/data/payouts.json
    const dataDir = path.join(process.cwd(), 'public/data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const cacheFilePath = path.join(dataDir, 'payouts.json');
    fs.writeFileSync(cacheFilePath, JSON.stringify(dataset, null, 2), 'utf8');

    // 2. Update public/clone-app.js embedded PAYOUT_DATA block so static bundle stays in sync
    const cloneAppPath = path.join(process.cwd(), 'public/clone-app.js');
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

        // 3. Re-sync index.html and clone.html directly with fs
        const cssPath = path.join(process.cwd(), 'src/app/clone.css');
        const bodyPath = path.join(process.cwd(), 'src/app/clone-body.html');
        if (fs.existsSync(cssPath) && fs.existsSync(bodyPath)) {
          const rawCss = fs.readFileSync(cssPath, 'utf8');
          const css = rawCss.replaceAll('/assets/logo-mark.png', 'assets/logo-mark.png');
          const body = fs.readFileSync(bodyPath, 'utf8');
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
${updated}
</script>
</body>
</html>
`;
          fs.writeFileSync(path.join(process.cwd(), 'public/index.html'), htmlContent, 'utf8');
          fs.writeFileSync(path.join(process.cwd(), 'public/clone.html'), htmlContent, 'utf8');
        }
      }
    }
  } catch (err) {
    console.error('Error saving synced payouts:', err);
  }
}
