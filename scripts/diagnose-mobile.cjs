const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Check horizontal overflow
  const overflow = await page.evaluate(() => {
    const docWidth = document.documentElement.offsetWidth;
    const scrollWidth = document.documentElement.scrollWidth;
    const overflowingElements = [];
    document.querySelectorAll('*').forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.right > docWidth + 2) {
        overflowingElements.push({
          tag: el.tagName,
          id: el.id,
          className: el.className,
          right: rect.right,
          docWidth
        });
      }
    });
    return {
      docWidth,
      scrollWidth,
      hasHorizontalScroll: scrollWidth > docWidth,
      overflowingCount: overflowingElements.length,
      sampleOverflow: overflowingElements.slice(0, 10)
    };
  });
  console.log('OVERFLOW DIAGNOSTICS:', JSON.stringify(overflow, null, 2));

  // Screenshot 1: Mobile top hero
  await page.screenshot({ path: 'C:/Users/koush/.gemini/antigravity/brain/3ea0bf9e-fd03-4f48-8947-0a03e3265adc/mobile_check_hero.png' });

  // Screenshot 2: Mobile scrolled down to offers
  await page.evaluate(() => window.scrollTo(0, 500));
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'C:/Users/koush/.gemini/antigravity/brain/3ea0bf9e-fd03-4f48-8947-0a03e3265adc/mobile_check_offers.png' });

  // Screenshot 3: Mobile scrolled down to rankings table
  await page.evaluate(() => window.scrollTo(0, 1200));
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'C:/Users/koush/.gemini/antigravity/brain/3ea0bf9e-fd03-4f48-8947-0a03e3265adc/mobile_check_table.png' });

  // Screenshot 4: Mobile nav menu open
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  const menuBtn = await page.locator('.menu').first();
  if (await menuBtn.count() > 0) {
    await menuBtn.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'C:/Users/koush/.gemini/antigravity/brain/3ea0bf9e-fd03-4f48-8947-0a03e3265adc/mobile_check_menu_open.png' });
  }

  await browser.close();
  console.log('Mobile diagnostic complete.');
})();
