import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://gbfoempwoeurhhlxqxgy.supabase.co';
const supabaseService = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdiZm9lbXB3b2V1cmhobHhxeGd5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODU1MDkzNiwiZXhwIjoyMDk0MTI2OTM2fQ.6Tm0XESSnrop7BYgcuS9bCgeMhOxTHSUB8wmpkUFQ3c';

const supabase = createClient(supabaseUrl, supabaseService);

const toMinutes = (timeValue = '') => {
  const [hours = 0, minutes = 0] = String(timeValue).substring(0, 5).split(':').map((value) => Number(value) || 0);
  return (hours * 60) + minutes;
};

async function main() {
  const empNo = '20230039';
  const dateStr = '2026-04-14';

  const { data: rawLogs } = await supabase
    .from('sa_attendance')
    .select('*')
    .eq('emp_no', empNo)
    .gte('log_time', '2026-04-14T00:00:00+09:00')
    .lte('log_time', '2026-04-14T23:59:59+09:00');

  // Hardcode schedule start from override
  const scheduleTime = '11:30';

  // MOCK route.js grouping and sorting logic
  const baseLogs = rawLogs.map(log => {
    // Format UTC to KST representation (KST = UTC + 9)
    const kstDate = new Date(new Date(log.log_time).getTime());
    const yyyy = kstDate.getFullYear();
    const mm = String(kstDate.getMonth() + 1).padStart(2, '0');
    const dd = String(kstDate.getDate()).padStart(2, '0');
    const hh = String(kstDate.getHours()).padStart(2, '0');
    const min = String(kstDate.getMinutes()).padStart(2, '0');
    const ss = String(kstDate.getSeconds()).padStart(2, '0');
    
    return {
      ...log,
      logTime: `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`,
      workDate: dateStr,
      isAdjustedCheckout: String(log.adjustedRole || log.event_type || '').includes('퇴'),
      isAdjustedCheckin: String(log.adjustedRole || log.event_type || '').includes('출')
    };
  });

  const getLogPriority = (log) => Number.isFinite(Number(log.manualPriority)) ? Number(log.manualPriority) : 1;
  
  const normalized = baseLogs.map(log => {
    const timeOnly = log.logTime.split(' ')[1];
    const minutes = toMinutes(timeOnly);
    // getWorkOrder returns minutes for non-checkout logs
    const isCheckout = log.isAdjustedCheckout || String(log.adjustedRole || log.event_type || '').includes('퇴근');
    const workOrder = isCheckout ? minutes + 24 * 60 : minutes;
    return {
      ...log,
      workOrder
    };
  });

  const sorted = normalized.sort((a, b) => 
    getLogPriority(a) - getLogPriority(b) ||
    a.workOrder - b.workOrder ||
    a.logTime.localeCompare(b.logTime)
  );

  console.log('Sorted logs for the day:');
  sorted.forEach(l => {
    console.log(`ID: ${l.id}, Time: ${l.logTime}, Type: ${l.event_type}, WorkOrder: ${l.workOrder}`);
  });

  const firstLog = sorted[0];
  const timeOnly = firstLog.logTime.split(' ')[1];
  const isOfficialCheckin = timeOnly >= '07:00:00';
  
  let isLate = false;
  let lateLimit = '';
  if (scheduleTime) {
    lateLimit = `${scheduleTime}:59`;
    if (scheduleTime === '12:00') {
      lateLimit = '13:00:59';
    }
    isLate = isOfficialCheckin && timeOnly > lateLimit;
  }

  console.log(`firstLog time: ${timeOnly}`);
  console.log(`lateLimit: ${lateLimit}`);
  console.log(`isLate: ${isLate}`);
}

main();
