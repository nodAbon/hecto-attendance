# 버그 수정 보고서: 근무일정 조정 저장 오류

## 증상

관리자/팀장이 근무일정 조정(schedule override)을 저장하려 할 때  
`"일정 저장 중 오류가 발생했습니다."` 메시지가 표시되며 저장 실패.

---

## 근본 원인

`src/lib/supabaseDb.js` 의 `saveScheduleOverride` 함수가  
**DB에 존재하지 않는 컬럼** `updated_at`에 값을 쓰려 시도했음.

### 수정 전 코드

```js
await supabase
  .from('sa_schedule_overrides')
  .upsert({
    emp_no: empNo,
    work_date: workDate,
    schedule_start: scheduleStart,
    schedule_end: scheduleEnd,
    note,
    created_by: userId,
    updated_at: new Date().toISOString()   // ← 문제의 줄
  }, { onConflict: 'emp_no,work_date' })
```

### 수정 후 코드

```js
await supabase
  .from('sa_schedule_overrides')
  .upsert({
    emp_no: empNo,
    work_date: workDate,
    schedule_start: scheduleStart,
    schedule_end: scheduleEnd,
    note,
    created_by: userId,
    // updated_at 제거
  }, { onConflict: 'emp_no,work_date' })
```

---

## 근거: 실제 DB 스키마 확인

Supabase MCP를 통해 `sa_schedule_overrides` 테이블의 실제 컬럼을 직접 조회한 결과:

| column_name    | data_type                   |
|----------------|-----------------------------|
| id             | bigint                      |
| emp_no         | character varying           |
| work_date      | date                        |
| schedule_start | time without time zone      |
| schedule_end   | time without time zone      |
| note           | text                        |
| created_by     | uuid                        |
| created_at     | timestamp with time zone    |

`updated_at` 컬럼은 **존재하지 않음**.  
`supabase/schema.sql` 에도 해당 테이블에 `updated_at` 정의 없음 (확인 완료).

---

## 오류 전파 경로

```
[프론트엔드] 저장 버튼 클릭
    → POST /api/employees/schedule-override
    → verifySession() → 정상 (관리자 세션 유효)
    → saveScheduleOverride() → supabase.upsert() 호출
    → PostgreSQL: column "updated_at" of relation "sa_schedule_overrides" does not exist
    → error 객체 throw
    → route.js catch(err) → 500 응답
    → [프론트엔드] "일정 저장 중 오류가 발생했습니다."
```

---

## 수정 범위

- **변경 파일**: `src/lib/supabaseDb.js` (1줄 제거)
- **DB 변경 없음**: 스키마는 올바름, 코드만 수정
- **영향 범위**: `saveScheduleOverride` 함수만 해당. 다른 함수 변경 없음.

---

## 반론 가능성 검토

| 주장 | 판단 |
|------|------|
| `updated_at`을 DB에 추가해야 한다 | 가능한 대안이지만, 기존 스키마 설계 의도(생성 시각만 추적)를 바꾸는 것이므로 코드를 스키마에 맞추는 것이 더 안전한 수정 |
| 다른 곳에서 `updated_at`을 읽고 있다 | `sa_schedule_overrides`에서 `updated_at`을 SELECT하는 코드가 없음 (grep 확인 가능) |
| `created_by`가 NULL이라 FK 위반 아닌가 | 관리자 세션의 `userId`는 Supabase Auth UUID이므로 `auth.users(id)` FK 조건 충족 |
