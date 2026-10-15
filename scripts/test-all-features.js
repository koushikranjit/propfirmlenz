const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0].split('#')[0];
  if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
  const filePath = path.join(__dirname, '../public', reqPath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(fs.readFileSync(filePath));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

async function runTests() {
  await new Promise(resolve => server.listen(3333, resolve));
  console.log('Test server running at http://localhost:3333');

  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(`[Console Error] ${msg.text()}`);
  });
  page.on('pageerror', err => {
    errors.push(`[Page Error] ${err.message}`);
  });

  console.log('\n--- 1. Testing Page Load ---');
  await page.goto('http://localhost:3333/index.html');
  await page.waitForTimeout(500);
  console.log('Page loaded. Title:', await page.title());

  console.log('\n--- 2. Testing Market Switchers ---');
  // Check default market
  const initialTheme = await page.evaluate(() => document.body.dataset.marketTheme);
  console.log('Initial market theme:', initialTheme);

  // Click Futures
  const futuresBtn = page.locator('.market-switch [data-market="futures"]').first();
  await futuresBtn.click();
  await page.waitForTimeout(300);
  const futuresTheme = await page.evaluate(() => document.body.dataset.marketTheme);
  const heroTitleFutures = await page.locator('#heroTitle').innerText();
  console.log('After clicking Futures -> Theme:', futuresTheme, '| Hero:', heroTitleFutures);

  // Click Crypto
  const cryptoBtn = page.locator('.market-switch [data-market="crypto"]').first();
  await cryptoBtn.click();
  await page.waitForTimeout(300);
  const cryptoTheme = await page.evaluate(() => document.body.dataset.marketTheme);
  const heroTitleCrypto = await page.locator('#heroTitle').innerText();
  console.log('After clicking Crypto -> Theme:', cryptoTheme, '| Hero:', heroTitleCrypto);

  // Click Forex
  const forexBtn = page.locator('.market-switch [data-market="forex"]').first();
  await forexBtn.click();
  await page.waitForTimeout(300);
  const forexTheme = await page.evaluate(() => document.body.dataset.marketTheme);
  console.log('After clicking Forex -> Theme:', forexTheme);

  console.log('\n--- 3. Testing Navigation to All Pages ---');
  const pagesToTest = ['best-sellers', 'offers', 'reviews', 'payouts', 'compare', 'favorites'];
  for (const p of pagesToTest) {
    const navLink = page.locator(`.navlinks [data-page="${p}"]`).first();
    await navLink.click();
    await page.waitForTimeout(300);
    const activePage = await page.evaluate(() => document.body.dataset.page);
    console.log(`Navigated to: ${p} -> body.dataset.page = ${activePage}`);
  }

  console.log('\n--- 4. Testing FAQ Accordion & Scroll Position ---');
  await page.locator(`.navlinks [data-page="home"]`).first().click();
  await page.waitForTimeout(300);
  // Scroll to FAQ
  const faqLocator = page.locator('#faqTitle');
  await faqLocator.scrollIntoViewIfNeeded();
  const scrollBefore = await page.evaluate(() => window.scrollY);
  console.log('Scroll position before FAQ click:', scrollBefore);

  // Click first FAQ item summary
  const firstFaq = page.locator('.faq-card .faq-summary').first();
  await firstFaq.click();
  await page.waitForTimeout(300);
  const scrollAfter = await page.evaluate(() => window.scrollY);
  console.log('Scroll position after FAQ click:', scrollAfter);
  const isDetailsOpen = await page.locator('.faq-card').first().evaluate(el => el.open);
  console.log('Is first FAQ open?', isDetailsOpen);
  if (Math.abs(scrollAfter - scrollBefore) > 100) {
    errors.push(`FAQ click triggered unexpected scroll jump: before=${scrollBefore}, after=${scrollAfter}`);
  }

  console.log('\n--- 5. Testing Best Sellers Sorting & Filters ---');
  await page.locator(`.navlinks [data-page="best-sellers"]`).first().click();
  await page.waitForTimeout(300);

  // Filter: Popular
  await page.locator('[data-filter="popular"]').first().click();
  await page.waitForTimeout(200);
  console.log('Clicked Popular filter -> Cards count:', await page.locator('#rankList .rank-card, #rankList .alt-card').count());

  // Filter: New
  await page.locator('[data-filter="new"]').first().click();
  await page.waitForTimeout(200);
  console.log('Clicked New filter -> Cards count:', await page.locator('#rankList .rank-card, #rankList .alt-card').count());

  // Filter: All
  await page.locator('[data-filter="all"]').first().click();
  await page.waitForTimeout(200);
  console.log('Clicked All filter -> Cards count:', await page.locator('#rankList .rank-card, #rankList .alt-card').count());

  // Sort by allocation
  const allocSort = page.locator('[data-sort="allocation"]').first();
  if (await allocSort.count() > 0) {
    await allocSort.click();
    await page.waitForTimeout(200);
    console.log('Sorted by Allocation successfully');
  }

  // Toggle View (Cards vs Table)
  const cardViewBtn = page.locator('[data-view="cards"]').first();
  if (await cardViewBtn.count() > 0) {
    await cardViewBtn.click();
    await page.waitForTimeout(200);
    console.log('Toggled to Cards view -> alt-card count:', await page.locator('#rankList .alt-card').count());
  }

  const tableViewBtn = page.locator('[data-view="firms"]').first();
  if (await tableViewBtn.count() > 0) {
    await tableViewBtn.click();
    await page.waitForTimeout(200);
    console.log('Toggled back to Table view -> rank-card count:', await page.locator('#rankList .rank-card').count());
  }

  // View All / Reset button
  const viewAllBtn = page.locator('#viewAll');
  if (await viewAllBtn.isVisible()) {
    await viewAllBtn.click();
    await page.waitForTimeout(200);
    console.log('Clicked View All / Reset filter');
  }

  console.log('\n--- 6. Testing Payouts Page & View Breakdown ---');
  await page.locator(`.navlinks [data-page="payouts"]`).first().click();
  await page.waitForTimeout(300);

  // Test Category Filters on Payouts
  const pForex = page.locator('[data-payout-category="forex"]').first();
  if (await pForex.count() > 0) {
    await pForex.click();
    await page.waitForTimeout(200);
    console.log('Clicked Forex payout category');
  }

  const pFutures = page.locator('[data-payout-category="futures"]').first();
  if (await pFutures.count() > 0) {
    await pFutures.click();
    await page.waitForTimeout(200);
    console.log('Clicked Futures payout category');
  }

  const pCrypto = page.locator('[data-payout-category="crypto"]').first();
  if (await pCrypto.count() > 0) {
    await pCrypto.click();
    await page.waitForTimeout(200);
    console.log('Clicked Crypto payout category');
  }

  const pAll = page.locator('[data-payout-category="all"]').first();
  if (await pAll.count() > 0) {
    await pAll.click();
    await page.waitForTimeout(200);
    console.log('Clicked All Firms payout category');
  }

  // Click View on first payout row
  const firstViewBtn = page.locator('.payout-view-button').first();
  const firmName = await firstViewBtn.getAttribute('data-payout-detail');
  console.log(`Clicking View breakdown for: ${firmName}`);
  await firstViewBtn.click();
  await page.waitForTimeout(300);

  const detailActive = await page.evaluate(() => document.body.dataset.page);
  console.log('Active page after View click:', detailActive);
  const detailTitle = await page.locator('#payoutDetailTitle').innerText();
  console.log('Payout detail title:', detailTitle);

  // Test Timeframe switch on Detail Page
  const last30dTab = page.locator('[data-detail-timeframe="last_30d"]').first();
  if (await last30dTab.count() > 0) {
    await last30dTab.click();
    await page.waitForTimeout(200);
    console.log('Switched to 30 Days timeframe on detail page');
  }

  // Test Back to Payouts button
  const backToPayoutsBtn = page.locator('#payoutDetailPage .payout-detail-back, #payoutDetailPage [data-page="payouts"]').first();
  if (await backToPayoutsBtn.count() > 0) {
    await backToPayoutsBtn.click();
    await page.waitForTimeout(300);
    console.log('Clicked Back to Payouts -> Active page:', await page.evaluate(() => document.body.dataset.page));
  }

  console.log('\n--- 7. Testing Firm Profile Page & Back Navigation ---');
  await page.locator(`.navlinks [data-page="best-sellers"]`).first().click();
  await page.waitForTimeout(300);

  const firstProfileLink = page.locator('[data-firm-profile]').first();
  const profileSlug = await firstProfileLink.getAttribute('data-firm-profile');
  console.log(`Clicking profile for slug: ${profileSlug}`);
  await firstProfileLink.click();
  await page.waitForTimeout(300);
  console.log('Active page after profile click:', await page.evaluate(() => document.body.dataset.page));

  // Click Back from profile
  const profileBackBtn = page.locator('[data-profile-back]').first();
  if (await profileBackBtn.count() > 0) {
    await profileBackBtn.click();
    await page.waitForTimeout(300);
    console.log('Clicked Profile Back button -> Active page:', await page.evaluate(() => document.body.dataset.page));
  }

  console.log('\n--- 8. Testing Modals ---');
  // Log in modal
  await page.locator('.header-auth .login').first().click();
  await page.waitForTimeout(200);
  const isAuthModalOpen = await page.locator('#accountNoticeModal').evaluate(el => el.classList.contains('open'));
  console.log('Is Auth Modal open?', isAuthModalOpen);
  // Close modal via Escape
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const isAuthModalClosed = await page.locator('#accountNoticeModal').evaluate(el => !el.classList.contains('open'));
  console.log('Is Auth Modal closed on Escape?', isAuthModalClosed);

  console.log('\n--- 9. Testing Reviews Page Interaction ---');
  await page.locator(`.navlinks [data-page="reviews"]`).first().click();
  await page.waitForTimeout(300);

  // Switch to PFL community reviews
  const pflSourceBtn = page.locator('[data-review-source="pfl"]').first();
  if (await pflSourceBtn.count() > 0) {
    await pflSourceBtn.click();
    await page.waitForTimeout(200);
    console.log('Switched to PFL Community Reviews');
  }

  // Switch back to Trustpilot reviews
  const tpSourceBtn = page.locator('[data-review-source="trustpilot"]').first();
  if (await tpSourceBtn.count() > 0) {
    await tpSourceBtn.click();
    await page.waitForTimeout(200);
    console.log('Switched back to Trustpilot Reviews');
  }

  // Test Review Slider
  const reviewSlider = page.locator('#reviewAmount');
  if (await reviewSlider.count() > 0) {
    await reviewSlider.fill('1000');
    await reviewSlider.dispatchEvent('input');
    await page.waitForTimeout(200);
    const amountVal = await page.locator('#reviewAmountValue').innerText();
    console.log('Adjusted review slider to 1000 -> Display:', amountVal);
  }

  console.log('\n--- 10. Testing Favorites Feature ---');
  // Add a favorite from rankings or profile
  await page.locator(`.navlinks [data-page="best-sellers"]`).first().click();
  await page.waitForTimeout(300);

  const starBtn = page.locator('[data-favorite]').first();
  if (await starBtn.count() > 0) {
    const starFirm = await starBtn.getAttribute('data-favorite');
    await starBtn.click();
    await page.waitForTimeout(200);
    const favCount = await page.locator('#favTotal').innerText();
    console.log(`Favorited ${starFirm} -> Header badge count:`, favCount);

    // Navigate to favorites page
    await page.locator(`.navlinks [data-page="favorites"]`).first().click();
    await page.waitForTimeout(300);
    const favCardCount = await page.locator('#favoriteFirmRows .favorite-firm-row').count();
    console.log('Favorites page rows count:', favCardCount);
  }

  console.log('\n--- 11. Testing Compare Page ---');
  await page.locator(`.navlinks [data-page="compare"]`).first().click();
  await page.waitForTimeout(300);
  const slotCount = await page.locator('#compareSlots select, [data-compare-slot]').count();
  console.log('Compare picker slots count:', slotCount);

  console.log('\n=== SUMMARY OF ERRORS ===');
  if (errors.length === 0) {
    console.log('PERFECT! 0 errors detected across all tested features.');
  } else {
    console.log(`Detected ${errors.length} errors:`);
    errors.forEach(e => console.log(' - ' + e));
  }

  await browser.close();
  server.close();
}

runTests().catch(err => {
  console.error('Fatal test runner error:', err);
  server.close();
  process.exit(1);
});
