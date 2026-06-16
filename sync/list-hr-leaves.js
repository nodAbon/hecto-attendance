/**
 * Server-PC utility to inspect hr_yuncha_use rows and employee code shape.
 *
 * Usage:
 *   node list-hr-leaves.js
 *   node list-hr-leaves.js --limit=100
 *   node list-hr-leaves.js --json
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

const MYSQL_CONFIG = {
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  port: parseInt(process.env.MYSQL_PORT, 10) || 3306,
  connectTimeout: 15_000,
};

const DEFAULT_COMPANY_CODE = process.env.MY_COMPANY_CODE || '1600';

function parseArgs(argv) {
  const out = { limit: 200, json: false, company: DEFAULT_COMPANY_CODE };
  for (const arg of argv.slice(2)) {
    if (arg === '--json') out.json = true;
    else if (arg.startsWith('--limit=')) {
      const v = parseInt(arg.split('=')[1], 10);
      if (Number.isFinite(v) && v > 0) out.limit = v;
    } else if (arg.startsWith('--company=')) {
      const v = String(arg.split('=')[1] || '').trim();
      if (v) out.company = v;
    }
  }
  return out;
}

function normalizeText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function resolveEmployeeCode(rawEmpNo, companyCode = DEFAULT_COMPANY_CODE) {
  const raw = normalizeText(rawEmpNo);
  if (!raw) {
    return { companyCode: '', empNo: '', fullEmpNo: '' };
  }

  const digits = raw.replace(/\D/g, '');

  if (digits.length >= 12 && digits.startsWith(companyCode)) {
    const resolvedCompany = digits.slice(0, 4);
    const empNo = digits.slice(4).replace(/^0+/, '') || digits.slice(4);
    return {
      companyCode: resolvedCompany,
      empNo,
      fullEmpNo: `${resolvedCompany}${empNo.padStart(8, '0')}`,
    };
  }

  if (digits.length <= 8) {
    const empNo = digits.replace(/^0+/, '') || digits;
    return {
      companyCode,
      empNo,
      fullEmpNo: `${companyCode}${empNo.padStart(8, '0')}`,
    };
  }

  return {
    companyCode: raw.slice(0, 4) || companyCode,
    empNo: raw.slice(4),
    fullEmpNo: raw,
  };
}

async function main() {
  const { limit, json, company } = parseArgs(process.argv);
  let conn = null;

  try {
    conn = await mysql.createConnection(MYSQL_CONFIG);

    const [rows] = await conn.execute(
      `
        SELECT
          y.I_COMPANY AS company_code_raw,
          y.I_EMPLOY_NO AS emp_no_raw,
          CONCAT(y.I_COMPANY, y.I_EMPLOY_NO) AS full_emp_no_raw,
          e.N_EMPLOY_NAME AS emp_name,
          e.I_DEPT AS dept_id_raw,
          d.N_DEPT AS dept_name_raw,
          y.D_START_DATE AS start_date,
          y.D_END_DATE AS end_date,
          y.I_CODE AS leave_code,
          COALESCE(c.N_NAME, tc.NAME) AS leave_name,
          CAST(y.O_ANNLEV_CNT AS CHAR) AS leave_days,
          y.I_STATUS AS status
        FROM hr_yuncha_use y
        INNER JOIN hr_employee e
          ON e.I_COMPANY = y.I_COMPANY
         AND e.I_EMPLOY_NO = y.I_EMPLOY_NO
        LEFT JOIN hr_department d
          ON d.I_COMPANY = e.I_COMPANY
         AND d.I_DEPT = e.I_DEPT
        LEFT JOIN hr_diligence_code c
          ON c.I_CODE = y.I_CODE
        LEFT JOIN tong_code tc
          ON tc.GUBUN_CODE = 'H0281'
         AND tc.CODE = y.I_CODE
        WHERE y.I_COMPANY = ?
        ORDER BY y.D_START_DATE DESC, e.N_EMPLOY_NAME ASC, y.I_EMPLOY_NO ASC
        LIMIT ${Number(limit)}
      `,
      [company]
    );

    const normalized = rows.map((row) => {
      const rawEmpNo = normalizeText(row.emp_no_raw);
      const companyCode = normalizeText(row.company_code_raw) || company;
      const guessed = resolveEmployeeCode(rawEmpNo, companyCode);
      const fullEmpNo = normalizeText(row.full_emp_no_raw) || guessed.fullEmpNo || `${companyCode}${guessed.empNo.padStart(8, '0')}`;

      return {
        companyCode: companyCode || guessed.companyCode,
        empNo: guessed.empNo,
        fullEmpNo,
        name: normalizeText(row.emp_name),
        dept: normalizeText(row.dept_name_raw) || normalizeText(row.dept_id_raw),
        rawEmpNo,
        leaveCode: normalizeText(row.leave_code),
        leaveName: normalizeText(row.leave_name),
        leaveDays: normalizeText(row.leave_days),
        status: normalizeText(row.status),
        startDate: normalizeText(row.start_date),
        endDate: normalizeText(row.end_date),
      };
    });

    if (json) {
      console.log(JSON.stringify(normalized, null, 2));
      return;
    }

    console.log(`hr_yuncha_use 조회 결과 (${normalized.length}건)`);
    console.table(normalized.map((row) => ({
      companyCode: row.companyCode,
      empNo: row.empNo,
      fullEmpNo: row.fullEmpNo,
      name: row.name,
      dept: row.dept,
      rawEmpNo: row.rawEmpNo,
      leaveCode: row.leaveCode,
      leaveName: row.leaveName,
      startDate: row.startDate,
      endDate: row.endDate,
    })));

    console.log('');
    console.log('사번 해석 기준:');
    console.log('- companyCode + empNo');
    console.log('- fullEmpNo = companyCode + empNo');
  } finally {
    if (conn) await conn.end();
  }
}

main().catch((err) => {
  console.error('[hr_yuncha_use 조회 실패]', err.message || err);
  process.exit(1);
});
