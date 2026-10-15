import { NextResponse } from 'next/server';
import { getPayoutData, fetchLivePayoutData, saveSyncedPayouts } from '@/lib/payout-sync';

export const dynamic = 'force-dynamic';
export const revalidate = 60; // 1 minute

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get('refresh') === 'true';

    let data;
    if (forceRefresh) {
      data = await fetchLivePayoutData();
      saveSyncedPayouts(data);
    } else {
      data = await getPayoutData();
    }

    return NextResponse.json(data, {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=30',
        'X-PFL-Feed-Status': 'live'
      }
    });
  } catch (error) {
    console.error('Error serving payouts API:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve live payout feed' },
      { status: 500 }
    );
  }
}
