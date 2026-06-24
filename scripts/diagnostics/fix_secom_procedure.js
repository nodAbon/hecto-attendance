const mysql = require('mysql2/promise');

const MYSQL_CONFIG = {
  host: '[REDACTED MYSQL HOST]',
  user: 'whradmin',
  password: '[REDACTED MYSQL PASSWORD]',
  database: 'whr',
  port: 3306,
  connectTimeout: 10000
};

// 수정된 프로시저 DDL (INSERT IGNORE 적용)
const dropProcedureSql = `DROP PROCEDURE IF EXISTS whr.PROC_TRANS_SECOM_TO_TENTER`;

const createProcedureSql = `
CREATE PROCEDURE whr.PROC_TRANS_SECOM_TO_TENTER(
      OUT P_ERRFLAG VARCHAR(20)
    , OUT P_ERRCODE VARCHAR(20)
    , OUT P_ERRMSG  VARCHAR(4000)
    , IN  P_PROGRAMID VARCHAR(20)
    , IN  P_COMPANYID VARCHAR(20)
    , IN  P_LANGUAGE VARCHAR(20)
    , IN  P_BRANDCODE VARCHAR(20)
    , IN  P_EMPID VARCHAR(20)
    , IN  P_EMPTYPE VARCHAR(20)
    , IN  P_IPADDR VARCHAR(20)
    , IN  P_COMPUTERNAME VARCHAR(20)
    , IN  P_BASEDATE VARCHAR(20)
    , IN  P_D_DILI_DATE VARCHAR(20)
)
BEGIN
    /********************************************************************************************
        근태 점각기(SECOM) 자료 전송 → 일근태관리(TENTER)
        웅진표준 변환본 - 중복 키 충돌 시 스킵할 수 있도록 INSERT IGNORE 적용 (2026-05-22 수정)
    ********************************************************************************************/

    DECLARE V_D_DATE VARCHAR(8);
    DECLARE v_sqlstate CHAR(5);
    DECLARE v_errno INT;
    DECLARE v_message TEXT;

    -- 예외 핸들러
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        GET DIAGNOSTICS CONDITION 1
            v_sqlstate = RETURNED_SQLSTATE,
            v_errno    = MYSQL_ERRNO,
            v_message  = MESSAGE_TEXT;
        SET P_ERRFLAG = 'TRUE';
        SET P_ERRCODE = '-1016';
        SET P_ERRMSG  = CONCAT('[SQLSTATE: ', v_sqlstate, '] [ERRNO: ', v_errno, '] ', v_message);
    END;

    -- ===========================================
    -- 1️⃣ 근태일자 세팅 : NULL이면 전일 기준
    -- ===========================================
    IF P_D_DILI_DATE IS NULL OR P_D_DILI_DATE = '' THEN
        SET V_D_DATE = DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 1 DAY), '%Y%m%d');
    ELSE
        SET V_D_DATE = P_D_DILI_DATE;
    END IF;


    -- ===========================================
    -- 2️⃣ SECOM 근태기록 → TENTER Table 입력 (중복 키 무시를 위해 IGNORE 키워드 추가)
    -- ===========================================
    INSERT IGNORE INTO TENTER (
        E_DATE, E_TIME, G_ID, E_ID, E_NAME, E_IDNO,
        E_GROUP, E_USER, E_MODE, E_TYPE, E_RESULT
     )
     SELECT SUBSTR(A.ATime,1,8) AS E_DATE
                , SUBSTR(A.ATime,9,8 ) AS E_TIME
                , CAST(A.EqCode AS CHAR) AS G_ID
                , A.CardNo  AS E_ID
                , B.N_EMPLOY_NAME AS E_NAME
                , A.Sabun AS E_IDNO
                , ''
                , ''
                , ''
                , ''
                , ''
           FROM t_secom_alarm A
      LEFT JOIN HR_EMPLOYEE B
             ON SUBSTR(A.Sabun,1,4) = B.I_COMPANY
            AND SUBSTR(A.Sabun,5,8) = B.I_EMPLOY_NO
          WHERE SUBSTR(A.ATime,1,8) = V_D_DATE;

END
`;

async function run() {
  const conn = await mysql.createConnection(MYSQL_CONFIG);
  try {
    console.log('[+] MySQL 연결 성공\n');

    // 1. 기존 프로시저 DROP
    console.log('[1] 기존 PROC_TRANS_SECOM_TO_TENTER 프로시저 제거 중...');
    await conn.query(dropProcedureSql);
    console.log('    -> 제거 완료.');

    // 2. 수정된 프로시저 CREATE
    console.log('[2] 수정된 PROC_TRANS_SECOM_TO_TENTER 프로시저 생성 중 (INSERT IGNORE 적용)...');
    await conn.query(createProcedureSql);
    console.log('    -> 생성 완료.');

    // 3. 오늘(2026-05-22) 데이터 동기화 수동 실행 (SECOM -> TENTER)
    console.log('\n[3] 오늘(20260522) 데이터에 대해 프로시저 수동 실행 테스트...');
    await conn.query('SET @P_ERRFLAG = NULL');
    await conn.query('SET @P_ERRCODE = NULL');
    await conn.query('SET @P_ERRMSG = NULL');
    
    await conn.query(`
      CALL whr.PROC_TRANS_SECOM_TO_TENTER(
        @P_ERRFLAG,
        @P_ERRCODE,
        @P_ERRMSG,
        'PROC_TRANS_FIX',
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
    
    const [result1] = await conn.query('SELECT @P_ERRFLAG AS errFlag, @P_ERRCODE AS errCode, @P_ERRMSG AS errMsg');
    console.log('    - 실행 결과:');
    console.log(`      * ERR_FLAG: ${result1[0].errFlag}`);
    console.log(`      * ERR_CODE: ${result1[0].errCode}`);
    console.log(`      * ERR_MSG: ${result1[0].errMsg}`);

    // 4. 대시보드 2단계 동기화 수동 실행 (TENTER -> HECTOENTER)
    console.log('\n[4] 오늘(20260522) 데이터에 대해 2단계 프로시저 수동 실행 (TENTER -> HECTOENTER)...');
    await conn.query('SET @P_ERRFLAG = NULL');
    await conn.query('SET @P_ERRCODE = NULL');
    await conn.query('SET @P_ERRMSG = NULL');
    
    await conn.query(`
      CALL whr.PROC_TRANS_TENTER_TO_HECTOENTER(
        @P_ERRFLAG,
        @P_ERRCODE,
        @P_ERRMSG,
        'PROC_TRANS_FIX',
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
    
    const [result2] = await conn.query('SELECT @P_ERRFLAG AS errFlag, @P_ERRCODE AS errCode, @P_ERRMSG AS errMsg');
    console.log('    - 실행 결과:');
    console.log(`      * ERR_FLAG: ${result2[0].errFlag}`);
    console.log(`      * ERR_CODE: ${result2[0].errCode}`);
    console.log(`      * ERR_MSG: ${result2[0].errMsg}`);

    // 5. 복구 상태 최종 검증
    console.log('\n[5] 테이블 데이터 수 최종 검증 (오늘: 20260522)...');
    const [cntTenter] = await conn.query("SELECT COUNT(*) as cnt FROM tenter WHERE E_DATE = '20260522'");
    const [cntHecto] = await conn.query("SELECT COUNT(*) as cnt FROM hecto_enter WHERE E_DATE = '20260522'");
    
    console.log(`    - 오늘 tenter 데이터 수: ${cntTenter[0].cnt}개 (이전: 40개)`);
    console.log(`    - 오늘 hecto_enter 데이터 수: ${cntHecto[0].cnt}개 (이전: 30개)`);
    
    if (cntTenter[0].cnt > 40) {
      console.log('\n[성공] 동기화 프로시저가 정상 복구되었으며 누락된 데이터가 동기화되었습니다! 🎉');
    } else {
      console.log('\n[-] 프로시저는 실행되었으나 tenter의 데이터 수가 늘어나지 않았습니다. 날짜 매칭을 확인해야 합니다.');
    }

  } finally {
    await conn.end();
  }
}

run().catch(err => {
  console.error('오류:', err.message);
  process.exit(1);
});
