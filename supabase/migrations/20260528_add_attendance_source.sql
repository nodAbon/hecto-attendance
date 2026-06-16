ALTER TABLE public.sa_attendance
  ADD COLUMN IF NOT EXISTS source VARCHAR(20);

