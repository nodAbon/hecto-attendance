/**
 * Secom MySQL Specific Employee Leave Checker
 * --------------------------------------------------
 * 이 도구는 Hecto_Live (whr) DB에서 회사코드 1600, 사번 20240050 인 직원의
 * 발령 상세(hr_appoint_dtl), 휴가/휴직 신청(hr_leave_app), 대체휴가(hr_sub_holiday), 
 * 근태뷰(v_leave) 등의 테이블에 데이터가 어떻게 들어있는지 조회합니다.
 * 
 * [실행 방법]
 * 1. 이 파일(secom_mysql_find_user.js)을 세콤 서버 PC로 가져갑니다. (git pull)
 * 2. 서버 PC의 명령 프롬프트(cmd)에서 다음 명령을 실행합니다:
 *    node secom_mysql_find_user.js
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

const TARGET_EMP = '20240052';
const TARGET_COMPANY = '1600';

const TARGET_TABLES = [
  'hr_appoint_dtl',
  'hr_leave_app',
  'hr_sub_holiday',
  'v_leave',
  'v_leave2'
];

async function runSearch() {
  console.log('==================================================');
  console.log(` Hecto_Live MySQL 사번: ${TARGET_EMP} 근태/연차 정보 조회`);
  console.log('==================================================');

  let connection;
  try {
    connection = await mysql.createConnection(MYSQL_CONFIG);
    console.log('[+] MySQL 연결 성공!');

    for (const table of TARGET_TABLES) {
      console.log(`\n--------------------------------------------------`);
      console.log(`테이블: ${table}`);
      console.log(`--------------------------------------------------`);

      try {
        // 1. 해당 테이블에 사번 관련 컬럼이 존재하는지 컬럼 정보 먼저 스캔
        const [cols] = await connection.query(`DESCRIBE ??`, [table]);
        
        // 사번 컬럼명 후보 매칭 (I_EMPLOY_NO 또는 I_EMP_NO 또는 I_EMPLOY 등)
        const empColObj = cols.find(c => 
          c.Field.toUpperCase() === 'I_EMPLOY_NO' || 
          c.Field.toUpperCase() === 'I_EMP_NO' ||
          c.Field.toUpperCase().includes('EMP')
        );

        if (!empColObj) {
          console.log(`[-] 사번 관련 컬럼을 찾을 수 없습니다. (컬럼 목록: ${cols.map(c => c.Field).join(', ')})`);
          continue;
        }

        const empColName = empColObj.Field;
        console.log(`[확인] 사번 컬럼명: ${empColName}`);

        // 2. 회사코드 컬럼 후보 찾기 (I_COMPANY, I_COMPANY_CODE 등)
        const compColObj = cols.find(c => 
          c.Field.toUpperCase() === 'I_COMPANY' || 
          c.Field.toUpperCase() === 'I_COMPANY_CODE' ||
          c.Field.toUpperCase().includes('COMPANY')
        );

        let queryStr = `SELECT * FROM ?? WHERE ?? = ?`;
        let queryParams = [table, empColName, TARGET_EMP];

        if (compColObj) {
          const compColName = compColObj.Field;
          queryStr += ` AND ?? = ?`;
          queryParams.push(compColName, TARGET_COMPANY);
          console.log(`[확인] 회사코드 컬럼명: ${compColName}`);
        }

        // 3. 데이터 조회
        const [rows] = await connection.query(queryStr, queryParams);
        console.log(`[조회 결과] 총 ${rows.length}건이 발견되었습니다.`);
        if (rows.length > 0) {
          console.log(JSON.stringify(rows, null, 2));
        } else {
          console.log('데이터가 없습니다.');
        }

      } catch (err) {
        console.log(`[-] 테이블 ${table} 조회 중 실패: ${err.message}`);
      }
    }

  } catch (err) {
    console.error('[-] 에러 발생:', err.message);
  } finally {
    if (connection) {
      await connection.end();
    }
    console.log('\n==================================================');
    console.log(' 조회가 완료되었습니다.');
    console.log('==================================================');
  }
}

runSearch();
