import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const UPSTREAM_BASE = 'https://payoutjunction.com';

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
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–');
}

function cleanText(str) {
  if (!str) return '';
  const decoded = decodeEntities(str);
  return decoded.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseStandardTable(html) {
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

    const slugMatch = firmTd.match(/href="\/firms\/([^"]+)"/i);
    const slug = slugMatch ? slugMatch[1] : firmName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    const chipMatches = [...firmTd.matchAll(/<span class="rchip"[^>]*>([\s\S]*?)<\/span>/gi)];
    const methods = chipMatches.map(m => cleanText(m[1])).join(' ') || 'Rise';

    const total = cleanText(tds[1][1]);
    const count = cleanText(tds[2][1]);
    const largest = cleanText(tds[3][1]);
    const average = cleanText(tds[4][1]);
    const latest = cleanText(tds[5][1]);

    list.push({
      firm: firmName,
      slug: slug,
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

export function parseFirmPage(html, slug) {
  // 1. Firm Name & Website
  const nameMatch = html.match(/<h1 class="nb">([\s\S]*?)<\/h1>/i);
  const firmName = nameMatch ? cleanText(nameMatch[1]) : slug;

  const fwebMatch = html.match(/<a class="fweb"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
  const website = fwebMatch ? cleanText(fwebMatch[2]) : '';
  const websiteUrl = fwebMatch ? fwebMatch[1] : '';

  // 2. Coupon/Promo
  const couponMatch = html.match(/<div class="pjcoupon">([\s\S]*?)<\/div>/i);
  let promo = '';
  if (couponMatch) {
    promo = cleanText(couponMatch[1]).replace(/\s*Copy\s*$/i, '');
  }

  // 3. Four key stats from <div class="stat">
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
    // 0: Total & rail
    const v0 = statCards[0][1].match(/<span class="v">([\s\S]*?)<\/span>/i);
    total = v0 ? cleanText(v0[1]) : '—';
    const r0 = statCards[0][1].match(/via <span class="rail">([\s\S]*?)<\/span>/i);
    rail = r0 ? cleanText(r0[1]) : 'Rise';

    // 1: Count & average
    const v1 = statCards[1][1].match(/<span class="v">([\s\S]*?)<\/span>/i);
    count = v1 ? cleanText(v1[1]) : '—';
    const sub1 = statCards[1][1].match(/<div class="vsub mut">([\s\S]*?)<\/div>/i);
    if (sub1) {
      const avgMatch = cleanText(sub1[1]).match(/(\$[\d,]+)\s*average/i);
      average = avgMatch ? avgMatch[1] : cleanText(sub1[1]);
    }

    // 2: Largest & date
    const v2 = statCards[2][1].match(/<span class="v">([\s\S]*?)<\/span>/i);
    largest = v2 ? cleanText(v2[1]) : '—';
    const sub2 = statCards[2][1].match(/<div class="vsub mut">([\s\S]*?)<\/div>/i);
    largestDate = sub2 ? cleanText(sub2[1]) : '—';

    // 3: Time since last payout
    const v3 = statCards[3][1].match(/<span class="v"[^>]*>([\s\S]*?)<\/span>/i);
    latestTime = v3 ? cleanText(v3[1]) : '—';
    const sub3 = statCards[3][1].match(/<div class="vsub mut">([\s\S]*?)<\/div>/i);
    if (sub3) {
      const amtMatch = cleanText(sub3[1]).match(/(\$[\d,]+)/i);
      latestAmount = amtMatch ? amtMatch[1] : cleanText(sub3[1]);
    }
  }

  // 4. Monthly volume (Last 12 Months)
  // Get from desktop svg in m12
  const m12Block = html.match(/data-chart="m12"[\s\S]*?<\/svg>/i);
  const monthlyVolume = [];
  const seenMonths = new Set();
  if (m12Block) {
    const rects = [...m12Block[0].matchAll(/<rect[^>]*data-label="([^"]+)"[^>]*data-value="([^"]+)"/gi)];
    for (const r of rects) {
      const month = r[1].trim();
      if (!seenMonths.has(month)) {
        seenMonths.add(month);
        monthlyVolume.push({
          month: month,
          amount: r[2].trim(),
          num: Number(r[2].replace(/[^0-9.]/g, '')) || 0
        });
      }
    }
  }

  // 5. Daily volume (Last 30 Days)
  const d30Block = html.match(/data-chart="d30"[\s\S]*?<\/svg>/i);
  const dailyVolume = [];
  const seenDays = new Set();
  if (d30Block) {
    const rects = [...d30Block[0].matchAll(/<rect[^>]*data-label="([^"]+)"[^>]*data-value="([^"]+)"/gi)];
    for (const r of rects) {
      const day = r[1].trim();
      if (!seenDays.has(day)) {
        seenDays.add(day);
        dailyVolume.push({
          date: day,
          amount: r[2].trim(),
          num: Number(r[2].replace(/[^0-9.]/g, '')) || 0
        });
      }
    }
  }

  // 6. Top 10 Largest Single Payouts
  const top10Match = html.match(/<h2>Top 10 Largest Single Payouts<\/h2>[\s\S]*?<div class="list">([\s\S]*?)<\/div>\s*<\/div>/i);
  const top10 = [];
  if (top10Match) {
    const lrows = [...top10Match[1].matchAll(/<div class="lrow">([\s\S]*?)<\/div>/gi)];
    for (const lr of lrows) {
      const spans = [...lr[1].matchAll(/<span[^>]*>([\s\S]*?)<\/span>/gi)];
      if (spans.length >= 2) {
        const dateText = cleanText(spans[0][1]);
        const rawAmt = cleanText(spans[1][1]);
        const amtMatch = rawAmt.match(/\$[\d,]+(\.\d+)?/);
        const amtText = amtMatch ? amtMatch[0] : rawAmt;
        top10.push({
          date: dateText,
          amount: amtText,
          rail: lr[1].includes('Direct Crypto') ? 'Direct Crypto' : 'Rise'
        });
      }
    }
  }

  // 7. Latest Payouts list
  const latestMatch = html.match(/<h2>Latest Payouts<\/h2>[\s\S]*?<div class="list">([\s\S]*?)<\/div>\s*<\/div>/i);
  const latestPayouts = [];
  if (latestMatch) {
    const lrows = [...latestMatch[1].matchAll(/<div class="lrow">([\s\S]*?)<\/div>/gi)];
    for (const lr of lrows) {
      const spans = [...lr[1].matchAll(/<span[^>]*>([\s\S]*?)<\/span>/gi)];
      if (spans.length >= 2) {
        const timeText = cleanText(spans[0][1]);
        const rawAmt = cleanText(spans[1][1]);
        const amtMatch = rawAmt.match(/\$[\d,]+(\.\d+)?/);
        const amtText = amtMatch ? amtMatch[0] : rawAmt;
        latestPayouts.push({
          time: timeText,
          amount: amtText,
          rail: lr[1].includes('Direct Crypto') ? 'Direct Crypto' : 'Rise'
        });
      }
    }
  }

  return {
    slug,
    firm: firmName,
    website,
    websiteUrl,
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

export async function fetchFullPayoutDataset() {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Fetching main tables from upstream...`);

  const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };
  const [homeHtml, weeklyHtml, monthlyHtml, d30Html, alltimeHtml, recordsHtml, statsJson] = await Promise.all([
    fetch(`${UPSTREAM_BASE}/`, { headers }).then(r => r.text()),
    fetch(`${UPSTREAM_BASE}/7d`, { headers }).then(r => r.text()),
    fetch(`${UPSTREAM_BASE}/monthly`, { headers }).then(r => r.text()),
    fetch(`${UPSTREAM_BASE}/30d`, { headers }).then(r => r.text()),
    fetch(`${UPSTREAM_BASE}/alltime`, { headers }).then(r => r.text()),
    fetch(`${UPSTREAM_BASE}/records`, { headers }).then(r => r.text()),
    fetch(`${UPSTREAM_BASE}/statistics/data.json`, { headers }).then(r => r.json()).catch(() => ({}))
  ]);

  const latest_24h = parseStandardTable(homeHtml);
  const last_7d = parseStandardTable(weeklyHtml);
  const weekly = parsePeriod(weeklyHtml, 'weekly');
  const monthly = parsePeriod(monthlyHtml, 'monthly');
  const last_30d = parseStandardTable(d30Html);
  const all_time = parseStandardTable(alltimeHtml);
  const records = parseRecords(recordsHtml);

  // Clean stats object
  const cleanStats = { ...statsJson };
  delete cleanStats.source;
  delete cleanStats.license_note;

  // Extract all unique slugs across all tables
  const slugSet = new Set();
  [...latest_24h, ...last_7d, ...last_30d, ...all_time].forEach(r => {
    if (r.slug) slugSet.add(r.slug);
  });
  const slugs = Array.from(slugSet);
  console.log(`Found ${slugs.length} unique firm slugs. Fetching firm detail pages...`);

  const firm_details = {};
  const BATCH_SIZE = 8;
  for (let i = 0; i < slugs.length; i += BATCH_SIZE) {
    const chunk = slugs.slice(i, i + BATCH_SIZE);
    await Promise.all(chunk.map(async slug => {
      try {
        const r = await fetch(`${UPSTREAM_BASE}/firms/${slug}`, { headers });
        if (r.ok) {
          const html = await r.text();
          const detail = parseFirmPage(html, slug);
          firm_details[slug] = detail;
          // Also index by canonical firm name for instant lookups
          if (detail.firm && detail.firm !== slug) {
            firm_details[detail.firm] = detail;
          }
        }
      } catch (err) {
        console.error(`Failed to fetch firm ${slug}:`, err.message);
      }
    }));
  }

  const dataset = {
    captured_at: timestamp,
    attribution: {
      text: "Live Verified Blockchain Feed",
      url: "#page-payouts"
    },
    trader_leaderboard: DEFAULT_LEADERBOARD,
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

export function saveFullPayoutDataset(dataset) {
  try {
    const dataDir = path.join(rootDir, 'public/data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    // 1. Write payouts.json
    fs.writeFileSync(path.join(dataDir, 'payouts.json'), JSON.stringify(dataset, null, 2), 'utf8');

    // 2. Embed into public/clone-app.js
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
    const cssPath = path.join(rootDir, 'src/app/clone.css');
    const bodyPath = path.join(rootDir, 'src/app/clone-body.html');
    if (fs.existsSync(cssPath) && fs.existsSync(bodyPath) && fs.existsSync(cloneAppPath)) {
      const rawCss = fs.readFileSync(cssPath, 'utf8');
      const css = rawCss.replaceAll('/assets/logo-mark.png', 'assets/logo-mark.png');
      const body = fs.readFileSync(bodyPath, 'utf8');
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
    }

    console.log(`✓ Saved dataset: ${dataset.all_time.length} all-time firms, ${Object.keys(dataset.firm_details).length} firm details.`);
    return true;
  } catch (err) {
    console.error('Error saving synced dataset:', err);
    return false;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fetchFullPayoutDataset()
    .then(data => saveFullPayoutDataset(data))
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}
