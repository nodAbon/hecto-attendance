import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), 'sync/.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkRowCounts() {
  console.log('Checking Supabase table row counts...');
  
  const tables = ['sa_employees', 'sa_attendance', 'sa_leaves', 'sa_schedule_overrides'];
  
  for (const table of tables) {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });
      
    if (error) {
      console.error(`Error counting ${table}:`, error.message);
    } else {
      console.log(`Table: ${table} - Rows: ${count}`);
    }
  }
}

checkRowCounts();
