import {readFile} from 'node:fs/promises';
import {neon} from '@neondatabase/serverless';
if(!process.env.DATABASE_URL) {
  if(process.env.VERCEL)throw new Error('DATABASE_URL is required for an account-enabled deployment');
  console.log('No local database configured. Migration skipped; public browsing only.');
} else {
  const sql=neon(process.env.DATABASE_URL);
  const statements=[];
  for(const name of ['001_workspace.sql','002_search_cache.sql','003_feedback.sql','004_bookmark_quota.sql'])statements.push(...(await readFile(new URL('../db/'+name,import.meta.url),'utf8')).split('-- statement').map(s=>s.trim()).filter(Boolean));
  await sql.transaction([sql`SELECT pg_advisory_xact_lock(938426104)`,...statements.map(s=>sql.query(s,[]))]);
  console.log('YTGuide database migrations applied successfully.');
}

