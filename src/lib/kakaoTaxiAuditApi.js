import crypto from 'node:crypto';
import { fetchAttendanceLogs } from './supabaseDb';
import { shiftKstDateKey } from './kstDate';
import { normalizeEmpNoKey } from './dashboardUtils';

const DEFAULT_BASE_URL = process.env.KAKAO_T_BIZ_API_BASE_URL || 'https://b2b-api.kakaomobility.com';
const EARLY_MORNING_CUTOFF = 6 * 60;
const LATE_NIGHT_CUTOFF = 22 * 60;

const normalizeText = (value = '') => String(value || '').trim().replace(/\s+/g, '').toLowerCase();
const normalizeName = (value = '') => normalizeText(value);
const normalizeNamePrefix = (value = '') => normalizeName(value).slice(0, 3);

const resolveKakaoAuthConfig = () => {
  const corpId =
    process.env.KAKAO_T_BIZ_CORP_ID
    || process.env.KAKAO_T_BIZ_CORP_ID_VALUE
    || process.env.KAKAO_T_BIZ_ID
    || process.env.KAKAO_T_BIZ_COMPANY_ID
    || '';
  const secret =
    process.env.KAKAO_T_BIZ_API_SECRET
    || process.env.KAKAO_T_BIZ_SECRET
    || process.env.KAKAO_T_BIZ_TOKEN
    || process.env.KAKAO_T_BIZ_API_KEY
    || process.env.KAKAO_T_BIZ_AUTH_SECRET
    || '';

  return {
    corpId: String(corpId || '').trim(),
    secret: String(secret || '').trim(),
  };
};

const buildKakaoAuthHeaders = ({ corpId, secret, method, requestUrl }) => {
  if (!corpId || !secret) {
    throw new Error('카카오T API 설정이 부족합니다. KAKAO_T_BIZ_CORP_ID, KAKAO_T_BIZ_API_SECRET를 확인하세요.');
  }

  const nonce = String(crypto.randomInt(10000, 99999));
  const timestamp = String(Math.floor(Date.now() / 1000));
  const canonicalUrl = `${requestUrl.origin}${requestUrl.pathname}`;
  const message = `${nonce}\n${canonicalUrl}\n${method}\n${corpId}\n${timestamp}\n${nonce}`;
  const token = crypto.createHmac('sha1', secret).update(message).digest('base64');

  return {
    authorization: `Token ${token}`,
    'x-mob-b2b-corp-id': corpId,
    'x-mob-b2b-nonce': nonce,
    'x-mob-b2b-timestamp': timestamp,
  };
};

const parseDateTime = (value = '') => {
  const text = String(value || '').trim();
  if (!text) return null;

  const match = text.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (match) {
    return {
      date: match[1],
      hours: Number(match[2]),
      minutes: Number(match[3]),
      seconds: Number(match[4] || '0'),
    };
  }

  const fallback = new Date(text);
  if (Number.isNaN(fallback.getTime())) return null;

  const iso = fallback.toISOString();
  return {
    date: iso.slice(0, 10),
    hours: Number(iso.slice(11, 13)),
    minutes: Number(iso.slice(14, 16)),
    seconds: Number(iso.slice(17, 19)),
  };
};

const formatDateTime = (value = '') => {
  const parsed = parseDateTime(value);
  if (!parsed) return String(value || '-').trim() || '-';
  return `${parsed.date} ${String(parsed.hours).padStart(2, '0')}:${String(parsed.minutes).padStart(2, '0')}`;
};

const toMinutes = (value = '') => {
  const match = String(value || '').trim().match(/^(\d{2}):(\d{2})/);
  if (!match) return null;
  return (Number(match[1]) * 60) + Number(match[2]);
};

const getCheckoutMinutesRelative = (checkoutValue = '', workDate = '') => {
  const text = String(checkoutValue || '').trim();
  if (!text) return null;

  const matchFull = text.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/);
  if (matchFull && workDate) {
    const logDate = matchFull[1];
    const hours = Number(matchFull[2]);
    const minutes = Number(matchFull[3]);
    if (logDate === workDate) {
      return (hours * 60) + minutes;
    }
    const d1 = new Date(`${workDate}T00:00:00+09:00`);
    const d2 = new Date(`${logDate}T00:00:00+09:00`);
    const diffDays = Math.round((d2.getTime() - d1.getTime()) / (24 * 60 * 60 * 1000));
    return (diffDays * 24 * 60) + (hours * 60) + minutes;
  }

  const matchTime = text.match(/^(\d{2}):(\d{2})/);
  if (matchTime) {
    return (Number(matchTime[1]) * 60) + Number(matchTime[2]);
  }

  return null;
};

const getMonthKey = (dateStr = '') => String(dateStr || '').slice(0, 7);

const getAuditWorkDate = (rideValue = '') => {
  const parsed = parseDateTime(rideValue);
  if (!parsed) return '';
  const minutes = (parsed.hours * 60) + parsed.minutes;
  if (minutes < EARLY_MORNING_CUTOFF) {
    return shiftKstDateKey(parsed.date, -1);
  }
  return parsed.date;
};

const isLateNightRide = (rideValue = '') => {
  const parsed = parseDateTime(rideValue);
  if (!parsed) return false;
  const minutes = (parsed.hours * 60) + parsed.minutes;
  return minutes >= LATE_NIGHT_CUTOFF || minutes < EARLY_MORNING_CUTOFF;
};

const getOrderAmount = (order = {}) => {
  const paymentItems = Array.isArray(order.payment_items) ? order.payment_items : [];
  const paidAmounts = paymentItems
    .filter((item) => String(item?.status || '').toLowerCase() === 'paid')
    .map((item) => Number(item?.amount || 0))
    .filter((amount) => Number.isFinite(amount));

  if (paidAmounts.length > 0) {
    return paidAmounts.reduce((sum, amount) => sum + amount, 0);
  }

  const fallback = Number(order.service_fare || 0) + Number(order.toll || 0) + Number(order.platform_fee || 0);
  return Number.isFinite(fallback) ? fallback : 0;
};

const buildActualCheckoutLookup = (logs = []) => {
  const grouped = new Map();

  for (const log of logs || []) {
    const empNo = String(log.empNo || '').trim();
    const workDate = log.isAdjusted
      ? String(log.workDate || '').trim()
      : getAuditWorkDate(log.logTime || log.workDate || '');
    if (!empNo || !workDate) continue;

    const key = `${empNo}_${workDate}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(log);
  }

  const lookup = new Map();

  for (const [key, dayLogs] of grouped.entries()) {
    const sorted = [...dayLogs].sort((a, b) => {
      const orderA = Number.isFinite(Number(a.workOrder)) ? Number(a.workOrder) : 0;
      const orderB = Number.isFinite(Number(b.workOrder)) ? Number(b.workOrder) : 0;
      return orderA - orderB || String(a.logTime || '').localeCompare(String(b.logTime || ''));
    });

    const firstLog = sorted[0];
    const lastLog = sorted[sorted.length - 1];
    const hasDistinctCheckout = sorted.length >= 2 && String(firstLog?.logTime || '') !== String(lastLog?.logTime || '');
    const corrected = [...sorted].reverse().find((log) => String(log.correctedOutTime || '').trim());

    let checkout = '';
    if (corrected) {
      checkout = String(corrected.correctedOutTime || '').trim();
    } else if (hasDistinctCheckout) {
      checkout = String(lastLog?.logTime || '').trim();
    }

    lookup.set(key, checkout || '-');
  }

  return lookup;
};

async function fetchKakaoTaxiOrdersPage({
  startDate,
  endDate,
  page = 1,
  per = 100,
  memberIdentifier = '',
} = {}) {
  const { corpId, secret } = resolveKakaoAuthConfig();

  const baseUrl = process.env.KAKAO_T_BIZ_API_BASE_URL || DEFAULT_BASE_URL;
  const requestUrl = new URL('/external/v2/orders', baseUrl);
  requestUrl.searchParams.set('start_date', startDate);
  requestUrl.searchParams.set('end_date', endDate);
  requestUrl.searchParams.set('page', String(page));
  requestUrl.searchParams.set('per', String(Math.min(100, Math.max(1, per))));
  requestUrl.searchParams.set('search_by_payment_at', 'false');
  requestUrl.searchParams.set('vertical_code', 'TAXI');
  if (memberIdentifier) {
    requestUrl.searchParams.set('member_identifier', memberIdentifier);
  }

  const headers = buildKakaoAuthHeaders({
    corpId,
    secret,
    method: 'GET',
    requestUrl,
  });

  const res = await fetch(requestUrl.toString(), {
    method: 'GET',
    headers: {
      accept: 'application/json;charset=UTF-8',
      ...headers,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`카카오T API 조회 실패 (${res.status}): ${text || res.statusText}`);
  }

  return res.json();
}

export async function fetchKakaoTaxiOrders({
  startDate,
  endDate,
  memberIdentifier = '',
  per = 100,
} = {}) {
  if (!startDate || !endDate) {
    throw new Error('조회 시작일과 종료일을 입력해 주세요.');
  }

  const orders = [];
  let totalCount = 0;
  let page = 1;
  const pageSize = Math.min(100, Math.max(1, per));

  while (orders.length < totalCount || (totalCount === 0 && page === 1)) {
    const json = await fetchKakaoTaxiOrdersPage({
      startDate,
      endDate,
      page,
      per: pageSize,
      memberIdentifier,
    });

    const pageOrders = Array.isArray(json?.orders) ? json.orders : [];
    totalCount = Number(json?.count || 0);
    orders.push(...pageOrders);

    if (pageOrders.length === 0 || orders.length >= totalCount || pageOrders.length < pageSize) {
      break;
    }

    page += 1;
  }

  return {
    count: totalCount || orders.length,
    orders,
  };
}

export async function buildTaxiAuditRowsFromKakao({
  startDate,
  endDate,
  memberIdentifier = '',
} = {}) {
  const { orders, count } = await fetchKakaoTaxiOrders({
    startDate,
    endDate,
    memberIdentifier,
  });

  const normalizedOrders = (orders || [])
    .map((order, index) => {
      const rideTimeRaw = String(order.departure_time || order.call_time || '').trim();
      const rideDate = parseDateTime(rideTimeRaw);
      const auditWorkDate = getAuditWorkDate(rideTimeRaw);
      const memberIdentifierValue = String(order.member_identifier || '').trim();
      const memberNameValue = String(order.member_name || '').trim();
      const amount = getOrderAmount(order);
      const paymentItems = Array.isArray(order.payment_items) ? order.payment_items : [];
      const paidItem = paymentItems.find((item) => String(item?.status || '').toLowerCase() === 'paid') || paymentItems[0] || null;

      return {
        id: String(order.id || `${index}`),
        orderId: String(order.id || '').trim(),
        ticketNo: String(order.id || '').trim(),
        rideTimeRaw,
        rideTime: formatDateTime(rideTimeRaw),
        callTime: formatDateTime(String(order.call_time || '').trim()),
        rideDate,
        employeeName: memberNameValue,
        dept: String(order.member_department || '').trim(),
        reason: String(order.use_code || order.vertical_product_name || '택시 이용').trim(),
        amount: String(amount),
        settleAmount: String(amount),
        status: String(paidItem?.status || order.payment_items?.[0]?.status || '').trim(),
        pickup: String(order.departure_point || '').trim(),
        dropoff: String(order.arrival_point || '').trim(),
        memberIdentifier: memberIdentifierValue,
        memberDepartment: String(order.member_department || '').trim(),
        verticalCode: String(order.vertical_code || '').trim(),
        verticalProductCode: String(order.vertical_product_code || '').trim(),
        verticalProductName: String(order.vertical_product_name || '').trim(),
        taxiKind: String(order.taxi_kind || '').trim(),
        useCode: String(order.use_code || '').trim(),
        groupId: String(order.group_id || '').trim(),
        groupName: String(order.group_name || '').trim(),
        carModel: String(order.car_model || '').trim(),
        carNumber: String(order.car_number || '').trim(),
        paymentItems,
        paymentApprovalNo: String(paidItem?.approval_no || '').trim(),
        paymentDateTime: String(paidItem?.org_date_time || '').trim(),
        auditWorkDate,
        isLateNightRide: isLateNightRide(rideTimeRaw),
        rawOrder: order,
      };
    })
    .filter((row) => row.isLateNightRide);

  const months = new Set();
  normalizedOrders.forEach((row) => {
    if (row.rideDate?.date) months.add(getMonthKey(row.rideDate.date));
    if (row.auditWorkDate) months.add(getMonthKey(row.auditWorkDate));
  });

  const employeeByEmpNo = new Map();
  const employeesByName = new Map();
  const checkoutLookupByEmpNo = new Map();

  for (const month of [...months].filter(Boolean)) {
    const { logs = [], employees = [] } = await fetchAttendanceLogs(month);

    for (const emp of employees || []) {
      const empNo = String(emp.empNo || '').trim();
      const name = String(emp.name || '').trim();
      const dept = String(emp.dept || '').trim();
      if (empNo) {
        employeeByEmpNo.set(empNo, { empNo, name, dept });
      }

      const exactName = normalizeName(name);
      const prefixName = normalizeNamePrefix(name);

      if (exactName) {
        if (!employeesByName.has(exactName)) employeesByName.set(exactName, []);
        employeesByName.get(exactName).push({ empNo, name, dept });
      }
      if (prefixName) {
        if (!employeesByName.has(prefixName)) employeesByName.set(prefixName, []);
        employeesByName.get(prefixName).push({ empNo, name, dept });
      }
    }

    const monthLookup = buildActualCheckoutLookup(logs);
    for (const [key, value] of monthLookup.entries()) {
      if (!checkoutLookupByEmpNo.has(key)) {
        checkoutLookupByEmpNo.set(key, value);
      }
    }
  }

  const checkoutLookupByName = new Map();
  for (const [empKey, checkoutTime] of checkoutLookupByEmpNo.entries()) {
    const [empNo, workDate] = String(empKey || '').split('_');
    if (!empNo || !workDate) continue;
    const emp = employeeByEmpNo.get(empNo);
    if (!emp) continue;

    const exactNameKey = `${normalizeName(emp.name)}|${workDate}`;
    const prefixNameKey = `${normalizeNamePrefix(emp.name)}|${workDate}`;
    if (!checkoutLookupByName.has(exactNameKey)) checkoutLookupByName.set(exactNameKey, checkoutTime);
    if (!checkoutLookupByName.has(prefixNameKey)) checkoutLookupByName.set(prefixNameKey, checkoutTime);
  }

  const rows = normalizedOrders
    .map((row) => {
      const normalizedIdentifier = normalizeEmpNoKey(row.memberIdentifier);
      const directEmp = normalizedIdentifier ? employeeByEmpNo.get(normalizedIdentifier) : null;
      const matchedByNameList = employeesByName.get(normalizeName(row.employeeName))
        || employeesByName.get(normalizeNamePrefix(row.employeeName))
        || [];
      const matchedEmployee = directEmp || matchedByNameList[0] || null;
      const employeeName = matchedEmployee?.name || row.employeeName || '';
      const dept = matchedEmployee?.dept || row.dept || '';
      const empNo = matchedEmployee?.empNo || normalizedIdentifier || '';

      const lookupKeys = [
        `${empNo}_${row.auditWorkDate}`,
        `${normalizeName(employeeName)}|${row.auditWorkDate}`,
        `${normalizeNamePrefix(employeeName)}|${row.auditWorkDate}`,
      ].filter(Boolean);
      const matchedKey = lookupKeys.find((key) => checkoutLookupByEmpNo.has(key) || checkoutLookupByName.has(key));
      const actualOutTime = matchedKey
        ? (checkoutLookupByEmpNo.get(matchedKey) || checkoutLookupByName.get(matchedKey))
        : '-';
      const actualOutMinutes = actualOutTime && actualOutTime !== '-'
        ? getCheckoutMinutesRelative(actualOutTime, row.auditWorkDate)
        : null;

      return {
        ...row,
        empNo,
        employeeName,
        dept,
        actualOutTime,
        actualOutMinutes,
      };
    })
    .filter((row) => Number.isFinite(row.actualOutMinutes) && row.actualOutMinutes < LATE_NIGHT_CUTOFF)
    .sort((a, b) => String(a.auditWorkDate || '').localeCompare(String(b.auditWorkDate || ''))
      || String(a.rideTimeRaw || '').localeCompare(String(b.rideTimeRaw || ''))
      || String(a.employeeName || '').localeCompare(String(b.employeeName || '')));

  return {
    count,
    rows,
    meta: {
      queriedMonths: [...months].filter(Boolean),
      matchedRows: rows.length,
      source: 'kakao',
    },
  };
}
