/**
 * Secom MySQL Leave History Table Finder
 * --------------------------------------------------
 * 이 도구는 hr_diligence_code에서 확인한 연차/휴가 관련 코드(12, 16, 17, 60 등)가
 * 실제로 기록되는 테이블이 어디인지 역추적합니다.
 * 특정 사원(20240052)의 기록 유무와 상관없이, 시스템 전체에서 
 * 휴가 코드가 쌓이고 있는 진짜 "휴가/연차 사용 내역 테이블"을 찾아냅니다.
 * 
 * [실행 방법]
 * 1. 이 파일(secom_mysql_find_leave_history.js)을 세콤 서버 PC로 가져갑니다. (git pull)
 * 2. 서버 PC의 명령 프롬프트(cmd)에서 다음 명령을 실행합니다:
 *    node secom_mysql_find_leave_history.js
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

// 연차/반차/휴가 관련 코드들
const LEAVE_CODES = [
  '12', '13', '14', '16', '17', '18', '19', '20', 
  '21', '22', '23', '24', '25', '26', '27', '28', 
  '30', '40', '42', '43', '60', '61', '62', '63', 
  '64', '65', '66', '67', '68', '90'
];

const TARGET_EMP = '20240052';
const TARGET_COMPANY = '1600';

async function runSearch() {
  console.log('==================================================');
  console.log(' 연차/휴가 사용 이력 테이블 역추적 시작');
  console.log('==================================================');

  let connection;
  try {
    connection = await mysql.createConnection(MYSQL_CONFIG);
    console.log('[+] MySQL 연결 성공!');

    // 1. 근태 코드 또는 휴가 코드가 매핑될 법한 컬럼을 가진 테이블 목록 조회
    const [columns] = await connection.execute(`
      SELECT TABLE_NAME, COLUMN_NAME 
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = 'whr' 
        AND (
          COLUMN_NAME LIKE '%dili%' 
          OR COLUMN_NAME LIKE '%holiday%' 
          OR COLUMN_NAME LIKE '%leave%'
          OR COLUMN_NAME = 'I_CODE' 
          OR COLUMN_NAME = 'I_DILI_CODE'
        )
    `);

    // 임시/백업 테이블 필터링
    const targetCols = columns.filter(c => {
      const table = c.TABLE_NAME;
      const isBackupOrTemp = 
        /_\d{4,}/.test(table) || 
        /_\d{2,}/.test(table) || 
        table.includes('bak') || 
        table.includes('test') || 
        table.includes('diff') || 
        table.includes('copy');
      return !isBackupOrTemp;
    });

    console.log(`[+] 검색 대상 컬럼 수: ${targetCols.length}개`);
    console.log('[+] 각 테이블의 연차/휴가 코드 데이터 분포를 확인하는 중...');

    const results = [];

    for (const col of targetCols) {
      const table = col.TABLE_NAME;
      const column = col.COLUMN_NAME;

      try {
        // 테이블에 사번 컬럼이 있는지 DESCRIBE를 통해 체크
        const [tableCols] = await connection.query(`DESCRIBE ??`, [table]);
        const empCol = tableCols.find(tc => 
          tc.Field.toUpperCase() === 'I_EMPLOY_NO' || 
          tc.Field.toUpperCase() === 'I_EMP_NO' ||
          tc.Field.toUpperCase().includes('EMP')
        );

        // 회사코드 컬럼 확인
        const compCol = tableCols.find(tc => 
          tc.Field.toUpperCase() === 'I_COMPANY' || 
          tc.Field.toUpperCase() === 'I_COMPANY_CODE' ||
          tc.Field.toUpperCase().includes('COMPANY')
        );

        if (empCol) {
          const inClause = LEAVE_CODES.map(code => `'${code}'`).join(',');
          
          // 회사코드와 사번, 그리고 휴가코드가 동시에 일치하는 행 카운트
          let queryUser = `
            SELECT COUNT(*) as cnt 
            FROM ?? 
            WHERE ?? IN (${inClause}) AND ?? = ?
          `;
          const userQueryParams = [table, column, empCol.Field, TARGET_EMP];

          if (compCol) {
            queryUser += ` AND ?? = ?`;
            userQueryParams.push(compCol.Field, TARGET_COMPANY);
          }

          const [userRes] = await connection.query(queryUser, userQueryParams);
          const userCount = userRes[0].cnt;

          if (userCount > 0) {
            // 실제 데이터 샘플 가져오기
            let queryUserSamples = `
              SELECT * 
              FROM ?? 
              WHERE ?? IN (${inClause}) AND ?? = ? 
            `;
            const sampleParams = [table, column, empCol.Field, TARGET_EMP];

            if (compCol) {
              queryUserSamples += ` AND ?? = ?`;
              sampleParams.push(compCol.Field, TARGET_COMPANY);
            }
            queryUserSamples += ` LIMIT 5`;

            const [samples] = await connection.query(queryUserSamples, sampleParams);

            results.push({
              table,
              column,
              userCount,
              userSamples: samples
            });
          }
        }
      } catch (err) {
        // 에러 무시
      }
    }

    console.log('\n==================================================');
    console.log(` [결과] 회사코드: ${TARGET_COMPANY} | 사번: ${TARGET_EMP} 연차/휴가 내역`);
    console.log('==================================================');
    
    if (results.length > 0) {
      results.forEach(res => {
        console.log(`\n▶ 테이블: ${res.table} | 컬럼: ${res.column}`);
        console.log(`  - 매칭된 데이터 건수: ${res.userCount}건`);
        console.log(`  - 상세 데이터:`);
        console.log(JSON.stringify(res.userSamples, null, 2));
      });
    } else {
      console.log(`[-] 사번 ${TARGET_EMP}에 대한 연차/휴가 기록이 발견되지 않았습니다.`);
    }

  } catch (err) {
    console.error('[-] 에러 발생:', err.message);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n==================================================');
      console.log(' 조회가 완료되었습니다.');
      console.log('==================================================');
    }
  }
}

runSearch();
