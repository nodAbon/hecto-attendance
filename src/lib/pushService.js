import webpush from 'web-push';
import { getAdminClient } from './supabaseClient';

webpush.setVapidDetails(
  'mailto:admin@nodabons.com', // Replace with a real email
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export const sendPushNotification = async (empNo, title, body, url = '/') => {
  const supabase = getAdminClient();

  const { data: subscriptions, error } = await supabase
    .from('sa_push_subscriptions')
    .select('*')
    .eq('emp_no', String(empNo));

  if (error || !subscriptions || subscriptions.length === 0) {
    console.warn(`No push subscriptions found for empNo: ${empNo}`);
    return;
  }

  const payload = JSON.stringify({
    title,
    body,
    url,
    icon: '/favicon.ico'
  });

  for (const sub of subscriptions) {
    const pushSubscription = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.p256dh,
        auth: sub.auth
      }
    };

    try {
      await webpush.sendNotification(pushSubscription, payload);
    } catch (err) {
      console.error('Failed to send push notification, may be expired', err);
      if (err.statusCode === 404 || err.statusCode === 410) {
        // Subscription has expired or is no longer valid, delete it
        await supabase.from('sa_push_subscriptions').delete().eq('endpoint', sub.endpoint);
      }
    }
  }
};
