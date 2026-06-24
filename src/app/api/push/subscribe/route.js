import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabaseClient';

export async function POST(request) {
  try {
    const { subscription, empNo } = await request.json();
    if (!subscription || !subscription.endpoint || !empNo) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = getAdminClient();
    
    // We assume the sa_push_subscriptions table has been created
    const { error } = await supabase
      .from('sa_push_subscriptions')
      .upsert({
        emp_no: String(empNo),
        endpoint: subscription.endpoint,
        p256dh: subscription.keys?.p256dh,
        auth: subscription.keys?.auth,
        updated_at: new Date().toISOString()
      }, { onConflict: 'endpoint' });

    if (error) {
      console.error('Failed to save subscription:', error);
      // Even if the table doesn't exist yet, we return 200 so frontend doesn't crash
      return NextResponse.json({ success: false, error: error.message });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
