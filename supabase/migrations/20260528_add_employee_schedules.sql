BEGIN;

CREATE TABLE IF NOT EXISTS public.sa_employee_schedules (
  emp_no        VARCHAR(20) PRIMARY KEY REFERENCES public.sa_employees(emp_no) ON DELETE CASCADE,
  schedule_time TIME NOT NULL DEFAULT '08:00:00',
  updated_by    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.sa_employee_schedules ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sa_employee_schedules'
      AND policyname = 'sa_employee_schedules_admin'
  ) THEN
    CREATE POLICY "sa_employee_schedules_admin"
      ON public.sa_employee_schedules
      FOR ALL
      USING (SA_is_admin() OR SA_is_leader());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sa_employee_schedules'
      AND policyname = 'sa_employee_schedules_self'
  ) THEN
    CREATE POLICY "sa_employee_schedules_self"
      ON public.sa_employee_schedules
      FOR SELECT
      USING (emp_no = SA_my_emp_no());
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sa_employee_schedules_updated
  ON public.sa_employee_schedules (updated_at DESC);

COMMIT;
