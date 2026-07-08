import fs from 'fs';
import path from 'path';

const filePath = 'c:\\Users\\Owner\\Documents\\Antigravity\\agitated-raman\\src\\components\\tabs\\MonthlyTab.js';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Map start replacement
const mapStartTarget = `              {allEmps.map(emp => (
                <tr key={emp.empNo}>`;

const mapStartReplacement = `              {allEmps.map(emp => {
                const empKey = normalizeEmpNoKey(emp.empNo);
                const overtimeRound = (monthlyData?.overtimeRounds || []).find((row) => normalizeEmpNoKey(row.emp_no || '') === empKey);
                
                const getEndingSoonLabel = () => {
                  if (!overtimeRound?.end_date) return null;
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const end = new Date(overtimeRound.end_date);
                  end.setHours(0, 0, 0, 0);
                  const diffTime = end.getTime() - today.getTime();
                  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                  if (diffDays >= 0 && diffDays <= 14) {
                    return diffDays === 0 ? 'D-Day' : \`D-\${diffDays}\`;
                  }
                  return null;
                };
                const overtimeDDay = getEndingSoonLabel();

                return (
                  <tr key={emp.empNo} style={overtimeDDay ? { background: 'rgba(245, 158, 11, 0.04)' } : undefined}>`;

// 2. Name cell style replacement
const nameCellTarget = `                      <td
                        key={\`\${emp.empNo}-name\`}
                        rowSpan={1}
                        style={{
                          position: 'sticky',
                          left: 0,
                          background: 'var(--bg-card)',
                          zIndex: 12,
                          fontWeight: 700,
                          borderRight: '1px solid var(--border)',
                          boxShadow: '6px 0 14px -14px rgba(15, 23, 42, 0.28)',
                          paddingLeft: '8px',
                          paddingRight: '8px',
                          overflow: 'hidden',
                        }}
                      >`;

const nameCellReplacement = `                      <td
                        key={\`\${emp.empNo}-name\`}
                        rowSpan={1}
                        style={{
                          position: 'sticky',
                          left: 0,
                          background: overtimeDDay ? 'linear-gradient(90deg, rgba(245, 158, 11, 0.12), rgba(245, 158, 11, 0.04))' : 'var(--bg-card)',
                          zIndex: 12,
                          fontWeight: 700,
                          borderRight: '1px solid var(--border)',
                          borderLeft: overtimeDDay ? '4px solid var(--amber)' : undefined,
                          boxShadow: '6px 0 14px -14px rgba(15, 23, 42, 0.28)',
                          paddingLeft: overtimeDDay ? '4px' : '8px',
                          paddingRight: '8px',
                          overflow: 'hidden',
                        }}
                      >`;

// 3. Name label badge replacement
const nameLabelTarget = `                          <span style={{ color: 'var(--text-1)', fontSize: 13.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
                            {emp.name}
                          </span>`;

const nameLabelReplacement = `                          <span style={{ color: 'var(--text-1)', fontSize: 13.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                            {emp.name}
                            {overtimeDDay && (
                              <span style={{
                                fontSize: '9px',
                                fontWeight: 800,
                                background: 'var(--amber)',
                                color: '#fff',
                                padding: '1px 4px',
                                borderRadius: '4px',
                                display: 'inline-block',
                                border: '1px solid rgba(255,255,255,0.2)',
                                boxShadow: '0 2px 4px rgba(245,158,11,0.2)'
                              }}>
                                {overtimeDDay}
                              </span>
                            )}
                          </span>`;

// 4. Map end replacement - We need to replace the ending of the mapping block.
// To do this uniquely, we find the part of the table row ending and closing the map:
const mapEndTarget = `                  </tr>
                )
              ))}
            </tbody>`;

const mapEndReplacement = `                  </tr>
                );
              })}
            </tbody>`;

if (content.includes(mapStartTarget)) {
  content = content.replace(mapStartTarget, mapStartReplacement);
  console.log('[+] Map start replaced.');
} else {
  console.log('[-] Map start target NOT found!');
}

if (content.includes(nameCellTarget)) {
  content = content.replace(nameCellTarget, nameCellReplacement);
  console.log('[+] Name cell replaced.');
} else {
  // Let's try with different line endings just in case
  const nameCellTargetCRLF = nameCellTarget.replace(/\n/g, '\r\n');
  if (content.includes(nameCellTargetCRLF)) {
    content = content.replace(nameCellTargetCRLF, nameCellReplacement.replace(/\n/g, '\r\n'));
    console.log('[+] Name cell replaced (CRLF).');
  } else {
    console.log('[-] Name cell target NOT found!');
  }
}

if (content.includes(nameLabelTarget)) {
  content = content.replace(nameLabelTarget, nameLabelReplacement);
  console.log('[+] Name label replaced.');
} else {
  const nameLabelTargetCRLF = nameLabelTarget.replace(/\n/g, '\r\n');
  if (content.includes(nameLabelTargetCRLF)) {
    content = content.replace(nameLabelTargetCRLF, nameLabelReplacement.replace(/\n/g, '\r\n'));
    console.log('[+] Name label replaced (CRLF).');
  } else {
    console.log('[-] Name label target NOT found!');
  }
}

// Since mapEndTarget is small and near the bottom:
if (content.includes(mapEndTarget)) {
  content = content.replace(mapEndTarget, mapEndReplacement);
  console.log('[+] Map end replaced.');
} else {
  const mapEndTargetCRLF = mapEndTarget.replace(/\n/g, '\r\n');
  if (content.includes(mapEndTargetCRLF)) {
    content = content.replace(mapEndTargetCRLF, mapEndReplacement.replace(/\n/g, '\r\n'));
    console.log('[+] Map end replaced (CRLF).');
  } else {
    // Let's try matching with more flexibility
    console.log('[-] Map end target NOT found!');
  }
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('[+] Patched file successfully.');
