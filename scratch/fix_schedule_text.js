const fs = require('fs');

const path = 'src/components/tabs/ScheduleTab.js';
let lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);

const replaceFirst = (predicate, nextLine) => {
  const idx = lines.findIndex(predicate);
  if (idx >= 0) lines[idx] = nextLine;
};

replaceFirst((l) => l.includes('吏곸썝 寃') && l.includes('form-label'), '            <div className="form-label">직원 검색</div>');
replaceFirst((l) => l.includes('placeholder="?대쫫'), '                placeholder="이름 / 사번 / 부서 검색"');
replaceFirst((l) => l.includes('吏곸썝 ?좏깮') && l.includes('form-label'), '            <div className="form-label">직원 선택</div>');
replaceFirst((l) => l.includes('媛?ν븳 吏곸썝'), '              <option value="">선택 가능한 직원이 없습니다</option>');
replaceFirst((l) => l.includes('({emp.empNo})') && l.includes('dept'), '                  <option key={emp.empNo} value={emp.empNo}>{emp.name} ({emp.empNo}) · {emp.dept}</option>');
replaceFirst((l) => l.includes('湲곕낯 異쒓렐 ?쒓컙'), '            <div className="form-label">기본 출근 시간</div>');
replaceFirst((l) => l.includes("time === '08:00'"), "                <option key={time} value={time}>{time}{time === '08:00' ? ' (기본)' : ''}</option>");
replaceFirst((l) => l.includes('湲곕낯?쇱젙 ???'), "            {isScheduleSaving ? <RefreshCw style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} /> : '기본일정 저장'}");
replaceFirst((l) => l.includes('selectedMonth') && l.includes('????'), '              <h3 className="card-title">{selectedMonth} 근무일정</h3>');
replaceFirst((l) => l.includes('?좎쭨瑜??щ윭') || l.includes('날짜를 여러 개 선택'), '              <p className="card-subtitle">날짜를 여러 개 선택하면 같은 근무시간을 한 번에 적용할 수 있습니다.</p>');
replaceFirst((l) => l.includes('legend-pill') && l.includes('媛쒕퀎') || l.includes('legend-pill') && l.includes('개별 조정'), '              <span className="legend-pill"><span className="calendar-widget__legend-swatch" style={{ background: "var(--amber)" }} />개별 조정</span>');
replaceFirst((l) => l.includes('legend-pill') && l.includes('오늘') || l.includes('legend-pill') && l.includes('?ㅻ뒛'), '              <span className="legend-pill"><span className="calendar-widget__legend-swatch" style={{ background: "var(--red)" }} />오늘</span>');
replaceFirst((l) => l.includes("{['") && l.includes('map('), "            {['일', '월', '화', '수', '목', '금', '토'].map((day, idx) => (");
replaceFirst((l) => l.includes('calendar-day__state-tag is-today-tag'), '                      {isToday && <span className="calendar-day__state-tag is-today-tag">오늘</span>}');
replaceFirst((l) => l.includes('calendar-day__state-tag is-override-tag'), '                        <span className="calendar-day__state-tag is-override-tag">조정</span>');
replaceFirst((l) => l.includes('珥덇낵鍮꾪뿀'), '                          초과금지');
replaceFirst((l) => l.includes('calendar-day__time-main is-in') && l.includes('??'), '                        <span className="calendar-day__time-main is-in">출근 {displayStart}</span>');
replaceFirst((l) => l.includes('calendar-day__time-main is-out') && l.includes('??'), '                        <span className="calendar-day__time-main is-out">퇴근 {displayEnd}</span>');
replaceFirst((l) => l.includes('calendar-day__leave-more') && l.includes('?? ??'), '                        <span className="calendar-day__leave-more">{override?.note || \'상세 조정\'}</span>');
replaceFirst((l) => l.includes('card-title') && l.includes('?쇱옄蹂'), '            <h3 className="card-title">세부 조정</h3>');
replaceFirst((l) => l.includes('card-subtitle') && l.includes('吏곸썝') || l.includes('직원을 먼저 선택'), '            <p className="card-subtitle">직원을 먼저 선택해주세요.</p>');
replaceFirst((l) => l.includes('?좏깮 ?쇱옄') || l.includes('선택 일자'), '              <span>선택 일자</span>');
replaceFirst((l) => l.includes('?꾩옱 湲곕낯') || l.includes('현재 기본 시간'), '              <span>현재 기본 시간</span>');
replaceFirst((l) => l.includes('?깅줉??議곗젙') || l.includes('등록된 조정'), '              <span>등록된 조정</span>');
replaceFirst((l) => l.includes('嫄?/strong>') || l.includes('건</strong>'), '              <strong>{selectedOverrides.length}건</strong>');
replaceFirst((l) => l.includes('?곸슜 ?쇱옄') || l.includes('적용 일자'), '              <div className="form-label">적용 일자</div>');
replaceFirst((l) => l.includes('異쒓렐 湲곗?') || l.includes('출근 기준 시각'), '              <div className="form-label">출근 기준 시각</div>');
replaceFirst((l) => l.includes('珥덇낵洹쇰Т ?덉슜') || l.includes('초과근무 허용'), '              초과근무 허용');
replaceFirst((l) => l.includes('?닿렐 湲곗?') || l.includes('퇴근 기준 시각'), '              <div className="form-label">퇴근 기준 시각</div>');
replaceFirst((l) => l.includes('?ъ쑀 / 硫붾え') || l.includes('사유 / 메모'), '              <div className="form-label">사유 / 메모</div>');
replaceFirst((l) => l.includes('예: 교육 참석') || l.includes('議곌린 異쒓렐'), '                placeholder="예: 교육 참석, 현장 일정, 조기 출근 조정"');
replaceFirst((l) => l.includes('??젣') || l.includes('삭제'), '                  삭제');
replaceFirst((l) => l.includes('?좏깮 ?댁젣') || l.includes('선택 해제'), '                선택 해제');
replaceFirst((l) => l.includes('媛??쇱옄 ???') || l.includes('개 일자 저장'), "                {scheduleSelectedDates.length > 1 ? `${scheduleSelectedDates.length}개 일자 저장` : '일자별 조정 저장'}");

// Fix lingering garbled text in the top section.
lines = lines.map((line) => {
  if (line.includes('?좎쭨瑜??좏깮?섏꽭??')) return line.replace(/.*\?좎쭨瑜.*$/, "    ? '날짜를 선택해주세요'");
  if (line.includes('媛??좎쭨 ?좏깮')) return "      : `${scheduleSelectedDates.length}개 날짜 선택`;";
  if (line.includes('?ㅻ뒛') && line.includes('is-today-tag')) return '                      {isToday && <span className="calendar-day__state-tag is-today-tag">오늘</span>}';
  if (line.includes('議곗젙</span>') && line.includes('is-override-tag')) return '                        <span className="calendar-day__state-tag is-override-tag">조정</span>';
  return line;
});

fs.writeFileSync(path, lines.join('\n'), 'utf8');
