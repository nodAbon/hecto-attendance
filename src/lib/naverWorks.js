/**
 * ================================================================
 * 네이버웍스(NAVER WORKS) API 연동 모듈 (ESM - Next.js App 라우트용)
 * ================================================================
 * - OAuth 2.0 (JWT Assertion) Access Token 발급 및 메모리 캐싱
 * - 구성원 프로필 상태(휴가/부재) 설정 API 호출
 * ================================================================
 */

import crypto from 'crypto';

let cachedToken = null;
let tokenExpiresAt = 0;

function base64url(input) {
  const str = typeof input === 'string' ? input : JSON.stringify(input);
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function normalizePrivateKey(rawKey) {
  if (!rawKey) return '';
  let str = String(rawKey).trim();

  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    str = str.slice(1, -1);
  }

  str = str.replace(/\\n/g, '\n').replace(/\r/g, '');

  const match = str.match(/-----BEGIN (?:RSA )?PRIVATE KEY-----([\s\S]*?)-----END (?:RSA )?PRIVATE KEY-----/);
  if (match) {
    const rawBody = match[1].replace(/\s+/g, '');
    const formattedBody = rawBody.match(/.{1,64}/g)?.join('\n') || rawBody;
    return `-----BEGIN PRIVATE KEY-----\n${formattedBody}\n-----END PRIVATE KEY-----`;
  }

  return str;
}

function getEnvConfig() {
  return {
    clientId: process.env.NAVER_WORKS_CLIENT_ID || '',
    clientSecret: process.env.NAVER_WORKS_CLIENT_SECRET || '',
    serviceAccount: process.env.NAVER_WORKS_SERVICE_ACCOUNT || '',
    privateKey: normalizePrivateKey(process.env.NAVER_WORKS_PRIVATE_KEY),
  };
}

export function isNaverWorksConfigured() {
  const cfg = getEnvConfig();
  return !!(cfg.clientId && cfg.clientSecret && cfg.serviceAccount && cfg.privateKey);
}

function createJwtAssertion(clientId, serviceAccount, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: clientId,
    sub: serviceAccount,
    iat: now,
    exp: now + 3600,
  };

  const encodedHeader = base64url(header);
  const encodedPayload = base64url(payload);
  const signInput = `${encodedHeader}.${encodedPayload}`;

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signInput);
  const signature = signer.sign(privateKey, 'base64');
  const encodedSignature = signature
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${signInput}.${encodedSignature}`;
}

export async function getAccessToken() {
  if (!isNaverWorksConfigured()) {
    return null;
  }

  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 5 * 60 * 1000) {
    return cachedToken;
  }

  const cfg = getEnvConfig();
  const jwt = createJwtAssertion(cfg.clientId, cfg.serviceAccount, cfg.privateKey);

  const bodyParams = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwt,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    scope: 'directory',
  });

  const res = await fetch('https://auth.worksmobile.com/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: bodyParams.toString(),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`[NaverWorks Token Error ${res.status}] ${errText}`);
  }

  const data = await res.json();
  if (!data.access_token) {
    throw new Error('[NaverWorks Token Error] access_token이 응답에 없습니다.');
  }

  cachedToken = data.access_token;
  const expiresInMs = (data.expires_in || 86400) * 1000;
  tokenExpiresAt = now + expiresInMs;

  return cachedToken;
}

const TWO_HOUR_LEAVE_TIMES = {
  '19': { start: '07:00:00', end: '09:00:00', label: '2시간 휴가 [07-09]' },
  '20': { start: '08:00:00', end: '10:00:00', label: '2시간 휴가 [08-10]' },
  '21': { start: '09:00:00', end: '11:00:00', label: '2시간 휴가 [09-11]' },
  '22': { start: '10:00:00', end: '12:00:00', label: '2시간 휴가 [10-12]' },
  '23': { start: '11:00:00', end: '13:00:00', label: '2시간 휴가 [11-13]' },
  '24': { start: '13:00:00', end: '15:00:00', label: '2시간 휴가 [13-15]' },
  '25': { start: '14:00:00', end: '16:00:00', label: '2시간 휴가 [14-16]' },
  '26': { start: '15:00:00', end: '17:00:00', label: '2시간 휴가 [15-17]' },
  '27': { start: '16:00:00', end: '18:00:00', label: '2시간 휴가 [16-18]' },
  '28': { start: '17:00:00', end: '19:00:00', label: '2시간 휴가 [17-19]' },
};

const LEAVE_CODE_LABELS = {
  '12': '연차',
  '13': '공가',
  '16': '오전 반차',
  '17': '오후 반차',
  '18': '경조휴가',
  '19': '2시간 휴가 [07-09]',
  '20': '2시간 휴가 [08-10]',
  '21': '2시간 휴가 [09-11]',
  '22': '2시간 휴가 [10-12]',
  '23': '2시간 휴가 [11-13]',
  '24': '2시간 휴가 [13-15]',
  '25': '2시간 휴가 [14-16]',
  '26': '2시간 휴가 [15-17]',
  '27': '2시간 휴가 [16-18]',
  '28': '2시간 휴가 [17-19]',
  '51': '연차',
  '60': '연차',
  '61': '오전 반차',
  '62': '오후 반차',
};

function formatDateDashed(rawDateStr) {
  const digits = String(rawDateStr || '').replace(/\D/g, '');
  if (digits.length < 8) return '';
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

export function calculateLeaveTimeWindow(leave) {
  const startDateStr = formatDateDashed(leave.start_date || leave.startDate);
  const endDateStr = formatDateDashed(leave.end_date || leave.endDate);
  if (!startDateStr || !endDateStr) return null;

  const code = String(leave.leave_code || leave.leaveCode || '').trim();
  const rawName = String(leave.leave_name || leave.leaveName || '').trim();

  let startTime = `${startDateStr}T08:00:00+09:00`;
  let endTime = `${endDateStr}T17:00:00+09:00`;
  let statusMessage = LEAVE_CODE_LABELS[code] || (rawName && !/^\d+$/.test(rawName) ? rawName : '연차');

  if (code === '16' || code === '61' || rawName.includes('오전') || rawName.includes('4시간휴가 [오전]')) {
    startTime = `${startDateStr}T08:00:00+09:00`;
    endTime = `${startDateStr}T12:00:00+09:00`;
    statusMessage = '오전 반차';
  } else if (code === '17' || code === '62' || rawName.includes('오후') || rawName.includes('4시간휴가 [오후]')) {
    startTime = `${startDateStr}T13:00:00+09:00`;
    endTime = `${startDateStr}T17:00:00+09:00`;
    statusMessage = '오후 반차';
  } else if (TWO_HOUR_LEAVE_TIMES[code]) {
    const info = TWO_HOUR_LEAVE_TIMES[code];
    startTime = `${startDateStr}T${info.start}+09:00`;
    endTime = `${startDateStr}T${info.end}+09:00`;
    statusMessage = info.label;
  }

  const profileStatusId = process.env.NAVER_WORKS_PROFILE_STATUS_ID || 'CUSTOM01';

  return {
    profileStatusId,
    statusMessage,
    startTime,
    endTime,
  };
}

export async function setUserProfileStatus(email, leave) {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return { success: false, skipped: true, reason: '네이버웍스 인증 미설정' };
  }

  if (!email || !email.includes('@')) {
    return { success: false, skipped: true, reason: '이메일 정보 없음' };
  }

  const window = calculateLeaveTimeWindow(leave);
  if (!window) {
    return { success: false, skipped: true, reason: '날짜 계산 실패' };
  }

  // Naver Works API는 endTime이 현재 시각 이후인 미래/현재 상태만 등록 허용합니다.
  const endTimeMs = new Date(window.endTime).getTime();
  if (Number.isFinite(endTimeMs) && endTimeMs <= Date.now()) {
    return { success: false, skipped: true, reason: '과거 연차 (endTime이 현재 시각 이전)' };
  }

  const url = `https://www.worksapis.com/v1.0/users/${encodeURIComponent(email)}/user-profile-statuses`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(window),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`[NaverWorks Status Error ${res.status}] ${errText}`);
  }

  const data = await res.json().catch(() => ({}));
  return { success: true, email, window, data };
}

export async function syncLeavesToNaverWorks(leavesWithEmails = []) {
  if (!isNaverWorksConfigured()) {
    console.log('[NaverWorks Sync] NAVER_WORKS credentials 미설정으로 상태 동기화를 건너뜁니다.');
    return { success: true, processed: 0, skipped: leavesWithEmails.length };
  }

  // 가장 가까운 미래 연차가 가장 마지막에 등록(덮어쓰기)되도록 내림차순 정렬
  const sortedLeaves = [...leavesWithEmails].sort((a, b) => {
    const aDate = String(a.start_date || a.startDate || '');
    const bDate = String(b.start_date || b.startDate || '');
    return bDate.localeCompare(aDate);
  });

  let processed = 0;
  let skipped = 0;
  let errors = 0;

  for (const item of sortedLeaves) {
    try {
      const email = item.email || item.emp_email;
      const res = await setUserProfileStatus(email, item);
      if (res.skipped) {
        skipped++;
      } else {
        processed++;
        console.log(`[NaverWorks Sync] 상태 설정 완료: ${item.emp_name || item.emp_no} (${email}) - ${res.window.statusMessage} (${res.window.startTime} ~ ${res.window.endTime})`);
      }
    } catch (err) {
      errors++;
      console.error(`[NaverWorks Sync Error] ${item.emp_name || item.emp_no} 상태 설정 실패:`, err.message);
    }
  }

  return { success: errors === 0, processed, skipped, errors };
}
