import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';
import { getAdminClient } from '@/lib/supabaseClient';

function normalizeEmpNo(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (!digits) return raw;
  if (digits.length >= 12 && digits.startsWith('1600')) {
    const empNo = digits.slice(4).replace(/^0+/, '') || digits.slice(4);
    return empNo.padStart(8, '0');
  }
  if (digits.length <= 8) {
    return digits.padStart(8, '0');
  }
  return digits.slice(-8);
}

export async function POST(request) {
  try {
    const session = await verifySession(request);
    if (!session) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }
    if (!session.isAdmin) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const { empNo } = await request.json();
    const normalizedEmpNo = normalizeEmpNo(empNo);
    if (!normalizedEmpNo) {
      return NextResponse.json({ error: '사원번호가 필요합니다.' }, { status: 400 });
    }

    const supabase = getAdminClient();
    const { data: employee, error: employeeErr } = await supabase
      .from('sa_employees')
      .select('emp_no, name, dept')
      .eq('emp_no', normalizedEmpNo)
      .maybeSingle();

    if (employeeErr) {
      return NextResponse.json({ error: `직원 조회 실패: ${employeeErr.message}` }, { status: 500 });
    }
    if (!employee) {
      return NextResponse.json({ error: '해당 사번의 직원 정보가 없습니다.' }, { status: 404 });
    }

    const { error: queueErr } = await supabase
      .from('sa_leave_backfill_queue')
      .upsert({
        emp_no: normalizedEmpNo,
        status: 'pending',
        requested_by: session.userId,
        requested_at: new Date().toISOString(),
        processed_at: null,
        last_error: null,
        synced_at: new Date().toISOString(),
      }, { onConflict: 'emp_no' });

    if (queueErr) {
      return NextResponse.json({ error: `백필 요청 등록 실패: ${queueErr.message}` }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `${employee.name || normalizedEmpNo}(${normalizedEmpNo}) 연차 백필 요청이 등록되었습니다.`,
      empNo: normalizedEmpNo,
    });
  } catch (err) {
    console.error('[Admin Leave Backfill Request]', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
