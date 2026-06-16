ALTER TABLE public.sa_leaves
  ADD COLUMN IF NOT EXISTS emp_name VARCHAR(100);

UPDATE public.sa_leaves l
SET emp_name = e.name
FROM public.sa_employees e
WHERE e.emp_no = l.emp_no
  AND COALESCE(l.emp_name, '') = '';
