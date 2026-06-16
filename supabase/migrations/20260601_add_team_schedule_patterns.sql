BEGIN;

CREATE TABLE IF NOT EXISTS public.sa_team_schedule_patterns (
  id             BIGSERIAL PRIMARY KEY,
  dept_name      VARCHAR(100) NOT NULL,
  work_date      DATE NOT NULL,
  pattern_code   VARCHAR(20) NOT NULL,
  pattern_name   VARCHAR(100) NOT NULL,
  schedule_start TIME,
  schedule_end   TIME,
  note           TEXT,
  created_by     UUID REFERENCES auth.users(id),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (dept_name, work_date)
);

ALTER TABLE public.sa_team_schedule_patterns ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sa_team_schedule_patterns'
      AND policyname = 'sa_team_schedule_patterns_admin'
  ) THEN
    CREATE POLICY "sa_team_schedule_patterns_admin"
      ON public.sa_team_schedule_patterns
      FOR ALL
      USING (SA_is_admin() OR SA_is_leader());
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sa_team_schedule_patterns_dept_date
  ON public.sa_team_schedule_patterns (dept_name, work_date);

NOTIFY pgrst, 'reload schema';

COMMIT;
