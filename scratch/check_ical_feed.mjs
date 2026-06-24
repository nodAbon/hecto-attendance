import fs from 'node:fs';

function loadEnvValue(key) {
  const text = fs.readFileSync('.env.local', 'utf8');
  const line = text.split(/\r?\n/).find((item) => item.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1) : '';
}

const { createIcalSubscriptionToken } = await import('../src/lib/icalToken.js');

const token = createIcalSubscriptionToken({
  depts: ['경영지원실', '경영지원팀'],
  label: '비공개 iCal 구독',
  createdBy: 'debug',
  scope: 'leave-calendar',
});

const url = `https://agitated-raman-alpha.vercel.app/api/ical/subscriptions/${token}.ics`;
console.log(JSON.stringify({
  hasSecret: Boolean(loadEnvValue('ICAL_SUBSCRIPTION_SECRET') || loadEnvValue('SUPABASE_SERVICE_ROLE_KEY')),
  token,
  url,
}, null, 2));
