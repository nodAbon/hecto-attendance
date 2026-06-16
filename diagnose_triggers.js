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

    // 1. 트리거(Trigger) 목록 조회
    console.log('=== [1] 트리거 목록 (SHOW TRIGGERS) ===');
    try {
      const [triggers] = await conn.query(`
        SELECT 
          TRIGGER_NAME as name, 
          EVENT_MANIPULATION as event, 
          EVENT_OBJECT_TABLE as tbl, 
          ACTION_TIMING as timing,
          CREATED as created
        FROM information_schema.triggers 
        WHERE TRIGGER_SCHEMA = 'whr'
      `);
      if (triggers.length === 0) {
        console.log('  등록된 트리거가 없습니다.');
      } else {
        triggers.forEach((t, i) => {
          console.log(`  [${i+1}] 트리거명: ${t.name} | 이벤트: ${t.timing} ${t.event} ON ${t.tbl} | 생성일: ${t.created}`);
        });
      }
    } catch (e) {
      console.log(`  [-] 트리거 조회 실패: ${e.message}`);
    }
    console.log('\n');

    // 2. 특정 테이블의 상세 트리거 정의 조회 (t_secom_alarm)
    console.log('=== [2] t_secom_alarm 관련 트리거 상세 정의 ===');
    try {
      const [triggersDetail] = await conn.query(`
        SELECT TRIGGER_NAME, ACTION_STATEMENT 
        FROM information_schema.triggers 
        WHERE TRIGGER_SCHEMA = 'whr' AND EVENT_OBJECT_TABLE = 't_secom_alarm'
      `);
      if (triggersDetail.length === 0) {
        console.log('  t_secom_alarm 테이블에 등록된 트리거가 없습니다.');
      } else {
        triggersDetail.forEach((t, i) => {
          console.log(`  [${i+1}] 트리거명: ${t.TRIGGER_NAME}`);
          console.log(`------ 정의 시작 ------`);
          console.log(t.ACTION_STATEMENT);
          console.log(`------ 정의 끝 ------\n`);
        });
      }
    } catch (e) {
      console.log(`  [-] 상세 트리거 조회 실패: ${e.message}`);
    }
    console.log('\n');

    // 3. 이벤트 스케줄러(Event Scheduler) 상태 조회
    console.log('=== [3] 이벤트 스케줄러 상태 ===');
    try {
      const [eventSchedulerStatus] = await conn.query(`SHOW VARIABLES LIKE 'event_scheduler'`);
      console.log(`  - event_scheduler 변수 값: ${eventSchedulerStatus[0]?.Value}`);
      
      const [events] = await conn.query(`
        SELECT 
          EVENT_NAME as name, 
          STATUS as status, 
          LAST_EXECUTED as last_executed,
          EVENT_DEFINITION as definition
        FROM information_schema.events 
        WHERE EVENT_SCHEMA = 'whr'
      `);
      if (events.length === 0) {
        console.log('  등록된 이벤트 스케줄러가 없습니다.');
      } else {
        events.forEach((ev, i) => {
          console.log(`  [${i+1}] 이벤트명: ${ev.name} | 상태: ${ev.status} | 마지막 실행: ${ev.last_executed}`);
          console.log(`------ 정의 시작 ------`);
          console.log(ev.definition);
          console.log(`------ 정의 끝 ------\n`);
        });
      }
    } catch (e) {
      console.log(`  [-] 이벤트 조회 실패: ${e.message}`);
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
