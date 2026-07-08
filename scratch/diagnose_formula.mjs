/**
 * 진단 스크립트: 잔여조정 계산 공식 비교
 * 
 * OLD 방식: 주별로 근무시간 합산 → 주 평균 → 40시간 대비 잔여분
 * NEW 방식(내가 변경한): 일별 scheduleDeviation + overtimeMinutes 누적합 → 시간으로 변환
 * 
 * 어떤 방식이 ~24를 주는지 확인
 */

const BASE_URL = 'http://localhost:3000';

// 윤현필, 이동규
const TARGET_EMPLOYEES = [
  { name: '윤현필', empNo: null },
  { name: '이동규', empNo: null },
];

const ROUND_START = '2026-04-01';
const ROUND_END = '2026-06-26';

const getLocalDate = (dateStr) => new Date(`${dateStr}T00:00:00+09:00`);
const toDateOnly = (date) => {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60 * 1000).toISOString().split('T')[0];
};

const toMinutes = (value = '') => {
  const match = String(value || '').trim().match(/^(\d{2}):(\d{2})/);
  if (!match) return null;
  return (Number(match[1]) * 60) + Number(match[2]);
};

const getTimePart = (value) => {
  const text = String(value || '').trim();
  if (!text) return '';
  const timeText = text.includes(' ') ? text.split(' ')[1] : text.includes('T') ? text.split('T')[1] : text;
  return timeText ? timeText.substring(0, 5) : '';
};

const getScheduleDurationMinutes = (start, end) => {
  const startMinutes = toMinutes(start);
  const endMinutes = toMinutes(end);
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) return 0;
  let duration = endMinutes - startMinutes;
  if (duration < 0) duration += 24 * 60;
  return Math.max(0, duration);
};

const getAdjustmentMinutes = ({ scheduleEnd = '', actualOut = '' } = {}) => {
  const endMinutes = toMinutes(scheduleEnd);
  let outMinutes = toMinutes(actualOut);
  if (!Number.isFinite(endMinutes) || !Number.isFinite(outMinutes)) return 0;
  if (endMinutes >= 12 * 60 && outMinutes < 6 * 60) {
    outMinutes += 24 * 60;
  }
  if (outMinutes <= endMinutes) return 0;
  return outMinutes - endMinutes;
};

const clampToHalfHourSteps = (minutes) => {
  if (!minutes || minutes <= 0) return 0;
  return Math.floor(minutes / 30) * 30;
};

const isWeekendDate = (dateStr) => {
  const date = new Date(`${dateStr}T00:00:00+09:00`);
  const day = date.getDay();
  return day === 0 || day === 6;
};

async function fetchMonthData(month, empNo) {
  const url = empNo
    ? `${BASE_URL}/api/attendance?month=${month}&empNo=${empNo}`
    : `${BASE_URL}/api/attendance?month=${month}`;
  const res = await fetch(url);
  const json = await res.json();
  return json.success ? json : null;
}

function getPeriodMonths(startDate, endDate) {
  const start = getLocalDate(startDate);
  const end = getLocalDate(endDate);
  const months = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const endCursor = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cursor <= endCursor) {
    months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

async function main() {
  console.log('=== 잔여조정 계산 공식 진단 ===\n');
  
  const months = getPeriodMonths(ROUND_START, ROUND_END);
  console.log(`기간: ${ROUND_START} ~ ${ROUND_END}`);
  console.log(`조회 월: ${months.join(', ')}\n`);

  // 먼저 직원 목록 조회
  const firstMonthData = await fetchMonthData(months[months.length - 1]);
  if (!firstMonthData) {
    console.error('데이터 조회 실패');
    return;
  }

  // 직원 목록에서 대상 찾기
  const allEmployees = firstMonthData.allEmployees || [];
  for (const target of TARGET_EMPLOYEES) {
    const emp = allEmployees.find(e => e.name === target.name);
    if (emp) {
      target.empNo = emp.empNo || emp.emp_no;
      target.dept = emp.dept;
      target.baseScheduleTime = emp.baseScheduleTime || emp.scheduleTime || '08:00';
      target.baseScheduleEndTime = emp.baseScheduleEndTime || emp.scheduleEndTime || '';
    }
  }

  // overtimeRounds 확인
  const overtimeRounds = firstMonthData.overtimeRounds || [];
  console.log('초과근무 라운드 데이터:');
  for (const target of TARGET_EMPLOYEES) {
    const round = overtimeRounds.find(r => String(r.emp_no).trim() === String(target.empNo).trim());
    if (round) {
      target.roundStart = round.start_date;
      target.roundEnd = round.end_date;
      console.log(`  ${target.name}: ${round.start_date} ~ ${round.end_date} (${round.round_name})`);
    } else {
      target.roundStart = ROUND_START;
      target.roundEnd = ROUND_END;
      console.log(`  ${target.name}: 라운드 없음 (기본값 ${ROUND_START}~${ROUND_END} 사용)`);
    }
  }
  console.log('');

  // 전체 월 데이터 로드 - 모든 직원의 라운드 기간에 필요한 월 수집
  const allMonthsNeeded = new Set();
  for (const target of TARGET_EMPLOYEES) {
    if (!target.roundStart || !target.roundEnd) continue;
    const empMonths = getPeriodMonths(target.roundStart, target.roundEnd);
    empMonths.forEach(m => allMonthsNeeded.add(m));
  }
  const allMonthsSorted = Array.from(allMonthsNeeded).sort();
  console.log(`필요한 전체 월: ${allMonthsSorted.join(', ')}`);

  const allData = [];
  for (const month of allMonthsSorted) {
    const data = await fetchMonthData(month);
    if (data) allData.push(data);
    else console.warn(`  ${month} 데이터 로드 실패`);
  }

  // 로그/오버라이드/등 합산
  const mergeUnique = (items, keyFn) => {
    const map = new Map();
    items.forEach(item => {
      const key = keyFn(item);
      if (key && !map.has(key)) map.set(key, item);
    });
    return Array.from(map.values());
  };

  const allLogs = mergeUnique(
    allData.flatMap(d => d.allLogs || []),
    log => String(log?.id || `${log?.empNo}_${log?.logTime}_${log?.gateName}_${log?.eventType}`)
  );
  const allCorrections = mergeUnique(
    allData.flatMap(d => d.corrections || []),
    c => `${c?.emp_no}_${c?.work_date}`
  );
  const allOverrides = mergeUnique(
    allData.flatMap(d => d.overrides || []),
    o => `${o?.emp_no}_${o?.work_date}`
  );
  const allTeamPatterns = mergeUnique(
    allData.flatMap(d => d.teamSchedulePatterns || []),
    p => `${p?.dept_name}_${p?.pattern_date}`
  );
  const allLeaves = mergeUnique(
    allData.flatMap(d => d.leaves || []),
    l => `${l?.empNo}_${l?.startDate}_${l?.endDate}_${l?.leaveCode}`
  );

  console.log(`총 로그 수: ${allLogs.length}`);
  console.log(`총 보정 수: ${allCorrections.length}`);
  console.log(`총 오버라이드 수: ${allOverrides.length}`);
  console.log(`총 팀패턴 수: ${allTeamPatterns.length}`);
  console.log(`총 휴가 수: ${allLeaves.length}`);
  console.log('');

  for (const target of TARGET_EMPLOYEES) {
    if (!target.empNo) continue;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`직원: ${target.name} (${target.empNo}), 부서: ${target.dept}`);
    console.log(`기본 스케줄: ${target.baseScheduleTime} ~ ${target.baseScheduleEndTime || '(추정)'}`);
    console.log(`라운드 기간: ${target.roundStart} ~ ${target.roundEnd}`);
    console.log(`${'='.repeat(60)}`);

    const empNo = target.empNo;
    const dept = target.dept || '';

    // 보정 맵
    const correctionMap = new Map();
    allCorrections.forEach(c => {
      correctionMap.set(`${c.emp_no}_${c.work_date}`, c.corrected_out_time);
    });

    // 오버라이드 맵
    const overrideMap = new Map();
    allOverrides.forEach(row => {
      const key = `${String(row.emp_no || '').trim()}_${String(row.work_date || '').trim()}`;
      const note = String(row.note || '').trim();
      overrideMap.set(key, {
        scheduleStart: String(row.schedule_start || '').trim().substring(0, 5),
        scheduleEnd: String(row.schedule_end || '').trim().substring(0, 5),
        allowOvertime: row.allow_overtime !== false,
        note,
        removed: note === '__SCHEDULE_REMOVED__',
        derivedMonthly: note.includes('__MONTHLY_'),
      });
    });

    // 팀 패턴 맵
    const teamPatternMap = new Map();
    allTeamPatterns.forEach(row => {
      const deptKey = String(row.dept_name || '').trim().replace(/\s+/g, '');
      const dateKey = String(row.pattern_date || row.work_date || '').trim();
      if (deptKey && dateKey) {
        teamPatternMap.set(`${deptKey}_${dateKey}`, {
          scheduleStart: String(row.schedule_start || '').trim().substring(0, 5),
          scheduleEnd: String(row.schedule_end || '').trim().substring(0, 5),
        });
      }
    });

    // 일별 로그
    const dailyLogs = {};
    allLogs
      .filter(log => log.empNo === empNo && log.workDate >= target.roundStart && log.workDate <= target.roundEnd)
      .forEach(log => {
        if (!dailyLogs[log.workDate]) dailyLogs[log.workDate] = [];
        dailyLogs[log.workDate].push(log);
      });

    // 일별 휴가
    const getLeaveForDate = (dateStr) => {
      const dateCompact = dateStr.replace(/-/g, '');
      return allLeaves.find(l => l.empNo === empNo && dateCompact >= l.startDate && dateCompact <= l.endDate) || null;
    };

    const getLeaveWorkedMinutes = (leave) => {
      if (!leave) return 0;
      const leaveDays = parseFloat(leave.leaveDays || '0');
      if (leave.leaveCode === '12' || leave.leaveCode === '60' || leaveDays >= 1.0) return 8 * 60;
      if (leave.leaveCode === '16' || leave.leaveCode === '17' || leave.leaveCode === '61' || leave.leaveCode === '62' || leaveDays === 0.5) return 4 * 60;
      return 2 * 60;
    };

    // resolveSchedulePairForDate 간이 구현
    const resolveSchedule = (dateStr, override, teamPattern) => {
      if (override?.removed) return null;
      
      // 오버라이드 우선 적용
      if (override?.scheduleStart) {
        const start = override.scheduleStart || '08:00';
        const end = override.scheduleEnd || '';
        return { start, end: end || inferEnd(start), source: 'override' };
      }

      if (isWeekendDate(dateStr)) return null;

      // 팀 패턴
      if (teamPattern?.scheduleStart) {
        return { start: teamPattern.scheduleStart, end: teamPattern.scheduleEnd || inferEnd(teamPattern.scheduleStart), source: 'team-pattern' };
      }

      // 베이스 스케줄
      const start = target.baseScheduleTime || '08:00';
      const end = target.baseScheduleEndTime || inferEnd(start);
      if (!end) return null;
      return { start, end, source: 'base' };
    };

    const inferEnd = (start) => {
      if (start === '10:00') return '19:00';
      if (start === '08:00') return '17:00';
      if (start === '09:00') return '18:00';
      const startMin = toMinutes(start);
      if (startMin !== null) {
        const endMin = startMin + 9 * 60; // 9시간 (8시간 근무 + 1시간 점심)
        const h = Math.floor(endMin / 60) % 24;
        const m = endMin % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      }
      return '17:00';
    };

    const resolveAllowOvertime = (schedule, override) => {
      if (!schedule) return false;
      if (override?.removed) return false;
      if (override && !override.derivedMonthly) {
        return Boolean(override.allowOvertime);
      }
      return schedule.start === '10:00' && schedule.end === '19:00';
    };

    // ========== OLD 방식: 주별 평균 ==========
    const dayTotals_old = new Map();
    const start = getLocalDate(target.roundStart);
    const end = getLocalDate(target.roundEnd);

    for (let day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
      const dateStr = toDateOnly(day);
      const override = overrideMap.get(`${empNo}_${dateStr}`) || null;
      const teamPattern = teamPatternMap.get(`${dept.replace(/\s+/g, '')}_${dateStr}`) || null;
      const schedulePair = resolveSchedule(dateStr, override, teamPattern);
      const leave = getLeaveForDate(dateStr);
      const leaveWorkedMinutes = getLeaveWorkedMinutes(leave);
      const allowOT = resolveAllowOvertime(schedulePair, override);

      const dayLogs = (dailyLogs[dateStr] || []).slice().sort((a, b) =>
        String(a.logTime || '').localeCompare(String(b.logTime || ''))
      );

      const scheduleMinutes = schedulePair
        ? Math.max(0, getScheduleDurationMinutes(schedulePair.start, schedulePair.end) - 60)
        : 0;

      let dayTotalMinutes = 0;
      if (schedulePair) {
        dayTotalMinutes = scheduleMinutes;
        const firstLog = dayLogs[0];
        const correctedOut = correctionMap.get(`${empNo}_${dateStr}`);
        const inTime = firstLog ? getTimePart(firstLog.logTime) : '';
        let outTime = null;

        if (correctedOut) {
          outTime = new Date(correctedOut).toLocaleTimeString('ko-KR', { hour12: false }).substring(0, 5);
        } else if (dayLogs.length >= 2 && firstLog) {
          const lastLog = dayLogs[dayLogs.length - 1];
          if (lastLog && lastLog.logTime !== firstLog.logTime) {
            outTime = getTimePart(lastLog.logTime);
          }
        }

        if (inTime && outTime && allowOT) {
          const overtimeMinutes = getAdjustmentMinutes({
            scheduleEnd: schedulePair.end,
            actualOut: outTime,
          });
          dayTotalMinutes += clampToHalfHourSteps(overtimeMinutes);
        }

        dayTotalMinutes = Math.min(24 * 60, dayTotalMinutes + leaveWorkedMinutes);
      } else {
        dayTotalMinutes = Math.min(24 * 60, dayTotalMinutes + leaveWorkedMinutes);
      }

      dayTotals_old.set(dateStr, dayTotalMinutes);
    }

    // 주별 합산 (OLD)
    const weeklyTotals = [];
    for (let periodStart = new Date(start); periodStart <= end; periodStart.setDate(periodStart.getDate() + 7)) {
      const periodEnd = new Date(periodStart);
      periodEnd.setDate(periodEnd.getDate() + 6);
      let weekMinutes = 0;
      for (let day = new Date(periodStart); day <= periodEnd && day <= end; day.setDate(day.getDate() + 1)) {
        const dateStr = toDateOnly(day);
        weekMinutes += Number(dayTotals_old.get(dateStr) || 0);
      }
      weeklyTotals.push(weekMinutes);
    }

    const totalWorkMinutes_old = weeklyTotals.reduce((sum, m) => sum + m, 0);
    const averageWeeklyMinutes_old = weeklyTotals.length > 0
      ? Math.round(totalWorkMinutes_old / weeklyTotals.length)
      : 0;
    const residualMinutes_old = averageWeeklyMinutes_old - (40 * 60);

    // ========== NEW 방식: scheduleDeviation + overtimeMinutes 누적 ==========
    let totalAdjustmentMinutes_new = 0;
    let totalWorkMinutes_new = 0;
    let scheduledDaysCount = 0;

    for (let day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
      const dateStr = toDateOnly(day);
      const override = overrideMap.get(`${empNo}_${dateStr}`) || null;
      const teamPattern = teamPatternMap.get(`${dept.replace(/\s+/g, '')}_${dateStr}`) || null;
      const schedulePair = resolveSchedule(dateStr, override, teamPattern);
      const allowOT = resolveAllowOvertime(schedulePair, override);

      if (!schedulePair) {
        const isWeekend = day.getDay() === 0 || day.getDay() === 6;
        if (!isWeekend) {
          totalAdjustmentMinutes_new += -480;
        }
        continue;
      }

      scheduledDaysCount++;

      const dayLogs = (dailyLogs[dateStr] || []).slice().sort((a, b) =>
        String(a.logTime || '').localeCompare(String(b.logTime || ''))
      );

      const scheduleMinutes = Math.max(0, getScheduleDurationMinutes(schedulePair.start, schedulePair.end) - 60);
      const scheduleDeviation = scheduleMinutes - 480;

      let overtimeMinutes = 0;
      if (allowOT) {
        const firstLog = dayLogs[0];
        const correctedOut = correctionMap.get(`${empNo}_${dateStr}`);
        let outTime = null;

        if (correctedOut) {
          outTime = new Date(correctedOut).toLocaleTimeString('ko-KR', { hour12: false }).substring(0, 5);
        } else if (dayLogs.length >= 2 && firstLog) {
          const lastLog = dayLogs[dayLogs.length - 1];
          if (lastLog && lastLog.logTime !== firstLog.logTime) {
            outTime = getTimePart(lastLog.logTime);
          }
        }

        if (outTime) {
          const rawOvertime = getAdjustmentMinutes({
            scheduleEnd: schedulePair.end,
            actualOut: outTime,
          });
          overtimeMinutes = clampToHalfHourSteps(rawOvertime);
        }
      }

      totalAdjustmentMinutes_new += (scheduleDeviation + overtimeMinutes);
      totalWorkMinutes_new += (scheduleMinutes + overtimeMinutes);
    }

    const averageWeeklyMinutes_new = scheduledDaysCount > 0
      ? Math.round((totalWorkMinutes_new / scheduledDaysCount) * 5)
      : 0;
    const totalAdjustments_new = Math.round((totalAdjustmentMinutes_new / 60) * 2) / 2;

    // ========== 결과 출력 ==========
    console.log(`\n--- OLD 방식 (주별 평균) ---`);
    console.log(`  주별 근무시간:`);
    weeklyTotals.forEach((wm, i) => {
      console.log(`    ${i + 1}주차: ${(wm / 60).toFixed(1)}시간 (${wm}분)`);
    });
    console.log(`  총 근무시간: ${(totalWorkMinutes_old / 60).toFixed(1)}시간`);
    console.log(`  주 수: ${weeklyTotals.length}`);
    console.log(`  주간 평균 근무시간: ${(averageWeeklyMinutes_old / 60).toFixed(1)}시간 (${averageWeeklyMinutes_old}분)`);
    console.log(`  잔여조정(분): ${residualMinutes_old}분`);
    console.log(`  잔여조정(시간): ${(residualMinutes_old / 60).toFixed(1)}시간`);
    console.log(`  formatDuration: ${residualMinutes_old > 0 ? '초과' : '부족'} ${Math.floor(Math.abs(residualMinutes_old) / 60)}시간 ${String(Math.abs(residualMinutes_old) % 60).padStart(2, '0')}분`);

    console.log(`\n--- NEW 방식 (일별 deviation 누적) ---`);
    console.log(`  스케줄 있는 근무일 수: ${scheduledDaysCount}`);
    console.log(`  총 근무시간: ${(totalWorkMinutes_new / 60).toFixed(1)}시간`);
    console.log(`  주간 평균 근무시간: ${(averageWeeklyMinutes_new / 60).toFixed(1)}시간 (${averageWeeklyMinutes_new}분)`);
    console.log(`  총 조정 분: ${totalAdjustmentMinutes_new}분`);
    console.log(`  잔여조정: ${totalAdjustments_new > 0 ? '+' : ''}${totalAdjustments_new.toFixed(1)}`);

    // 일별 상세
    console.log(`\n--- 일별 상세 (주요 차이만) ---`);
    let dayCount = 0;
    for (let day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
      const dateStr = toDateOnly(day);
      const override = overrideMap.get(`${empNo}_${dateStr}`) || null;
      const teamPattern = teamPatternMap.get(`${dept.replace(/\s+/g, '')}_${dateStr}`) || null;
      const schedulePair = resolveSchedule(dateStr, override, teamPattern);
      const oldTotal = dayTotals_old.get(dateStr) || 0;
      const isWeekend = day.getDay() === 0 || day.getDay() === 6;
      
      // 차이가 있는 날만 출력
      if (!schedulePair && !isWeekend) {
        console.log(`  ${dateStr}: NO_SCHEDULE (평일) - OLD: ${oldTotal}분, NEW: -480분(deviation)`);
        dayCount++;
      } else if (schedulePair) {
        const sMin = Math.max(0, getScheduleDurationMinutes(schedulePair.start, schedulePair.end) - 60);
        if (sMin !== 480) {
          console.log(`  ${dateStr}: 스케줄 ${schedulePair.start}~${schedulePair.end} (${sMin}분, deviation=${sMin-480}), OLD dayTotal=${oldTotal}분, source=${schedulePair.source}`);
          dayCount++;
        }
      }
      if (dayCount > 30) {
        console.log('  ... (이하 생략)');
        break;
      }
    }
  }
}

main().catch(console.error);
