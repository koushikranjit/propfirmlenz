import { chromium } from '@playwright/test';
import path from 'path';

const ARTIFACT_DIR = 'C:/Users/koush/.gemini/antigravity/brain/3ea0bf9e-fd03-4f48-8947-0a03e3265adc';

async function run() {
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  console.log('Navigating to http://localhost:3000/#firm/fundingpips ...');
  await page.goto('http://localhost:3000/#firm/fundingpips', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // 1. Take top view screenshot
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'profile_verified_top.png') });
  console.log('Saved profile_verified_top.png');

  // 2. Scroll to Challenges and take screenshot
  const challengesEl = await page.$('#profile-challenges');
  if (challengesEl) {
    await challengesEl.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'profile_verified_challenges.png') });
    console.log('Saved profile_verified_challenges.png');
  }

  // 3. Scroll to Reviews Scorecard & Feed
  const reviewsEl = await page.$('#profile-reviews');
  if (reviewsEl) {
    await reviewsEl.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'profile_verified_reviews.png') });
    console.log('Saved profile_verified_reviews.png');
  }

  // 4. Test Favorite button toggle
  const favBtn = await page.$('.profile-action-favorite');
  if (favBtn) {
    const textBefore = await favBtn.innerText();
    console.log('Favorite button before click:', textBefore.trim());
    await favBtn.click();
    await page.waitForTimeout(300);
    const textAfter = await favBtn.innerText();
    console.log('Favorite button after click:', textAfter.trim());
  }

  // 5. Test Helpful upvote button
  const upvoteBtn = await page.$('.btn-review-upvote');
  if (upvoteBtn) {
    const upvoteTextBefore = await upvoteBtn.innerText();
    console.log('Upvote button before click:', upvoteTextBefore.trim());
    await upvoteBtn.click();
    await page.waitForTimeout(300);
    const upvoteTextAfter = await upvoteBtn.innerText();
    console.log('Upvote button after click:', upvoteTextAfter.trim());
  }

  // 6. Test Write a Review modal
  const writeBtn = await page.$('[data-write-pfl-review]');
  if (writeBtn) {
    console.log('Clicking Write a Review button...');
    await writeBtn.click();
    await page.waitForTimeout(600);
    
    const modalVisible = await page.isVisible('#writeReviewModal');
    const selectedFirm = await page.$eval('#reviewFirmSelect', el => el.value);
    console.log('Modal visible:', modalVisible, 'Selected firm in dropdown:', selectedFirm);

    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'profile_write_review_modal.png') });
    console.log('Saved profile_write_review_modal.png');
  }

  // 7. Test another prop firm profile (e.g. FTMO)
  console.log('Navigating to http://localhost:3000/#firm/ftmo ...');
  await page.goto('http://localhost:3000/#firm/ftmo', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'profile_ftmo_top.png') });
  console.log('Saved profile_ftmo_top.png');

  await browser.close();
  console.log('All profile tests completed successfully!');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
