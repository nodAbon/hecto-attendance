import crypto from 'node:crypto';

const getSecret = () => (
  process.env.ICAL_SUBSCRIPTION_SECRET
  || process.env.SUPABASE_SERVICE_ROLE_KEY
  || process.env.SUPABASE_ANON_KEY
  || (() => {
    throw new Error('ICAL_SUBSCRIPTION_SECRET가 설정되지 않았습니다.');
  })()
);

export function normalizeIcalDeptList(depts = []) {
  return [...new Set(
    (depts || [])
      .map((dept) => String(dept || '').trim())
      .filter(Boolean)
  )];
}

export function createIcalSubscriptionToken(payload = {}) {
  const cleanPayload = {
    v: 1,
    createdAt: new Date().toISOString(),
    ...payload,
    depts: normalizeIcalDeptList(payload.depts || []),
  };

  const body = Buffer.from(JSON.stringify(cleanPayload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSecret())
    .update(body)
    .digest('base64url');

  return `${body}.${sig}`;
}

export function verifyIcalSubscriptionToken(token = '') {
  const value = String(token || '').trim();
  if (!value || !value.includes('.')) return null;

  const [body, sig] = value.split('.');
  if (!body || !sig) return null;

  const expectedSig = crypto
    .createHmac('sha256', getSecret())
    .update(body)
    .digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload || !Array.isArray(payload.depts)) return null;
    return {
      ...payload,
      depts: normalizeIcalDeptList(payload.depts),
    };
  } catch {
    return null;
  }
}
