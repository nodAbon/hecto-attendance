/**
 * 서버PC에서 hr_employee 목록을 조회하는 전용 스크립트
 *
 * 사용 예:
 *   node list-hr-employees.js
 *   node list-hr-employees.js --limit=50
 *   node list-hr-employees.js --json
 *
 * 지원 스키마:
 *  1) 회사코드 + 사원번호 분리형
 *  2) 회사코드가 포함된 단일 사번형
 */

const { loadSyncEnv } = require('./loadEnv');
const mysql = require('mysql2/promise');

loadSyncEnv();

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
  const out = { limit: 200, json: false };
  for (const arg of argv.slice(2)) {
    if (arg === '--json') out.json = true;
    else if (arg.startsWith('--limit=')) {
      const v = parseInt(arg.split('=')[1], 10);
      if (Number.isFinite(v) && v > 0) out.limit = v;
    }
  }
  return out;
}

function pickColumn(columns, candidates) {
  const lowerMap = new Map(columns.map((c) => [c.toLowerCase(), c]));
  for (const candidate of candidates) {
    const found = lowerMap.get(candidate.toLowerCase());
    if (found) return found;
  }
  return null;
}

function quoteIdent(name) {
  return `\`${String(name).replace(/`/g, '``')}\``;
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
    const company = digits.slice(0, 4);
    const empNo = digits.slice(4).replace(/^0+/, '') || digits.slice(4);
    return {
      companyCode: company,
      empNo,
      fullEmpNo: `${company}${empNo.padStart(8, '0')}`,
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

async function getTableColumns(conn, tableName) {
  const [rows] = await conn.execute(
    `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION
    `,
    [tableName]
  );
  return rows.map((row) => row.COLUMN_NAME);
}

async function main() {
  const { limit, json } = parseArgs(process.argv);
  let conn = null;

  try {
    conn = await mysql.createConnection(MYSQL_CONFIG);

    const empCols = await getTableColumns(conn, 'hr_employee');
    if (empCols.length === 0) {
      throw new Error('hr_employee 테이블을 찾지 못했습니다.');
    }

    const deptCols = await getTableColumns(conn, 'hr_department');
    const hasDeptTable = deptCols.length > 0;

    const empCompanyCol = pickColumn(empCols, ['I_COMPANY', 'COMPANY', 'COMPANY_CODE', 'COMPANYCODE']);
    const empNoCol = pickColumn(empCols, [
      'I_EMPLOY_NO',
      'I_EMPLOYEE_NO',
      'EMP_NO',
      'EMPNO',
      'EMPLOYEE_NO',
      'SABUN',
      'MEMBERID',
      'I_SABUN',
    ]);
    const empNameCol = pickColumn(empCols, [
      'N_EMPLOY_NAME',
      'N_EMPLOYEE_NAME',
      'EMP_NAME',
      'EMPNAME',
      'NAME',
      'N_NAME',
    ]);
    const empDeptIdCol = pickColumn(empCols, ['I_DEPT', 'DEPT', 'DEPT_ID', 'DEPARTMENT_ID']);
    const empDeptNameCol = pickColumn(empCols, ['N_DEPT', 'DEPT_NAME', 'DEPARTMENT', 'DEPARTMENT_NAME']);

    const deptCompanyCol = hasDeptTable ? pickColumn(deptCols, ['I_COMPANY', 'COMPANY', 'COMPANY_CODE', 'COMPANYCODE']) : null;
    const deptIdCol = hasDeptTable ? pickColumn(deptCols, ['I_DEPT', 'DEPT', 'DEPT_ID']) : null;
    const deptNameCol = hasDeptTable ? pickColumn(deptCols, ['N_DEPT', 'DEPT_NAME', 'DEPARTMENT_NAME']) : null;

    if (!empNoCol) {
      throw new Error(`사원번호 컬럼을 찾지 못했습니다. hr_employee 컬럼: ${empCols.join(', ')}`);
    }

    const selectParts = [
      empCompanyCol ? `e.${quoteIdent(empCompanyCol)} AS company_code_raw` : `NULL AS company_code_raw`,
      `e.${quoteIdent(empNoCol)} AS emp_no_raw`,
      empNameCol ? `e.${quoteIdent(empNameCol)} AS emp_name` : `NULL AS emp_name`,
      empDeptIdCol ? `e.${quoteIdent(empDeptIdCol)} AS dept_id_raw` : `NULL AS dept_id_raw`,
      empDeptNameCol ? `e.${quoteIdent(empDeptNameCol)} AS dept_name_raw` : `NULL AS dept_name_raw`,
    ];

    let sql = `SELECT ${selectParts.join(', ')} FROM hr_employee e`;
    if (hasDeptTable && deptIdCol && deptNameCol) {
      const joinParts = ['1=1'];
      if (deptCompanyCol && empCompanyCol) {
        joinParts.push(`d.${quoteIdent(deptCompanyCol)} = e.${quoteIdent(empCompanyCol)}`);
      } else if (deptCompanyCol) {
        joinParts.push(`d.${quoteIdent(deptCompanyCol)} = '${DEFAULT_COMPANY_CODE}'`);
      }
      if (empDeptIdCol) {
        joinParts.push(`d.${quoteIdent(deptIdCol)} = e.${quoteIdent(empDeptIdCol)}`);
      }
      sql += ` LEFT JOIN hr_department d ON ${joinParts.join(' AND ')}`;
    }

    sql += ` ORDER BY ${empNameCol ? `e.${quoteIdent(empNameCol)}` : '1'}`;
    sql += ` LIMIT ${Number(limit)}`;

    const [rows] = await conn.execute(sql);

    const normalized = rows.map((row) => {
      const rawEmp = normalizeText(row.emp_no_raw);
      const companyFromRow = normalizeText(row.company_code_raw);
      const guessed = resolveEmployeeCode(rawEmp, companyFromRow || DEFAULT_COMPANY_CODE);
      const deptName = normalizeText(row.dept_name_raw);

      return {
        companyCode: companyFromRow || guessed.companyCode,
        empNo: guessed.empNo,
        fullEmpNo: guessed.fullEmpNo,
        name: normalizeText(row.emp_name),
        dept: deptName || normalizeText(row.dept_id_raw),
        rawEmpNo: rawEmp,
      };
    });

    if (json) {
      console.log(JSON.stringify(normalized, null, 2));
    } else {
      console.log(`hr_employee 조회 결과 (${normalized.length}건)`);
      console.table(normalized);
      console.log('');
      console.log('사번 형식:');
      console.log(`- 분리형: companyCode + empNo`);
      console.log(`- 단일형: fullEmpNo`);
    }
  } finally {
    if (conn) await conn.end();
  }
}

main().catch((err) => {
  console.error('[hr_employee 조회 실패]', err.message || err);
  process.exit(1);
});
