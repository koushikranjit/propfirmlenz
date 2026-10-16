const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  await page.screenshot({ path: 'C:/Users/koush/.gemini/antigravity/brain/3ea0bf9e-fd03-4f48-8947-0a03e3265adc/desktop_verified_header_hero.png' });
  await browser.close();
  console.log('Desktop verification screenshot captured.');
})();
