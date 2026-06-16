-- Create queue table for manual leave backfill requests.
-- Apply this in Supabase before using the backfill icon/worker.

CREATE TABLE IF NOT EXISTS public.sa_leave_backfill_queue (
  emp_no       VARCHAR(20) PRIMARY KEY,
  status       VARCHAR(20) DEFAULT 'pending',
  requested_by UUID REFERENCES auth.users(id),
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  last_error   TEXT,
  synced_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.sa_leave_backfill_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sa_leave_backfill_queue_admin_all" ON public.sa_leave_backfill_queue;

CREATE POLICY "sa_leave_backfill_queue_admin_all"
  ON public.sa_leave_backfill_queue
  FOR ALL
  USING (public.SA_is_admin() OR public.SA_is_leader());

CREATE INDEX IF NOT EXISTS idx_sa_leave_queue_status
  ON public.sa_leave_backfill_queue (status, requested_at);
