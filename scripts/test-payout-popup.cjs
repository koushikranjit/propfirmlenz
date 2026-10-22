const { chromium } = require('@playwright/test');

(async () => {
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
  } catch (e) {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
  }

  const artifactDir = 'C:/Users/koush/.gemini/antigravity/brain/3ea0bf9e-fd03-4f48-8947-0a03e3265adc';

  // 1. Desktop Test
  const desktopPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await desktopPage.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  
  // Wait for initial popup (~5s) or trigger it
  console.log('Waiting for live payout popup to appear on desktop...');
  try {
    await desktopPage.waitForSelector('#payoutLiveToast.plt-show', { timeout: 8000 });
  } catch (_) {
    // If delay is still counting down, trigger directly
    await desktopPage.evaluate(() => {
      const item = {
        trader: 'Alex M.',
        firm: 'FundedNext',
        amount: '$48,250.00',
        rail: 'Rise · Instant',
        time: 'Just now'
      };
      if (typeof window.triggerNewPayoutNotification === 'function') {
        window.triggerNewPayoutNotification({ trader_leaderboard: [item] });
      }
    });
    await desktopPage.waitForSelector('#payoutLiveToast.plt-show', { timeout: 3000 });
  }

  await desktopPage.waitForTimeout(600);
  await desktopPage.screenshot({
    path: `${artifactDir}/payout_popup_desktop_forex.png`
  });
  console.log('Saved payout_popup_desktop_forex.png');

  // Test theme switch to Futures
  await desktopPage.evaluate(() => {
    document.body.setAttribute('data-market-theme', 'futures');
  });
  await desktopPage.waitForTimeout(400);
  await desktopPage.screenshot({
    path: `${artifactDir}/payout_popup_desktop_futures.png`
  });
  console.log('Saved payout_popup_desktop_futures.png');

  // Test theme switch to Crypto
  await desktopPage.evaluate(() => {
    document.body.setAttribute('data-market-theme', 'crypto');
  });
  await desktopPage.waitForTimeout(400);
  await desktopPage.screenshot({
    path: `${artifactDir}/payout_popup_desktop_crypto.png`
  });
  console.log('Saved payout_popup_desktop_crypto.png');

  await desktopPage.close();

  // 2. Mobile Test (iPhone 14 / modern phone viewport)
  const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  await mobilePage.goto('http://localhost:3000', { waitUntil: 'networkidle' });

  // Trigger popup on mobile
  await mobilePage.evaluate(() => {
    const item = {
      trader: 'David K.',
      firm: 'FundingPips',
      amount: '$36,410.50',
      rail: 'Crypto · 1.4 hrs',
      time: 'Just now'
    };
    if (typeof window.triggerNewPayoutNotification === 'function') {
      window.triggerNewPayoutNotification({ trader_leaderboard: [item] });
    }
  });

  await mobilePage.waitForSelector('#payoutLiveToast.plt-show', { timeout: 3000 });
  await mobilePage.waitForTimeout(600);
  await mobilePage.screenshot({
    path: `${artifactDir}/payout_popup_mobile.png`
  });
  console.log('Saved payout_popup_mobile.png');

  // Test dismiss button on mobile
  await mobilePage.click('#pltClose');
  await mobilePage.waitForTimeout(500);
  const isHidden = await mobilePage.evaluate(() => {
    const toast = document.querySelector('#payoutLiveToast');
    return !toast.classList.contains('plt-show');
  });
  console.log('Dismiss button works cleanly on mobile:', isHidden);

  await mobilePage.close();
  await browser.close();
  console.log('All payout popup tests finished successfully!');
})();
