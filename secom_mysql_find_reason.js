/**
 * Secom MySQL Reason-based Table Finder
 * --------------------------------------------------
 * 이 도구는 Hecto_Live (whr) MySQL DB에서 "개인사유", "개인사정", "연차" 등
 * 휴가 신청 사유에서 흔히 쓰이는 키워드가 실제 저장되어 있는 테이블을 역추적합니다.
 * 
 * [실행 방법]
 * 1. 이 파일(secom_mysql_find_reason.js)을 세콤 서버 PC로 가져갑니다. (git pull)
 * 2. 서버 PC의 명령 프롬프트(cmd)에서 다음 명령을 실행합니다:
 *    node secom_mysql_find_reason.js
 * 3. 출력 결과를 복사하여 전달해주세요.
 */

const mysql = require('mysql2/promise');

const MYSQL_CONFIG = {
  host: 'Prd-Hecto-WHR-Ext-NLB-8e82b66ed560637d.elb.ap-northeast-2.amazonaws.com',
  user: 'whradmin',
  password: '1q2w3e4r!@#$',
  database: 'whr',
  port: 3306,
  connectTimeout: 5000
};

// 휴가 사유로 유력한 검색어들
const TARGET_KEYWORDS = ['개인사유', '개인사정', '연차'];

async function runSearch() {
  console.log('==================================================');
  console.log(' Hecto_Live MySQL "개인사유/사정/연차" 데이터 검색 시작');
  console.log('==================================================');

  let connection;
  try {
    connection = await mysql.createConnection(MYSQL_CONFIG);
    console.log('[+] MySQL 연결 성공!');

    // 1. 문자열 계열 컬럼 목록 전체 조회
    const [columns] = await connection.execute(`
      SELECT TABLE_NAME, COLUMN_NAME 
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = 'whr' 
        AND DATA_TYPE IN ('varchar', 'char', 'text', 'mediumtext', 'longtext')
    `);

    // 임시/백업 테이블 제외 필터링 (부하 최소화 및 가시성 확보)
    const targetCols = columns.filter(c => {
      const table = c.TABLE_NAME;
      const isBackupOrTemp = 
        /_\d{4,}/.test(table) ||      // 날짜 포함 백업
        /_\d{2,}/.test(table) ||      // 연도 포함 백업
        table.includes('bak') ||      // 백업
        table.includes('test') ||     // 테스트
        table.includes('diff') ||     // 비교 임시
        table.includes('copy');       // 복사본
      return !isBackupOrTemp;
    });

    console.log(`[+] 검색 대상 테이블/컬럼 수: ${targetCols.length}개`);
    console.log('[+] 키워드로 데이터를 직접 스캔 중입니다. 잠시만 기다려 주세요...');

    let matchCount = 0;

    for (const col of targetCols) {
      const table = col.TABLE_NAME;
      const column = col.COLUMN_NAME;

      for (const keyword of TARGET_KEYWORDS) {
        try {
          // 해당 컬럼에 키워드가 매칭되는 행의 수 계산
          const queryStr = `
            SELECT COUNT(*) as cnt 
            FROM ?? 
            WHERE ?? LIKE ?
          `;
          const [countRes] = await connection.query(queryStr, [table, column, `%${keyword}%`]);
          const cnt = countRes[0].cnt;

          if (cnt > 0) {
            matchCount++;
            console.log(`\n🎉 [매칭 발견] 테이블: ${table} | 컬럼: ${column} | 키워드: "${keyword}" (매칭 건수: ${cnt}개)`);
            
            // 실제 데이터 샘플 최대 3건 추출
            const sampleQuery = `
              SELECT * 
              FROM ?? 
              WHERE ?? LIKE ? 
              LIMIT 3
            `;
            const [samples] = await connection.query(sampleQuery, [table, column, `%${keyword}%`]);
            console.log('샘플 데이터:');
            console.log(JSON.stringify(samples, null, 2));
          }
        } catch (err) {
          // 조회 오류가 발생한 테이블(권한 부족 등)은 무시하고 넘어갑니다.
        }
      }
    }

    if (matchCount === 0) {
      console.log('\n[-] 검색 키워드로 매칭되는 데이터를 찾지 못했습니다.');
    }

  } catch (err) {
    console.error('[-] 검색 중 오류 발생:', err.message);
  } finally {
    if (connection) {
      await connection.end();
    }
    console.log('\n==================================================');
    console.log(' 검색이 완료되었습니다.');
    console.log('==================================================');
  }
}

runSearch();
