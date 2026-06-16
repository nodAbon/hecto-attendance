const mysql = require('mysql2/promise');

const MYSQL_CONFIG = {
  host: '[REDACTED MYSQL HOST]',
  user: 'whradmin',
  password: '[REDACTED MYSQL PASSWORD]',
  database: 'whr',
  port: 3306,
  connectTimeout: 10000
};

// 각 테이블의 특성에 맞는 최적의 정렬 컬럼 정의
const tableSortConfig = {
  't_secom_alarm': 'ATime DESC',
  'tenter': 'E_DATE DESC, E_TIME DESC',
  'hecto_enter': 'E_DATE DESC, E_TIME DESC',
  't_secom_person_p': 'UpdateTime DESC',
  'am_access_log': 'LOGIN_DATE DESC, LOGIN_TIME DESC',
  'caps1200': 'E_DATE DESC, E_TIME DESC'
};

const tablesToInspect = [
  'am_access_log',
  't_secom_alarm',
  't_secom_person_p',
  'caps1200',
  'tenter',
  'hecto_enter'
];

async function run() {
  const conn = await mysql.createConnection(MYSQL_CONFIG);
  try {
    console.log('[+] MySQL 연결 성공\n');

    // 오늘 날짜 계산 (YYYYMMDD 형식)
    const today = '20260522';
    console.log(`[기준일자] ${today}\n`);

    for (const table of tablesToInspect) {
      console.log(`--------------------------------------------------`);
      console.log(`[분석] 테이블: ${table}`);
      console.log(`--------------------------------------------------`);

      try {
        const [exists] = await conn.query(`SHOW TABLES LIKE ?`, [table]);
        if (exists.length === 0) {
          console.log(`  [-] 테이블이 존재하지 않습니다.`);
          continue;
        }

        // 컬럼 구조 조회
        const [cols] = await conn.query(`DESCRIBE ${table}`);
        const colNames = cols.map(c => c.Field);
        console.log(`  - 컬럼 구조: ${colNames.join(', ')}`);

        // 정렬 기준 결정
        const sortOrder = tableSortConfig[table] || `${colNames[0]} DESC`;
        console.log(`  - 정렬 기준: ${sortOrder}`);

        // 오늘 데이터 개수 카운트 (날짜 컬럼 존재 여부에 따라 조건 분기)
        let countQuery = `SELECT COUNT(*) as cnt FROM ${table}`;
        if (table === 'tenter' || table === 'hecto_enter' || table === 'caps1200') {
          countQuery += ` WHERE E_DATE = '${today}'`;
        } else if (table === 't_secom_alarm') {
          countQuery += ` WHERE ATime LIKE '${today}%'`;
        } else if (table === 'am_access_log') {
          countQuery += ` WHERE LOGIN_DATE = '${today}' OR INSERT_DATE = '${today}'`;
        }
        
        try {
          const [countResult] = await conn.query(countQuery);
          console.log(`  - 오늘(${today}) 데이터 수: ${countResult[0].cnt}개`);
        } catch (cntErr) {
          console.log(`  - 오늘 데이터 수 조회 실패: ${cntErr.message}`);
        }

        // 최근 데이터 10건 추출
        const [rows] = await conn.query(`
          SELECT * FROM ${table}
          ORDER BY ${sortOrder}
          LIMIT 10
        `);

        console.log(`  - 최근 데이터 10건 (최신순):`);
        rows.forEach((row, idx) => {
          // 테이블별 주요 요약 정보 포맷팅 출력
          let summary = '';
          if (table === 't_secom_alarm') {
            summary = `[시간: ${row.ATime} | 사번: ${row.Sabun} | 이름: ${row.Name} | 카드: ${row.CardNo} | 게이트: ${row.EqCode}]`;
          } else if (table === 'tenter' || table === 'hecto_enter') {
            summary = `[시간: ${row.E_DATE} ${row.E_TIME} | 사번: ${row.I_EMPLOY_NO || row.E_IDNO} | 이름: ${row.E_NAME} | 카드: ${row.E_ID || row.E_CARD} | 게이트: ${row.G_ID}]`;
          } else {
            summary = JSON.stringify(row);
          }
          console.log(`    [${idx + 1}] ${summary}`);
        });

      } catch (e) {
        console.log(`  [-] 분석 실패: ${e.message}`);
      }
    }

  } finally {
    await conn.end();
  }
}

run().catch(err => {
  console.error('오류:', err.message);
  process.exit(1);
});
