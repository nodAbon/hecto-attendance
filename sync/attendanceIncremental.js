const DEFAULT_OVERLAP_MINUTES = 10;
const DEFAULT_INITIAL_LOOKBACK_MINUTES = 60;

function validDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function formatMySqlBoundary(date) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}${String(kst.getUTCMonth() + 1).padStart(2, '0')}${String(kst.getUTCDate()).padStart(2, '0')}${String(kst.getUTCHours()).padStart(2, '0')}${String(kst.getUTCMinutes()).padStart(2, '0')}${String(kst.getUTCSeconds()).padStart(2, '0')}`;
}

function formatBytes(value) {
  if (value < 1024) return `${value}B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)}KB`;
  return `${(value / (1024 * 1024)).toFixed(2)}MB`;
}

async function getAttendanceWindow({ supabase, companyCode, source, now = new Date() }) {
  const { data, error } = await supabase
    .from('sa_sync_checkpoints')
    .select('last_success_at')
    .eq('company_code', companyCode)
    .eq('source', source)
    .limit(1);
  const checkpointAvailable = !error || error.code !== 'PGRST205';
  if (error && checkpointAvailable) throw new Error(`동기화 체크포인트 조회 실패: ${error.message}`);

  let cursor = validDate(data?.[0]?.last_success_at);
  let origin = 'checkpoint';
  if (!cursor) {
    const { data: latest, error: latestError } = await supabase
      .from('sa_attendance')
      .select('log_time')
      .eq('source', source)
      .like('sabun', `${companyCode}%`)
      .order('log_time', { ascending: false })
      .limit(1);
    if (latestError) throw new Error(`기존 출입기록 기준시각 조회 실패: ${latestError.message}`);
    cursor = validDate(latest?.[0]?.log_time);
    origin = cursor ? 'existing_data' : 'initial_lookback';
  }

  const base = cursor || new Date(now.getTime() - DEFAULT_INITIAL_LOOKBACK_MINUTES * 60 * 1000);
  const from = new Date(base.getTime() - DEFAULT_OVERLAP_MINUTES * 60 * 1000);
  return { from, to: now, fromStr: formatMySqlBoundary(from), toStr: formatMySqlBoundary(now), origin, checkpointAvailable };
}

async function saveAttendanceCheckpoint({ supabase, companyCode, source, window, rowCount, queryBytes, upsertBytes }) {
  if (!window.checkpointAvailable) return false;
  const { error } = await supabase
    .from('sa_sync_checkpoints')
    .upsert({
      company_code: companyCode,
      source,
      last_success_at: window.to.toISOString(),
      last_window_start: window.from.toISOString(),
      last_window_end: window.to.toISOString(),
      last_row_count: rowCount,
      last_query_bytes: queryBytes,
      last_upsert_bytes: upsertBytes,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'company_code,source' });
  if (error) throw new Error(`동기화 체크포인트 저장 실패: ${error.message}`);
  return true;
}

module.exports = { formatBytes, getAttendanceWindow, saveAttendanceCheckpoint };
