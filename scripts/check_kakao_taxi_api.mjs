import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const envPath = path.join(projectRoot, '.env.local');

function loadDotEnv(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) return env;

  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex < 0) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function pickEnv(key, fallback = '') {
  return String(process.env[key] ?? fallback ?? '').trim();
}

function resolveConfig(dotEnv = {}) {
  const corpId =
    pickEnv('KAKAO_T_BIZ_CORP_ID', dotEnv.KAKAO_T_BIZ_CORP_ID)
    || pickEnv('KAKAO_T_BIZ_CORP_ID_VALUE', dotEnv.KAKAO_T_BIZ_CORP_ID_VALUE)
    || pickEnv('KAKAO_T_BIZ_ID', dotEnv.KAKAO_T_BIZ_ID)
    || pickEnv('KAKAO_T_BIZ_COMPANY_ID', dotEnv.KAKAO_T_BIZ_COMPANY_ID);

  const secret =
    pickEnv('KAKAO_T_BIZ_API_SECRET', dotEnv.KAKAO_T_BIZ_API_SECRET)
    || pickEnv('KAKAO_T_BIZ_SECRET', dotEnv.KAKAO_T_BIZ_SECRET)
    || pickEnv('KAKAO_T_BIZ_TOKEN', dotEnv.KAKAO_T_BIZ_TOKEN)
    || pickEnv('KAKAO_T_BIZ_API_KEY', dotEnv.KAKAO_T_BIZ_API_KEY)
    || pickEnv('KAKAO_T_BIZ_AUTH_SECRET', dotEnv.KAKAO_T_BIZ_AUTH_SECRET);

  const baseUrl = pickEnv('KAKAO_T_BIZ_API_BASE_URL', dotEnv.KAKAO_T_BIZ_API_BASE_URL) || 'https://b2b-api.kakaomobility.com';

  return {
    corpId,
    secret,
    baseUrl,
  };
}

function buildAuthHeaders({ corpId, secret, requestUrl, method = 'GET' }) {
  const nonce = String(Math.floor(Math.random() * 90000) + 10000);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const canonicalUrl = `${requestUrl.origin}${requestUrl.pathname}`;
  const message = `${nonce}\n${canonicalUrl}\n${method}\n${corpId}\n${timestamp}\n${nonce}`;
  const token = crypto.createHmac('sha1', secret).update(message).digest('base64');

  return {
    authorization: `Token ${token}`,
    'x-mob-b2b-corp-id': corpId,
    'x-mob-b2b-nonce': nonce,
    'x-mob-b2b-timestamp': timestamp,
  };
}

async function main() {
  const dotEnv = loadDotEnv(envPath);
  const config = resolveConfig(dotEnv);

  console.log('=== KakaoT Taxi API Check ===');
  console.log(`.env.local: ${fs.existsSync(envPath) ? 'found' : 'missing'}`);
  console.log(`KAKAO_T_BIZ_CORP_ID: ${config.corpId ? 'set' : 'missing'}`);
  console.log(`KAKAO_T_BIZ_API_SECRET: ${config.secret ? 'set' : 'missing'}`);
  console.log(`KAKAO_T_BIZ_API_BASE_URL: ${config.baseUrl}`);

  if (!config.corpId || !config.secret) {
    console.error('\nMissing KakaoT credentials. Add KAKAO_T_BIZ_CORP_ID and KAKAO_T_BIZ_API_SECRET to .env.local.');
    process.exitCode = 1;
    return;
  }

  const startDate = process.argv[2] || dotEnv.KAKAO_T_BIZ_TEST_START_DATE || '';
  const endDate = process.argv[3] || dotEnv.KAKAO_T_BIZ_TEST_END_DATE || '';
  const memberIdentifier = process.argv[4] || dotEnv.KAKAO_T_BIZ_TEST_MEMBER_IDENTIFIER || '';

  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    console.log('\nUsage: node scripts/check_kakao_taxi_api.mjs YYYY-MM-DD YYYY-MM-DD [member_identifier]');
    console.log('Or set KAKAO_T_BIZ_TEST_START_DATE / KAKAO_T_BIZ_TEST_END_DATE in .env.local.');
    return;
  }

  const requestUrl = new URL('/external/v2/orders', config.baseUrl);
  requestUrl.searchParams.set('start_date', startDate);
  requestUrl.searchParams.set('end_date', endDate);
  requestUrl.searchParams.set('page', '1');
  requestUrl.searchParams.set('per', '5');
  requestUrl.searchParams.set('search_by_payment_at', 'false');
  requestUrl.searchParams.set('vertical_code', 'TAXI');
  if (memberIdentifier) {
    requestUrl.searchParams.set('member_identifier', memberIdentifier);
  }

  const headers = buildAuthHeaders({
    corpId: config.corpId,
    secret: config.secret,
    requestUrl,
  });

  console.log(`\nRequest URL: ${requestUrl.toString()}`);
  console.log(`member_identifier: ${memberIdentifier || '(none)'}`);

  const res = await fetch(requestUrl.toString(), {
    method: 'GET',
    headers: {
      accept: 'application/json;charset=UTF-8',
      ...headers,
    },
  });

  const text = await res.text();
  console.log(`HTTP ${res.status}`);
  try {
    const json = JSON.parse(text);
    console.log(JSON.stringify(json, null, 2));
  } catch {
    console.log(text);
  }

  if (!res.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('[check_kakao_taxi_api] failed:', error);
  process.exitCode = 1;
});
