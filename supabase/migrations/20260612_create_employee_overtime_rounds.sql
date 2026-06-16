-- Create SA_employee_overtime_rounds table
CREATE TABLE IF NOT EXISTS SA_employee_overtime_rounds (
  emp_no VARCHAR(20) PRIMARY KEY REFERENCES SA_employees(emp_no) ON DELETE CASCADE,
  round_name VARCHAR(50) NOT NULL DEFAULT '1차',
  start_date DATE NOT NULL DEFAULT '2026-04-01',
  end_date DATE NOT NULL DEFAULT '2026-06-26',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
