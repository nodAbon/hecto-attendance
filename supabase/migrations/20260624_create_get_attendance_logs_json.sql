CREATE OR REPLACE FUNCTION public.get_attendance_logs_json(
  log_time_from text,
  log_time_to text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT coalesce(jsonb_agg(t), '[]'::jsonb)
  FROM (
    SELECT 
      id, 
      emp_no, 
      card_no, 
      a_time, 
      log_time, 
      gate_name, 
      flag1, 
      event_type, 
      source
    FROM public.sa_attendance
    WHERE log_time >= log_time_from::timestamptz AND log_time <= log_time_to::timestamptz
    ORDER BY log_time DESC
  ) t;
$$;
