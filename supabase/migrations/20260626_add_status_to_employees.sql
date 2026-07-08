-- Add status column to sa_employees if it does not exist
ALTER TABLE public.sa_employees ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';
