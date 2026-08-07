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
  const empNo = normalizeEmpNoKey(row?.empNo || row?.memberIdentifier || row?.emp_no);

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

  const targets = await resolveTaxiAuditMailTargets(row);
  const recipientEmail = overrideRecipientEmail || targets.recipientEmail;
  const cc = targets.cc || [];

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
    <div style="font-family: Pretendard, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #11141b; background: #f1f4f8; padding: 20px 12px;">
      <div style="max-width: 640px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden; box-shadow: 0 4px 16px rgba(15,23,42,0.06);">
        <div style="padding: 24px 28px; background: #181d28; color: #ffffff;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 11px; font-weight: 700; color: #5b88d6; letter-spacing: 0.05em; text-transform: uppercase;">HECTO Q&amp;M 근태관리시스템</span>
          </div>
          <div style="font-size: 20px; font-weight: 700; margin-top: 6px; color: #ecf2f9; letter-spacing: -0.02em;">야간 택시 이용 소명 요청</div>
          <div style="font-size: 13px; color: #aab6c7; margin-top: 4px;">아래 내역을 확인하시고 [소명 작성하기] 버튼을 통해 사유를 입력해 주세요.</div>
        </div>

        <div style="padding: 28px;">
          <p style="margin: 0 0 18px; font-size: 14px; color: #334155; line-height: 1.6;">
            안녕하세요, <strong>${escapeHtml(employeeName)}</strong>님.<br/>
            최근 법인 택시 이용 건 중 22시 이후 탑승 건에 대해 실제 퇴근 시각 기준과 대조하여 소명 사유를 수집하고 있습니다.
          </p>

          <table style="width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; font-size: 13px;">
            <tbody>
              <tr>
                <td style="padding: 11px 14px; width: 140px; color: #64748b; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-weight: 600;">직원명 / 부서</td>
                <td style="padding: 11px 14px; color: #0f172a; background: #ffffff; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${escapeHtml(employeeName)} (${escapeHtml(dept)})</td>
              </tr>
              <tr>
                <td style="padding: 11px 14px; color: #64748b; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-weight: 600;">택시 탑승 일시</td>
                <td style="padding: 11px 14px; color: #d06b6b; background: #ffffff; border-bottom: 1px solid #e2e8f0; font-weight: 700;">${escapeHtml(rideTime)}</td>
              </tr>
              <tr>
                <td style="padding: 11px 14px; color: #64748b; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-weight: 600;">실제 퇴근 기록 시각</td>
                <td style="padding: 11px 14px; color: #5b88d6; background: #ffffff; border-bottom: 1px solid #e2e8f0; font-weight: 700;">${escapeHtml(checkoutTime)}</td>
              </tr>
              <tr>
                <td style="padding: 11px 14px; color: #64748b; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-weight: 600;">출발지 ➔ 도착지</td>
                <td style="padding: 11px 14px; color: #334155; background: #ffffff; border-bottom: 1px solid #e2e8f0;">${escapeHtml(pickup)} ➔ ${escapeHtml(dropoff)}</td>
              </tr>
              <tr>
                <td style="padding: 11px 14px; color: #64748b; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-weight: 600;">카카오T 신청 사유</td>
                <td style="padding: 11px 14px; color: #334155; background: #ffffff; border-bottom: 1px solid #e2e8f0;">${escapeHtml(reason)}</td>
              </tr>
              <tr>
                <td style="padding: 11px 14px; color: #64748b; background: #f8fafc; font-weight: 600;">결제 금액</td>
                <td style="padding: 11px 14px; color: #0f172a; background: #ffffff; font-weight: 700;">${escapeHtml(amount)}원</td>
              </tr>
            </tbody>
          </table>

          <div style="margin-top: 28px; text-align: center;">
            <a href="${explainUrl}" target="_blank" style="display: inline-block; padding: 13px 28px; background: #5b88d6; color: #ffffff; font-size: 14px; font-weight: 700; text-decoration: none; border-radius: 10px; box-shadow: 0 4px 12px rgba(91,136,214,0.3);">
              👉 소명 작성 페이지로 이동하기
            </a>
          </div>

          <div style="margin-top: 20px; text-align: center; font-size: 12px; color: #94a3b8;">
            버튼이 클릭되지 않는 경우 아래 링크를 클릭하거나 주소창에 복사해 주세요:<br/>
            <a href="${explainUrl}" target="_blank" style="color: #5b88d6; word-break: break-all;">${explainUrl}</a>
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

/**
 * 팀원이 소명 제출 완료 시 해당 팀장에게 알림 이메일 전송
 */
export async function sendTaxiAuditLeaderNotificationMail(record, siteBaseUrl = '') {
  if (!record) return null;

  try {
    const smtp = getSmtpConfig();
    const fromAddress = process.env.TAXI_AUDIT_MAIL_FROM || smtp.user;
    const fromName = process.env.TAXI_AUDIT_MAIL_FROM_NAME || 'HECTO Q&M 근태관리시스템';
    const replyTo = process.env.TAXI_AUDIT_REPLY_TO || fromAddress;

    const targets = await resolveTaxiAuditMailTargets(record).catch(() => null);
    const leaderEmail = targets?.cc?.find((email) => email !== 'hq_admin@hecto.co.kr') || targets?.cc?.[0];
    if (!leaderEmail) return null;

    const employeeName = String(record.employee_name || '-').trim();
    const dept = String(record.dept || '-').trim();
    const rideTime = String(record.ride_time || '-').trim();
    const actualOutTime = String(record.actual_out_time || '-').trim();
    const amount = formatAmount(record.amount);
    const explanationText = String(record.explanation_text || '-').trim();
    const pickup = String(record.pickup || '-').trim();
    const dropoff = String(record.dropoff || '-').trim();

    const subject = `[팀원 소명제출] ${dept} ${employeeName} 직원의 야간 택시 이용 소명 내역`;

    const text = [
      '안녕하세요, 팀장님.',
      '',
      `[${dept}] ${employeeName} 직원이 야간 택시 이용에 대한 소명 사유를 제출하였습니다.`,
      '',
      `· 직원명: ${employeeName} (${dept})`,
      `· 탑승일시: ${rideTime}`,
      `· 실제 퇴근 기록: ${actualOutTime}`,
      `· 결제 금액: ${amount}원`,
      `· 출발/도착: ${pickup} ➔ ${dropoff}`,
      `· 제출된 소명 사유: ${explanationText}`,
      '',
      '자세한 내용은 근태관리 시스템 [팀원 택시 소명 내역] 메뉴에서 확인하실 수 있습니다.',
    ].join('\n');

    const html = `
      <div style="font-family: Pretendard, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #11141b; background: #f1f4f8; padding: 20px 12px;">
        <div style="max-width: 640px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden; box-shadow: 0 4px 16px rgba(15,23,42,0.06);">
          <div style="padding: 24px 28px; background: #181d28; color: #ffffff;">
            <div style="font-size: 11px; font-weight: 700; color: #5b88d6; letter-spacing: 0.05em; text-transform: uppercase;">HECTO Q&amp;M 근태관리시스템</div>
            <div style="font-size: 20px; font-weight: 700; margin-top: 6px; color: #ecf2f9; letter-spacing: -0.02em;">팀원 야간 택시 소명 제출 안내</div>
            <div style="font-size: 13px; color: #aab6c7; margin-top: 4px;">부서 팀원이 소명 사유를 작성하여 제출하였습니다.</div>
          </div>

          <div style="padding: 28px;">
            <p style="margin: 0 0 18px; font-size: 14px; color: #334155; line-height: 1.6;">
              안녕하세요, <strong>${escapeHtml(dept)}</strong> 팀장님.<br/>
              귀하의 부서 팀원 <strong>${escapeHtml(employeeName)}</strong> 직원이 야간 택시 이용 소명을 작성 완료하였습니다.
            </p>

            <table style="width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; font-size: 13px; margin-bottom: 20px;">
              <tbody>
                <tr>
                  <td style="padding: 11px 14px; width: 140px; color: #64748b; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-weight: 600;">팀원명 / 부서</td>
                  <td style="padding: 11px 14px; color: #0f172a; background: #ffffff; border-bottom: 1px solid #e2e8f0; font-weight: 700;">${escapeHtml(employeeName)} (${escapeHtml(dept)})</td>
                </tr>
                <tr>
                  <td style="padding: 11px 14px; color: #64748b; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-weight: 600;">택시 탑승 일시</td>
                  <td style="padding: 11px 14px; color: #d06b6b; background: #ffffff; border-bottom: 1px solid #e2e8f0; font-weight: 700;">${escapeHtml(rideTime)}</td>
                </tr>
                <tr>
                  <td style="padding: 11px 14px; color: #64748b; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-weight: 600;">실제 퇴근 기록 시각</td>
                  <td style="padding: 11px 14px; color: #5b88d6; background: #ffffff; border-bottom: 1px solid #e2e8f0; font-weight: 700;">${escapeHtml(actualOutTime)}</td>
                </tr>
                <tr>
                  <td style="padding: 11px 14px; color: #64748b; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-weight: 600;">출발지 ➔ 도착지</td>
                  <td style="padding: 11px 14px; color: #334155; background: #ffffff; border-bottom: 1px solid #e2e8f0;">${escapeHtml(pickup)} ➔ ${escapeHtml(dropoff)}</td>
                </tr>
                <tr>
                  <td style="padding: 11px 14px; color: #64748b; background: #f8fafc; font-weight: 600;">결제 금액</td>
                  <td style="padding: 11px 14px; color: #0f172a; background: #ffffff; font-weight: 700;">${escapeHtml(amount)}원</td>
                </tr>
              </tbody>
            </table>

            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px;">
              <div style="font-size: 12px; font-weight: 700; color: #2563eb; margin-bottom: 6px;">📝 팀원이 작성한 소명 사유</div>
              <div style="font-size: 14px; color: #0f172a; line-height: 1.6; white-space: pre-wrap; font-weight: 500;">
                ${escapeHtml(explanationText)}
              </div>
            </div>

            <div style="margin-top: 24px; text-align: center; font-size: 12px; color: #94a3b8;">
              근태관리시스템 ➔ [팀원 택시 소명 내역] 메뉴에서 전체 내역 조회가 가능합니다.
            </div>
          </div>
        </div>
      </div>
    `;

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

    const info = await transport.sendMail({
      from: fromName ? `${fromName} <${fromAddress}>` : fromAddress,
      to: leaderEmail,
      replyTo,
      subject,
      text,
      html,
    });

    return { leaderEmail, messageId: info.messageId };
  } catch (err) {
    console.error('[Taxi Audit Leader Mail Error]', err);
    return null;
  }
}


