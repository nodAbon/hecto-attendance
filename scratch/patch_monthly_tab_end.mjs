import fs from 'fs';

const filePath = 'c:\\Users\\Owner\\Documents\\Antigravity\\agitated-raman\\src\\components\\tabs\\MonthlyTab.js';
let content = fs.readFileSync(filePath, 'utf8');

// Replace map closing
const target1 = `                </tr>
              ))}`;

const replacement1 = `                </tr>
              })}`;

const target2 = `                </tr>\r\n              ))}`;
const replacement2 = `                </tr>\r\n              })}`;

if (content.includes(target1)) {
  content = content.replace(target1, replacement1);
  console.log('[+] Map end replaced (LF).');
} else if (content.includes(target2)) {
  content = content.replace(target2, replacement2);
  console.log('[+] Map end replaced (CRLF).');
} else {
  console.log('[-] Map end target NOT found in file!');
  
  // Let's search for any occurrences of "allEmps.map" ending
  // We can search for the last occurrence of "))}" before "</tbody>"
  const tbodyIdx = content.indexOf('</tbody>');
  if (tbodyIdx !== -1) {
    const beforeTbody = content.slice(0, tbodyIdx);
    const lastMapCloseIdx = beforeTbody.lastIndexOf('))}');
    if (lastMapCloseIdx !== -1 && lastMapCloseIdx > tbodyIdx - 200) {
      content = content.slice(0, lastMapCloseIdx) + ')}' + content.slice(lastMapCloseIdx + 3);
      console.log('[+] Map end replaced using position search.');
    }
  }
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('[+] Finished patching map end.');
