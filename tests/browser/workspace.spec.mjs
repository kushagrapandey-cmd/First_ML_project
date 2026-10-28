import {test as base,expect} from '@playwright/test';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {load,mutate} from '../../api/workspace.js';

// Browser UI + production workspace SQL against a disposable schema.
// Only identity is stubbed. Managed-provider auth is tested in the Vercel preview build.
const test=base.extend({backend:async({context},use)=>{
 const pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});
 const schema='browser_'+randomUUID().replaceAll('-',''),user={id:'browser-fixture',name:'Browser fixture'};
 let signedIn=true,offline=false;
 const sql=(parts,...values)=>({text:parts.reduce((s,p,i)=>s+(i?'$'+i:'')+p,''),values});
 const asUser=async(id,queries)=>{
  const c=await pool.connect();try{await c.query('BEGIN');await c.query(`SET LOCAL search_path TO ${schema},public`);const rows=[];for(const q of queries(sql))rows.push((await c.query(q)).rows);await c.query('COMMIT');return rows;}
  catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 };
 await pool.query(`CREATE SCHEMA ${schema}`);
 const c=await pool.connect();try{await c.query(`SET search_path TO ${schema},public`);for(const f of ['001_workspace.sql','004_bookmark_quota.sql','005_collection_quota.sql'])await c.query(await readFile(new URL('../../db/'+f,import.meta.url),'utf8'));await c.query('INSERT INTO learner_profiles(user_id,display_name) VALUES($1,$2)',[user.id,user.name]);}finally{await c.query('RESET search_path');c.release();}
 await context.route('**/api/auth/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/sign-out'))signedIn=false;
  const token='e30.'+Buffer.from(JSON.stringify({sub:user.id})).toString('base64url')+'.fixture';
  await route.fulfill({json:path.endsWith('/token')?{token}:signedIn?{user}:null});
 });
 await context.route('**/api/workspace**',async route=>{
  if(route.request().url().includes('action=config'))return route.fulfill({json:{accountsConfigured:true}});
  if(offline)return route.abort();
  try{
   const body=route.request().method()==='POST'?route.request().postDataJSON():null;
   const result=body?await mutate(user,body,asUser):{user,workspace:await load(user,asUser)};
   await route.fulfill({status:result.conflict?409:200,json:result});
  }catch(e){await route.fulfill({status:e.status||409,json:{error:e.message}});}
 });
 try{await use({offline:v=>{offline=v;},guest:()=>{signedIn=false;},workspace:()=>load(user,asUser)});}
 finally{for(const page of context.pages())await page.close();await pool.query(`DROP SCHEMA ${schema} CASCADE`);await pool.end();}
}});
test.skip(!process.env.TEST_DATABASE_URL,'Set TEST_DATABASE_URL to a disposable PostgreSQL database');
const discover=async page=>{
 await page.goto('/?topic=sql&source=catalogue');
 await expect(page.locator('#storage-label')).toContainText('Account workspace');
 await expect(page.locator('#results .video-card').first()).toBeVisible();
};
test('search, notes, completion, bookmarks, collections, export, reload and logout',async({page,backend})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await discover(page);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
 await page.locator('[data-watch]').first().click();await page.locator('#lesson-notes').fill('A note saved through the browser and actual SQL.');
 await page.locator('#mark-complete').click();await page.locator('#bookmark-label').fill('Review this join');await page.locator('#bookmark-time').fill('01:10');await page.locator('#add-bookmark').click();
 await expect(page.locator('#bookmark-list')).toContainText('1:10');await page.locator('#save-lesson').click();await page.locator('#close-lesson').click();
 await page.locator('[data-view="workspace"]').first().click();await expect(page.locator('#sync-status')).toHaveText('Cloud synced ✓');
 await page.locator('#collection-name').fill('Browser collection');await page.locator('#collection-form button').click();
 await expect(page.locator('#sync-status')).toHaveText('Cloud synced ✓');await page.locator('#workspace-results [data-watch]').first().click();
 const collection=await page.locator('#lesson-collection option').nth(1).getAttribute('value');await page.locator('#lesson-collection').selectOption(collection);await page.locator('#add-to-collection').click();await expect(page.locator('#lesson-collections')).toContainText('Browser collection');await page.locator('#close-lesson').click();
 await expect(page.locator('#sync-status')).toHaveText('Cloud synced ✓');
 const download=page.waitForEvent('download');await page.locator('#export-backup').click();expect((await download).suggestedFilename()).toBe('YTGuide-workspace.json');
 await page.reload();await expect(page.locator('#sync-status')).toHaveText('Cloud synced ✓');await page.locator('#workspace-results [data-watch]').first().click();
 await expect(page.locator('#lesson-notes')).toHaveValue('A note saved through the browser and actual SQL.');await expect(page.locator('#mark-complete')).toHaveText('Marked complete ✓');await expect(page.locator('#bookmark-list')).toContainText('Review this join');
 const state=await backend.workspace();expect(state.notes).toHaveLength(1);expect(state.bookmarks).toHaveLength(1);expect(state.memberships).toHaveLength(1);
 await page.locator('#close-lesson').click();await page.locator('#account-button').click();await page.locator('#sign-out').click();await expect(page.locator('#storage-label')).toContainText('sign in');expect(errors).toEqual([]);
});
test('a reload during note debounce keeps the latest draft and synchronizes it',async({page,backend})=>{
 await discover(page);await page.locator('[data-watch]').first().click();await page.locator('#lesson-notes').fill('Reload immediately after typing');await page.reload();
 await expect.poll(async()=> (await backend.workspace()).notes[0]?.content).toBe('Reload immediately after typing');
});
test('two tabs keep conflicting drafts and offer explicit resolution',async({page,context,backend})=>{
 await discover(page);const other=await context.newPage();await discover(other);
 await page.locator('[data-watch]').first().click();await other.locator('[data-watch]').first().click();
 await page.locator('#lesson-notes').fill('First tab note');await page.locator('#close-lesson').click();
 await expect.poll(async()=>(await backend.workspace()).notes[0]?.content).toBe('First tab note');
 await other.locator('#lesson-notes').fill('Second tab draft');await expect(other.locator('#note-conflict')).toBeVisible();await expect(other.locator('#lesson-notes')).toHaveValue('Second tab draft');
 await other.locator('#keep-my-note').click();await other.locator('#close-lesson').click();await expect.poll(async()=>(await backend.workspace()).notes[0]?.content).toBe('Second tab draft');
});
test('offline edits stay pending and retry successfully when the connection returns',async({page,backend})=>{
 await discover(page);await page.locator('[data-watch]').first().click();backend.offline(true);await page.locator('#lesson-notes').fill('Offline browser draft');await page.locator('#close-lesson').click();
 await page.locator('[data-view="workspace"]').first().click();await expect(page.locator('#sync-status')).toContainText('pending');
 backend.offline(false);await page.locator('#sync-retry').click();await expect(page.locator('#sync-status')).toHaveText('Cloud synced ✓');expect((await backend.workspace()).notes[0].content).toBe('Offline browser draft');
});
test('guest gates, keyboard navigation, timer and theme work without saving personal data',async({page,backend})=>{
 backend.guest();await page.goto('/?topic=sql&source=catalogue');await expect(page.locator('#results .video-card').first()).toBeVisible();
 await page.getByRole('link',{name:'Skip to content',exact:true}).press('Enter');await expect(page.locator('#main')).toBeFocused();
 await page.locator('[data-save]').first().click();await expect(page.locator('#account-dialog')).toBeVisible();await page.keyboard.press('Escape');
 await page.locator('[data-watch]').first().click();await expect(page.locator('#lesson-notes')).toBeDisabled();await page.keyboard.press('Escape');
 const theme=await page.locator('#theme').isVisible()?page.locator('#theme'):page.locator('#theme-mobile');await theme.click();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 if(await page.locator('#start-focus').isVisible())await page.locator('#start-focus').click();
 else{await page.locator('[data-watch]').first().click();await page.locator('#lesson-timer').click();}
 await page.locator('#timer-toggle').click();await expect(page.locator('#timer-toggle')).toHaveText('Pause');await page.locator('#timer-toggle').click();await page.locator('#timer-reset').click();await expect(page.locator('#timer-display')).toHaveText('25:00');
 const state=await backend.workspace();expect(state.lessons).toHaveLength(0);expect(state.notes).toHaveLength(0);
});
