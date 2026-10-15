import { chromium } from '@playwright/test';
import path from 'path';

const outDir = 'C:/Users/koush/.gemini/antigravity/brain/3ea0bf9e-fd03-4f48-8947-0a03e3265adc';

async function run() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();
  
  console.log('Navigating to http://localhost:3000...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // 1. Header Logo
  const headerBrand = await page.$('.head-main .brand-lock');
  if (headerBrand) {
    await headerBrand.screenshot({ path: path.join(outDir, 'verified_header_brand_logo.png') });
    console.log('Saved verified_header_brand_logo.png');
  }

  // 2. Home Page Hero
  await page.screenshot({ path: path.join(outDir, 'verified_home_hero.png'), clip: { x: 0, y: 0, width: 1440, height: 500 } });
  console.log('Saved verified_home_hero.png');

  // 3. Offers Page
  await page.click('nav a[data-page="offers"]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, 'verified_offers_hero.png'), clip: { x: 0, y: 0, width: 1440, height: 500 } });
  console.log('Saved verified_offers_hero.png');

  // 4. Reviews Page
  await page.click('nav a[data-page="reviews"]');
  await page.waitForTimeout(500);

  // Verify Reviews Hero
  await page.screenshot({ path: path.join(outDir, 'verified_reviews_hero.png'), clip: { x: 0, y: 0, width: 1440, height: 500 } });
  console.log('Saved verified_reviews_hero.png');

  // Verify duplicate hero is hidden
  const dupHeroVisible = await page.evaluate(() => {
    const el = document.querySelector('.reviews-hero-3d');
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none';
  });
  console.log('Duplicate reviews-hero-3d visible?', dupHeroVisible);

  // Partner Embed Review Widget Card
  const partnerWidget = await page.$('.pfl-partner-widget-card');
  if (partnerWidget) {
    await partnerWidget.screenshot({ path: path.join(outDir, 'verified_partner_widget_card.png') });
    console.log('Saved verified_partner_widget_card.png');
  }

  // Click Copy Partner Widget Code button
  await page.click('[data-copy-partner-widget]');
  await page.waitForTimeout(300);
  const toastText = await page.evaluate(() => {
    const t = document.getElementById('toast');
    return t ? t.textContent : '';
  });
  console.log('Toast after copying partner widget:', toastText);

  // Dual Category Review Table Leaderboard
  const revTable = await page.$('.reviews-table-3d');
  if (revTable) {
    await revTable.screenshot({ path: path.join(outDir, 'verified_reviews_dual_category_table.png') });
    console.log('Saved verified_reviews_dual_category_table.png');
  }

  // Measure Gap before FAQ
  const gapMetrics = await page.evaluate(() => {
    const methodCard = document.querySelector('.reviews-methodology-card');
    const faq = document.querySelector('#faq');
    if (!methodCard || !faq) return null;
    const methodRect = methodCard.getBoundingClientRect();
    const faqRect = faq.getBoundingClientRect();
    const icon = document.querySelector('.review-info-icon');
    const iconRect = icon ? icon.getBoundingClientRect() : null;
    return {
      methodHeight: methodRect.height,
      distanceToFaq: faqRect.top - methodRect.bottom,
      iconWidth: iconRect ? iconRect.width : 0,
      iconHeight: iconRect ? iconRect.height : 0
    };
  });
  console.log('Gap metrics before FAQ:', JSON.stringify(gapMetrics));

  // Screenshot of methodology card
  const methodCardEl = await page.$('.reviews-methodology-card');
  if (methodCardEl) {
    await methodCardEl.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await methodCardEl.screenshot({ 
      path: path.join(outDir, 'verified_reviews_faq_gap_fixed.png')
    });
    console.log('Saved verified_reviews_faq_gap_fixed.png');
  }

  // 5. Payouts Page Hero
  await page.click('nav a[data-page="payouts"]');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(outDir, 'verified_payouts_hero.png'), clip: { x: 0, y: 0, width: 1440, height: 500 } });
  console.log('Saved verified_payouts_hero.png');

  await browser.close();
  console.log('Verification script completed successfully!');
}

run().catch(e => {
  console.error('Test script failed:', e);
  process.exit(1);
});
