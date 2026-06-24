const fs = require('fs');

const path = 'src/components/tabs/ScheduleTab.js';
const lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);

const setLine = (lineNo, value) => {
  lines[lineNo - 1] = value;
};

setLine(179, '        alert(`${targetDates.length}개 날짜의 근무일정이 저장되었습니다.`);');
setLine(187, "        alert(failed.error || '근무일정 저장에 실패했습니다.');");
setLine(190, "      alert('저장 중 오류가 발생했습니다.');");

setLine(201, '    const confirmMsg = targetDates.length > 1');
setLine(202, '      ? `${targetDates.length}개의 근무일정 조정을 삭제하시겠습니까?`');
setLine(203, "      : '해당 날짜의 근무일정 조정을 삭제하시겠습니까?';");
setLine(219, '        alert(`${targetDates.length}개 날짜의 근무일정 조정이 삭제되었습니다.`);');
setLine(227, "        alert(failed.error || '근무일정 조정 삭제에 실패했습니다.');");
setLine(230, "      alert('삭제 중 오류가 발생했습니다.');");

setLine(239, '            <h3 className="card-title">근무일정 관리</h3>');
setLine(240, '            <p className="card-subtitle">직원별 기본 근무시간과 날짜별 조정을 관리합니다.</p>');
setLine(247, '            }} title="이전 월">');
setLine(257, '            }} title="다음 월">');
setLine(271, '            <div className="form-label">직원 검색</div>');
setLine(278, '                placeholder="이름 / 사번 / 부서 검색"');
setLine(285, '            <div className="form-label">직원 선택</div>');
setLine(300, '                <option value="">선택 가능한 직원이 없습니다</option>');
setLine(303, '                  <option key={emp.empNo} value={emp.empNo}>{emp.name} ({emp.empNo}) · {emp.dept}</option>');
setLine(310, '            <div className="form-label">기본 출근 시간</div>');
setLine(322, "                <option key={time} value={time}>{time}{time === '08:00' ? ' (기본)' : ''}</option>");
setLine(334, "            {isScheduleSaving ? <RefreshCw style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} /> : '기본일정 저장'}");

setLine(342, '              <h3 className="card-title">{selectedMonth} 근무일정</h3>');
setLine(343, '              <p className="card-subtitle">날짜를 여러 개 선택하면 같은 근무시간을 한 번에 적용할 수 있습니다.</p>');
setLine(346, '              <span className="legend-pill"><span className="calendar-widget__legend-swatch" style={{ background: "var(--amber)" }} />개별 조정</span>');
setLine(347, '              <span className="legend-pill"><span className="calendar-widget__legend-swatch" style={{ background: "var(--red)" }} />오늘</span>');
setLine(352, "            {['일', '월', '화', '수', '목', '금', '토'].map((day, idx) => (");
setLine(390, '                      {isToday && <span className="calendar-day__state-tag is-today-tag">오늘</span>}');
setLine(392, '                        <span className="calendar-day__state-tag is-override-tag">조정</span>');
setLine(403, '                          초과근무 비허용');
setLine(410, '                        <span className="calendar-day__time-main is-in">출근 {displayStart}</span>');
setLine(411, '                        <span className="calendar-day__time-main is-out">퇴근 {displayEnd}</span>');
setLine(414, '                        <span className="calendar-day__leave-more">{override?.note || \'상세 조정\'}</span>');

setLine(426, '            <h3 className="card-title">일자별 세부 조정</h3>');
setLine(427, '            <p className="card-subtitle">직원을 먼저 선택해주세요.</p>');
setLine(432, '              <span>선택 일자</span>');
setLine(436, '              <span>현재 기본 시간</span>');
setLine(440, '              <span>등록된 조정</span>');
setLine(447, '              <div className="form-label">적용 일자</div>');
setLine(470, '              <div className="form-label">출근 기준 시각</div>');
setLine(502, '              초과근무 허용');
setLine(506, '              <div className="form-label">퇴근 기준 시각</div>');
setLine(520, '              <div className="form-label">사유 / 메모</div>');
setLine(526, '                placeholder="예: 교육 참석, 현장 조정, 조기 출근 조정"');
setLine(539, '                  삭제');
setLine(556, '                선택 해제');
setLine(564, "                {scheduleSelectedDates.length > 1 ? `${scheduleSelectedDates.length}개 날짜 조정 저장` : '조정 저장'}");

fs.writeFileSync(path, lines.join('\n'), 'utf8');

