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
    console.log('[+] MySQL 연결 성공\n');

    // 1. PROC_TRANS_SECOM_TO_TENTER 프로시저 생성 구문 조회
    console.log('=== [1] PROC_TRANS_SECOM_TO_TENTER 프로시저 정의 ===');
    try {
      const [rows] = await conn.query('SHOW CREATE PROCEDURE whr.PROC_TRANS_SECOM_TO_TENTER');
      if (rows.length > 0) {
        console.log(rows[0]['Create Procedure']);
      } else {
        console.log('  프로시저를 찾을 수 없습니다.');
      }
    } catch (e) {
      console.log(`  [-] 프로시저 정의 조회 실패: ${e.message}`);
    }
    console.log('\n');

    // 2. PROC_TRANS_TENTER_TO_HECTOENTER 프로시저 생성 구문 조회
    console.log('=== [2] PROC_TRANS_TENTER_TO_HECTOENTER 프로시저 정의 ===');
    try {
      const [rows] = await conn.query('SHOW CREATE PROCEDURE whr.PROC_TRANS_TENTER_TO_HECTOENTER');
      if (rows.length > 0) {
        console.log(rows[0]['Create Procedure']);
      } else {
        console.log('  프로시저를 찾을 수 없습니다.');
      }
    } catch (e) {
      console.log(`  [-] 프로시저 정의 조회 실패: ${e.message}`);
    }
    console.log('\n');

    // 3. 수동으로 프로시저 CALL 테스트 (SECOM -> TENTER)
    console.log('=== [3] PROC_TRANS_SECOM_TO_TENTER 수동 실행 테스트 ===');
    try {
      console.log('  - 프로시저 호출 중 (2026-05-21 ~ 2026-05-22 대상)...');
      
      // 변수 바인딩하여 세팅
      await conn.query('SET @P_ERRFLAG = NULL');
      await conn.query('SET @P_ERRCODE = NULL');
      await conn.query('SET @P_ERRMSG = NULL');
      
      // 프로시저 실행
      await conn.query(`
        CALL whr.PROC_TRANS_SECOM_TO_TENTER(
          @P_ERRFLAG,
          @P_ERRCODE,
          @P_ERRMSG,
          'PROC_TRANS_TEST',
          '1600',
          'KR',
          'BR01',
          'SYS',
          'A',
          '127.0.0.1',
          'SERVER01',
          '20260521',
          '20260522'
        )
      `);
      
      // 결과 변수 조회
      const [resultRows] = await conn.query('SELECT @P_ERRFLAG AS errFlag, @P_ERRCODE AS errCode, @P_ERRMSG AS errMsg');
      console.log('  - 실행 완료 결과:');
      console.log(`    * ERR_FLAG: ${resultRows[0].errFlag}`);
      console.log(`    * ERR_CODE: ${resultRows[0].errCode}`);
      console.log(`    * ERR_MSG: ${resultRows[0].errMsg}`);
      
    } catch (e) {
      console.log(`  [-] 프로시저 호출 중 예외 발생: ${e.message}`);
    }
    console.log('\n');

    // 4. 수동으로 프로시저 CALL 테스트 (TENTER -> HECTOENTER)
    console.log('=== [4] PROC_TRANS_TENTER_TO_HECTOENTER 수동 실행 테스트 ===');
    try {
      console.log('  - 프로시저 호출 중 (2026-05-22 대상)...');
      
      await conn.query('SET @P_ERRFLAG = NULL');
      await conn.query('SET @P_ERRCODE = NULL');
      await conn.query('SET @P_ERRMSG = NULL');
      
      await conn.query(`
        CALL whr.PROC_TRANS_TENTER_TO_HECTOENTER(
          @P_ERRFLAG,
          @P_ERRCODE,
          @P_ERRMSG,
          'PROC_TRANS_TEST',
          '1600',
          'KR',
          'BR01',
          'SYS',
          'A',
          '127.0.0.1',
          'SERVER01',
          '20260522',
          '20260522'
        )
      `);
      
      const [resultRows] = await conn.query('SELECT @P_ERRFLAG AS errFlag, @P_ERRCODE AS errCode, @P_ERRMSG AS errMsg');
      console.log('  - 실행 완료 결과:');
      console.log(`    * ERR_FLAG: ${resultRows[0].errFlag}`);
      console.log(`    * ERR_CODE: ${resultRows[0].errCode}`);
      console.log(`    * ERR_MSG: ${resultRows[0].errMsg}`);
      
    } catch (e) {
      console.log(`  [-] 프로시저 호출 중 예외 발생: ${e.message}`);
    }
    console.log('\n');

  } finally {
    await conn.end();
  }
}

run().catch(err => {
  console.error('오류:', err.message);
  process.exit(1);
});
