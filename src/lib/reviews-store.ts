import fs from 'fs';
import path from 'path';

export interface TraderReview {
  id: string;
  firm: string;
  author: string;
  email: string;
  rating: number; // 1 - 5
  title: string;
  body: string;
  date: string;
  categories: {
    payoutSpeed: number;
    rulesSpreads: number;
    support: number;
  };
  payoutReceived: boolean;
  verifiedTrader: boolean;
  upvotes: number;
}

const SEED_REVIEWS: TraderReview[] = [
  {
    id: 'rev-fp-1',
    firm: 'FundingPips',
    author: 'Daniel K.',
    email: 'daniel.k.trader@gmail.com',
    rating: 5,
    title: 'Instant crypto payout received in under 2 hours',
    body: 'Passed the 100K 2-step evaluation in 12 days. Requested my first payout of $4,820 via USDT on Tuesday morning and it was confirmed on-chain in 1 hour 45 minutes. Execution on Match-Trader is clean with no unexpected slippage.',
    date: '2026-10-14T09:30:00Z',
    categories: { payoutSpeed: 5, rulesSpreads: 5, support: 5 },
    payoutReceived: true,
    verifiedTrader: true,
    upvotes: 42
  },
  {
    id: 'rev-fn-1',
    firm: 'FundedNext',
    author: 'Sarah M.',
    email: 'sarah.m.fx@proton.me',
    rating: 5,
    title: '15% profit sharing from evaluation phase is a game changer',
    body: 'FundedNext really stands out by paying 15% profit share from the challenge phase itself. My second withdrawal of $3,150 arrived through Rise within 6 hours. Account dashboard and analytics are top tier.',
    date: '2026-10-12T14:15:00Z',
    categories: { payoutSpeed: 5, rulesSpreads: 4, support: 5 },
    payoutReceived: true,
    verifiedTrader: true,
    upvotes: 38
  },
  {
    id: 'rev-e8-1',
    firm: 'E8 Markets',
    author: 'Marcus Vance',
    email: 'marcus.vance88@yahoo.com',
    rating: 5,
    title: 'Custom evaluation scale and zero commission spreads',
    body: 'Configured a custom $150K account with 80% split and 14-day cycle. Spreads on EURUSD and NAS100 are extremely tight. Support answered my drawdown rule inquiry in under 3 minutes on Discord.',
    date: '2026-10-10T18:20:00Z',
    categories: { payoutSpeed: 5, rulesSpreads: 5, support: 4 },
    payoutReceived: true,
    verifiedTrader: true,
    upvotes: 29
  },
  {
    id: 'rev-5ers-1',
    firm: 'The5ers',
    author: 'Liam O’Connor',
    email: 'liam.trader.uk@gmail.com',
    rating: 5,
    title: 'The gold standard for longevity and reliability',
    body: 'Have been with The5ers for over 2 years on the High Stakes account. Every single payout has been processed on schedule without a hitch. If you are serious about long-term scaling, they are unbeatable.',
    date: '2026-10-09T11:45:00Z',
    categories: { payoutSpeed: 5, rulesSpreads: 5, support: 5 },
    payoutReceived: true,
    verifiedTrader: true,
    upvotes: 56
  },
  {
    id: 'rev-ac-1',
    firm: 'Alpha Capital',
    author: 'Tariq Al-Mansoor',
    email: 'tariq.alpha@gmail.com',
    rating: 4,
    title: 'Great raw spreads on cTrader, smooth withdrawal',
    body: 'Using cTrader on Alpha Capital has been flawless. Zero commission raw spreads make scalping gold very viable. Payout of $2,400 received via bank transfer within 24 hours.',
    date: '2026-10-08T16:00:00Z',
    categories: { payoutSpeed: 4, rulesSpreads: 5, support: 4 },
    payoutReceived: true,
    verifiedTrader: true,
    upvotes: 21
  },
  {
    id: 'rev-tf-1',
    firm: 'Tradeify',
    author: 'Austin Reed',
    email: 'austin.futures@outlook.com',
    rating: 5,
    title: 'Straightforward futures rules and same-day ACH',
    body: 'Traded NQ and ES on Tradovate. The daily loss limit calculation is clear and fair with trailing drawdown stopping at initial balance. First payout of $5,200 cleared same-day.',
    date: '2026-10-07T13:10:00Z',
    categories: { payoutSpeed: 5, rulesSpreads: 5, support: 5 },
    payoutReceived: true,
    verifiedTrader: true,
    upvotes: 34
  },
  {
    id: 'rev-mff-1',
    firm: 'My Funded Futures',
    author: 'Brandon C.',
    email: 'brandon.c.trading@gmail.com',
    rating: 5,
    title: 'No activation fees and transparent rules',
    body: 'The Starter plan is by far the most trader-friendly evaluation in the futures industry. No activation fees, end-of-day drawdown instead of intraday trailing. Payout process is fully automated.',
    date: '2026-10-06T19:25:00Z',
    categories: { payoutSpeed: 5, rulesSpreads: 5, support: 4 },
    payoutReceived: true,
    verifiedTrader: true,
    upvotes: 48
  },
  {
    id: 'rev-ftmo-1',
    firm: 'FTMO',
    author: 'Elena Rostova',
    email: 'elena.fx@mail.com',
    rating: 5,
    title: 'Industry benchmark for a reason',
    body: 'FTMO remains the most respected firm in prop trading. Client area, MetriX analytics, and customer support are unmatched. Received over 10 payouts consistently on the 14-day cycle.',
    date: '2026-10-05T08:50:00Z',
    categories: { payoutSpeed: 5, rulesSpreads: 5, support: 5 },
    payoutReceived: true,
    verifiedTrader: true,
    upvotes: 62
  },
  {
    id: 'rev-if-1',
    firm: 'Instant Funding',
    author: 'Kevin Zhang',
    email: 'kzhang.crypto@gmail.com',
    rating: 4,
    title: 'Instant funding model without evaluation phase',
    body: 'Chose the direct funding route to skip evaluation. 10% max drawdown with scaling opportunities. Payout requested after 14 trading days arrived in 24 hours.',
    date: '2026-10-04T15:30:00Z',
    categories: { payoutSpeed: 4, rulesSpreads: 4, support: 4 },
    payoutReceived: true,
    verifiedTrader: true,
    upvotes: 18
  },
  {
    id: 'rev-bf-1',
    firm: 'BrightFunded',
    author: 'Jonas Lind',
    email: 'jonas.lindqvist@hotmail.com',
    rating: 4,
    title: 'Sleek custom trading platform and friendly team',
    body: 'Their proprietary trading app is responsive and clean. Trading rules are straightforward with 8% target in phase 1 and 5% in phase 2. Payout of $1,850 completed via crypto without delay.',
    date: '2026-10-03T12:00:00Z',
    categories: { payoutSpeed: 4, rulesSpreads: 4, support: 5 },
    payoutReceived: true,
    verifiedTrader: true,
    upvotes: 15
  },
  {
    id: 'rev-topone-1',
    firm: 'Top One Futures',
    author: 'Tyler Brooks',
    email: 'tyler.futures.trader@gmail.com',
    rating: 5,
    title: 'Huge discount with code LENZ and rapid payout approval',
    body: 'Grabbed the 150K challenge with the LENZ discount code. Target achieved in 8 trading days. Payout request was approved in 4 hours and processed via crypto.',
    date: '2026-10-02T17:40:00Z',
    categories: { payoutSpeed: 5, rulesSpreads: 5, support: 4 },
    payoutReceived: true,
    verifiedTrader: true,
    upvotes: 27
  },
  {
    id: 'rev-holaprime-1',
    firm: 'Hola Prime',
    author: 'Mateo Morales',
    email: 'mateo.prime.trading@gmail.com',
    rating: 5,
    title: 'Fast growing firm with competitive leverage and rules',
    body: 'Great experience so far. Low commissions, great dashboard UI, and no hidden rules. Payout of $3,400 received in under 12 hours.',
    date: '2026-10-01T10:15:00Z',
    categories: { payoutSpeed: 5, rulesSpreads: 4, support: 5 },
    payoutReceived: true,
    verifiedTrader: true,
    upvotes: 23
  }
];

const REVIEWS_FILE = path.join(process.cwd(), 'data', 'reviews.json');

function ensureDataDir() {
  const dir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function getAllReviews(): TraderReview[] {
  try {
    ensureDataDir();
    if (fs.existsSync(REVIEWS_FILE)) {
      const content = fs.readFileSync(REVIEWS_FILE, 'utf-8');
      const stored: TraderReview[] = JSON.parse(content);
      // Merge with seed reviews so user-submitted reviews stay at the top
      const storedIds = new Set(stored.map(r => r.id));
      const merged = [...stored];
      for (const seed of SEED_REVIEWS) {
        if (!storedIds.has(seed.id)) {
          merged.push(seed);
        }
      }
      return merged;
    } else {
      fs.writeFileSync(REVIEWS_FILE, JSON.stringify(SEED_REVIEWS, null, 2), 'utf-8');
      return SEED_REVIEWS;
    }
  } catch (err) {
    console.error('Error reading reviews file:', err);
    return SEED_REVIEWS;
  }
}

export function hasUserReviewed(email: string, firm: string): boolean {
  if (!email || !firm) return false;
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedFirm = firm.trim().toLowerCase();
  const reviews = getAllReviews();
  return reviews.some(r =>
    r.email.trim().toLowerCase() === normalizedEmail &&
    r.firm.trim().toLowerCase() === normalizedFirm
  );
}

export function addReview(newReview: Omit<TraderReview, 'id' | 'date' | 'verifiedTrader' | 'upvotes'>): { success: boolean; review?: TraderReview; error?: string } {
  const normalizedEmail = newReview.email.trim().toLowerCase();
  const normalizedFirm = newReview.firm.trim().toLowerCase();

  // Enforce one review per user per firm
  if (hasUserReviewed(normalizedEmail, normalizedFirm)) {
    return {
      success: false,
      error: `You have already submitted a review for ${newReview.firm}. To ensure fair and authentic community ratings, each trader can submit only one review per firm.`
    };
  }

  const review: TraderReview = {
    ...newReview,
    id: `rev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    date: new Date().toISOString(),
    verifiedTrader: true,
    upvotes: 0
  };

  try {
    ensureDataDir();
    const reviews = getAllReviews();
    reviews.unshift(review); // Add at top
    fs.writeFileSync(REVIEWS_FILE, JSON.stringify(reviews, null, 2), 'utf-8');
    return { success: true, review };
  } catch (err: any) {
    console.error('Error saving review:', err);
    return { success: false, error: err.message || 'Failed to save review' };
  }
}
