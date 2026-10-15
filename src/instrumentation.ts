export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Start backend payout auto-sync every 1 minute
    const { getPayoutData, fetchLivePayoutData, saveSyncedPayouts } = await import('@/lib/payout-sync');
    
    // Initial sync
    getPayoutData().catch(err => {
      console.error('[Instrumentation] Initial payout sync error:', (err as Error)?.message || err);
    });

    // Schedule 1-minute sync interval
    setInterval(async () => {
      try {
        const fresh = await fetchLivePayoutData();
        saveSyncedPayouts(fresh);
      } catch (err: unknown) {
        console.error('[Payout Auto-Sync] ✗ Interval sync error:', (err as Error)?.message || err);
      }
    }, 60 * 1000);
  }
}
