import nodemailer from 'nodemailer';
import { getAdminClient } from './supabaseClient';
import { isLeaderPosition } from './roleUtils';
import { normalizeEmpNoKey } from './dashboardUtils';

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

export async function sendTaxiAuditExplanationMail(row) {
  const smtp = getSmtpConfig();
  const fromAddress = process.env.TAXI_AUDIT_MAIL_FROM || smtp.user;
  const fromName = process.env.TAXI_AUDIT_MAIL_FROM_NAME || 'HECTO Q&M 근태관리시스템';
  const replyTo = process.env.TAXI_AUDIT_REPLY_TO || fromAddress;
  const { recipientEmail, cc } = await resolveTaxiAuditMailTargets(row);

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

  const rideTime = String(row.rideTime || row.rideTimeRaw || '-').trim();
  const checkoutTime = String(row.actualOutTime || '-').trim();
  const amount = formatAmount(row.amount);
  const employeeName = String(row.employeeName || '-').trim();
  const dept = String(row.dept || '-').trim();
  const reason = String(row.reason || '-').trim();
  const subject = `[소명요청] 택시 이용 내역 확인 - ${employeeName} / ${rideTime}`;

  const text = [
    '안녕하세요.',
    '',
    'HECTO Q&M 근태관리시스템에서 택시 이용 소명 요청드립니다.',
    '아래의 사유 입력 칸에 내용을 적어 회신해 주시면 됩니다.',
    '예: 야근 확인 후 귀가했습니다.',
    '',
    `직원명: ${employeeName}`,
    `부서: ${dept}`,
    `탑승일시: ${rideTime}`,
    `실제 퇴근시간: ${checkoutTime}`,
    `이용사유: ${reason}`,
    `결제금액: ${amount}`,
    '',
    '회신 시 아래 사유 칸에 내용을 적어 보내주세요.',
  ].join('\n');

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.7; color: #1f2937; background: #f8fafc; padding: 12px;">
      <div style="max-width: 720px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 16px; overflow: hidden;">
        <div style="padding: 18px 20px; background: linear-gradient(180deg, #eff6ff 0%, #ffffff 100%); border-bottom: 1px solid #e5e7eb;">
          <div style="font-size: 13px; color: #2563eb; font-weight: 700; letter-spacing: 0.02em;">소명 요청</div>
          <div style="font-size: 20px; font-weight: 700; color: #111827; margin-top: 4px;">택시 이용 내역 확인 요청</div>
          <div style="font-size: 13px; color: #6b7280; margin-top: 6px;">HECTO Q&amp;M 근태관리시스템에서 자동 발송된 안내입니다.</div>
        </div>

        <div style="padding: 20px;">
          <p style="margin: 0 0 14px; font-size: 14px; color: #374151;">
            아래 택시 이용 건에 대해 실제 퇴근 기준과 일치하는지 확인 부탁드립니다.
            회신하실 수 있도록 아래에 사유 입력 칸을 만들어두었습니다.
          </p>

          <table style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
            <thead>
              <tr>
                <th style="padding: 10px 12px; text-align: left; background: #f3f4f6; color: #374151; font-size: 13px; border-bottom: 1px solid #e5e7eb;">항목</th>
                <th style="padding: 10px 12px; text-align: left; background: #f3f4f6; color: #374151; font-size: 13px; border-bottom: 1px solid #e5e7eb;">내용</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="padding: 10px 12px; width: 160px; color: #6b7280; background: #ffffff; border-bottom: 1px solid #f1f5f9;">직원명</td>
                <td style="padding: 10px 12px; color: #111827; background: #ffffff; border-bottom: 1px solid #f1f5f9;">${escapeHtml(employeeName)}</td>
              </tr>
              <tr>
                <td style="padding: 10px 12px; color: #6b7280; background: #ffffff; border-bottom: 1px solid #f1f5f9;">부서</td>
                <td style="padding: 10px 12px; color: #111827; background: #ffffff; border-bottom: 1px solid #f1f5f9;">${escapeHtml(dept)}</td>
              </tr>
              <tr>
                <td style="padding: 10px 12px; color: #6b7280; background: #ffffff; border-bottom: 1px solid #f1f5f9;">탑승일시</td>
                <td style="padding: 10px 12px; color: #111827; background: #ffffff; border-bottom: 1px solid #f1f5f9;">${escapeHtml(rideTime)}</td>
              </tr>
              <tr>
                <td style="padding: 10px 12px; color: #6b7280; background: #ffffff; border-bottom: 1px solid #f1f5f9;">실제 퇴근시간</td>
                <td style="padding: 10px 12px; color: #111827; background: #ffffff; border-bottom: 1px solid #f1f5f9;">${escapeHtml(checkoutTime)}</td>
              </tr>
              <tr>
                <td style="padding: 10px 12px; color: #6b7280; background: #ffffff; border-bottom: 1px solid #f1f5f9;">이용사유</td>
                <td style="padding: 10px 12px; color: #111827; background: #ffffff; border-bottom: 1px solid #f1f5f9;">${escapeHtml(reason)}</td>
              </tr>
              <tr>
                <td style="padding: 10px 12px; color: #6b7280; background: #ffffff;">결제금액</td>
                <td style="padding: 10px 12px; color: #111827; background: #ffffff;">${escapeHtml(amount)}</td>
              </tr>
            </tbody>
          </table>

          <div style="margin-top: 16px; padding: 12px 14px; border-radius: 12px; background: #eff6ff; color: #1d4ed8; font-size: 13px; border: 1px solid #dbeafe;">
            <div style="font-size: 12px; color: #2563eb; font-weight: 700; margin-bottom: 8px;">사유</div>
            <div style="padding: 12px; min-height: 64px; border-radius: 10px; border: 1px solid #bfdbfe; background: #ffffff; color: #6b7280;">
              여기에 회신해 주세요. 예: 야근 확인 후 귀가했습니다.
            </div>
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
  };
}
