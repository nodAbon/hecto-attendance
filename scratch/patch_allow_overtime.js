const fs = require('fs');

const path = 'src/lib/supabaseDb.js';
const text = fs.readFileSync(path, 'utf8');

const startMarker = 'const { data: overrides, error: overErr } = await supabase';
const endMarker = '    // ';

const start = text.indexOf(startMarker);
const end = text.indexOf(endMarker, start + startMarker.length);

if (start === -1 || end === -1) {
  throw new Error('Could not find overrides block');
}

const replacement = `const { data: overridesRaw, error: overErr } = await supabase
      .from('sa_schedule_overrides')
      .select('emp_no, work_date, schedule_start, schedule_end, allow_overtime, note');

    const overrides = !overErr
      ? (overridesRaw || []).map((row) => ({ ...row, allow_overtime: Boolean(row.allow_overtime) }))
      : [];

    let teamSchedulePatterns = [];

    if (overErr) {
      const message = String(overErr.message || '').toLowerCase();
      if (message.includes('allow_overtime') || overErr.code === '42703') {
        const { data: fallbackOverrides, error: fallbackErr } = await supabase
          .from('sa_schedule_overrides')
          .select('emp_no, work_date, schedule_start, schedule_end, note');
        if (fallbackErr) throw new Error(\`?ㅼ?以?議곗젙 ?뺣낫 議고쉶 ?ㅽ뙣: \${fallbackErr.message}\`);
        overrides.length = 0;
        (fallbackOverrides || []).forEach((row) => overrides.push({ ...row, allow_overtime: false }));
      } else {
        throw new Error(\`?ㅼ?以?議곗젙 ?뺣낫 議고쉶 ?ㅽ뙣: \${overErr.message}\`);
      }
    }
`;

const next = text.slice(0, start) + replacement + text.slice(end);
fs.writeFileSync(path, next);
