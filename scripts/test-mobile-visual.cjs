const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  });
  const page = await context.newPage();
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const shot = async (name) => {
    await page.screenshot({ path: `C:/Users/koush/.gemini/antigravity/brain/3ea0bf9e-fd03-4f48-8947-0a03e3265adc/${name}.png` });
  };

  // 1. Hero
  await shot('mob_1_hero');

  // 2. Open Menu
  const menuBtn = page.locator('.menu').first();
  await menuBtn.click();
  await page.waitForTimeout(400);
  await shot('mob_2_menu_open');

  // Close Menu
  await menuBtn.click();
  await page.waitForTimeout(300);

  // 3. Offers
  await page.locator('#offers').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await shot('mob_3_offers');

  // 4. Rankings table
  await page.locator('#rankings').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await shot('mob_4_rankings');

  // 5. Calculator
  const calc = page.locator('#calc');
  if (await calc.count() > 0) {
    await calc.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await shot('mob_5_calc');
  }

  // 6. Resources
  const resources = page.locator('#resources');
  if (await resources.count() > 0) {
    await resources.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await shot('mob_6_resources');
  }

  // 7. Footer
  await page.locator('footer').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await shot('mob_7_footer');

  await browser.close();
  console.log('Mobile screenshots captured successfully.');
})();
