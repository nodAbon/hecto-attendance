const fs = require('fs');

const path = 'src/components/tabs/ScheduleTab.js';
const lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);

const block = [
  '                    </div>',
  '                  {showSchedule ? (',
  '                    <>',
  '                      <div className="calendar-day__time-block">',
  '                        <span className="calendar-day__time-main is-in">출근 {displayStart}</span>',
  '                        <span className="calendar-day__time-main is-out">퇴근 {displayEnd}</span>',
  '                      </div>',
  '                      <div className="calendar-day__leave-list">',
  '                        <span className="calendar-day__leave-more">{override?.note || \'상세 조정\'}</span>',
  '                      </div>',
  '                    </>',
  '                  ) : null}',
];

lines.splice(404, 12, ...block);
fs.writeFileSync(path, lines.join('\n'), 'utf8');

