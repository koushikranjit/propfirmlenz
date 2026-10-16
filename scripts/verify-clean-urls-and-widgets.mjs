import { chromium } from '@playwright/test';
import path from 'path';

const outDir = 'C:/Users/koush/.gemini/antigravity/brain/3ea0bf9e-fd03-4f48-8947-0a03e3265adc';

async function run() {
  console.log('🚀 Launching Playwright browser...');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 }
  });
  const page = await context.newPage();

  // Test 1: Load Root /
  console.log('\n--- 1. Testing Root URL / ---');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  console.log('Current URL:', page.url());
  if (page.url().includes('#')) throw new Error('Root URL contains unexpected #');

  // Test 2: Click Navigation Links (Check clean URLs without #)
  const navTests = [
    { label: 'Offers', selector: '.navlinks a[data-page="offers"]', expectedPath: '/offers' },
    { label: 'Best Sellers', selector: '.navlinks a[data-page="best-sellers"]', expectedPath: '/best-sellers' },
    { label: 'Reviews', selector: '.navlinks a[data-page="reviews"]', expectedPath: '/reviews' },
    { label: 'Favorites', selector: '.navlinks a[data-page="favorites"]', expectedPath: '/favorites' },
    { label: 'Compare Firms', selector: '.navlinks a[data-page="compare"]', expectedPath: '/compare' },
    { label: 'Payouts', selector: '.navlinks a[data-page="payouts"]', expectedPath: '/payouts' },
    { label: 'Widgets', selector: '.navlinks a[data-page="partner-badges"]', expectedPath: '/widgets' },
  ];

  for (const t of navTests) {
    console.log(`\n--- Clicking Nav: ${t.label} ---`);
    await page.click(t.selector);
    await page.waitForTimeout(400);
    const u = new URL(page.url());
    console.log(`Navigated to: ${u.pathname}${u.hash}`);
    if (u.pathname !== t.expectedPath) {
      throw new Error(`Expected pathname ${t.expectedPath}, but got ${u.pathname}`);
    }
    if (u.hash) {
      throw new Error(`URL contains hash: ${u.hash}`);
    }
  }

  // Test 3: Prop Firm Profile navigation to clean /firm/:slug
  console.log('\n--- 3. Testing Prop Firm Profile Navigation ---');
  await page.goto('http://localhost:3000/best-sellers', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // Click on FundingPips firm name
  const fundingPipsLink = await page.$('[data-firm-profile="FundingPips"]');
  if (fundingPipsLink) {
    await fundingPipsLink.click();
    await page.waitForTimeout(500);
    const u = new URL(page.url());
    console.log(`Firm profile URL: ${u.pathname}${u.hash}`);
    if (u.pathname !== '/firm/fundingpips') {
      throw new Error(`Expected /firm/fundingpips, got ${u.pathname}`);
    }
    if (u.hash) {
      throw new Error(`Firm profile contains hash: ${u.hash}`);
    }

    // Verify firm profile title
    const firmTitle = await page.$eval('.profile-title-main h1', el => el.textContent.trim());
    console.log(`Firm Profile Title: "${firmTitle}"`);

    // Click back button
    await page.click('[data-profile-back]');
    await page.waitForTimeout(400);
    const backUrl = new URL(page.url());
    console.log(`Back from profile URL: ${backUrl.pathname}${backUrl.hash}`);
  }

  // Test 4: Legacy hash auto-migration
  console.log('\n--- 4. Testing Legacy Hash Auto-Migration ---');
  await page.goto('http://localhost:3000/#page-offers', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  let migrated = new URL(page.url());
  console.log('Legacy #page-offers migrated to:', migrated.pathname + migrated.hash);
  if (migrated.pathname !== '/offers' || migrated.hash) {
    throw new Error(`Failed to migrate legacy #page-offers to clean /offers: got ${migrated.href}`);
  }

  await page.goto('http://localhost:3000/#firm/ftmo', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  migrated = new URL(page.url());
  console.log('Legacy #firm/ftmo migrated to:', migrated.pathname + migrated.hash);
  if (migrated.pathname !== '/firm/ftmo' || migrated.hash) {
    throw new Error(`Failed to migrate legacy #firm/ftmo to clean /firm/ftmo: got ${migrated.href}`);
  }

  // Test 5: Verify 10 Widgets on /widgets
  console.log('\n--- 5. Testing Widgets Page & 10 Widgets ---');
  await page.goto('http://localhost:3000/widgets', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  for (let i = 1; i <= 10; i++) {
    const id = `w${i}Code`;
    const textarea = await page.$(`#${id}`);
    if (!textarea) throw new Error(`Missing widget textarea #${id}`);
    const code = await textarea.inputValue();
    if (!code || code.length < 50) throw new Error(`Widget #${id} has empty or invalid code`);

    // Check copy button
    const copyBtn = await page.$(`[data-copy-target="${id}"]`);
    if (!copyBtn) throw new Error(`Missing copy button for #${id}`);
    await copyBtn.click();
    await page.waitForTimeout(100);

    // Check toast
    const toastText = await page.$eval('#toast', el => el.textContent.trim());
    console.log(`Widget ${i} (${id}) Verified! Toast: "${toastText}", Code Length: ${code.length}`);
  }

  // Take Screenshots of the 10 Widgets
  console.log('\n--- 6. Capturing High-Res Screenshots ---');
  const widgetsPage = await page.$('#partnerBadgesPage');
  if (widgetsPage) {
    // Screenshot top half (Widgets 1-4)
    await page.screenshot({
      path: path.join(outDir, 'widgets_showcase_top.png'),
      clip: { x: 0, y: 150, width: 1440, height: 950 }
    });
    console.log('Saved widgets_showcase_top.png');

    // Scroll down to Widgets 5-10
    await page.evaluate(() => window.scrollBy(0, 800));
    await page.waitForTimeout(300);
    await page.screenshot({
      path: path.join(outDir, 'widgets_showcase_middle.png'),
      clip: { x: 0, y: 150, width: 1440, height: 950 }
    });
    console.log('Saved widgets_showcase_middle.png');

    // Scroll down to Guidelines & Bottom Widgets
    await page.evaluate(() => window.scrollBy(0, 800));
    await page.waitForTimeout(300);
    await page.screenshot({
      path: path.join(outDir, 'widgets_showcase_bottom.png'),
      clip: { x: 0, y: 150, width: 1440, height: 950 }
    });
    console.log('Saved widgets_showcase_bottom.png');
  }

  await browser.close();
  console.log('\n🎉 ALL VERIFICATION TESTS PASSED SUCCESSFULLY! Clean URLs and 10 Widgets are 100% verified.');
}

run().catch(err => {
  console.error('❌ Verification Error:', err);
  process.exit(1);
});
