import { chromium } from '@playwright/test';
import path from 'path';

const ARTIFACT_DIR = 'C:/Users/koush/.gemini/antigravity/brain/3ea0bf9e-fd03-4f48-8947-0a03e3265adc';

async function run() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log('Navigating to http://localhost:3000/#firm/fundingpips ...');
  await page.goto('http://localhost:3000/#firm/fundingpips', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // Set Google user in localStorage
  await page.evaluate(() => {
    localStorage.setItem('pfl_google_user', JSON.stringify({
      name: 'Marcus Vance',
      email: 'marcus.vance.trader@gmail.com',
      avatar: 'https://lh3.googleusercontent.com/a/default-user=s96-c'
    }));
  });

  // Click Write a Review button
  console.log('Clicking Write a Review button in action bar...');
  await page.click('.profile-action-review');
  await page.waitForTimeout(600);

  const modal = await page.$('#writeReviewModal');
  const isVisible = await page.isVisible('#writeReviewModal');
  console.log('Write review modal is visible:', isVisible);

  const selectedFirm = await page.$eval('#reviewFirmSelect', el => el.value);
  console.log('Selected firm in modal dropdown:', selectedFirm);

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'profile_modal_open.png') });
  console.log('Saved profile_modal_open.png');

  // Fill review form
  await page.fill('#newReviewTitle', 'Consistently pays out on time - Best prop firm in 2025');
  await page.fill('#newReviewBody', 'Have completed three 100K accounts and received payouts without hassle. Spreads during NY session are very competitive.');
  
  // Submit the review
  console.log('Submitting review form...');
  await page.click('#newReviewForm button[type="submit"]');
  await page.waitForTimeout(1000);

  const errBoxText = await page.$eval('#reviewFormError', el => el.innerText || el.textContent);
  const succBoxText = await page.$eval('#reviewFormSuccess', el => el.innerText || el.textContent);
  console.log('Error box text:', errBoxText);
  console.log('Success box text:', succBoxText);

  // Verify review appeared on profile page
  const reviewsEl = await page.$('#profile-reviews');
  if (reviewsEl) {
    await reviewsEl.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'profile_new_review_posted.png') });
    console.log('Saved profile_new_review_posted.png');
  }

  const reviewTitles = await page.$$eval('.profile-review-card h4', els => els.map(e => e.innerText));
  console.log('Profile review titles on page:', reviewTitles);

  await browser.close();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
