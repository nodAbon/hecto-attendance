# 헥토 근태 대시보드 - 서버 PC 마이그레이션 가이드

> 작성일: 2026-05-22  
> 대상: 스타팅빌딩 서버 PC (AWS MySQL 직접 접근 가능한 환경)

---

## ✅ 사전 준비

### Node.js 설치 확인
서버 PC에서 CMD 또는 PowerShell 열고 실행:
```powershell
node -v
```
- `v18.x` 이상이면 OK
- 없으면 https://nodejs.org 에서 LTS 버전 설치

---

## 📦 1단계: 프로젝트 파일 복사

개발자 PC의 아래 폴더를 서버 PC에 복사합니다.

**복사할 것:**
```
agitated-raman/
├─ src/                   ← 핵심 소스코드 (필수)
├─ public/                ← 정적 파일
├─ package.json           ← 패키지 목록 (필수)
├─ package-lock.json      ← 버전 고정 (필수)
├─ next.config.mjs        ← Next.js 설정
├─ jsconfig.json
├─ postcss.config.mjs
└─ secom-settings.json    ← 설정값
```

**복사 안 해도 되는 것:**
```
node_modules/    → 서버에서 npm install로 재생성
.next/           → 서버에서 npm run build로 재생성
.git/            → 불필요
diagnose_depts.js, secom_mysql_*.js 등 분석용 스크립트
```

---

## ⚙️ 2단계: 패키지 설치 및 빌드

서버 PC에서 프로젝트 폴더로 이동 후 실행:

```powershell
# 패키지 설치
npm install

# 프로덕션 빌드
npm run build
```

빌드 완료 시 아래와 같이 출력됩니다:
```
✓ Compiled successfully
✓ Generating static pages (7/7)
```

---

## 🚀 3단계: 서버 시작

### 일반 시작 (테스트용)
```powershell
npm start
```
브라우저에서 `http://localhost:3000` 접속

### pm2로 백그라운드 실행 (운영용 권장)
```powershell
# pm2 최초 1회 설치
npm install -g pm2

# 앱 시작
pm2 start npm --name "hecto-attendance" -- start

# 재부팅 후 자동 시작 등록 (최초 1회)
pm2 startup
pm2 save
```

---

## 🔄 4단계: 코드 업데이트 방법 (개발자 PC에서 수정 후)

개발자 PC에서 코드 변경 후 서버에 반영할 때:

1. 변경된 파일을 서버 PC에 복사
2. 서버 PC에서 아래 실행:

```powershell
npm run build

# pm2 사용 중이면:
pm2 restart hecto-attendance

# 일반 시작이면: 기존 프로세스 종료 후 npm start
```

---

## 🔍 연결 확인

### MySQL 연결 정상 여부 확인
```powershell
# 프로젝트 폴더에서 실행
node diagnose_depts.js
```

정상 시 출력:
```
[+] 연결 성공

=== [1] 부서별 인원 ===
  [14명] "사업관리 2팀"
  [13명] "사업관리 1팀"
  ...

=== [4] 수정된 필터 결과 ===
  수정된 필터 결과: 38명
```

### 대시보드 정상 여부 확인
- 브라우저에서 `http://localhost:3000` 접속
- 화면 상단에 **"데모"** 배지가 없으면 → MySQL 실제 데이터 연결 성공 ✅
- "데모" 배지가 있으면 → MySQL 연결 실패 (VPN 확인)

---

## ⚠️ 주요 설정 정보

### DB 연결 정보 (`src/lib/secomDb.js`)
```javascript
host: '[REDACTED MYSQL HOST]'
user: 'whradmin'
database: 'whr'
port: 3306
```

### 조회 범위
- **회사 코드:** `I_COMPANY = '1600'` (헥토 단독, 그룹사 타 회사 제외)
- **대상 부서:** 플랫폼서비스실, 사업개발팀, 사업관리 1~3팀
- **조회 테이블:** `tenter` (세콤 출입 로그), `hr_employee`, `hr_department`
- **데이터 수정:** 절대 없음 (SELECT 전용)

### 조회 Fallback 순서
```
① AWS MySQL (VPN 연결 시)
  → 실패 시
② 로컬 세콤 SQLite 파일
  → 실패 시
③ 데모 모드 (샘플 데이터)
```

---

## 🛠️ 트러블슈팅

| 증상 | 원인 | 해결 |
|---|---|---|
| 대시보드에 "데모" 배지 표시 | MySQL 연결 실패 | VPN 연결 상태 확인 |
| 전체 임직원 수가 이상함 | 코드가 구버전 | npm run build 후 재시작 |
| 포트 3000 사용 중 오류 | 기존 서버 실행 중 | `netstat -ano \| findstr :3000` 으로 PID 확인 후 `taskkill /PID [번호] /F` |
| 빌드 오류 | node_modules 문제 | `node_modules` 폴더 삭제 후 `npm install` 재실행 |
| pm2 명령어 없음 | pm2 미설치 | `npm install -g pm2` |

---

## 📌 포트 변경이 필요한 경우

3000번 외 다른 포트로 실행:
```powershell
# 예: 3001번으로 실행
npm start -- -p 3001

# pm2 사용 시
pm2 start node_modules/next/dist/bin/next --name "hecto-attendance" -- start
```

---

## 📌 연차/휴가 테이블 분석 정보 (추후 연동용)

나중에 대시보드에 연차/휴가 기능을 연동할 때 참고할 수 있도록 파악된 DB 구조와 코드를 여기에 기록해 둡니다.

### 1. 연차 사용 이력 테이블: `hr_yuncha_use`
- **`I_COMPANY`**: 회사코드 (`'1600'`)
- **`I_EMPLOY_NO`**: 사번
- **`D_START_DATE` / `D_END_DATE`**: 휴가 시작일 및 종료일 (예: `'20251212'` ~ `'20251215'`)
- **`I_CODE`**: 휴가 종류 코드 (아래 코드표 참고)
- **`N_RMK`**: 휴가 신청 사유 (예: `'개인사유'`)
- **`O_ANNLEV_CNT`**: 차감된 연차 일수 (반차: `0.500`, 1일 연차: `1.000` 등)
- **`I_STATUS`**: 결재 상태 코드 (`'40'`이 최종 승인 완료 상태)

### 2. 주요 휴가 코드 (`hr_diligence_code`)
- **`12`**: 연차
- **`16`**: 4시간휴가 [오전] (반차)
- **`17`**: 4시간휴가 [오후] (반차)
- **`19` ~ `28`**: 2시간휴가 [A~J] (반반차)
- **`60`**: 1년미만연차
- **`61` / `62`**: 1년미만 4시간휴가 [오전/오후]

### 3. 일 단위 최종 근태 테이블: `hr_day_diligence`
- 하루 단위로 최종 집계된 근태가 기록되는 테이블
- `D_DILI_DATE` (일자), `I_EMPLOY_NO` (사번), `I_CODE` (최종 근태 코드 - 예: `'16'`이 반차인 날 등)로 구성됨

