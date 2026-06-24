/**
 * t_secom_alarm 테이블 전체 컬럼 및 출입 상태값 분석
 * - 출근/퇴근을 구분하는 컬럼(InOut, State 등)이 있는지 확인
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
  console.log('[+] MySQL 연결 성공\n');

  // 1. t_secom_alarm 전체 컬럼 구조
  console.log('=== [1] t_secom_alarm 컬럼 전체 목록 ===');
  const [cols] = await conn.execute('DESCRIBE t_secom_alarm');
  console.table(cols.map(c => ({ Field: c.Field, Type: c.Type, Null: c.Null, Default: c.Default })));

  // 2. 상태/구분 관련 컬럼 후보 찾기
  const stateCandidates = cols.filter(c =>
    /inout|state|status|type|mode|gubun|io|event|dir|flag/i.test(c.Field)
  );
  console.log('\n=== [2] 출입 상태값 관련 컬럼 후보 ===');
  if (stateCandidates.length === 0) {
    console.log('  → 상태값 컬럼 없음 (모든 레코드가 단순 출입으로만 기록)');
  } else {
    console.table(stateCandidates.map(c => ({ Field: c.Field, Type: c.Type })));

    // 3. 각 후보 컬럼의 실제 값 분포
    for (const col of stateCandidates) {
      console.log(`\n--- [${col.Field}] 값 분포 ---`);
      const [dist] = await conn.execute(
        `SELECT \`${col.Field}\` as value, COUNT(*) as count FROM t_secom_alarm GROUP BY \`${col.Field}\` ORDER BY count DESC LIMIT 20`
      );
      console.table(dist);
    }
  }

  // 4. 최신 레코드 10개 (전체 컬럼)
  console.log('\n=== [3] 최신 레코드 10건 (전체 컬럼) ===');
  const [samples] = await conn.execute(
    `SELECT * FROM t_secom_alarm ORDER BY ATime DESC LIMIT 10`
  );
  console.log(JSON.stringify(samples, null, 2));

  // 5. 오후 반차로 의심되는 케이스 찾기
  // 오전에 출입 기록 없이 오후에만 찍힌 Sabun 목록 (오늘 기준)
  const today = new Date();
  const todayStr = `${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`;
  console.log(`\n=== [4] 오늘(${todayStr}) 단일 출입 기록만 있는 직원 (오후 반차 의심) ===`);
  const [singles] = await conn.execute(`
    SELECT Sabun, COUNT(*) as log_count, MIN(ATime) as first_log, MAX(ATime) as last_log
    FROM t_secom_alarm
    WHERE ATime LIKE '${todayStr}%'
      AND Sabun IS NOT NULL AND Sabun <> ''
    GROUP BY Sabun
    HAVING log_count = 1
    ORDER BY first_log
  `);
  console.table(singles.map(r => ({
    Sabun: r.Sabun,
    log_count: r.log_count,
    first_log: r.first_log,
    last_log: r.last_log
  })));

  await conn.end();
}

run().catch(err => {
  console.error('[-] 오류:', err.message);
  process.exit(1);
});
