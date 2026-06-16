/**
 * 전체 스키마(데이터베이스) 목록 조회 및 caps, enter 테이블 리스트 추출
 * 실행: node analyze_gate_4000.js
 */
const mysql = require('mysql2/promise');

const MYSQL_CONFIG = {
  host: '[REDACTED MYSQL HOST]',
  user: 'whradmin',
  password: '[REDACTED MYSQL PASSWORD]',
  database: 'whr',
  port: 3306,
  connectTimeout: 10000
};

async function run() {
  const conn = await mysql.createConnection(MYSQL_CONFIG);
  try {
    console.log('MySQL 연결 성공\n');

    console.log('=== [1] 전체 데이터베이스(Schema) 목록 ===');
    // 2. hr_diligence_code에서 코드별 한글 명칭 스캔
    console.log(`\n=== hr_diligence_code 공통코드 및 한글 명칭 목록 ===`);
    try {
      const [codes] = await conn.execute(`
        SELECT I_CODE, N_NAME, I_DAY_HALF, I_YUN_YN, I_HOLIDAY_YN
        FROM hr_diligence_code
        WHERE I_USE_YN = 'Y'
        ORDER BY I_CODE
      `);
      codes.forEach(c => {
        console.log(`  코드: ${c.I_CODE} | 명칭: ${c.N_NAME} | 반차구분: ${c.I_DAY_HALF} | 연차여부: ${c.I_YUN_YN} | 휴일여부: ${c.I_HOLIDAY_YN}`);
      });
    } catch(err) {
      console.log(`  ⚠️  hr_diligence_code 조회 오류: ${err.message}`);
    }

    console.log(`\n--- tong_code의 실제 명칭 필드 확인 (C_NAME, J_NAME, NAME) ---`);
    try {
      const [names] = await conn.execute(`
        SELECT CODE, NAME, J_NAME, C_NAME, T_SPARE2 
        FROM tong_code 
        WHERE GUBUN_CODE = 'H0281' AND CODE IN ('12', '16', '17', '19')
      `);
      names.forEach(n => {
        console.log(`  코드: ${n.CODE} | NAME: ${n.NAME} | J_NAME: ${n.J_NAME} | C_NAME: ${n.C_NAME} | 일수(T_SPARE2): ${n.T_SPARE2}`);
      });
    } catch(err) {
      console.log(`  ⚠️  tong_code 명칭 확인 오류: ${err.message}`);
    }

    console.log(`\n--- 휴가 공통코드 상세 매핑 (TONG_CODE 등) ---`);
    try {
      // tong_code 컬럼명 파악
      const [colDesc] = await conn.execute(`DESCRIBE tong_code`);
      const fields = colDesc.map(c => c.Field);
      console.log(`  - tong_code 컬럼 목록:`, fields.join(', '));

      // 이름 컬럼 후보 찾기 (N_CODE, CODE_NAME, NAME 등)
      const nameCol = fields.find(f => f.toLowerCase().includes('name') || f.toLowerCase().includes('n_code') || f.toLowerCase() === 'code_name' || f.toLowerCase().includes('title') || f.toLowerCase().includes('desc') || f.toLowerCase().includes('val'));

      if (nameCol) {
        const [codes] = await conn.execute(`
          SELECT GUBUN_CODE, CODE, \`${nameCol}\` as CODE_NAME, T_SPARE1, T_SPARE2 
          FROM tong_code 
          WHERE GUBUN_CODE = 'H0281' OR \`${nameCol}\` LIKE '%연차%' OR \`${nameCol}\` LIKE '%반차%'
        `);
        codes.forEach(c => console.log(`  [${c.GUBUN_CODE}] 코드: ${c.CODE} | 명칭: ${c.CODE_NAME} | 여유1: ${c.T_SPARE1} | 여유2: ${c.T_SPARE2}`));
      } else {
        // 컬럼 이름을 모를 시 전체 출력
        const [codes] = await conn.execute(`SELECT * FROM tong_code WHERE GUBUN_CODE = 'H0281' LIMIT 10`);
        codes.forEach(c => console.log(JSON.stringify(c)));
      }
    } catch(codeErr) {
      console.log(`  ⚠️  통합 공통코드 테이블 스캔 오류: ${codeErr.message}`);
    }

  } finally {
    await conn.end();
  }
}

run().catch(err => {
  console.error('오류:', err.message);
  process.exit(1);
});
