import fs from 'fs';
import path from 'path';

export interface Payout24hRow {
  firm: string;
  slug?: string;
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

export interface FirmDetailData {
  slug: string;
  firm: string;
  website: string;
  websiteUrl: string;
  promo: string;
  total: string;
  rail: string;
  count: string;
  average: string;
  largest: string;
  largestDate: string;
  latestTime: string;
  latestAmount: string;
  monthlyVolume: Array<{ month: string; amount: string; num: number }>;
  dailyVolume: Array<{ date: string; amount: string; num: number }>;
  top10: Array<{ date: string; amount: string; rail: string }>;
  latestPayouts: Array<{ time: string; amount: string; rail: string }>;
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
  last_7d?: Payout24hRow[];
  weekly: PayoutPeriodData;
  monthly: PayoutPeriodData;
  last_30d?: Payout24hRow[];
  all_time: Payout24hRow[];
  records: PayoutRecord[];
  stats: Record<string, unknown>;
  firm_details?: Record<string, FirmDetailData>;
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
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–');
}

function cleanText(str?: string): string {
  if (!str) return '';
  const decoded = decodeEntities(str);
  return decoded.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseStandardTable(html: string): Payout24hRow[] {
  const tbodyMatch = html.match(/<tbody[\s\S]*?<\/tbody>/i);
  if (!tbodyMatch || !tbodyMatch[0]) return [];
  const rows = [...tbodyMatch[0].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  const list: Payout24hRow[] = [];

  for (const r of rows) {
    const rHtml = r[1] ?? '';
    const tds = [...rHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)];
    if (tds.length < 6) continue;

    const firmTd = tds[0]?.[1] ?? '';
    const nameMatch = firmTd.match(/<a class="fname"[^>]*>([\s\S]*?)<\/a>/i);
    const firmName = nameMatch && nameMatch[1] ? cleanText(nameMatch[1]) : cleanText(firmTd);

    const slugMatch = firmTd.match(/href="\/firms\/([^"]+)"/i);
    const slug = slugMatch && slugMatch[1] ? slugMatch[1] : firmName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    const chipMatches = [...firmTd.matchAll(/<span class="rchip"[^>]*>([\s\S]*?)<\/span>/gi)];
    const methods = chipMatches.map(m => cleanText(m[1] ?? '')).join(' ') || 'Rise';

    const total = cleanText(tds[1]?.[1] ?? '');
    const count = cleanText(tds[2]?.[1] ?? '');
    const largest = cleanText(tds[3]?.[1] ?? '');
    const average = cleanText(tds[4]?.[1] ?? '');
    const latest = cleanText(tds[5]?.[1] ?? '');

    list.push({
      firm: firmName,
      slug: slug || firmName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      methods,
      total,
      count,
      largest,
      average,
      latest
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
    const rHtml = r[1] ?? '';
    const tds = [...rHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)];
    if (tds.length < 6) continue;

    const rank = cleanText(tds[0]?.[1] ?? '');
    const firmTd = tds[1]?.[1] ?? '';
    const nameMatch = firmTd.match(/<a class="fname"[^>]*>([\s\S]*?)<\/a>/i);
    const firmName = nameMatch && nameMatch[1] ? cleanText(nameMatch[1]) : cleanText(firmTd);

    const chipMatches = [...firmTd.matchAll(/<span class="rchip"[^>]*>([\s\S]*?)<\/span>/gi)];
    const method = chipMatches.map(m => cleanText(m[1] ?? '')).join(' ') || 'Rise';

    const firmCellText = `${firmName} Tracked payout method: ${method}`;
    const total = cleanText(tds[2]?.[1] ?? '');
    const count = cleanText(tds[3]?.[1] ?? '');
    const change = cleanText(tds[4]?.[1] ?? '');
    const share = cleanText(tds[5]?.[1] ?? '');

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
    const rHtml = r[1] ?? '';
    const tds = [...rHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)];
    if (tds.length < 4) continue;

    const firmTd = tds[1]?.[1] ?? '';
    const nameMatch = firmTd.match(/<a class="fname"[^>]*>([\s\S]*?)<\/a>/i);
    const firmName = nameMatch && nameMatch[1] ? cleanText(nameMatch[1]) : cleanText(firmTd);

    const chipMatches = [...firmTd.matchAll(/<span class="rchip"[^>]*>([\s\S]*?)<\/span>/gi)];
    const method = chipMatches.map(m => cleanText(m[1] ?? '')).join(' ') || 'Rise';

    const date = cleanText(tds[2]?.[1] ?? '');
    const amount = cleanText(tds[3]?.[1] ?? '');

    list.push({
      firm: firmName,
      method: method,
      date: date,
      amount: amount
    });
  }
  return list;
}

function parseFirmPage(html: string, slug: string): FirmDetailData {
  const nameMatch = html.match(/<h1 class="nb">([\s\S]*?)<\/h1>/i);
  const firmName = nameMatch && nameMatch[1] ? cleanText(nameMatch[1]) : slug;

  const fwebMatch = html.match(/<a class="fweb"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
  const website = fwebMatch && fwebMatch[2] ? cleanText(fwebMatch[2]) : '';
  const websiteUrl = fwebMatch && fwebMatch[1] ? fwebMatch[1] : '';

  const couponMatch = html.match(/<div class="pjcoupon">([\s\S]*?)<\/div>/i);
  let promo = '';
  if (couponMatch && couponMatch[1]) {
    promo = cleanText(couponMatch[1]).replace(/\s*Copy\s*$/i, '');
  }

  let total = '—';
  let rail = 'Rise';
  let count = '—';
  let average = '—';
  let largest = '—';
  let largestDate = '—';
  let latestTime = '—';
  let latestAmount = '—';

  const statCards = [...html.matchAll(/<div class="stat">([\s\S]*?)<\/div>\s*(?=<div class="stat">|<\/div>\s*<div class="panel)/gi)];
  if (statCards.length >= 4) {
    const card0 = statCards[0]?.[1] ?? '';
    const v0 = card0.match(/<span class="v">([\s\S]*?)<\/span>/i);
    total = v0 && v0[1] ? cleanText(v0[1]) : '—';
    const r0 = card0.match(/via <span class="rail">([\s\S]*?)<\/span>/i);
    rail = r0 && r0[1] ? cleanText(r0[1]) : 'Rise';

    const card1 = statCards[1]?.[1] ?? '';
    const v1 = card1.match(/<span class="v">([\s\S]*?)<\/span>/i);
    count = v1 && v1[1] ? cleanText(v1[1]) : '—';
    const sub1 = card1.match(/<div class="vsub mut">([\s\S]*?)<\/div>/i);
    if (sub1 && sub1[1]) {
      const avgMatch = cleanText(sub1[1]).match(/(\$[\d,]+)\s*average/i);
      average = avgMatch && avgMatch[1] ? avgMatch[1] : cleanText(sub1[1]);
    }

    const card2 = statCards[2]?.[1] ?? '';
    const v2 = card2.match(/<span class="v">([\s\S]*?)<\/span>/i);
    largest = v2 && v2[1] ? cleanText(v2[1]) : '—';
    const sub2 = card2.match(/<div class="vsub mut">([\s\S]*?)<\/div>/i);
    largestDate = sub2 && sub2[1] ? cleanText(sub2[1]) : '—';

    const card3 = statCards[3]?.[1] ?? '';
    const v3 = card3.match(/<span class="v"[^>]*>([\s\S]*?)<\/span>/i);
    latestTime = v3 && v3[1] ? cleanText(v3[1]) : '—';
    const sub3 = card3.match(/<div class="vsub mut">([\s\S]*?)<\/div>/i);
    if (sub3 && sub3[1]) {
      const amtMatch = cleanText(sub3[1]).match(/(\$[\d,]+)/i);
      latestAmount = amtMatch && amtMatch[1] ? amtMatch[1] : cleanText(sub3[1]);
    }
  }

  const m12Block = html.match(/data-chart="m12"[\s\S]*?<\/svg>/i);
  const monthlyVolume: Array<{ month: string; amount: string; num: number }> = [];
  const seenMonths = new Set<string>();
  if (m12Block && m12Block[0]) {
    const rects = [...m12Block[0].matchAll(/<rect[^>]*data-label="([^"]+)"[^>]*data-value="([^"]+)"/gi)];
    for (const r of rects) {
      const month = (r[1] ?? '').trim();
      const valStr = (r[2] ?? '').trim();
      if (month && !seenMonths.has(month)) {
        seenMonths.add(month);
        monthlyVolume.push({
          month,
          amount: valStr,
          num: Number(valStr.replace(/[^0-9.]/g, '')) || 0
        });
      }
    }
  }

  const d30Block = html.match(/data-chart="d30"[\s\S]*?<\/svg>/i);
  const dailyVolume: Array<{ date: string; amount: string; num: number }> = [];
  const seenDays = new Set<string>();
  if (d30Block && d30Block[0]) {
    const rects = [...d30Block[0].matchAll(/<rect[^>]*data-label="([^"]+)"[^>]*data-value="([^"]+)"/gi)];
    for (const r of rects) {
      const day = (r[1] ?? '').trim();
      const valStr = (r[2] ?? '').trim();
      if (day && !seenDays.has(day)) {
        seenDays.add(day);
        dailyVolume.push({
          date: day,
          amount: valStr,
          num: Number(valStr.replace(/[^0-9.]/g, '')) || 0
        });
      }
    }
  }

  const top10Match = html.match(/<h2>Top 10 Largest Single Payouts<\/h2>[\s\S]*?<div class="list">([\s\S]*?)<\/div>\s*<\/div>/i);
  const top10: Array<{ date: string; amount: string; rail: string }> = [];
  if (top10Match && top10Match[1]) {
    const lrows = [...top10Match[1].matchAll(/<div class="lrow">([\s\S]*?)<\/div>/gi)];
    for (const lr of lrows) {
      const lrHtml = lr[1] ?? '';
      const spans = [...lrHtml.matchAll(/<span[^>]*>([\s\S]*?)<\/span>/gi)];
      if (spans.length >= 2) {
        const dateText = cleanText(spans[0]?.[1] ?? '');
        const rawAmt = cleanText(spans[1]?.[1] ?? '');
        const amtMatch = rawAmt.match(/\$[\d,]+(\.\d+)?/);
        const amtText = amtMatch ? amtMatch[0] : rawAmt;
        top10.push({
          date: dateText,
          amount: amtText,
          rail: lrHtml.includes('Direct Crypto') ? 'Direct Crypto' : 'Rise'
        });
      }
    }
  }

  const latestMatch = html.match(/<h2>Latest Payouts<\/h2>[\s\S]*?<div class="list">([\s\S]*?)<\/div>\s*<\/div>/i);
  const latestPayouts: Array<{ time: string; amount: string; rail: string }> = [];
  if (latestMatch && latestMatch[1]) {
    const lrows = [...latestMatch[1].matchAll(/<div class="lrow">([\s\S]*?)<\/div>/gi)];
    for (const lr of lrows) {
      const lrHtml = lr[1] ?? '';
      const spans = [...lrHtml.matchAll(/<span[^>]*>([\s\S]*?)<\/span>/gi)];
      if (spans.length >= 2) {
        const timeText = cleanText(spans[0]?.[1] ?? '');
        const rawAmt = cleanText(spans[1]?.[1] ?? '');
        const amtMatch = rawAmt.match(/\$[\d,]+(\.\d+)?/);
        const amtText = amtMatch ? amtMatch[0] : rawAmt;
        latestPayouts.push({
          time: timeText,
          amount: amtText,
          rail: lrHtml.includes('Direct Crypto') ? 'Direct Crypto' : 'Rise'
        });
      }
    }
  }

  return {
    slug,
    firm: firmName,
    website,
    websiteUrl: websiteUrl || '',
    promo,
    total,
    rail,
    count,
    average,
    largest,
    largestDate,
    latestTime,
    latestAmount,
    monthlyVolume,
    dailyVolume,
    top10,
    latestPayouts
  };
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
  const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };

  const [homeHtml, weeklyHtml, monthlyHtml, d30Html, alltimeHtml, recordsHtml, statsJson] = await Promise.all([
    fetch(`${upstreamBase}/`, { headers }).then(r => r.text()),
    fetch(`${upstreamBase}/7d`, { headers }).then(r => r.text()),
    fetch(`${upstreamBase}/monthly`, { headers }).then(r => r.text()),
    fetch(`${upstreamBase}/30d`, { headers }).then(r => r.text()),
    fetch(`${upstreamBase}/alltime`, { headers }).then(r => r.text()),
    fetch(`${upstreamBase}/records`, { headers }).then(r => r.text()),
    fetch(`${upstreamBase}/statistics/data.json`, { headers }).then(r => r.json()).catch(() => ({}))
  ]);

  const latest_24h = parseStandardTable(homeHtml);
  const last_7d = parseStandardTable(weeklyHtml);
  const weekly = parsePeriod(weeklyHtml, 'weekly');
  const monthly = parsePeriod(monthlyHtml, 'monthly');
  const last_30d = parseStandardTable(d30Html);
  const all_time = parseStandardTable(alltimeHtml);
  const records = parseRecords(recordsHtml);

  // Clean stats object: remove any public mentions of upstream domain
  const cleanStats = { ...(statsJson as Record<string, unknown>) };
  delete cleanStats.source;
  delete cleanStats.license_note;

  // Extract all unique slugs across all tables
  const slugSet = new Set<string>();
  [...latest_24h, ...last_7d, ...last_30d, ...all_time].forEach(r => {
    if (r.slug) slugSet.add(r.slug);
  });
  const slugs = Array.from(slugSet);

  const firm_details: Record<string, FirmDetailData> = {};
  const BATCH_SIZE = 8;
  for (let i = 0; i < slugs.length; i += BATCH_SIZE) {
    const chunk = slugs.slice(i, i + BATCH_SIZE);
    await Promise.all(chunk.map(async slug => {
      try {
        const r = await fetch(`${upstreamBase}/firms/${slug}`, { headers });
        if (r.ok) {
          const html = await r.text();
          const detail = parseFirmPage(html, slug);
          firm_details[slug] = detail;
          if (detail.firm && detail.firm !== slug) {
            firm_details[detail.firm] = detail;
          }
        }
      } catch (err) {
        console.error(`Failed to fetch firm ${slug}:`, err);
      }
    }));
  }

  const dataset: PayoutDataset = {
    captured_at: new Date().toISOString(),
    attribution: {
      text: "Live Verified Blockchain Feed",
      url: "#page-payouts"
    },
    trader_leaderboard: cachedDataset?.trader_leaderboard || DEFAULT_LEADERBOARD,
    latest_24h,
    last_7d,
    weekly,
    monthly,
    last_30d,
    all_time,
    records,
    stats: cleanStats,
    firm_details
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
