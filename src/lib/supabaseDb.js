/**
 * ================================================================
 * Supabase 기반 근태 데이터 조회/변경 레이어
 * ================================================================
 */

import { getAdminClient } from './supabaseClient';

/**
 * fetchAttendanceLogs: 근태관련 모든 데이터를 통합 로드
 * 반환값: { employees, logs, leaves, corrections, overrides, manualCheckins, isDemo, error }
 */
export async function fetchAttendanceLogs(yearMonth) {
  const supabase = getAdminClient();
  const targetMonth = yearMonth || new Date().toISOString().substring(0, 7); // YYYY-MM
  const [year, month] = targetMonth.split('-');
  const monthCompact = `${year}${month}`; // YYYYMM
  const lastDayNum = new Date(Number(year), Number(month), 0).getDate();
  const monthEndDate = `${year}-${month}-${String(lastDayNum).padStart(2, '0')}`;

  // log_time 기반 ISO 범위 (KST +09:00 기준)
  const logTimeFrom = `${year}-${month}-01T00:00:00+09:00`;
  const nextMonthDate = new Date(Number(year), Number(month), 1);
  const nextYear = nextMonthDate.getFullYear();
  const nextMonth = String(nextMonthDate.getMonth() + 1).padStart(2, '0');
  const nextMonthLastDay = 1;
  const logTimeTo = `${nextYear}-${nextMonth}-${String(nextMonthLastDay).padStart(2, '0')}T23:59:59+09:00`;

  try {
    // ── 1. 직원 목록 ──────────────────────────────────────────────
    const { data: employees, error: empErr } = await supabase
      .from('sa_employees')
      .select('emp_no, name, dept')
      .eq('is_active', true)
      .order('dept')
      .order('name');

    if (empErr) throw new Error(`직원 조회 실패: ${empErr.message}`);

    const { data: employeeNames, error: employeeNamesErr } = await supabase
      .from('sa_employees')
      .select('emp_no, name');

    if (employeeNamesErr) throw new Error(`직원 이름 조회 실패: ${employeeNamesErr.message}`);

    // ── 2. 해당 월 출입 로그 (log_time 기반 ISO 범위 조회) ─────────
    // Supabase PostgREST max-rows 프로젝트 설정(기본 1000)을 우회하기 위해 페이지네이션
    const rawLogs = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data: page, error: logErr } = await supabase
        .from('sa_attendance')
        .select('id, emp_no, card_no, a_time, log_time, gate_name, flag1, event_type, source')
        .gte('log_time', logTimeFrom)
        .lte('log_time', logTimeTo)
        .order('log_time', { ascending: false })
        .range(from, from + PAGE - 1);

      if (logErr) throw new Error(`출입 로그 조회 실패: ${logErr.message}`);
      if (!page || page.length === 0) break;
      rawLogs.push(...page);
      if (page.length < PAGE) break;
    }

    // ── 3. 해당 기간 승인 휴가 ────────────────────────────────────
    const { data: rawLeaves, error: leaveErr } = await supabase
      .from('sa_leaves')
      .select('emp_no, emp_name, start_date, end_date, leave_code, leave_name, leave_days, status')
      .lte('start_date', monthCompact + String(lastDayNum).padStart(2, '0'))
      .gte('end_date', `${monthCompact}01`)
      .eq('status', '40');

    if (leaveErr) throw new Error(`휴가 조회 실패: ${leaveErr.message}`);

    // ── 4. 출퇴근 수정값 조회 (sa_attendance_corrections) ─────────
    const firstDay = `${year}-${month}-01`;
    const lastDay  = monthEndDate;
    let safeAdjustments = [];
    {
      const { data: rawAdjustments, error: adjustErr } = await supabase
        .from('sa_attendance_log_adjustments')
        .select('id, attendance_id, emp_no, work_date, adjusted_role, note, adjusted_by, created_at, updated_at')
        .gte('work_date', firstDay)
        .lte('work_date', lastDay);

      if (adjustErr) {
        const adjustMessage = String(adjustErr.message || '').toLowerCase();
        if (adjustMessage.includes('sa_attendance_log_adjustments') || adjustErr.code === '42p01') {
          safeAdjustments = [];
        } else {
          throw new Error(`Attendance log adjustment fetch failed: ${adjustErr.message}`);
        }
      } else {
        safeAdjustments = rawAdjustments || [];
      }
    }

    const { data: corrections, error: corrErr } = await supabase
      .from('sa_attendance_corrections')
      .select('emp_no, work_date, corrected_out_time, reason');
    const corrMap = new Map();
    (corrections || []).forEach(c => {
      corrMap.set(`${c.emp_no}_${c.work_date}`, c);
    });

    const adjustmentMap = new Map();
    safeAdjustments.forEach((adjustment) => {
      adjustmentMap.set(String(adjustment.attendance_id), adjustment);
    });

    const { data: overrides, error: overErr } = await supabase
      .from('sa_schedule_overrides')
      .select('emp_no, work_date, schedule_start, schedule_end, note');
    
    let teamSchedulePatterns = [];

    if (overErr) throw new Error(`스케줄 조정 정보 조회 실패: ${overErr.message}`);

    // ── 6. 수동 출퇴근 기록 조회 (sa_manual_checkins) ──────────────
    try {
      const { data: teamPatterns, error: teamPatternErr } = await supabase
        .from('sa_team_schedule_patterns')
        .select('dept_name, work_date, pattern_code, pattern_name, schedule_start, schedule_end, note, created_by, created_at, updated_at')
        .gte('work_date', firstDay)
        .lte('work_date', lastDay);

      if (teamPatternErr) {
        const message = String(teamPatternErr.message || '').toLowerCase();
        if (!message.includes('sa_team_schedule_patterns') && !message.includes('does not exist')) {
          throw new Error(`팀 근무패턴 조회 실패: ${teamPatternErr.message}`);
        }
      } else {
        teamSchedulePatterns = teamPatterns || [];
      }
    } catch (patternError) {
      if (!String(patternError?.message || '').toLowerCase().includes('sa_team_schedule_patterns')) {
        throw patternError;
      }
    }

    const { data: rawManual, error: manualErr } = await supabase
      .from('sa_manual_checkins')
      .select('id, emp_no, check_type, check_time, work_date, note, admin_decision')
      .gte('work_date', firstDay)
      .lte('work_date', lastDay);

    if (manualErr) throw new Error(`수동 출퇴근 조회 실패: ${manualErr.message}`);

    // ── 7. 데이터 포맷팅 및 병합 ──────────────────────────────────
    const normalizeEmpNoKey = (value) => {
      const digits = String(value ?? '').replace(/\D/g, '');
      return digits.replace(/^0+/, '') || digits;
    };

    const employees_fmt = (employees || []).map(e => ({
      empNo: e.emp_no,
      name:  e.name,
      dept:  e.dept,
    }));
    const employeeNameMap = new Map((employeeNames || []).map(e => [normalizeEmpNoKey(e.emp_no), e.name || '']));

    // 세콤 로그 포맷팅
    const logs_fmt = (rawLogs || []).map(r => {
      let logTime = '';
      if (r.a_time && r.a_time.length >= 14) {
        // a_time (YYYYMMDDHHMMSS KST 현지 시각) 직접 파싱 → 이중변환 없이 KST 시각 그대로 사용
        logTime = formatATime(r.a_time);
      } else if (r.log_time) {
        // log_time이 +09:00 오프셋으로 저장된 경우 → 이미 KST이므로 오프셋 없이 그대로 출력
        const d = new Date(r.log_time);
        // getTime()은 UTC 기준 ms, toISOString()은 UTC 문자열이므로
        // +09:00 타임스탬프 → UTC offset -9h → toISOString이 UTC 시각 출력 → +9h 보정 필요
        const kst = new Date(d.getTime() + (9 * 60 * 60 * 1000));
        logTime = kst.toISOString().replace('T', ' ').substring(0, 19);
      } else {
        logTime = new Date().toISOString().replace('T', ' ').substring(0, 19);
      }

      const dateStr = logTime.split(' ')[0]; // YYYY-MM-DD
      const corr = corrMap.get(`${r.emp_no}_${dateStr}`);
      const adjustment = adjustmentMap.get(String(r.id || ''));
      const adjustedWorkDate = adjustment?.work_date || dateStr;
      const adjustedRole = adjustment?.adjusted_role || null;
      const baseMinutes = (() => {
        const timePart = String(logTime || '').split(' ')[1] || '00:00:00';
        const [hours = 0, minutes = 0] = timePart.substring(0, 5).split(':').map((value) => Number(value) || 0);
        return (hours * 60) + minutes;
      })();
      const adjustedRoleText = String(adjustedRole || '').trim().toLowerCase();
      const isIgnored = adjustedRoleText.includes('무시') || adjustedRoleText.includes('ignore');
      const isAdjustedCheckout = adjustedRoleText.includes('퇴') || adjustedRoleText.includes('checkout');
      const isAdjustedCheckin = adjustedRoleText.includes('출') || adjustedRoleText.includes('checkin');
      const adjustedWorkOrder = (() => {
        if (isAdjustedCheckout) return baseMinutes + (24 * 60);
        if (isAdjustedCheckin) return baseMinutes - (24 * 60);
        return baseMinutes;
      })();

      return {
        id:        r.id,
        empNo:     r.emp_no,
        cardNo:    r.card_no,
        logTime,
        rawWorkDate: dateStr,
        workDate:  adjustedWorkDate,
        gateName:  r.gate_name || '게이트',
        flag1:     r.flag1,
        source:    r.source || 'secom',
        eventType: adjustedRole || r.event_type || flag1ToEventType(r.flag1),
        adjustedRole,
        isIgnored,
        isAdjustedCheckout,
        isAdjustedCheckin,
        workOrder: adjustedWorkOrder,
        adjustmentId: adjustment?.id || null,
        adjustmentNote: adjustment?.note || '',
        adjustedRoleApplied: adjustedRole || null,
        isAdjusted: !!adjustment,
        correctedOutTime: (r.event_type === '퇴근' && corr)
          ? corr.corrected_out_time?.replace('T', ' ').substring(0, 19)
          : null,
        correctionReason: (r.event_type === '퇴근' && corr) ? corr.reason : null,
      };
    }).filter((row) => !row.isIgnored);

    // 수동 기록을 로그 형식으로 병합
    const manual_logs = (rawManual || [])
      .filter(m => m.admin_decision !== 'rejected')
      .map(m => {
        let logTime = '';
        if (m.check_time) {
          // check_time은 UTC로 저장된 timestamp이므로 +9h 보정
          const d = new Date(m.check_time);
          const kst = new Date(d.getTime() + (9 * 60 * 60 * 1000));
          logTime = kst.toISOString().replace('T', ' ').substring(0, 19);
        } else {
          logTime = `${m.work_date} 09:00:00`;
        }
        const dateStr = m.work_date;
        const corr = corrMap.get(`${m.emp_no}_${dateStr}`);

        return {
          empNo:     m.emp_no,
          cardNo:    '수동',
          logTime,
          workDate:  dateStr,
          gateName:  m.note ? `수동 (${m.note})` : '수동',
          flag1:     m.check_type === '출근' ? '1' : '4',
          eventType: m.check_type,
          correctedOutTime: (m.check_type === '퇴근' && corr)
            ? corr.corrected_out_time?.replace('T', ' ').substring(0, 19)
            : null,
          correctionReason: (m.check_type === '퇴근' && corr) ? corr.reason : null,
          isManual:  true,
          manualId:  m.id,
          adminDecision: m.admin_decision
        };
      });

    // 병합된 전체 로그 (최신순 정렬)
    const combined_logs = [...logs_fmt, ...manual_logs].sort((a, b) => b.logTime.localeCompare(a.logTime));

    const leaves_fmt = (rawLeaves || []).map(l => ({
      empNo:     l.emp_no,
      empName:   l.emp_name || employeeNameMap.get(normalizeEmpNoKey(l.emp_no)) || '',
      startDate: l.start_date,
      endDate:   l.end_date,
      leaveCode: l.leave_code,
      leaveName: l.leave_name,
      leaveDays: l.leave_days?.toString() || '0',
      status:    l.status,
    }));

    return {
      employees: employees_fmt,
      logs:      combined_logs,
      leaves:    leaves_fmt,
      corrections: corrections || [],
      overrides: overrides || [],
      teamSchedulePatterns,
      manualCheckins: rawManual || [],
      isDemo:    false,
      error:     null,
    };

  } catch (err) {
    console.error('[Supabase] 데이터 조회 실패:', err.message);
    return {
      employees: [],
      logs:      [],
      leaves:    [],
      corrections: [],
      overrides: [],
      teamSchedulePatterns: [],
      manualCheckins: [],
      isDemo:    true,
      error:     `데이터 조회 실패: ${err.message}`,
    };
  }
}

/**
 * 초과시간 설정 조회
 */
export async function fetchOvertimeSettings() {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('sa_overtime_settings')
    .select('dept_name, threshold_time, is_active')
    .eq('is_active', true);

  if (error) return {};

  const map = {};
  (data || []).forEach(s => {
    map[s.dept_name] = s.threshold_time; // "HH:MM:SS"
  });
  return map;
}

/**
 * 날짜별 근무일정 조정 조회
 */
export async function fetchScheduleOverrides(yearMonth) {
  const supabase = getAdminClient();
  const [year, month] = yearMonth.split('-');
  const lastDay = new Date(Number(year), Number(month), 0).getDate();
  const { data, error } = await supabase
    .from('sa_schedule_overrides')
    .select('emp_no, work_date, schedule_start, schedule_end, note')
    .gte('work_date', `${year}-${month}-01`)
    .lte('work_date', `${year}-${month}-${String(lastDay).padStart(2, '0')}`);

  if (error) return [];
  return data || [];
}

/**
 * 직원별 기본 출근시간 조회
 */
export async function fetchEmployeeSchedules() {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('sa_employee_schedules')
    .select('emp_no, schedule_time, updated_at, updated_by');

  if (error) return [];
  return data || [];
}

/**
 * 직원별 기본 출근시간 저장/삭제
 */
export async function saveEmployeeSchedules(entries, userId) {
  const supabase = getAdminClient();
  const payload = Array.isArray(entries)
    ? entries
    : Object.entries(entries || {}).map(([empNo, scheduleTime]) => ({ empNo, scheduleTime }));

  const rows = payload
    .map((item) => ({
      emp_no: item.empNo,
      schedule_time: String(item.scheduleTime || '').trim() || null,
      updated_by: userId || null,
      updated_at: new Date().toISOString(),
    }))
    .filter((row) => row.emp_no);

  const toUpsert = rows.filter((row) => row.schedule_time);
  const toDelete = rows.filter((row) => !row.schedule_time).map((row) => row.emp_no);

  if (toUpsert.length > 0) {
    const { error } = await supabase
      .from('sa_employee_schedules')
      .upsert(toUpsert, { onConflict: 'emp_no' });
    if (error) throw error;
  }

  if (toDelete.length > 0) {
    const { error } = await supabase
      .from('sa_employee_schedules')
      .delete()
      .in('emp_no', toDelete);
    if (error) throw error;
  }

  return true;
}

/**
 * 퇴근 시간 수정 저장
 */
export async function saveAttendanceCorrection({ empNo, workDate, correctedOutTime, reason, userId }) {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('sa_attendance_corrections')
    .upsert({
      emp_no: empNo,
      work_date: workDate,
      corrected_out_time: correctedOutTime,
      reason,
      corrected_by: userId,
      updated_at: new Date().toISOString()
    }, { onConflict: 'emp_no,work_date' })
    .select();
  if (error) throw error;
  return data;
}

export async function saveTeamSchedulePattern({ deptName, workDate, patternCode, patternName, scheduleStart, scheduleEnd, note, userId }) {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('sa_team_schedule_patterns')
    .upsert({
      dept_name: deptName,
      work_date: workDate,
      pattern_code: patternCode,
      pattern_name: patternName,
      schedule_start: scheduleStart || null,
      schedule_end: scheduleEnd || null,
      note: note || '',
      created_by: userId || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'dept_name,work_date' })
    .select();
  if (error) {
    if (String(error?.message || '').includes('sa_team_schedule_patterns') || error?.code === '42P01') {
      const tableError = new Error('팀 스케줄 테이블이 아직 준비되지 않았습니다. Supabase 마이그레이션을 적용한 뒤 다시 시도해 주세요.');
      tableError.code = 'MISSING_TEAM_SCHEDULE_TABLE';
      throw tableError;
    }
    throw error;
  }
  return data;
}

export async function fetchTeamSchedulePatterns({ deptName, from, to } = {}) {
  const supabase = getAdminClient();
  let query = supabase
    .from('sa_team_schedule_patterns')
    .select('dept_name, work_date, pattern_code, pattern_name, schedule_start, schedule_end, note, created_by, created_at, updated_at')
    .order('work_date', { ascending: true });

  if (deptName) {
    query = query.eq('dept_name', deptName);
  }
  if (from) {
    query = query.gte('work_date', from);
  }
  if (to) {
    query = query.lte('work_date', to);
  }

  const { data, error } = await query;
  if (error) {
    if (String(error?.message || '').includes('sa_team_schedule_patterns') || error?.code === '42P01') {
      return [];
    }
    throw error;
  }
  return data || [];
}

/**
 * 날짜별 근무일정 조정 저장
 */
export async function saveScheduleOverride({ empNo, workDate, scheduleStart, scheduleEnd, note, userId }) {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('sa_schedule_overrides')
    .upsert({
      emp_no: empNo,
      work_date: workDate,
      schedule_start: scheduleStart,
      schedule_end: scheduleEnd,
      note,
      created_by: userId,
    }, { onConflict: 'emp_no,work_date' })
    .select();
  if (error) throw error;
  return data;
}

export async function saveScheduleOverridesBatch({ empNo, workDates = [], scheduleStart, scheduleEnd, note, userId }) {
  const supabase = getAdminClient();
  const payload = (workDates || [])
    .map((workDate) => ({
      emp_no: empNo,
      work_date: workDate,
      schedule_start: scheduleStart,
      schedule_end: scheduleEnd,
      note: note || '',
      created_by: userId || null,
    }))
    .filter((row) => row.emp_no && row.work_date && row.schedule_start);

  if (payload.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('sa_schedule_overrides')
    .upsert(payload, { onConflict: 'emp_no,work_date' })
    .select();
  if (error) throw error;
  return data || [];
}

/**
 * 수동 출퇴근 등록
 */
/**
 * 날짜별 근무일정 예외 삭제
 */
export async function deleteScheduleOverride({ empNo, workDate }) {
  const supabase = getAdminClient();
  const { error } = await supabase
    .from('sa_schedule_overrides')
    .delete()
    .eq('emp_no', empNo)
    .eq('work_date', workDate);
  if (error) throw error;
  return true;
}

/**
 * 출입 로그 귀속 저장
 */
export async function saveAttendanceLogAdjustment({ attendanceId, empNo, workDate, adjustedRole, note, userId }) {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('sa_attendance_log_adjustments')
    .upsert({
      attendance_id: attendanceId,
      emp_no: empNo,
      work_date: workDate,
      adjusted_role: adjustedRole,
      note: note || '',
      adjusted_by: userId || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'attendance_id' })
    .select();
  if (error) {
    const message = String(error?.message || '').toLowerCase();
    const isMissingTable =
      error?.code === '42P01' ||
      message.includes('could not find the table') ||
      message.includes('relation "sa_attendance_log_adjustments" does not exist') ||
      message.includes('table "sa_attendance_log_adjustments" does not exist');

    if (isMissingTable) {
      const tableError = new Error('출입기록 귀속 테이블이 아직 Supabase에 반영되지 않았습니다. 마이그레이션을 적용한 뒤 schema cache를 새로고침해 주세요.');
      tableError.code = 'MISSING_ATTENDANCE_LOG_ADJUSTMENTS_TABLE';
      throw tableError;
    }
    throw error;
  }
  return data;
}

/**
 * 출입 로그 귀속 삭제
 */
export async function deleteAttendanceLogAdjustment({ attendanceId }) {
  const supabase = getAdminClient();
  const { error } = await supabase
    .from('sa_attendance_log_adjustments')
    .delete()
    .eq('attendance_id', attendanceId);
  if (error) {
    const message = String(error?.message || '').toLowerCase();
    const isMissingTable =
      error?.code === '42P01' ||
      message.includes('could not find the table') ||
      message.includes('relation "sa_attendance_log_adjustments" does not exist') ||
      message.includes('table "sa_attendance_log_adjustments" does not exist');

    if (isMissingTable) {
      const tableError = new Error('출입기록 귀속 테이블이 아직 Supabase에 반영되지 않았습니다. 마이그레이션을 적용한 뒤 schema cache를 새로고침해 주세요.');
      tableError.code = 'MISSING_ATTENDANCE_LOG_ADJUSTMENTS_TABLE';
      throw tableError;
    }
    throw error;
  }
  return true;
}

export async function deleteTeamSchedulePattern({ deptName, workDate }) {
  const supabase = getAdminClient();
  const { error } = await supabase
    .from('sa_team_schedule_patterns')
    .delete()
    .eq('dept_name', deptName)
    .eq('work_date', workDate);
  if (error) {
    if (String(error?.message || '').includes('sa_team_schedule_patterns') || error?.code === '42P01') {
      const tableError = new Error('팀 스케줄 테이블이 아직 준비되지 않았습니다. Supabase 마이그레이션을 적용한 뒤 다시 시도해 주세요.');
      tableError.code = 'MISSING_TEAM_SCHEDULE_TABLE';
      throw tableError;
    }
    throw error;
  }
  return true;
}

export async function saveManualCheckin({ empNo, checkType, checkTime, workDate, note }) {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('sa_manual_checkins')
    .insert({
      emp_no: empNo,
      check_type: checkType,
      check_time: checkTime,
      work_date: workDate,
      note
    })
    .select();
  if (error) throw error;
  return data;
}

/**
 * 수동 출퇴근 승인/반려 결정
 */
export async function decideManualCheckin({ id, decision, userId }) {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('sa_manual_checkins')
    .update({
      admin_decision: decision,
      decided_by: userId,
      decided_at: new Date().toISOString()
    })
    .eq('id', id)
    .select();
  if (error) throw error;
  return data;
}

/**
 * 휴일근무 대체휴가 시간 조회
 */
export async function fetchHolidayWork(yearMonth) {
  const supabase = getAdminClient();
  const [year, month] = yearMonth.split('-');
  const { data, error } = await supabase
    .from('sa_holiday_work')
    .select('emp_no, work_date, clock_in, clock_out, work_hours, comp_leave_hours, is_confirmed')
    .gte('work_date', `${year}-${month}-01`)
    .lte('work_date', `${year}-${month}-31`);

  if (error) return [];
  return data || [];
}

/**
 * 휴일근무 대체휴가 시간 등록/수정
 */
export async function saveHolidayWork({ empNo, workDate, clockIn, clockOut, workHours, compLeaveHours, isConfirmed, userId }) {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('sa_holiday_work')
    .upsert({
      emp_no: empNo,
      work_date: workDate,
      clock_in: clockIn,
      clock_out: clockOut,
      work_hours: workHours,
      comp_leave_hours: compLeaveHours,
      is_confirmed: isConfirmed,
      confirmed_by: userId,
      updated_at: new Date().toISOString()
    }, { onConflict: 'emp_no,work_date' })
    .select();
  if (error) throw error;
  return data;
}

/**
 * 초과시간 누적 기간 조회
 */
export async function fetchOvertimePeriods() {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('sa_overtime_periods')
    .select('id, name, start_date, end_date, note')
    .order('start_date', { ascending: false });

  if (error) return [];
  return data || [];
}

/**
 * 초과시간 누적 기간 등록
 */
export async function saveOvertimePeriod({ name, startDate, endDate, note, userId }) {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('sa_overtime_periods')
    .insert({
      name,
      start_date: startDate,
      end_date: endDate,
      note,
      created_by: userId
    })
    .select();
  if (error) throw error;
  return data;
}

/**
 * 초과시간 누적 기간 삭제
 */
export async function deleteOvertimePeriod(id) {
  const supabase = getAdminClient();
  const { error } = await supabase
    .from('sa_overtime_periods')
    .delete()
    .eq('id', id);
  if (error) throw error;
  return true;
}

/**
 * 초과시간 팀 설정 전체 업데이트
 */
export async function saveOvertimeSettings(deptName, thresholdTime, isActive) {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('sa_overtime_settings')
    .upsert({
      dept_name: deptName,
      threshold_time: thresholdTime,
      is_active: isActive,
      updated_at: new Date().toISOString()
    }, { onConflict: 'dept_name' })
    .select();
  if (error) throw error;
  return data;
}


/**
 * 직원별 초과근무 차수/기간 조회
 */
export async function fetchEmployeeOvertimeRounds() {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('sa_employee_overtime_rounds')
    .select('emp_no, round_name, start_date, end_date');
  if (error) {
    console.error('fetchEmployeeOvertimeRounds error:', error);
    return [];
  }
  return data || [];
}

/**
 * 직원별 초과근무 차수/기간 저장
 */
export async function saveEmployeeOvertimeRound({ empNo, roundName, startDate, endDate }) {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('sa_employee_overtime_rounds')
    .upsert({
      emp_no: empNo,
      round_name: roundName,
      start_date: startDate,
      end_date: endDate,
      updated_at: new Date().toISOString()
    }, { onConflict: 'emp_no' })
    .select();
  if (error) throw error;
  return data;
}

// ── 내부 유틸리티 ────────────────────────────────────────────────

function formatATime(aTime) {
  if (!aTime || aTime.length < 14) return new Date().toISOString().replace('T', ' ').substring(0, 19);
  return `${aTime.substring(0,4)}-${aTime.substring(4,6)}-${aTime.substring(6,8)} ` +
         `${aTime.substring(8,10)}:${aTime.substring(10,12)}:${aTime.substring(12,14)}`;
}

function flag1ToEventType(flag1) {
  if (flag1 === '1') return '출근';
  if (flag1 === '4') return '퇴근';
  return '출입';
}

export function getSettings() {
  try {
    const settingsPath = require('path').join(process.cwd(), 'secom-settings.json');
    if (require('fs').existsSync(settingsPath)) {
      const data = require('fs').readFileSync(settingsPath, 'utf8');
      const parsed = JSON.parse(data);
      return {
        appMode: 'supabase',
        employeeSchedules: parsed.employeeSchedules || {},
      };
    }
  } catch (err) {
    console.error('supabaseDb getSettings error:', err);
  }
  return {
    appMode: 'supabase',
    employeeSchedules: {},
  };
}
