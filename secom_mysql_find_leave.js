/**
 * Secom MySQL Leave/Holiday Table Finder
 * --------------------------------------------------
 * 이 도구는 Hecto_Live (whr) MySQL DB에 접속하여 연차, 휴가, 휴직 등 
 * 연차사용 정보가 담겨있는 테이블이나 컬럼이 존재하는지 검색하고 분석합니다.
 * 
 * [실행 방법]
 * 1. 이 파일(secom_mysql_find_leave.js)을 세콤 서버 PC의 프로젝트 폴더(C:\hecto-attendance)로 복사합니다.
 * 2. 서버 PC의 명령 프롬프트(cmd)에서 다음 명령을 실행합니다:
 *    node secom_mysql_find_leave.js
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

// 검색에 사용할 키워드들 (테이블명 및 컬럼명 검색용)
const KEYWORDS = [
  'leave',     // 휴가, 연차, 퇴사 등
  'holiday',   // 휴일, 휴가
  'vacation',  // 휴가
  'annual',    // 연차
  'rest',      // 휴식, 휴직
  'off',       // 휴무, 오프
  'dayoff',    // 휴무일
  'yancha',    // 연차 한글 발음
  'yeoncha'    // 연차 한글 발음
];

async function runSearch() {
  console.log('==================================================');
  console.log(' Hecto_Live MySQL 연차/휴가 관련 테이블 검색 시작');
  console.log('==================================================');

  let connection;
  try {
    connection = await mysql.createConnection(MYSQL_CONFIG);
    console.log('[+] MySQL 연결 성공!');

    // 1. 키워드가 포함된 테이블 찾기
    console.log('\n[1] 키워드가 포함된 테이블명 검색:');
    const tableLikeClauses = KEYWORDS.map(k => `TABLE_NAME LIKE '%${k}%'`).join(' OR ');
    const [matchingTables] = await connection.execute(`
      SELECT TABLE_NAME, TABLE_COMMENT 
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = 'whr' 
        AND (${tableLikeClauses})
    `);
    
    if (matchingTables.length > 0) {
      console.table(matchingTables);
    } else {
      console.log('  -> 키워드가 매칭되는 테이블명이 없습니다.');
    }

    // 2. 키워드가 포함된 컬럼 찾기
    console.log('\n[2] 키워드가 포함된 컬럼명 검색 (테이블 포함):');
    const colLikeClauses = KEYWORDS.map(k => `COLUMN_NAME LIKE '%${k}%'`).join(' OR ');
    const [matchingCols] = await connection.execute(`
      SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, COLUMN_COMMENT 
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = 'whr' 
        AND (${colLikeClauses})
      ORDER BY TABLE_NAME, COLUMN_NAME
    `);

    if (matchingCols.length > 0) {
      console.table(matchingCols);

      // 매칭된 테이블 고유 목록 추출 및 백업/테스트/임시 테이블 필터링
      const uniqueTables = [...new Set(matchingCols.map(c => c.TABLE_NAME))].filter(table => {
        const isBackupOrTemp = 
          /_\d{4,}/.test(table) ||      // 날짜가 포함된 테이블 (예: _20251021)
          /_\d{2,}/.test(table) ||      // 짧은 숫자가 포함된 테이블 (예: _1745, _251102)
          table.includes('bak') ||      // 백업
          table.includes('test') ||     // 테스트
          table.includes('diff') ||     // 비교용 임시
          table.includes('copy');       // 복사본
        return !isBackupOrTemp;
      });
      
      console.log('\n[3] 핵심 테이블 샘플 데이터 및 행 수 확인:');
      for (const table of uniqueTables) {
        try {
          const [countRes] = await connection.query(`SELECT COUNT(*) as cnt FROM ??`, [table]);
          const count = countRes[0].cnt;
          console.log(`\n--------------------------------------------------`);
          console.log(`테이블: ${table} (전체 행 수: ${count}개)`);
          console.log(`--------------------------------------------------`);
          
          if (count > 0) {
            // 샘플 3건만 뽑아서 확인
            const [samples] = await connection.query(`SELECT * FROM ?? LIMIT 3`, [table]);
            console.log(JSON.stringify(samples, null, 2));
          } else {
            console.log('데이터가 비어 있습니다.');
          }
        } catch (tableErr) {
          console.log(`[-] 테이블 ${table} 조회 실패: ${tableErr.message}`);
        }
      }
    } else {
      console.log('  -> 키워드가 매칭되는 컬럼명이 없습니다.');
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
