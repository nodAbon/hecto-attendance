CREATE TABLE IF NOT EXISTS public.sa_attendance_log_adjustments (
  id BIGSERIAL PRIMARY KEY,
  attendance_id BIGINT NOT NULL REFERENCES public.sa_attendance(id) ON DELETE CASCADE,
  emp_no VARCHAR(20) NOT NULL,
  work_date DATE NOT NULL,
  adjusted_role VARCHAR(10) NOT NULL CHECK (adjusted_role IN ('출근', '퇴근', '무시하기')),
  note TEXT,
  adjusted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (attendance_id)
);

ALTER TABLE public.sa_attendance_log_adjustments ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_sa_attendance_log_adjustments_emp_date
  ON public.sa_attendance_log_adjustments (emp_no, work_date);

CREATE INDEX IF NOT EXISTS idx_sa_attendance_log_adjustments_attendance_id
  ON public.sa_attendance_log_adjustments (attendance_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sa_attendance_log_adjustments'
      AND policyname = 'sa_attendance_log_adjustments_admin'
  ) THEN
    CREATE POLICY "sa_attendance_log_adjustments_admin"
      ON public.sa_attendance_log_adjustments
      FOR ALL
      USING (SA_is_admin() OR SA_is_leader());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sa_attendance_log_adjustments'
      AND policyname = 'sa_attendance_log_adjustments_self'
  ) THEN
    CREATE POLICY "sa_attendance_log_adjustments_self"
      ON public.sa_attendance_log_adjustments
      FOR SELECT
      USING (emp_no = SA_my_emp_no());
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
