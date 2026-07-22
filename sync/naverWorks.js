/**
 * ================================================================
 * 네이버웍스(NAVER WORKS) API 연동 모듈 (CommonJS - 데몬용)
 * ================================================================
 * - OAuth 2.0 (JWT Assertion) Access Token 발급 및 메모리 캐싱
 * - 구성원 프로필 상태(휴가/부재) 설정 API 호출
 * ================================================================
 */

const crypto = require('crypto');

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
  str = str.replace(/\\n/g, '\n');
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

/**
 * 네이버웍스 credentials가 제대로 구성되었는지 확인
 */
function isNaverWorksConfigured() {
  const cfg = getEnvConfig();
  return !!(cfg.clientId && cfg.clientSecret && cfg.serviceAccount && cfg.privateKey);
}

/**
 * RS256 JWT 생성
 */
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

/**
 * Access Token 발급 (메모리 캐시 적용)
 */
async function getAccessToken() {
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

/**
 * 2시간 휴가(반반차) 코드별 시간대 매핑
 */
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

function formatDateDashed(rawDateStr) {
  const digits = String(rawDateStr || '').replace(/\D/g, '');
  if (digits.length < 8) return '';
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

/**
 * 휴가 데이터를 분석하여 네이버웍스 API용 시작/종료 일시(ISO 8601)와 상태 메시지 생성
 */
function calculateLeaveTimeWindow(leave) {
  const startDateStr = formatDateDashed(leave.start_date || leave.startDate);
  const endDateStr = formatDateDashed(leave.end_date || leave.endDate);
  if (!startDateStr || !endDateStr) return null;

  const code = String(leave.leave_code || leave.leaveCode || '').trim();
  const rawName = String(leave.leave_name || leave.leaveName || '').trim();

  let startTime = `${startDateStr}T09:00:00+09:00`;
  let endTime = `${endDateStr}T18:00:00+09:00`;
  let statusMessage = '연차';

  if (code === '16' || code === '61' || rawName.includes('오전') || rawName.includes('4시간휴가 [오전]')) {
    startTime = `${startDateStr}T09:00:00+09:00`;
    endTime = `${startDateStr}T13:00:00+09:00`;
    statusMessage = '오전 반차';
  } else if (code === '17' || code === '62' || rawName.includes('오후') || rawName.includes('4시간휴가 [오후]')) {
    startTime = `${startDateStr}T14:00:00+09:00`;
    endTime = `${startDateStr}T18:00:00+09:00`;
    statusMessage = '오후 반차';
  } else if (TWO_HOUR_LEAVE_TIMES[code]) {
    const info = TWO_HOUR_LEAVE_TIMES[code];
    startTime = `${startDateStr}T${info.start}+09:00`;
    endTime = `${startDateStr}T${info.end}+09:00`;
    statusMessage = info.label;
  } else if (rawName) {
    statusMessage = rawName;
  }

  return {
    profileStatusId: 'ABSENCE',
    statusMessage,
    startTime,
    endTime,
  };
}

/**
 * 특정 사용자의 네이버웍스 프로필 상태 변경 API 호출
 */
async function setUserProfileStatus(email, leave) {
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

/**
 * 연차 목록을 받아 네이버웍스 상태로 배치 동기화
 */
async function syncLeavesToNaverWorks(leavesWithEmails = []) {
  if (!isNaverWorksConfigured()) {
    console.log('[NaverWorks Sync] NAVER_WORKS credentials 미설정으로 상태 동기화를 건너뜁니다.');
    return { success: true, processed: 0, skipped: leavesWithEmails.length };
  }

  let processed = 0;
  let skipped = 0;
  let errors = 0;

  for (const item of leavesWithEmails) {
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

module.exports = {
  isNaverWorksConfigured,
  getAccessToken,
  calculateLeaveTimeWindow,
  setUserProfileStatus,
  syncLeavesToNaverWorks,
};
