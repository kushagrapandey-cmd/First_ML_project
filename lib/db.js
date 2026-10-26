import {neon} from '@neondatabase/serverless';
let client;
export function getSQL() {
  if(!process.env.DATABASE_URL)throw new Error('Database is not configured');
  return client ||= neon(process.env.DATABASE_URL);
}
export async function asUser(userId,queries) {
  const sql=getSQL();
  // Transaction-local identity is compatible with pooled connections; never SET a session-global user.
  const results=await sql.transaction([sql`SELECT set_config('ytguide.user_id', ${userId}, true)`,...queries(sql)],{isolationLevel:'ReadCommitted'});
  return results.slice(1);
}
