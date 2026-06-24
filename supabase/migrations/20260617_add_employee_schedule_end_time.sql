BEGIN;

ALTER TABLE public.sa_employee_schedules
  ADD COLUMN IF NOT EXISTS schedule_end_time TIME;

COMMIT;
