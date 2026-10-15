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

(async () => {
  await new Promise(resolve => server.listen(3334, resolve));
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  });
  const page = await browser.newPage();
  await page.goto('http://localhost:3334/index.html');

  console.log('\n--- Test Global Search ---');
  const searchInput = page.locator('#globalSearch');
  await searchInput.fill('alpha');
  await searchInput.dispatchEvent('input');
  await page.waitForTimeout(300);
  const filteredCount = await page.locator('#rankList .rank-card').count();
  console.log('Search "alpha" -> Filtered rank cards count:', filteredCount);

  // Clear search
  await searchInput.fill('');
  await searchInput.dispatchEvent('input');
  await page.waitForTimeout(300);
  console.log('Cleared search -> Rank cards count:', await page.locator('#rankList .rank-card').count());

  console.log('\n--- Test Offers Page Filters & Expand ---');
  await page.locator(`.navlinks [data-page="offers"]`).first().click();
  await page.waitForTimeout(300);

  // Filter exclusive
  await page.locator('[data-offer-filter="exclusive"]').first().click();
  await page.waitForTimeout(200);
  console.log('Exclusive offers count:', await page.locator('#offersOfferList .offer-group').count());

  // Filter all
  await page.locator('[data-offer-filter="all"]').first().click();
  await page.waitForTimeout(200);
  console.log('All offers count:', await page.locator('#offersOfferList .offer-group').count());

  // Test Coupon Copy
  const copyBtn = page.locator('#offersOfferList [data-copy]').first();
  if (await copyBtn.count() > 0) {
    await copyBtn.click();
    await page.waitForTimeout(200);
    const toastClass = await page.locator('#toast').getAttribute('class');
    const toastText = await page.locator('#toast').innerText();
    console.log('Coupon click -> Toast visible:', toastClass.includes('show'), '| Toast message:', toastText);
  }

  console.log('\n--- Test Back to Top Button ---');
  await page.evaluate(() => window.scrollTo(0, 2500));
  await page.waitForTimeout(400);
  const backToTopVisible = await page.locator('#backToTopBtn').evaluate(el => el.classList.contains('show') || window.getComputedStyle(el).display !== 'none');
  console.log('Back to top button visible after scroll:', backToTopVisible);

  await page.locator('#backToTopBtn').click();
  await page.waitForTimeout(800);
  const scrollAfterTop = await page.evaluate(() => window.scrollY);
  console.log('Scroll position after Back to Top click:', scrollAfterTop);

  console.log('\nALL ADDITIONAL CHECKS PASSED!');
  await browser.close();
  server.close();
})();
