import { chromium } from '@playwright/test';
import path from 'path';

const outDir = 'C:/Users/koush/.gemini/antigravity/brain/3ea0bf9e-fd03-4f48-8947-0a03e3265adc';

async function run() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://localhost:3000');
  await page.waitForTimeout(1000);

  // 1. Check Offer cards overflow
  const offerCards = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('#offerGrid .offer, #offerGrid .exclusive-offer-card')).map(card => {
      const name = card.querySelector('strong')?.textContent || '';
      return {
        name,
        offsetHeight: card.offsetHeight,
        scrollHeight: card.scrollHeight,
        isOverflowing: card.scrollHeight > card.offsetHeight + 1
      };
    });
  });
  console.log('Offer cards overflow analysis:', offerCards);

  // 2. Check Logo Frame dimensions in rank list
  const logoFrameData = await page.evaluate(() => {
    const card = document.querySelector('.rank-card');
    if (!card) return null;
    const logoWrap = card.querySelector('.logo-wrap');
    const img = card.querySelector('.firm-logo');
    return {
      wrapRect: logoWrap.getBoundingClientRect(),
      imgRect: img.getBoundingClientRect()
    };
  });
  console.log('Firm Logo frame dimensions:', JSON.stringify(logoFrameData, null, 2));

  // 3. Take screenshot of the Featured Offer Cards (Image 2 area)
  const offersPanel = await page.$('#offers');
  if (offersPanel) {
    await offersPanel.screenshot({ path: path.join(outDir, 'verified_fixed_offer_cards.png') });
    console.log('Saved verified_fixed_offer_cards.png');
  }

  // 4. Take screenshot of the Rank Card table rows with bigger logo frame (Image 1 area)
  const rankList = await page.$('#rankList');
  if (rankList) {
    await page.evaluate(() => {
      document.querySelector('#rankList').scrollIntoView({ block: 'start' });
    });
    await page.waitForTimeout(400);
    await page.screenshot({ 
      path: path.join(outDir, 'verified_bigger_firm_logos.png'),
      clip: { x: 0, y: 120, width: 1440, height: 600 }
    });
    console.log('Saved verified_bigger_firm_logos.png');
  }

  // 5. Take screenshot of the full Hero + Offers transition
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await page.screenshot({ 
    path: path.join(outDir, 'verified_hero_and_offers_clean.png'),
    clip: { x: 0, y: 0, width: 1440, height: 850 }
  });
  console.log('Saved verified_hero_and_offers_clean.png');

  await browser.close();
  console.log('User report test completed successfully!');
}

run();
