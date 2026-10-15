import { NextResponse } from 'next/server';
import { getAllReviews, addReview, hasUserReviewed } from '@/lib/reviews-store';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const reviews = getAllReviews();
    return NextResponse.json({
      reviews,
      count: reviews.length,
      status: 'success'
    }, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        'X-PFL-Review-Status': 'active'
      }
    });
  } catch (err: any) {
    console.error('Error fetching reviews:', err);
    return NextResponse.json({ error: 'Failed to retrieve reviews' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { firm, author, email, rating, title, body: reviewText, categories, payoutReceived } = body;

    if (!firm || typeof firm !== 'string') {
      return NextResponse.json({ error: 'Prop firm name is required.' }, { status: 400 });
    }
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'A valid email address is required to submit a verified review.' }, { status: 400 });
    }
    const numRating = Number(rating);
    if (!numRating || numRating < 1 || numRating > 5) {
      return NextResponse.json({ error: 'Rating must be between 1 and 5 stars.' }, { status: 400 });
    }
    if (!title || title.trim().length < 3) {
      return NextResponse.json({ error: 'Please provide a review title (at least 3 characters).' }, { status: 400 });
    }
    if (!reviewText || reviewText.trim().length < 10) {
      return NextResponse.json({ error: 'Please describe your trader experience (at least 10 characters).' }, { status: 400 });
    }

    // Check if user already reviewed this firm
    if (hasUserReviewed(email, firm)) {
      return NextResponse.json({
        error: `You have already submitted a review for ${firm}. Each trader is permitted only one review per firm to maintain fair ratings.`
      }, { status: 409 });
    }

    const result = addReview({
      firm: firm.trim(),
      author: (author && author.trim()) ? author.trim() : 'Verified Trader',
      email: email.trim().toLowerCase(),
      rating: Math.round(numRating),
      title: title.trim(),
      body: reviewText.trim(),
      categories: {
        payoutSpeed: categories?.payoutSpeed ? Number(categories.payoutSpeed) : Math.round(numRating),
        rulesSpreads: categories?.rulesSpreads ? Number(categories.rulesSpreads) : Math.round(numRating),
        support: categories?.support ? Number(categories.support) : Math.round(numRating)
      },
      payoutReceived: Boolean(payoutReceived)
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to publish review.' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      review: result.review,
      message: 'Review published live! No moderation delay.'
    }, { status: 201 });

  } catch (err: any) {
    console.error('Error handling review POST:', err);
    return NextResponse.json({ error: 'Internal server error while processing review' }, { status: 500 });
  }
}
