/**
 * Secom MySQL Diligence & Annual Leave Code Tracker
 * --------------------------------------------------
 * 이 도구는 근태 코드 테이블(hr_diligence_code)을 조회하여 연차/휴가 관련 코드들을 확인하고,
 * 기간근태관리(hr_diligence_holiday_dae) 및 일근태(hr_day_diligence) 테이블에서 
 * 사번 20240052인 사원의 실제 데이터를 추적합니다.
 * 
 * [실행 방법]
 * 1. 이 파일(secom_mysql_find_diligence.js)을 세콤 서버 PC로 가져갑니다. (git pull)
 * 2. 서버 PC의 명령 프롬프트(cmd)에서 다음 명령을 실행합니다:
 *    node secom_mysql_find_diligence.js
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

async function runSearch() {
  console.log('==================================================');
  console.log(' 근태 코드 및 상세 근태 이력 추적 시작');
  console.log('==================================================');

  let connection;
  try {
    connection = await mysql.createConnection(MYSQL_CONFIG);
    console.log('[+] MySQL 연결 성공!');

    // 1. 근태 코드 정의 테이블 조회 (hr_diligence_code)
    console.log('\n[1] hr_diligence_code 테이블 데이터 조회:');
    try {
      const [codeRows] = await connection.query(`
        SELECT * 
        FROM hr_diligence_code 
        ORDER BY 1
      `);
      console.log(`[확인] 총 ${codeRows.length}개의 근태 코드가 등록되어 있습니다.`);
      console.table(codeRows.map(r => ({
        '코드': r.I_DILIGENCE_CODE || r.I_CODE || Object.values(r)[0],
        '명칭': r.N_DILIGENCE_NAME || r.N_NAME || Object.values(r)[1],
        '휴일여부': r.I_HOLIDAY_YN,
        '설명': r.N_NOTE || r.N_REMARK || ''
      })));
    } catch (e) {
      console.error('[-] hr_diligence_code 조회 실패:', e.message);
      // 만약 실패하면 테이블의 원본 컬럼 구조라도 파악하기 위해 DESCRIBE 실행
      try {
        const [cols] = await connection.query(`DESCRIBE hr_diligence_code`);
        console.table(cols);
        // 원본 전체 데이터 출력 시도
        const [rawRows] = await connection.query(`SELECT * FROM hr_diligence_code LIMIT 30`);
        console.log(JSON.stringify(rawRows, null, 2));
      } catch (descErr) {
        console.error('[-] hr_diligence_code 구조 파악 실패:', descErr.message);
      }
    }

    // 2. 기간근태관리 테이블 조회 (hr_diligence_holiday_dae)
    console.log('\n[2] hr_diligence_holiday_dae (기간근태관리) 테이블 조회:');
    try {
      const [cols] = await connection.query(`DESCRIBE hr_diligence_holiday_dae`);
      console.log('[컬럼 스키마]');
      console.table(cols.map(c => ({ Field: c.Field, Type: c.Type, Comment: c.Comment || '' })));

      // 사번/회사코드 컬럼 확인
      const empCol = cols.find(c => c.Field.toUpperCase().includes('EMP') || c.Field.toUpperCase() === 'I_EMPLOY_NO');
      const compCol = cols.find(c => c.Field.toUpperCase().includes('COMP') || c.Field.toUpperCase() === 'I_COMPANY');

      if (empCol) {
        let sql = `SELECT * FROM hr_diligence_holiday_dae WHERE ?? = ?`;
        let params = [empCol.Field, TARGET_EMP];

        if (compCol) {
          sql += ` AND ?? = ?`;
          params.push(compCol.Field, TARGET_COMPANY);
        }

        const [rows] = await connection.query(sql, params);
        console.log(`\n[조회 결과] 사번 ${TARGET_EMP}에 대한 기간근태 정보: ${rows.length}건`);
        if (rows.length > 0) {
          console.log(JSON.stringify(rows, null, 2));
        } else {
          console.log('해당 사원의 데이터가 없습니다.');
        }
      } else {
        console.log('[-] 사번 컬럼을 찾을 수 없어 조회를 건너뜁니다.');
      }
    } catch (e) {
      console.error('[-] hr_diligence_holiday_dae 조회 실패:', e.message);
    }

    // 3. 일근태 테이블 조회 (hr_day_diligence)
    console.log('\n[3] hr_day_diligence (일근태) 테이블 조회:');
    try {
      const [cols] = await connection.query(`DESCRIBE hr_day_diligence`);
      console.log('[컬럼 스키마]');
      console.table(cols.map(c => ({ Field: c.Field, Type: c.Type })));

      const empCol = cols.find(c => c.Field.toUpperCase().includes('EMP') || c.Field.toUpperCase() === 'I_EMPLOY_NO');
      const compCol = cols.find(c => c.Field.toUpperCase().includes('COMP') || c.Field.toUpperCase() === 'I_COMPANY');

      if (empCol) {
        let sql = `SELECT * FROM hr_day_diligence WHERE ?? = ?`;
        let params = [empCol.Field, TARGET_EMP];

        if (compCol) {
          sql += ` AND ?? = ?`;
          params.push(compCol.Field, TARGET_COMPANY);
        }
        
        // 날짜 컬럼 검색하여 최신순 정렬 시도
        const dateCol = cols.find(c => c.Field.toUpperCase().includes('DATE') || c.Field.toUpperCase().includes('DT'));
        if (dateCol) {
          sql += ` ORDER BY ?? DESC`;
          params.push(dateCol.Field);
        }
        sql += ` LIMIT 10`;

        const [rows] = await connection.query(sql, params);
        console.log(`\n[조회 결과] 사번 ${TARGET_EMP}에 대한 일근태 정보 (최근 10건): ${rows.length}건`);
        if (rows.length > 0) {
          console.log(JSON.stringify(rows, null, 2));
        } else {
          console.log('해당 사원의 데이터가 없습니다.');
        }
      } else {
        console.log('[-] 사번 컬럼을 찾을 수 없어 조회를 건너뜁니다.');
      }
    } catch (e) {
      console.error('[-] hr_day_diligence 조회 실패:', e.message);
    }

  } catch (err) {
    console.error('[-] 에러 발생:', err.message);
  } finally {
    if (connection) {
      await connection.end();
    }
    console.log('\n==================================================');
    console.log(' 추적이 완료되었습니다.');
    console.log('==================================================');
  }
}

runSearch();
