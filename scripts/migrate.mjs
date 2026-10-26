import {readFile} from 'node:fs/promises';
import {neon} from '@neondatabase/serverless';
if(!process.env.DATABASE_URL) {
  if(process.env.VERCEL)throw new Error('DATABASE_URL is required for an account-enabled deployment');
  console.log('No local database configured. Migration skipped; guest mode only.');
} else {
  const sql=neon(process.env.DATABASE_URL);
  const statements=(await readFile(new URL('../db/001_workspace.sql',import.meta.url),'utf8')).split('-- statement').map(s=>s.trim()).filter(Boolean);
  await sql.transaction([sql`SELECT pg_advisory_xact_lock(938426104)`,...statements.map(s=>sql.query(s,[]))]);
  console.log('YTGuide workspace migration 1 applied successfully.');
}
