import nodemailer from 'nodemailer';
import { getAdminClient } from './supabaseClient.js';
import { isLeaderPosition } from './roleUtils.js';
import { normalizeEmpNoKey } from './dashboardUtils.js';


function getSmtpConfig() {
  const host = process.env.NAVER_WORKS_SMTP_HOST || process.env.TAXI_AUDIT_SMTP_HOST;
  const port = Number(process.env.NAVER_WORKS_SMTP_PORT || process.env.TAXI_AUDIT_SMTP_PORT || 587);
  const secureValue = String(process.env.NAVER_WORKS_SMTP_SECURE || process.env.TAXI_AUDIT_SMTP_SECURE || '').toLowerCase();
  const secure = secureValue === 'true' || secureValue === '1' || port === 465;
  const user = process.env.NAVER_WORKS_SMTP_USER || process.env.TAXI_AUDIT_SMTP_USER;
  const pass = process.env.NAVER_WORKS_SMTP_PASS || process.env.TAXI_AUDIT_SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error('SMTP 설정이 부족합니다. NAVER_WORKS_SMTP_HOST, NAVER_WORKS_SMTP_USER, NAVER_WORKS_SMTP_PASS를 확인하세요.');
  }

  return { host, port, secure, user, pass };
}

function formatAmount(value) {
  const text = String(value || '').trim().replace(/,/g, '');
  const num = Number(text);
  if (!Number.isFinite(num)) return text || '-';
  return new Intl.NumberFormat('ko-KR').format(Math.round(num));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}


function normalizeEmailAddress(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.includes('@') ? text : '';
}

function resolveFallbackEmail(employee = {}) {
  const directEmail = normalizeEmailAddress(employee?.email);
  if (directEmail) return directEmail;

  const loginId = String(employee?.login_id || '').trim();
  if (!loginId) return '';
  if (loginId.includes('@')) return loginId;
  return `${loginId}@hecto.internal`;
}

async function resolveTaxiAuditMailTargets(row) {
  const supabase = getAdminClient();
  const empNo = normalizeEmpNoKey(row?.empNo || row?.memberIdentifier);

  if (!empNo) {
    throw new Error('소명 대상 직원 정보를 찾을 수 없습니다.');
  }

  const { data: employee, error: employeeError } = await supabase
    .from('sa_employees')
    .select('emp_no, name, dept, email, login_id, is_active')
    .eq('emp_no', empNo)
    .maybeSingle();

  if (employeeError) {
    throw new Error(`직원 정보를 불러오지 못했습니다: ${employeeError.message}`);
  }

  const employeeEmail = resolveFallbackEmail(employee);

  const dept = String(employee?.dept || row?.dept || '').trim();
  let leaderEmail = '';

  if (dept) {
    const { data: deptEmployees, error: deptEmployeesError } = await supabase
      .from('sa_employees')
      .select('emp_no, name, dept, email, login_id, is_active')
      .eq('dept', dept)
      .eq('is_active', true);

    if (deptEmployeesError) {
      throw new Error(`팀장 대상 조회에 실패했습니다: ${deptEmployeesError.message}`);
    }

    const deptEmpNos = (deptEmployees || [])
      .map((item) => normalizeEmpNoKey(item?.emp_no))
      .filter(Boolean);

    const { data: profiles, error: profileError } = deptEmpNos.length > 0
      ? await supabase
        .from('sa_profiles')
        .select('emp_no, position, is_admin')
        .in('emp_no', deptEmpNos)
      : { data: [], error: null };

    if (profileError) {
      throw new Error(`팀장 프로필 조회에 실패했습니다: ${profileError.message}`);
    }

    const profileMap = new Map(
      (profiles || []).map((profile) => [normalizeEmpNoKey(profile?.emp_no), profile || {}])
    );

    const leaderEmployee = (deptEmployees || []).find((item) => {
      const profile = profileMap.get(normalizeEmpNoKey(item?.emp_no)) || {};
      return isLeaderPosition(profile.position || '') || !!profile.is_admin;
    }) || null;

    leaderEmail = resolveFallbackEmail(leaderEmployee);
  }

  const cc = Array.from(new Set([
    leaderEmail,
    'hq_admin@hecto.co.kr',
  ].filter(Boolean)));

  return {
    recipientEmail: employeeEmail,
    cc,
  };
}

export async function sendTaxiAuditExplanationMail(row, explanationRecord = null, siteBaseUrl = '', overrideRecipientEmail = '') {
  const smtp = getSmtpConfig();
  const fromAddress = process.env.TAXI_AUDIT_MAIL_FROM || smtp.user;
  const fromName = process.env.TAXI_AUDIT_MAIL_FROM_NAME || 'HECTO Q&M 근태관리시스템';
  const replyTo = process.env.TAXI_AUDIT_REPLY_TO || fromAddress;

  // 임시 테스트 설정: 소명요청 수신 대상을 bhkim@hecto.co.kr 로 고정 (CC 제외)
  const recipientEmail = 'bhkim@hecto.co.kr';
  const cc = [];

  if (!recipientEmail) {
    throw new Error('직원 이메일을 찾지 못했습니다. emp_no와 사원 정보를 확인하세요.');
  }



  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    requireTLS: !smtp.secure && smtp.port === 587,
    auth: {
      user: smtp.user,
      pass: smtp.pass,
    },
  });

  const baseUrl = siteBaseUrl
    || process.env.NEXT_PUBLIC_SITE_URL
    || process.env.SITE_URL
    || 'https://qnm.hecto.co.kr';

  const token = explanationRecord?.token || '';
  const explainUrl = token ? `${baseUrl.replace(/\/$/, '')}/taxi-audit/explain?token=${token}` : baseUrl;

  const rideTime = String(row.rideTime || row.rideTimeRaw || '-').trim();
  const checkoutTime = String(row.actualOutTime || '-').trim();
  const amount = formatAmount(row.amount);
  const employeeName = String(row.employeeName || '-').trim();
  const dept = String(row.dept || '-').trim();
  const reason = String(row.reason || '-').trim();
  const pickup = String(row.pickup || '-').trim();
  const dropoff = String(row.dropoff || '-').trim();

  const subject = `[소명요청] 택시 이용 내역 확인 - ${employeeName} / ${rideTime}`;

  const text = [
    '안녕하세요.',
    '',
    'HECTO Q&M 근태관리시스템에서 택시 이용 소명 요청드립니다.',
    '아래 링크를 클릭하여 소명 사유를 작성해 주시기 바랍니다.',
    '',
    `소명 작성 웹 페이지: ${explainUrl}`,
    '',
    `직원명: ${employeeName}`,
    `부서: ${dept}`,
    `탑승일시: ${rideTime}`,
    `실제 퇴근시간: ${checkoutTime}`,
    `이용사유: ${reason}`,
    `결제금액: ${amount}`,
    `출발/도착: ${pickup} ➔ ${dropoff}`,
  ].join('\n');

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.7; color: #1f2937; background: #f8fafc; padding: 16px;">
      <div style="max-width: 680px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
        <div style="padding: 24px; background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); color: #ffffff;">
          <div style="font-size: 13px; color: #93c5fd; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;">HECTO Q&amp;M 근태관리시스템</div>
          <div style="font-size: 22px; font-weight: 800; margin-top: 6px; letter-spacing: -0.01em;">🚖 야간 택시 이용 소명 요청</div>
          <div style="font-size: 13px; color: #dbeafe; margin-top: 6px;">아래 내역을 확인하시고 [소명 작성하기] 버튼을 통해 사유를 제출해 주세요.</div>
        </div>

        <div style="padding: 24px;">
          <p style="margin: 0 0 16px; font-size: 14px; color: #374151; line-height: 1.6;">
            안녕하세요, <strong>${escapeHtml(employeeName)}</strong>님.<br/>
            귀하의 최근 법인 택시 이용 건 중 22시 이후 탑승 건에 대해 소명 확인을 요청드립니다.
          </p>

          <table style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden; font-size: 13px;">
            <tbody>
              <tr>
                <td style="padding: 11px 14px; width: 140px; color: #6b7280; background: #f9fafb; border-bottom: 1px solid #f3f4f6; font-weight: 600;">직원명 / 부서</td>
                <td style="padding: 11px 14px; color: #111827; background: #ffffff; border-bottom: 1px solid #f3f4f6; font-weight: 600;">${escapeHtml(employeeName)} (${escapeHtml(dept)})</td>
              </tr>
              <tr>
                <td style="padding: 11px 14px; color: #6b7280; background: #f9fafb; border-bottom: 1px solid #f3f4f6; font-weight: 600;">택시 탑승 일시</td>
                <td style="padding: 11px 14px; color: #dc2626; background: #ffffff; border-bottom: 1px solid #f3f4f6; font-weight: 700;">${escapeHtml(rideTime)}</td>
              </tr>
              <tr>
                <td style="padding: 11px 14px; color: #6b7280; background: #f9fafb; border-bottom: 1px solid #f3f4f6; font-weight: 600;">실제 퇴근 기록 시각</td>
                <td style="padding: 11px 14px; color: #2563eb; background: #ffffff; border-bottom: 1px solid #f3f4f6; font-weight: 700;">${escapeHtml(checkoutTime)}</td>
              </tr>
              <tr>
                <td style="padding: 11px 14px; color: #6b7280; background: #f9fafb; border-bottom: 1px solid #f3f4f6; font-weight: 600;">출발지 ➔ 도착지</td>
                <td style="padding: 11px 14px; color: #374151; background: #ffffff; border-bottom: 1px solid #f3f4f6;">${escapeHtml(pickup)} ➔ ${escapeHtml(dropoff)}</td>
              </tr>
              <tr>
                <td style="padding: 11px 14px; color: #6b7280; background: #f9fafb; border-bottom: 1px solid #f3f4f6; font-weight: 600;">카카오T 신청 사유</td>
                <td style="padding: 11px 14px; color: #374151; background: #ffffff; border-bottom: 1px solid #f3f4f6;">${escapeHtml(reason)}</td>
              </tr>
              <tr>
                <td style="padding: 11px 14px; color: #6b7280; background: #f9fafb; font-weight: 600;">결제 금액</td>
                <td style="padding: 11px 14px; color: #111827; background: #ffffff; font-weight: 700;">${escapeHtml(amount)}원</td>
              </tr>
            </tbody>
          </table>

          <div style="margin-top: 28px; text-align: center;">
            <a href="${explainUrl}" target="_blank" style="display: inline-block; padding: 14px 32px; background: #2563eb; color: #ffffff; font-size: 15px; font-weight: 700; text-decoration: none; border-radius: 12px; box-shadow: 0 4px 12px rgba(37,99,235,0.25);">
              👉 소명 작성 페이지로 이동하기
            </a>
          </div>

          <div style="margin-top: 20px; text-align: center; font-size: 12px; color: #9ca3af;">
            버튼이 클릭되지 않는 경우 아래 링크를 주소창에 복사해 붙여넣으세요:<br/>
            <a href="${explainUrl}" target="_blank" style="color: #2563eb; word-break: break-all;">${explainUrl}</a>
          </div>
        </div>
      </div>
    </div>
  `;

  const info = await transport.sendMail({
    from: fromName ? `${fromName} <${fromAddress}>` : fromAddress,
    to: recipientEmail,
    cc,
    replyTo,
    subject,
    text,
    html,
  });

  return {
    recipientEmail,
    cc,
    messageId: info.messageId || '',
    token,
    explainUrl,
  };
}

