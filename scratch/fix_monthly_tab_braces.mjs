import fs from 'fs';

const filePath = 'c:\\Users\\Owner\\Documents\\Antigravity\\agitated-raman\\src\\components\\tabs\\MonthlyTab.js';
let content = fs.readFileSync(filePath, 'utf8');

// The incorrect part:
//                     );
//                   })}
//                 </tr>
//               })}
//             </tbody>

// We want to replace it with:
//                     );
//                   })()}
//                 </tr>
//               );
//             })}
//             </tbody>

const target1 = `                    );
                  })}
                </tr>
              })}`;

const replacement1 = `                    );
                  })()}
                </tr>
              );
            })}`;

const target2 = `                    );\r\n                  })}\r\n                </tr>\r\n              })}`;
const replacement2 = `                    );\r\n                  })()}\r\n                </tr>\r\n              );\r\n            })}`;

if (content.includes(target1)) {
  content = content.replace(target1, replacement1);
  console.log('[+] Replaced LF block.');
} else if (content.includes(target2)) {
  content = content.replace(target2, replacement2);
  console.log('[+] Replaced CRLF block.');
} else {
  console.log('[-] Could not find target block! Printing current file tail:');
  const lines = content.split('\n');
  console.log(lines.slice(1065, 1085).join('\n'));
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('[+] Finished brace patching.');
