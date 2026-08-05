import crypto from 'node:crypto';
import { getAdminClient } from './supabaseClient.js';


const TABLE_NAME = 'sa_taxi_explanations';

function generateSecureToken() {
  return crypto.randomBytes(24).toString('hex');
}

/**
 * 소명 요청 생성 또는 기존 소명 토큰 가져오기
 */
export async function createOrGetTaxiExplanation(row) {
  const supabase = getAdminClient();
  const orderId = String(row?.orderId || row?.id || row?.ticketNo || '').trim();
  const empNo = String(row?.empNo || row?.memberIdentifier || '').trim();

  // 기존에 생성된 PENDING / SUBMITTED 소명건이 있는지 확인
  if (orderId) {
    const { data: existing } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('order_id', orderId)
      .maybeSingle();

    if (existing) {
      return existing;
    }
  }

  const token = generateSecureToken();
  const newRecord = {
    token,
    order_id: orderId || null,
    ticket_no: String(row?.ticketNo || orderId || '').trim(),
    emp_no: empNo || null,
    employee_name: String(row?.employeeName || '').trim(),
    dept: String(row?.dept || '').trim(),
    ride_time: String(row?.rideTime || row?.rideTimeRaw || '').trim(),
    actual_out_time: String(row?.actualOutTime || '').trim(),
    amount: Number(String(row?.amount || '0').replace(/,/g, '')) || 0,
    pickup: String(row?.pickup || '').trim(),
    dropoff: String(row?.dropoff || '').trim(),
    use_reason: String(row?.reason || '').trim(),
    status: 'PENDING',
    requested_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .insert([newRecord])
    .select()
    .single();

  if (error) {
    console.error('sa_taxi_explanations insert error:', error);
    // 테이블이 없거나 DB 에러인 경우 메모리/임시 토큰 객체 반환
    return {
      ...newRecord,
      id: token,
      _fallback: true,
    };
  }

  return data;
}

/**
 * 토큰으로 소명 정보 조회 (직원용 페이지)
 */
export async function getTaxiExplanationByToken(token) {
  if (!token) return null;
  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('*')
    .eq('token', token)
    .maybeSingle();

  if (error) {
    console.error('getTaxiExplanationByToken error:', error);
    return null;
  }

  return data;
}

/**
 * 소명 사유 제출 (직원용)
 */
export async function submitTaxiExplanation({ token, explanationText }) {
  if (!token) throw new Error('소명 토큰이 누락되었습니다.');
  if (!explanationText || !explanationText.trim()) throw new Error('소명 사유를 입력해 주세요.');

  const supabase = getAdminClient();

  const { data: existing } = await supabase
    .from(TABLE_NAME)
    .select('*')
    .eq('token', token)
    .maybeSingle();

  if (!existing) {
    throw new Error('존재하지 않거나 유효하지 않은 소명 요청입니다.');
  }

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .update({
      explanation_text: explanationText.trim(),
      status: 'SUBMITTED',
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('token', token)
    .select()
    .single();

  if (error) {
    throw new Error(`소명 저장 실패: ${error.message}`);
  }

  return data;
}

/**
 * 관리자용: 여러 order_id 에 대한 소명 내역 Map 반환 (order_id -> explanation record)
 */
export async function fetchTaxiExplanationsMap(orderIds = []) {
  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    return new Map();
  }

  const supabase = getAdminClient();
  const validOrderIds = orderIds.map((id) => String(id || '').trim()).filter(Boolean);
  if (validOrderIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('*')
    .in('order_id', validOrderIds);

  if (error) {
    console.warn('fetchTaxiExplanationsMap warning (table may not exist yet):', error.message);
    return new Map();
  }

  const map = new Map();
  (data || []).forEach((item) => {
    if (item.order_id) map.set(item.order_id, item);
  });

  return map;
}
