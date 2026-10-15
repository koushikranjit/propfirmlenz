import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchFullPayoutDataset, saveFullPayoutDataset } from './full-payout-sync.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const INTERVAL_MS = 60 * 1000; // 1 minute

async function syncOnce() {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Starting continuous payout synchronization cycle...`);
  try {
    const dataset = await fetchFullPayoutDataset();
    saveFullPayoutDataset(dataset);
    console.log(`[${timestamp}] ✓ Payout cycle complete: ${dataset.all_time.length} all-time firms, ${Object.keys(dataset.firm_details).length} firm details updated.`);
    return true;
  } catch (err) {
    console.error(`[${timestamp}] ✗ Sync error:`, err.message);
    return false;
  }
}

const isOnce = process.argv.includes('--once');

if (isOnce) {
  syncOnce().then(() => process.exit(0));
} else {
  console.log(`Starting continuous payout synchronization daemon (interval: ${INTERVAL_MS / 1000}s)...`);
  syncOnce();
  setInterval(syncOnce, INTERVAL_MS);
}
