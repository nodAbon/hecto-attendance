# Hecto 동기화 워커

서버PC 전용입니다. AWS MySQL(VPN)에서 데이터를 읽어서 Supabase로 반영합니다.

## 설치

```bash
cd sync
npm install
cp .env.example .env
```

`sync/` 스크립트는 `sync/.env`, `sync/.env.local`, 상위 폴더의 `.env` / `.env.local`도 함께 읽습니다.

## 실행

```bash
# 메인 동기화
npm run start

# 개발용 watch
npm run dev

# 신규 등록 사번의 연차 백필 큐 처리
npm run backfill:leaves
```

## 조회 도구

```bash
npm run list:hr
npm run list:leave
```

## PM2 예시

```bash
pm2 start index.js --name hecto-sync
pm2 start backfill-leaves.js --name hecto-leave-backfill
pm2 save
pm2 startup
```

## 테이블 역할

| Supabase 테이블 | MySQL 원본 | 용도 |
|---|---|---|
| `sa_employees` | `hr_employee` | 회사 전체 직원 마스터 |
| `sa_attendance` | `t_secom_alarm` | 출입기록 |
| `sa_leaves` | `hr_yuncha_use` | 연차/휴가 내역 |
| `sa_leave_backfill_queue` | `sa_employees` 등록 시 생성 | 신규 등록 사번 연차 보강 큐 |

## 운영 메모

- `I_COMPANY = 1600`만 사용합니다.
- 메인 sync는 계속 MySQL -> Supabase 단방향으로 동작합니다.
- `sa_leave_backfill_queue`에 쌓인 사번은 `backfill-leaves.js`가 MySQL에서 재조회해 `sa_leaves`에 반영합니다.
- Supabase에 `supabase/migrations/20260527_create_leave_backfill_queue.sql`을 먼저 적용해야 백필 아이콘과 워커가 정상 동작합니다.
- `.env`는 git에 포함하지 않습니다.
