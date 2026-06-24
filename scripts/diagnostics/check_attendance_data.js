// 근태 데이터 진단 스크립트
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://gbfoempwoeurhhlxqxgy.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function diagnose() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const monthCompact = `${year}${month}`;

  console.log(`\n=== 현재 월: ${year}-${month} (compact: ${monthCompact}) ===\n`);

  // 1. 직원 수 확인
  const { data: emps, error: empErr } = await supabase
    .from('sa_employees')
    .select('emp_no, name, dept')
    .eq('is_active', true);

  console.log(`[직원] 총 ${emps?.length || 0}명 (오류: ${empErr?.message || '없음'})`);
  if (emps && emps.length > 0) {
    console.log('  샘플:', emps.slice(0, 3).map(e => `${e.name}(${e.emp_no})`).join(', '));
  }

  // 2. 이번 달 출근 로그 확인
  const { data: logs, error: logErr } = await supabase
    .from('sa_attendance')
    .select('emp_no, a_time, log_time, gate_name, flag1, event_type')
    .gte('a_time', `${monthCompact}01000000`)
    .lte('a_time', `${monthCompact}31235959`)
    .order('a_time', { ascending: false })
    .limit(20);

  console.log(`\n[출근 로그] 이번 달 총 ${logs?.length || 0}건 (오류: ${logErr?.message || '없음'})`);
  if (logs && logs.length > 0) {
    console.log('  최신 5건:');
    logs.slice(0, 5).forEach(l => {
      console.log(`    - emp_no:${l.emp_no}, a_time:${l.a_time}, event_type:${l.event_type}, flag1:${l.flag1}, gate:${l.gate_name}`);
    });
  }

  // 3. 전체 a_time 범위 확인
  const { data: recentAny, error: rangeErr } = await supabase
    .from('sa_attendance')
    .select('emp_no, a_time, log_time, event_type, flag1')
    .order('a_time', { ascending: false })
    .limit(5);

  console.log(`\n[최신 로그 (월 무관)] 총 ${recentAny?.length || 0}건 (오류: ${rangeErr?.message || '없음'})`);
  if (recentAny && recentAny.length > 0) {
    console.log('  최신 5건:');
    recentAny.slice(0, 5).forEach(l => {
      console.log(`    - emp_no:${l.emp_no}, a_time:${l.a_time}, log_time:${l.log_time}, event_type:${l.event_type}, flag1:${l.flag1}`);
    });
  }

  // 4. 오늘 날짜 기준 필터
  const todayCompact = `${year}${month}${String(now.getDate()).padStart(2, '0')}`;
  const { data: todayLogs, error: todayErr } = await supabase
    .from('sa_attendance')
    .select('emp_no, a_time, event_type, flag1')
    .gte('a_time', `${todayCompact}000000`)
    .lte('a_time', `${todayCompact}235959`)
    .limit(20);

  console.log(`\n[오늘(${todayCompact}) 로그] 총 ${todayLogs?.length || 0}건 (오류: ${todayErr?.message || '없음'})`);
  if (todayLogs && todayLogs.length > 0) {
    console.log('  샘플:');
    todayLogs.slice(0, 5).forEach(l => {
      console.log(`    - emp_no:${l.emp_no}, a_time:${l.a_time}, event_type:${l.event_type}, flag1:${l.flag1}`);
    });
  }

  // 5. event_type 값 분포
  const { data: allTypes, error: typeErr } = await supabase
    .from('sa_attendance')
    .select('event_type, flag1')
    .limit(100);
  
  if (allTypes) {
    const typeCount = {};
    allTypes.forEach(l => {
      const k = `event_type:${l.event_type}|flag1:${l.flag1}`;
      typeCount[k] = (typeCount[k] || 0) + 1;
    });
    console.log('\n[event_type / flag1 분포 (최근 100건 기준)]:');
    Object.entries(typeCount).forEach(([k, v]) => console.log(`  ${k} => ${v}건`));
  }
}

diagnose().catch(console.error);
