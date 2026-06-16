import nodemailer from 'nodemailer';

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

export async function sendTaxiAuditExplanationMail(row) {
  const smtp = getSmtpConfig();
  const fromAddress = process.env.TAXI_AUDIT_MAIL_FROM || smtp.user;
  const fromName = process.env.TAXI_AUDIT_MAIL_FROM_NAME || 'HECTO Q&M 근태관리시스템';
  const replyTo = process.env.TAXI_AUDIT_REPLY_TO || fromAddress;
  const cc = [process.env.TAXI_AUDIT_MAIL_CC, 'hq_admin@hecto.co.kr']
    .filter(Boolean)
    .join(', ');
  const recipientEmail = process.env.TAXI_AUDIT_MAIL_TO || 'bhkim@hecto.co.kr';

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
    '',
    `직원명: ${employeeName}`,
    `부서: ${dept}`,
    `탑승일시: ${rideTime}`,
    `실제 퇴근시간: ${checkoutTime}`,
    `이용사유: ${reason}`,
    `결제금액: ${amount}`,
    '',
    '해당 건에 대해 확인 후 회신 부탁드립니다.',
  ].join('\n');

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.7; color: #1f2937;">
      <p>안녕하세요.</p>
      <p><strong>HECTO Q&amp;M 근태관리시스템</strong>에서 택시 이용 소명 요청드립니다.</p>
      <table style="border-collapse: collapse; width: 100%; max-width: 640px;">
        <tbody>
          <tr><td style="padding: 8px 0; width: 140px; color: #6b7280;">직원명</td><td style="padding: 8px 0;">${escapeHtml(employeeName)}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7280;">부서</td><td style="padding: 8px 0;">${escapeHtml(dept)}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7280;">탑승일시</td><td style="padding: 8px 0;">${escapeHtml(rideTime)}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7280;">실제 퇴근시간</td><td style="padding: 8px 0;">${escapeHtml(checkoutTime)}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7280;">이용사유</td><td style="padding: 8px 0;">${escapeHtml(reason)}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7280;">결제금액</td><td style="padding: 8px 0;">${escapeHtml(amount)}</td></tr>
        </tbody>
      </table>
      <p>해당 건에 대해 확인 후 회신 부탁드립니다.</p>
    </div>
  `;

  const info = await transport.sendMail({
    from: fromName ? `${fromName} <${fromAddress}>` : fromAddress,
    to: recipientEmail,
    cc: cc || undefined,
    replyTo,
    subject,
    text,
    html,
  });

  return {
    recipientEmail,
    messageId: info.messageId || '',
  };
}
