const mysql = require('mysql2/promise');
const { createClient } = require('@supabase/supabase-js');

const MYSQL_CONFIG = {
  host: 'Prd-Hecto-WHR-Ext-NLB-8e82b66ed560637d.elb.ap-northeast-2.amazonaws.com',
  user: 'whradmin',
  password: '1q2w3e4r!@#$',
  database: 'whr',
  port: 3306,
  connectTimeout: 10000,
};

const supabaseUrl = 'https://gbfoempwoeurhhlxqxgy.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdiZm9lbXB3b2V1cmhobHhxeGd5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODU1MDkzNiwiZXhwIjoyMDk0MTI2OTM2fQ.6Tm0XESSnrop7BYgcuS9bCgeMhOxTHSUB8wmpkUFQ3c';

async function run() {
  console.log('1. MySQL 연결을 시도합니다...');
  let conn;
  try {
    conn = await mysql.createConnection(MYSQL_CONFIG);
    console.log('   -> MySQL 연결 성공!');

    console.log('2. 직원 정보를 MySQL에서 조회합니다...');
    const [empRows] = await conn.execute(`
      SELECT
        e.I_EMPLOY_NO  AS emp_no,
        e.N_EMPLOY_NAME AS name,
        d.N_DEPT        AS dept_name
      FROM hr_employee e
      INNER JOIN hr_department d ON
        d.I_COMPANY = '1600' AND d.I_DEPT = e.I_DEPT
      WHERE e.I_COMPANY = '1600'
        AND COALESCE(e.I_RETIRE_YN, '0') <> '1'
        AND (
          d.N_DEPT = '플랫폼서비스실'
          OR d.N_DEPT = '사업개발팀'
          OR d.N_DEPT REGEXP '사업관리 ?[123]팀'
        )
      ORDER BY d.N_DEPT, e.N_EMPLOY_NAME
    `);
    console.log(`   -> MySQL 조회 성공! 조회된 직원 수: ${empRows.length}명`);

    if (empRows.length > 0) {
      console.log('3. Supabase 연결 및 upsert를 시도합니다...');
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      
      const records = empRows.map(r => ({
        emp_no: r.emp_no,
        name: r.name,
        dept: r.dept_name,
        is_active: true
      }));

      const { data, error } = await supabase
        .from('SA_employees')
        .upsert(records, { onConflict: 'emp_no' })
        .select();

      if (error) {
        console.error('❌ Supabase Upsert 실패 에러 로그:', error);
      } else {
        console.log('✅ Supabase Upsert 성공! 저장된 데이터 건수:', data?.length || 0);
      }
    } else {
      console.log('⚠️ MySQL에서 조회된 직원이 없어 Supabase upsert를 생략합니다.');
    }

  } catch (err) {
    console.error('❌ 실행 중 에러 발생:', err);
  } finally {
    if (conn) {
      await conn.end();
      console.log('4. MySQL 연결을 종료했습니다.');
    }
  }
}

run();
