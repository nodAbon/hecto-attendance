# Agitated Raman Project Handoff

This document is the single source of truth for the current state of the project.
It is intended to let the next agent continue without re-discovering the whole codebase.

## 1. Project Summary

This is a Next.js attendance and HR portal backed by Supabase.
It supports:

- realtime attendance dashboard
- monthly attendance report
- detailed personal tracker
- leave overview and leave calendar
- overtime management
- manual attendance corrections
- employee schedule management
- employee admin management
- CAPS attendance file upload
- login, password change, and personal profile editing

The app is currently working end-to-end, and the production build passes.

## 2. Tech Stack

- Next.js 16.2.6
- React 19.2.4
- Supabase
- Lucide icons
- `xlsx` for CAPS file parsing
- `better-sqlite3`, `mysql2`, and `pg` are present in the repo, but Supabase is the primary live data source

## 3. How To Run

- Install dependencies: `npm install`
- Development: `npm run dev`
- Production build: `npm run build`
- Start production locally: `npm run start`
- Lint: `npm run lint`

## 4. Current Status

- Build is green.
- The app renders and the major flows work.
- The schedule management area has been converted to a calendar-based UX.
- CAPS upload works for `.xls` and `.xlsx`.
- Shared sidebar is the source of truth for main pages, mypage, and admin employee shell.
- A shared UI text catalog now exists at `src/lib/uiText.js`, and key labels already read from it.
- The UI text catalog now covers more of the dashboard header, department filter, refresh/theme buttons, table headers, leave overview labels, tracker top cards, schedule override labels, employee-admin labels, overtime labels, new-user registration form labels, and CAPS upload copy, which further reduces the surface area where text edits can damage JSX.
- A lot of historical mojibake still exists in comments and some legacy strings, but the runtime-critical pieces are mostly stable now.

## 5. Latest Fixes In This Session

- Dashboard KPI cards now use the full realtime employee set for counts, so clicking one card only filters the list/table below and no longer mutates the other KPI numbers.
  - The realtime employee-status table now uses a more stable sticky header and extra spacing, so the row text no longer visually collides with the header area.
  - The dashboard leave calendar selected-day view is back to grouped KPI-style cards instead of a flat list.
  - The dashboard/main sidebar now shows role badges consistently, so `ADMIN` or `LEADER` is visible outside the employee-admin shell as well.
  - The non-admin experience now defaults to the user's own team for dashboard KPIs, realtime statuses, tracker data, and monthly views, while the team selector is hidden for non-admins; the dashboard leave calendar and the leave overview tab still show the full company leave set.
  - The realtime employee-status table on the dashboard now uses a fixed height and fixed column layout, and the checkout column was removed so KPI clicks no longer make the table visually jump around.
  - Overtime navigation and data visibility now follow the department rule: only business development, business management 1~3, and platform service office users can access it unless they are admins, team leads, or executives, and team members stay scoped to their own team.
  - The employee schedule calendar now hides department selection for non-admins, while admins can still change departments there.
  - The admin-facing user-registration and CAPS-upload sections were brought back onto the shared card surface as well, so their buttons and inputs follow the same visual language as mypage and the rest of the app instead of looking like separate ad hoc forms.
  - Manual approval now loads monthly data reliably on direct entry because the monthly fetch runs for that tab and the selected month defaults to the current month, and its title, subtitle, table headers, status badges, and action buttons now read from the shared UI text catalog too.
  - The tracker calendar now also reads its key labels, weekday row, and correction/override badges from the shared UI text catalog, which further reduces mojibake exposure in the most frequently edited calendar area.
  - The overtime, user-registration, and CAPS upload sections also started moving their section titles, table headers, and button/placeholder copy into the shared UI text catalog, so those high-churn admin areas are safer to edit now too.
  - The user-registration form now also uses the catalog for sample placeholders and select prompts, and the CAPS upload copy now uses catalog-backed support hints and column hints, which keeps those admin forms from contributing extra mojibake surface area.
  - The schedule-management, employee-admin, and overtime sections also moved their card titles, table headers, buttons, prompts, and placeholders into the shared UI text catalog, which further shrinks the amount of text that still lives directly inside `page.js`.
  - Dashboard tracker/status labels such as late badges, work-day units, overtime units, and the schedule override card's labels/buttons now read from the shared UI text catalog too, keeping the most frequently edited status UI off the main page file.
  - The most common admin alerts and confirmations for user registration, CAPS upload, employee admin save/reset, leave backfill, schedule override, manual approval, and overtime-period deletion were also moved to the shared message catalog, which is helping contain the remaining text churn in `page.js`.
  - The employee-admin password placeholder and the schedule override labels were also moved into the shared catalog during this pass, so those forms can now be edited with less risk of damaging JSX structure or introducing more mojibake.
  - Common admin alert/confirm messages for schedule saves, check-in processing, correction saves, and overtime-period deletion were also moved into the shared message catalog, which keeps more of the high-frequency feedback text out of `page.js`.
  - The footer action labels now read from the shared sidebar catalog again, which restored the `logout` and `mypage` labels without tying them to the dashboard page copy block.
  - The dashboard profile badges now also reuse the shared sidebar badge labels, so `ADMIN` and `LEADER` are no longer hard-coded inside the main page file.
  - The stray `src/app/page_clean.js` copy was removed so future text cleanup and grep passes only hit the active route file.
  - The mypage screen was rewritten into a clean UTF-8 version with the existing profile/password behavior preserved, which removes one of the most visible mojibake-heavy screens from the workspace.
  - The shared UI text catalog itself was rewritten back into a clean UTF-8 source file, which re-established the single shared home for sidebar, dashboard, tracker, monthly, leave, overtime, manual-approval, registration, upload, and common alert copy.
  - The dashboard status badges also now read from the shared catalog for the common `근무중` and `미출근` labels, which keeps the most visible realtime list state strings off the main page file.
  - The tracker memo placeholders, late marker text, and fallback correction reason text were also moved into the shared catalog, which keeps another high-frequency part of the dashboard out of the main page file.
  - Common dashboard unit labels such as `명`, `건`, `일`, and `회`, plus the calendar-like employee table header, were also moved to shared copy so those inline counters no longer need to be edited directly in the page markup.
  - The remaining visible strings in `page.js` are now mostly domain-rule data such as holiday maps, leave-type classification labels, and short status constants rather than user-facing prose, so the next cleanup passes should be lower-risk.
  - The holiday and leave-classification rules were split out into `src/lib/leaveRules.js`, which removed a large block of attendance domain constants and helper functions from the top of `page.js`.
  - Shared employee option lists were also split out into `src/lib/employeeOptions.js`, and the overtime-only department list moved into `src/lib/overtimeRules.js`, which further shrinks the amount of rule data living inside the main page file.
- The schedule calendar detail view remains card-based and continues to support per-day override deletion.
  - A shared UI text catalog at `src/lib/uiText.js` is now the preferred home for repeated UI strings. Sidebar labels, dashboard headers, monthly report text, tracker text, calendar copy, leave overview labels, schedule override labels, employee-admin labels, overtime labels, manual-approval labels, user-registration labels, and CAPS upload copy already read from it, which reduces the chance that future text edits will damage large JSX blocks.
  - A final source scan over the active `src` and `supabase` text files found no remaining mojibake patterns in the live code path, and the app still passes `npm.cmd run build`, so the current working tree is in a clean, runnable state for the visible UI surface.

## 6. Key Domain Rules

### Attendance source rules

- `source = 'secom'`
  - used for Secom-synced attendance
- `source = 'caps'`
  - used for uploaded CAPS attendance

### Department routing rules

These departments use Secom attendance as the source of truth:

- 플랫폼서비스실
- 사업개발팀
- 사업관리 1팀
- 사업관리 2팀
- 사업관리 3팀

All other departments use CAPS uploads for attendance.

### Schedule rules

- 기본 출근시간 is the employee-level default.
- 일자별 출근시간 예외 is stored separately.
- A calendar-based UI is used to edit date-specific exceptions.
- Exports / leave / overtime are intentionally kept as separate concepts.

## 7. Important Business / UX Decisions

- The old split sidebars were replaced by one shared sidebar.
- The `설정` menu is removed from the main navigation flow.
- The sidebar now uses the company logo image `HQ.png` and shared config.
- MyPage uses one large card instead of two separate cards.
- Table styling was normalized into a single card-like table system.
- Buttons, badges, inputs, and selects were aligned to the same visual tone.
- Leave and calendar panels were redesigned for better light/dark contrast.
- The schedule screen now uses:
  - department filter
  - employee filter
  - monthly calendar
  - per-day exception editing
  - per-day exception deletion

## 8. Main User Flows

### Login / first login

- Users log in with the existing auth flow.
- Initial password change page is styled like the login page, not a dark-only screen.
- The profile and auth lookup paths were fixed so that `bhkim / 20240052` resolves correctly.

### Dashboard

Main dashboard includes:

- KPI cards
- realtime attendance status
- leave overview
- calendar widget
- monthly / tracker / overtime shortcuts

The dashboard calendar is designed to show leave types with strong visual grouping.

### Monthly attendance report

- Available to admin and relevant roles.
- Uses the month filter and attendance data from Supabase.

### Detailed tracker

- Admin can see everyone.
- Team lead sees only their department.
- Regular users see only their own data.

### Leave overview

- Renamed from “휴가 신청 현황” to “휴가 현황”.
- The calendar/detail panels show leave types with grouped cards.

### Employee schedule management

This area now uses a calendar-based UX:

- default employee schedule is still managed
- date-specific schedule override is managed through a calendar
- clicking a date loads the exception edit panel
- the right panel shows employee info, base schedule, selected date, and the month’s override list
- each override can be removed directly from the panel

### CAPS upload

- Upload supports `.xls` and `.xlsx`
- The sample file `Search_20260527.xls` was used during validation
- File parsing uses the columns:
  - 발생일자
  - 발생시각
  - 이름
  - 사원번호
- `Q_` prefixes are stripped from names
- matching is employee-number-first
- rows without valid employee numbers are skipped
- `X` and non-relevant rows are skipped silently

### MyPage

- One large card layout
- profile editing
- password change
- shared sidebar

### Employee admin

- shared sidebar
- employee info editing
- password reset
- leave backfill request
- employee list search

## 9. Routes / Pages

### Main pages

- `/`
  - dashboard + all major tabs
- `/mypage`
  - personal profile page
- `/login`
  - login page
- `/login/change-password`
  - forced password change screen
- `/admin/employees`
  - admin employee management

### Legacy / support routes

- `/settings`
  - still appears in the build output as a legacy route, but it is not meant to be a primary navigation target anymore

## 10. Important Files

### App shell / navigation

- `src/components/AppSidebar.js`
- `src/lib/sidebarConfig.js`

### Main page

- `src/app/page.js`

### MyPage

- `src/app/mypage/page.js`

### Employee admin

- `src/app/admin/employees/EmployeeAdminShell.js`
- `src/app/admin/employees/page.js`

### Auth

- `src/lib/auth.js`
- `src/app/api/auth/login/route.js`
- `src/app/api/auth/logout/route.js`
- `src/app/api/auth/me/route.js`
- `src/app/api/auth/profile/route.js`
- `src/app/api/auth/change-password/route.js`

### Attendance / schedule / leave APIs

- `src/app/api/attendance/route.js`
- `src/app/api/attendance/correction/route.js`
- `src/app/api/attendance/manual-checkin/route.js`
- `src/app/api/attendance/overtime-periods/route.js`
- `src/app/api/attendance/holiday-work/route.js`
- `src/app/api/employees/schedule/route.js`
- `src/app/api/employees/schedule-override/route.js`
- `src/app/api/admin/caps-attendance/upload/route.js`
- `src/app/api/admin/employees/route.js`
- `src/app/api/admin/employees/reset-password/route.js`
- `src/app/api/admin/create-user/route.js`
- `src/app/api/admin/leave-backfill/request/route.js`
- `src/app/api/sync/trigger/route.js`

### Supabase helpers / parsing

- `src/lib/supabaseDb.js`
- `src/lib/capsAttendance.js`
- `src/lib/clock.js`
- `src/lib/usePersistentTheme.js`
- `src/lib/uiText.js`

### Styles

- `src/app/globals.css`

## 11. Data Model

These are the important tables in `supabase/schema.sql` and the related migrations:

- `SA_employees`
  - employee master data
  - emp number, name, dept, company code, active flag
- `SA_attendance`
  - attendance logs
  - now includes `source` to distinguish Secom / CAPS
- `SA_leaves`
  - leave history and leave types
- `SA_leave_backfill_queue`
  - queue for leave backfill requests
- `SA_profiles`
  - auth profile mapping
  - links Supabase auth user to employee and role info
- `SA_overtime_settings`
  - overtime threshold by department
- `SA_overtime_periods`
  - overtime period definition
- `SA_attendance_corrections`
  - corrected checkout records
- `SA_schedule_overrides`
  - date-specific schedule exceptions
- `SA_employee_schedules`
  - employee-level base schedule time
- `SA_holiday_work`
  - holiday work and comp leave data
- `SA_manual_checkins`
  - manual attendance requests / approvals

### Important columns

- `SA_attendance.source`
  - `caps` or `secom`
- `SA_employee_schedules.schedule_time`
  - the default base clock-in time for an employee
- `SA_schedule_overrides.schedule_start`
  - date-specific exception clock-in time
- `SA_schedule_overrides.schedule_end`
  - optional date-specific exception clock-out time

## 11. API Behavior Notes

### `/api/attendance`

- Returns:
  - realtime stats
  - employee statuses
  - recent logs
  - all logs
  - all employees
  - leaves
  - corrections
  - overrides
  - manual checkins
  - overtime settings
- Used by the dashboard, monthly view, tracker, and schedule calendar

### `/api/employees/schedule`

- GET returns base schedules
- POST saves base schedules
- backed by `SA_employee_schedules`

### `/api/employees/schedule-override`

- POST creates or updates date-specific exceptions
- DELETE removes the exception for a given employee/date

### `/api/admin/caps-attendance/upload`

- parses CAPS exports
- upserts into `SA_attendance`
- source is set to `caps`

### `/api/sync/trigger`

- Secom synchronization path
- source is set to `secom`

## 12. Calendar Schedule UX

The schedule management area now behaves like this:

- the user picks a department
- then picks an employee
- then uses a monthly calendar
- each day shows:
  - day number
  - base schedule badge
  - if available, actual clock-in and clock-out times
  - an indication whether it is today
  - an indication whether it is an override day
- clicking a day loads the exception editor
- the right panel lists this employee’s overrides for the month
- each override can be removed from the panel

### Visual rules used in the calendar

- 출근 time is a different color from 퇴근 time
- text color is the priority over panel color
- in/out values are shown compactly as:
  - `출근 09:30`
  - `퇴근 18:22`
- if there is no log data, the display remains blank rather than showing noisy helper text

## 13. Known Risks / Fragility

### `src/app/page.js`

This is still the most fragile file in the repo.

Why:

- it contains a lot of historical recovery work
- there are still many mojibake strings in comments and some legacy UI text
- it has many responsibilities in one file
- the React hook structure is large and easy to destabilize

What to watch:

- avoid broad replacements unless necessary
- verify build after each non-trivial edit
- if a branch of UI is touched, open it in the browser and check for stale chunk issues

### Lint noise

`src/app/page.js` still tends to trigger React hook lint warnings when run in strict lint mode.
The build is green, but the file is not “clean” from a lint-policy perspective.

### Encoding / mojibake

- The repo has had many encoding issues in the past.
- UTF-8 normalization was added, but legacy strings may still exist.
- If text is visibly broken, treat it as a real cleanup task, not just a display bug.

## 14. Environment / Deployment Notes

### Environment variables

The deployment relies on Supabase variables such as:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

### Vercel

- The project has been deployed via Vercel.
- The production deployment has been used as the reference for the shared sidebar layout.
- Region was intended to be Singapore (`sin1`) in the Vercel config.

## 15. Recent Important Fixes

These have already been addressed in the current codebase:

- corrupted regex causing SSR `ChunkLoadError`
- hydration mismatch on first dashboard load
- duplicate calendar keys
- undefined leave meta `.bg`
- broken sidebar drift between pages
- CAPS upload parser and file support
- auth/profile mapping for `bhkim / 20240052`
- `source` column in `SA_attendance`
- calendar-based schedule management
- schedule exception deletion
- improved light/dark contrast for badges, buttons, and calendar elements

## 16. What The Next Agent Should Do First

Recommended order:

1. Check the app in the browser and confirm the schedule calendar feels correct.
2. If any text still looks garbled, normalize that file carefully rather than doing broad search/replace.
3. If the schedule UX needs more polish, continue improving the calendar panel rather than reintroducing the old table-first workflow.
4. Keep the shared sidebar as the source of truth.
5. Avoid changing the data model unless a real business rule requires it.

## 17. Short Practical Summary

If you only read one section, read this:

- The app is a Supabase-backed attendance portal.
- Shared sidebar is centralized.
- CAPS upload and Secom sync both work and are separated by `source`.
- Employee schedules now have:
  - default base time
  - date-specific overrides
  - calendar editing
  - override deletion
- Build is green.
- The biggest remaining maintenance risk is `src/app/page.js`.
