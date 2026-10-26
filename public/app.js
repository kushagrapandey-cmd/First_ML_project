'use strict';
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
let storageScope = 'guest';
let authenticated = false;
const personalKey = key => key !== 'ytguide.theme';
function requireAccount(){
  if(authenticated)return true;
  toast('Sign in to save lessons, notes, bookmarks and progress.');
  window.dispatchEvent(new Event('ytguide:signin'));
  return false;
}
function updateAccountControls(){
  for(const selector of ['#lesson-notes','#bookmark-label','#bookmark-time','#lesson-collection'])$(selector).disabled=!authenticated;
  $('#note-status').textContent=authenticated?'Notes sync to your account.':'Sign in to take notes and save your progress.';
  $('#lesson-auth-prompt').hidden=authenticated;
}
const storageKey = key => storageScope === 'guest' || key === 'ytguide.theme' ? key : `${storageScope}:${key}`;
const ID = /^[a-zA-Z0-9_-]{11}$/;
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let toastTimeout;
function toast(message) {
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { $('#toast').hidden = true; }, 3500);
}
function read(key, fallback) {
  if(storageScope==='guest'&&personalKey(key))return fallback;
  try { return JSON.parse(localStorage.getItem(storageKey(key))) ?? fallback; } catch { return fallback; }
}
function write(key, value) {
  if(storageScope==='guest'&&personalKey(key))return false;
  try { localStorage.setItem(storageKey(key), JSON.stringify(value)); return true; }
  catch { toast('Device storage is unavailable or full. Export your notes to keep them.'); return false; }
}
function validVideo(v) {
  return v && typeof v === 'object' && typeof v.id === 'string' && ID.test(v.id) && typeof v.title === 'string' && typeof v.channel === 'string';
}
let saved = read('ytguide.saved.v2', []);
if (!Array.isArray(saved)) saved = [];
saved = [...new Map(saved.filter(validVideo).slice(0, 300).map(v => [v.id, v])).values()];
let completed = read('ytguide.completed.v2', []);
if (!Array.isArray(completed)) completed = [];
completed = [...new Set(completed.filter(id => typeof id === 'string' && ID.test(id)).slice(0, 1000))];
let notes = read('ytguide.notes.v2', {});
if (!notes || typeof notes !== 'object' || Array.isArray(notes)) notes = {};
notes = Object.fromEntries(Object.entries(notes).filter(([id, text]) => ID.test(id) && typeof text === 'string').slice(0, 300).map(([id, text]) => [id, text.slice(0, 8000)]));
let lessonIndex = {...Object.fromEntries(saved.map(v=>[v.id,v])), ...read('ytguide.lessons.v3',{})};
let positions = read('ytguide.positions.v3',{});
let bookmarks = read('ytguide.bookmarks.v3',{});
let collections = read('ytguide.collections.v3',[]);
let memberships = read('ytguide.memberships.v3',{});
let noteVersions = {};
function normalizeWorkspace(){
  const object=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
  saved=Array.isArray(saved)?saved.filter(validVideo).slice(0,300):[];
  completed=Array.isArray(completed)?completed.filter(id=>typeof id==='string'&&ID.test(id)).slice(0,1000):[];
  notes=Object.fromEntries(Object.entries(object(notes)).filter(([id,v])=>ID.test(id)&&typeof v==='string').map(([id,v])=>[id,v.slice(0,8000)]));
  lessonIndex=Object.fromEntries(Object.entries(object(lessonIndex)).filter(([,v])=>validVideo(v)));
  for(const v of saved)lessonIndex[v.id]=v;
  positions=Object.fromEntries(Object.entries(object(positions)).filter(([id,v])=>ID.test(id)&&Number.isSafeInteger(v)&&v>=0&&v<=604800));
  collections=Array.isArray(collections)?collections.filter(c=>c&&typeof c.id==='string'&&/^[0-9a-f-]{36}$/i.test(c.id)&&typeof c.name==='string'&&c.name.trim()&&c.name.length<=60).slice(0,50):[];
  bookmarks=Object.fromEntries(Object.entries(object(bookmarks)).filter(([id,list])=>ID.test(id)&&Array.isArray(list)).map(([id,list])=>[id,list.filter(b=>b&&typeof b.id==='string'&&/^[0-9a-f-]{36}$/i.test(b.id)&&Number.isSafeInteger(b.seconds)&&b.seconds>=0&&b.seconds<=604800&&typeof b.label==='string'&&b.label.length<=200).slice(0,100)]));
  memberships=Object.fromEntries(Object.entries(object(memberships)).filter(([id,list])=>ID.test(id)&&Array.isArray(list)).map(([id,list])=>[id,list.filter(c=>collections.some(v=>v.id===c))]));
}
normalizeWorkspace();
let noteConflicts = {};
let playerInstance = null;
let playerReady = false;
let playerApiPromise;
let lastPositionSaved = 0;
let noteDebounce;
let noteDirty=false;
function emitMutation(action,payload) { if(!authenticated)return; window.dispatchEvent(new CustomEvent('ytguide:mutation',{detail:{action,...payload}})); }
function remember(video) {if(authenticated&&validVideo(video)){lessonIndex[video.id]=video;write('ytguide.lessons.v3',lessonIndex);}}
const stamp = seconds => `${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
function persistExtras() {
  write('ytguide.positions.v3',positions);write('ytguide.bookmarks.v3',bookmarks);
  write('ytguide.collections.v3',collections);write('ytguide.memberships.v3',memberships);
}
let videos = [];
let currentVideo = null;
let currentView = 'discover';
let request = null;
let generation = 0;
const isSaved = id => saved.some(v => v.id === id);
const languageLabel = language => ({en:'English', hi:'Hindi'}[language] || 'Language unconfirmed');
const durationLabel = seconds => Number.isFinite(seconds) && seconds > 0 ? (seconds >= 3600 ? `${Math.floor(seconds/3600)}h ${Math.floor((seconds%3600)/60)}m` : `${Math.ceil(seconds/60)} min`) : 'Length unconfirmed';

function card(video, index, workspace = false) {
  const done = completed.includes(video.id);
  return `<article class="video-card"><button class="thumb-button" data-watch="${video.id}" aria-label="Watch ${escapeHtml(video.title)}"><span class="thumb-fallback" aria-hidden="true"><span>YTGuide / ${escapeHtml(({python:"PYTHON",web:"WEB DEVELOPMENT",java:"JAVA",ml:"MACHINE LEARNING",sql:"SQL",linux:"LINUX & BASH",dsa:"DATA STRUCTURES"})[video.topic] || "STUDY LESSON")}</span><strong>${escapeHtml(video.title)}</strong><i>YOUR NEXT LESSON ↗</i></span><img src="https://i.ytimg.com/vi/${video.id}/hqdefault.jpg" alt="" loading="lazy" width="480" height="270"><span class="rank-badge">${workspace === true ? 'SAVED LESSON' : `PICK ${String(index+1).padStart(2,'0')}`}</span><span class="play" aria-hidden="true">▶</span></button><div class="card-body"><div class="card-meta"><span>${escapeHtml(languageLabel(video.language))}</span><span>${escapeHtml(durationLabel(video.duration))}</span></div>${positions[video.id] > 0 ? `<span class="resume-label">Resume from ${stamp(positions[video.id])}</span>` : ''}${done ? '<span class="complete-badge">✓ Marked complete</span>' : ''}<h3 class="card-title">${escapeHtml(video.title)}</h3><p class="card-channel">${escapeHtml(video.channel)}</p><details class="match-details"><summary>Why this lesson?</summary><p>${escapeHtml(video.reason || 'You saved this lesson to your workspace.')}.</p><p>Text relevance, not a quality score. ${video.source === 'youtube' ? 'Retrieved from YouTube.' : 'From the study catalogue.'}</p></details><div class="card-actions"><button class="watch-button" data-watch="${video.id}">Watch lesson <span aria-hidden="true">↗</span></button><button class="save-button" data-save="${video.id}" aria-pressed="${isSaved(video.id)}" aria-label="${isSaved(video.id)?'Unsave':'Save'} ${escapeHtml(video.title)}">${isSaved(video.id)?'✓':'+'}</button></div></div></article>`;
}
function updateWorkspace() {
  $('#saved-count').textContent = saved.length;
  $('#stat-saved').textContent = saved.length;
  $('#stat-complete').textContent = completed.length;
  $('#stat-notes').textContent = Object.values(notes).filter(n => n.trim()).length;
  if (currentView === 'workspace' && !authenticated) {
    $('#workspace-results').innerHTML='<div class="empty-state"><h3>Your workspace needs an account.</h3><p>Sign in to keep lessons, notes, bookmarks and progress across devices. Browsing and watching are free without an account.</p><button class="primary" data-signin>Sign in / create account</button></div>';
  } else if (currentView === 'workspace') {
    const filter=$('#workspace-filter').value;
    const source=filter==='saved'?saved:Object.values(lessonIndex).filter(validVideo).filter(v=>filter==='recent'||(filter==='completed'&&completed.includes(v.id))||(filter==='notes'&&notes[v.id]?.trim())||(filter.startsWith('collection:')&&(memberships[v.id]||[]).includes(filter.slice(11))));
    $('#workspace-results').innerHTML = source.length ? source.map((v, i) => card(v, i, true)).join('') : '<div class="empty-state"><h3>Your next chapter starts with a save.</h3><p>Tap + on a lesson to keep it here. Your notes and progress sync to your account.</p><button class="primary" data-view="discover">Discover lessons ↗</button></div>';
  }
  $$('[data-save]').forEach(button => {
    const v = [...videos, ...saved].find(v => v.id === button.dataset.save);
    const selected = isSaved(button.dataset.save);
    button.setAttribute('aria-pressed', String(selected));
    button.setAttribute('aria-label', `${selected ? 'Unsave' : 'Save'} ${v?.title || 'lesson'}`);
    button.textContent = selected ? '✓' : '+';
  });
  renderCollections();
  if (currentVideo) $('#save-lesson').textContent = isSaved(currentVideo.id) ? 'Remove from saved −' : 'Save lesson +';
}
document.addEventListener('click',event=>{
  const button=event.target.closest('button');
  if(!button)return;
  if(button.matches('[data-signin]')){event.preventDefault();window.dispatchEvent(new Event('ytguide:signin'));return;}
  if(button.matches('[data-save],#save-lesson,#mark-complete,#add-bookmark,#add-to-collection,#export-notes,#export-backup,[data-delete-collection],[data-rename-collection],[data-remove-membership],[data-remove-bookmark]')&&!authenticated){event.preventDefault();event.stopImmediatePropagation();requireAccount();}
},true);
document.addEventListener('submit',event=>{if(event.target.id==='collection-form'&&!authenticated){event.preventDefault();event.stopImmediatePropagation();requireAccount();}},true);
function toggleSave(video) {
  if (!video || !requireAccount()) return;
  remember(video);
  const before = isSaved(video.id);
  if (!before && saved.length >= 300) { toast('Your workspace holds 300 lessons. Remove one to make room.'); return; }
  saved = before ? saved.filter(v => v.id !== video.id) : [{...video}, ...saved];
  const stored = write('ytguide.saved.v2', saved);
  emitMutation('lesson',{video,patch:{saved:!before}});
  updateWorkspace();
  if (stored) toast(before ? 'Lesson removed. Your notes are still here.' : 'Lesson saved.');
}
function showView(view, moveFocus = true) {
  if (!['discover','workspace','about'].includes(view)) return;
  currentView = view;
  persistNavigation();
  ['discover','workspace','about'].forEach(name => { $(`#${name}-view`).hidden = name !== view; });
  $$('.nav-item').forEach(button => {
    const active = button.dataset.view === view;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current');
  });
  $('#breadcrumb').textContent = {discover:'Discover',workspace:'My workspace',about:'How it works'}[view];
  updateWorkspace();
  if (moveFocus) { window.scrollTo(0,0); $('#main').focus({preventScroll:true}); }
}
async function findLessons(event) {
  event?.preventDefault();
  persistNavigation();
  request?.abort();
  request = new AbortController();
  const ownGeneration = ++generation;
  const timeout = setTimeout(() => request?.abort(), 24000);
  $('#search-button').disabled = true;
  $('#search-button').textContent = 'Finding your lessons…';
  $('#results').setAttribute('aria-busy', 'true');
  $('#results').innerHTML = '<div class="loading" role="status">Finding a focused place to start…</div>';
  $('#source-notice').textContent = '';
  const params = new URLSearchParams(new FormData($('#search-form')));
  try {
    const response = await fetch(`/api/recommend?${params}`, {signal:request.signal});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not load lessons.');
    if (ownGeneration !== generation) return;
    videos = result.videos.filter(validVideo);
    $('#result-meta').textContent = `${videos.length} lessons · ${result.candidates} candidates`;
    $('#source-notice').textContent = result.notice;
    $('#results').innerHTML = videos.length ? videos.map((v, i) => card(v, i)).join('') : '<div class="empty-state"><h3>No matching lessons in this source.</h3><p>Try Live YouTube, broaden your goal, or search YouTube directly. The study catalogue has limited coverage.</p><a class="secondary" href="${escapeHtml(youtubeSearchURL())}" target="_blank" rel="noopener noreferrer">Search this topic on YouTube ↗</a><button class="secondary" id="clear-filters">Reset filters</button></div>';
  } catch (error) {
    if (ownGeneration !== generation) return;
    $('#result-meta').textContent = '';
    $('#results').innerHTML = `<div class="empty-state"><h3>Let’s try that again.</h3><p>${escapeHtml(error.name === 'AbortError' ? 'The search took too long. Please retry.' : error.message)}</p><a class="secondary" href="${escapeHtml(youtubeSearchURL())}" target="_blank" rel="noopener noreferrer">Search this topic on YouTube ↗</a><button class="primary" id="retry-search">Retry search ↗</button></div>`;
  } finally {
    clearTimeout(timeout);
    if (ownGeneration === generation) {
      $('#results').setAttribute('aria-busy', 'false');
      $('#search-button').disabled = false;
      $('#search-button').innerHTML = 'Find my lessons <span aria-hidden="true">↗</span>';
    }
  }
}
function openLesson(video) {
  if (!validVideo(video)) return;
  currentVideo = video;
  noteDirty=false;
  remember(video);
  emitMutation('lesson',{video,patch:{}});
  $('#lesson-title').textContent = video.title;
  $('#lesson-channel').textContent = video.channel;
  $('#youtube-link').href = `https://www.youtube.com/watch?v=${video.id}`;
  $('#lesson-notes').value = notes[video.id] || '';
  updateAccountControls();
  renderNoteConflict();
  renderBookmarks();
  $('#playback-position').textContent = positions[video.id] ? `Resume from ${stamp(positions[video.id])}. Completion is marked manually.` : 'Playback starts when you choose.';
  $('#bookmark-time').value = '';
  $('#mark-complete').textContent = completed.includes(video.id) ? 'Marked complete ✓' : 'Mark complete ✓';
  $('#mark-complete').setAttribute('aria-pressed', String(completed.includes(video.id)));
  $('#player').innerHTML = '<div class="player-placeholder"><p>Ready when you are.</p><button class="primary" id="load-player">Load YouTube player ▶</button><p>Loading connects to YouTube. No autoplay.</p></div>';
  updateWorkspace();
  $('#lesson-dialog').showModal();
}
$('#lesson-dialog').addEventListener('close', () => {
  if(currentVideo&&noteDirty){clearTimeout(noteDebounce);emitMutation('note',{video:currentVideo,content:notes[currentVideo.id]||''});noteDirty=false;}
  savePosition(true);
  if(playerInstance){try{playerInstance.destroy();}catch{} playerInstance=null;}
  playerReady=false;
  $('#player').replaceChildren(); currentVideo = null;
  document.body.append($('#timer-widget'));
  $('#timer-widget').classList.remove('embedded');
});
$('#close-lesson').addEventListener('click', () => $('#lesson-dialog').close());
$('#lesson-notes').addEventListener('input', () => {
  if (!currentVideo || !authenticated) return;
  if (!Object.hasOwn(notes,currentVideo.id) && Object.keys(notes).length >= 300) {
    $('#note-status').textContent = 'Notes limit reached. Export your existing notes first.'; return;
  }
  noteDirty=true;
  notes[currentVideo.id] = $('#lesson-notes').value;
  const stored = write('ytguide.notes.v2', notes);
  $('#note-status').textContent = stored ? (storageScope==='guest'?'Saved on this device ✓':'Saved locally · cloud sync pending') : 'Not saved. Copy or export your notes before leaving.';
  const video={...currentVideo}; const content=notes[video.id];
  clearTimeout(noteDebounce);
  noteDebounce=setTimeout(()=>{emitMutation('note',{video,content});if(currentVideo?.id===video.id&&notes[video.id]===content)noteDirty=false;},700);
  updateWorkspace();
});
$('#save-lesson').addEventListener('click', () => toggleSave(currentVideo));
$('#mark-complete').addEventListener('click', () => {
  if (!currentVideo || !requireAccount()) return;
  const id = currentVideo.id;
  completed = completed.includes(id) ? completed.filter(v => v !== id) : [...completed, id];
  write('ytguide.completed.v2', completed);
  emitMutation('lesson',{video:currentVideo,patch:{completed:completed.includes(id)}});
  $('#mark-complete').textContent = completed.includes(id) ? 'Marked complete ✓' : 'Mark complete ✓';
  $('#mark-complete').setAttribute('aria-pressed', String(completed.includes(id)));
  if (videos.length) $('#results').innerHTML = videos.map((v, i) => card(v, i)).join('');
  updateWorkspace();
});
$('#export-notes').addEventListener('click', () => {
  const entries = Object.entries(notes).filter(([,text]) => text.trim());
  if (!entries.length) { toast('Write a lesson note first, then export it here.'); return; }
  const text = '# My YTGuide study notes\n\n' + entries.map(([id,note]) => {
    const video = [...saved,...videos,...Object.values(lessonIndex)].find(v => v.id === id);
    return `## ${video?.title || id}\nhttps://www.youtube.com/watch?v=${id}\n\n${note}\n`;
  }).join('\n');
  const url = URL.createObjectURL(new Blob([text], {type:'text/markdown;charset=utf-8'}));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'YTGuide-study-notes.md'; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

document.addEventListener('error', (event) => {
  if (event.target instanceof HTMLImageElement) event.target.classList.add('unavailable');
}, true);
document.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.view) showView(button.dataset.view);
  if (button.dataset.watch) openLesson([...videos,...saved,...Object.values(lessonIndex)].find(v => v.id === button.dataset.watch));
  if (button.dataset.save) toggleSave([...videos,...saved,...Object.values(lessonIndex)].find(v => v.id === button.dataset.save));
  if (button.id === 'load-player' && currentVideo) loadPlayer();
  if (button.id === 'retry-search') findLessons();
  if (button.id === 'clear-filters') {
    $('#language').value = 'any'; $('#length').value = 'any'; $('#goal').value = ''; findLessons();
  }
});
$('#search-form').addEventListener('submit', findLessons);

let timerDuration = 25*60;
let remaining = timerDuration;
let deadline = null;
function updateTimer() {
  if (deadline !== null) remaining = Math.max(0, Math.ceil((deadline-Date.now())/1000));
  if (deadline !== null && remaining === 0) {
    deadline = null;
    $('#timer-status').textContent = 'Session complete. Take a breath and a short break.';
    toast('Your focus session is complete. Time for a short break.');
  }
  $('#timer-display').textContent = `${String(Math.floor(remaining/60)).padStart(2,'0')}:${String(remaining%60).padStart(2,'0')}`;
  $('#timer-toggle').textContent = deadline !== null ? 'Pause' : remaining === 0 ? 'Start again' : remaining === timerDuration ? 'Start' : 'Resume';
}
function openTimer() { document.body.append($('#timer-widget')); $('#timer-widget').classList.remove('embedded'); $('#timer-widget').hidden = false; }
$('#start-focus').addEventListener('click', openTimer);
$('#lesson-timer').addEventListener('click', () => {
  $('.notes-panel').append($('#timer-widget'));
  $('#timer-widget').classList.add('embedded');
  $('#timer-widget').hidden = false;
  $('#timer-toggle').focus();
});
$('#timer-close').addEventListener('click', () => { $('#timer-widget').hidden = true; });
$('#timer-toggle').addEventListener('click', () => {
  if (deadline !== null) { remaining = Math.max(0,Math.ceil((deadline-Date.now())/1000)); deadline = null; }
  else { if (remaining === 0) remaining = timerDuration; deadline = Date.now()+remaining*1000; }
  $('#timer-status').textContent = deadline !== null ? 'One small step. Stay with it.' : 'Paused. Come back when you’re ready.';
  updateTimer();
});
function resetTimer() { deadline = null; remaining = timerDuration; $('#timer-status').textContent = 'A little time, just for learning.'; updateTimer(); }
$('#timer-reset').addEventListener('click', resetTimer);
$('#timer-length').addEventListener('change', () => { timerDuration = Number($('#timer-length').value)*60; resetTimer(); });
setInterval(() => { if (deadline !== null) updateTimer(); }, 250);
document.addEventListener('visibilitychange', () => { if (!document.hidden) updateTimer(); });
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $('#theme').setAttribute('aria-label',`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`);
}
setTheme(read('ytguide.theme','light') === 'dark' ? 'dark' : 'light');
[$('#theme'), $('#theme-mobile')].forEach(button => button.addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  setTheme(theme); write('ytguide.theme',theme);
}));
window.YTGuide = {
  toast, read, write, validVideo,
  setAuthenticated(value){authenticated=!!value;updateAccountControls();updateWorkspace();},
  get authenticated(){return authenticated;},
  get scope(){return storageScope;},
  get video(){return currentVideo;},
  get state(){return {saved,completed,notes,lessonIndex,positions,bookmarks,collections,memberships};},
  getNoteVersion:id=>noteVersions[id]||0,
  setNoteVersion:(id,version)=>{noteVersions[id]=version;},
  conflict:(id,note)=>{noteConflicts[id]=note;renderNoteConflict();},
  setScope(scope) {
    clearTimeout(noteDebounce);
    if($('#lesson-dialog').open)$('#lesson-dialog').close();
    storageScope=scope;
    authenticated=false;
    saved=read('ytguide.saved.v2',[]);completed=read('ytguide.completed.v2',[]);notes=read('ytguide.notes.v2',{});
    lessonIndex=read('ytguide.lessons.v3',{});positions=read('ytguide.positions.v3',{});bookmarks=read('ytguide.bookmarks.v3',{});collections=read('ytguide.collections.v3',[]);memberships=read('ytguide.memberships.v3',{});
    noteVersions={};noteConflicts={};normalizeWorkspace();
    updateWorkspace();renderResults();
  },
  applyCloud(data) {
    lessonIndex=Object.fromEntries(data.lessons.map(r=>[r.video_id,r.metadata]));
    saved=data.lessons.filter(r=>r.saved).map(r=>r.metadata);
    completed=data.lessons.filter(r=>r.completed).map(r=>r.video_id);
    positions=Object.fromEntries(data.lessons.map(r=>[r.video_id,r.position_seconds]));
    notes=Object.fromEntries(data.notes.map(r=>[r.video_id,r.content]));
    noteVersions=Object.fromEntries(data.notes.map(r=>[r.video_id,r.version]));
    collections=data.collections;bookmarks={};memberships={};
    for(const b of data.bookmarks)(bookmarks[b.video_id]||=[]).push(b);
    for(const m of data.memberships)(memberships[m.video_id]||=[]).push(m.collection_id);
    write('ytguide.saved.v2',saved);write('ytguide.completed.v2',completed);write('ytguide.notes.v2',notes);write('ytguide.lessons.v3',lessonIndex);persistExtras();
    updateWorkspace();renderResults();
  },
  noteSynced(id,content,version) {
    noteVersions[id]=version;
    if(currentVideo?.id===id&&notes[id]===content)$('#note-status').textContent='Cloud synced ✓';
  },
  flushNote(){if(currentVideo&&noteDirty){clearTimeout(noteDebounce);emitMutation('note',{video:currentVideo,content:notes[currentVideo.id]||''});noteDirty=false;}},
};
restoreNavigation();
updateAccountControls();
showView(currentView,false);
findLessons();
window.dispatchEvent(new Event('ytguide:ready'));

function renderResults(){if(videos.length)$('#results').innerHTML=videos.map((v,i)=>card(v,i)).join('');}
function renderCollections(){
  const filter=$('#workspace-filter');const selected=filter.value;
  filter.innerHTML='<option value="saved">Saved lessons</option><option value="recent">Recently opened</option><option value="completed">Marked complete</option><option value="notes">With notes</option>'+collections.map(c=>`<option value="collection:${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('');
  if([...filter.options].some(o=>o.value===selected))filter.value=selected;
  $('#collection-list').innerHTML=collections.map(c=>`<span class="collection-chip"><button class="text-button" data-filter-collection="${escapeHtml(c.id)}">${escapeHtml(c.name)}</button><button class="rename-collection" data-rename-collection="${escapeHtml(c.id)}" aria-label="Rename ${escapeHtml(c.name)}">Edit</button><button data-delete-collection="${escapeHtml(c.id)}" aria-label="Delete collection ${escapeHtml(c.name)}">×</button></span>`).join('');
  if(currentVideo){
    const attached=memberships[currentVideo.id]||[];
    $('#lesson-collection').innerHTML='<option value="">Choose collection</option>'+collections.filter(c=>!attached.includes(c.id)).map(c=>`<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('');
    $('#lesson-collections').innerHTML=collections.filter(c=>attached.includes(c.id)).map(c=>`<span class="collection-chip">${escapeHtml(c.name)}<button data-remove-membership="${escapeHtml(c.id)}" aria-label="Remove from ${escapeHtml(c.name)}">×</button></span>`).join('');
  }
}
let editingCollection=null;
$('#workspace-filter').addEventListener('change',updateWorkspace);
$('#collection-form').addEventListener('submit',event=>{
  event.preventDefault();const name=$('#collection-name').value.trim();
  if(!name)return;
  if(collections.some(c=>c.name===name&&c.id!==editingCollection)){toast('A collection with that name already exists.');return;}
  if(editingCollection){
    const c=collections.find(c=>c.id===editingCollection);c.name=name;emitMutation('renameCollection',{id:c.id,name});
  }else{
    if(collections.length>=50){toast('You can create up to 50 collections.');return;}
    const c={id:crypto.randomUUID(),name};collections.push(c);emitMutation('createCollection',c);
  }
  editingCollection=null;$('#collection-form button').textContent='Create +';$('#collection-form').reset();persistExtras();updateWorkspace();
});
$('#add-to-collection').addEventListener('click',()=>{
  const id=$('#lesson-collection').value;if(!id||!currentVideo)return;
  memberships[currentVideo.id]=[...new Set([...(memberships[currentVideo.id]||[]),id])];
  remember(currentVideo);persistExtras();emitMutation('membership',{video:currentVideo,collectionId:id,add:true});updateWorkspace();
});
document.addEventListener('click',event=>{
  const b=event.target.closest('button');if(!b)return;
  if(b.dataset.filterCollection){$('#workspace-filter').value='collection:'+b.dataset.filterCollection;updateWorkspace();}
  if(b.dataset.renameCollection){const c=collections.find(c=>c.id===b.dataset.renameCollection);if(c){editingCollection=c.id;$('#collection-name').value=c.name;$('#collection-form button').textContent='Save name';$('#collection-name').focus();}}
  if(b.dataset.deleteCollection){
    const id=b.dataset.deleteCollection;
    if(!confirm('Delete this collection? Your lessons, notes and progress will stay.'))return;
    if($('#workspace-filter').value==='collection:'+id)$('#workspace-filter').value='saved';
    collections=collections.filter(c=>c.id!==id);for(const key of Object.keys(memberships))memberships[key]=memberships[key].filter(v=>v!==id);
    persistExtras();emitMutation('deleteCollection',{id});updateWorkspace();
  }
  if(b.dataset.removeMembership&&currentVideo){const id=b.dataset.removeMembership;memberships[currentVideo.id]=(memberships[currentVideo.id]||[]).filter(v=>v!==id);persistExtras();emitMutation('membership',{video:currentVideo,collectionId:id,add:false});updateWorkspace();}
  if(b.dataset.seekBookmark){const bookmark=(bookmarks[currentVideo?.id]||[]).find(v=>v.id===b.dataset.seekBookmark);if(bookmark){if(playerReady)playerInstance.seekTo(bookmark.seconds,true);else loadPlayer(bookmark.seconds);}}
  if(b.dataset.removeBookmark&&currentVideo){const id=b.dataset.removeBookmark;bookmarks[currentVideo.id]=(bookmarks[currentVideo.id]||[]).filter(v=>v.id!==id);persistExtras();emitMutation('deleteBookmark',{id});renderBookmarks();}
});
function renderBookmarks(){
  if(!currentVideo)return;
  $('#bookmark-list').innerHTML=(bookmarks[currentVideo.id]||[]).slice().sort((a,b)=>a.seconds-b.seconds).map(b=>`<div class="bookmark-row"><button class="seek-bookmark" data-seek-bookmark="${escapeHtml(b.id)}">${stamp(b.seconds)} · ${escapeHtml(b.label)}</button><button class="remove-bookmark" data-remove-bookmark="${escapeHtml(b.id)}" aria-label="Delete bookmark ${escapeHtml(b.label)}">×</button></div>`).join('');
}
$('#add-bookmark').addEventListener('click',()=>{
  if(!currentVideo)return;const label=$('#bookmark-label').value.trim();if(!label){toast('Give this moment a short label.');return;}
  let seconds=playerReady?Math.floor(playerInstance.getCurrentTime()):positions[currentVideo.id]||0;
  const entered=$('#bookmark-time').value.trim();
  if(entered){if(!/^\d{1,4}:[0-5]\d$/.test(entered)){toast('Use mm:ss, for example 12:35.');return;}const [m,s]=entered.split(':').map(Number);seconds=m*60+s;}
  if(seconds>604800||(currentVideo.duration&&seconds>currentVideo.duration)){toast('Choose a timestamp inside this lesson.');return;}
  const list=bookmarks[currentVideo.id]||[];if(list.length>=100){toast('This lesson already has 100 bookmarks.');return;}
  const bookmark={id:crypto.randomUUID(),seconds,label};bookmarks[currentVideo.id]=[...list,bookmark];remember(currentVideo);persistExtras();
  emitMutation('bookmark',{video:currentVideo,...bookmark});$('#bookmark-label').value='';$('#bookmark-time').value='';renderBookmarks();
});
function loadPlayerAPI(){
  if(window.YT?.Player)return Promise.resolve();
  if(!playerApiPromise)playerApiPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';
    const timeout=setTimeout(()=>{playerApiPromise=null;reject(new Error('Player connection timed out. Use the YouTube link below.'));},15000);
    window.onYouTubeIframeAPIReady=()=>{clearTimeout(timeout);resolve();};
    script.onerror=()=>{clearTimeout(timeout);playerApiPromise=null;reject(new Error('Could not load the player. Use the YouTube link below.'));};
    document.head.append(script);
  });
  return playerApiPromise;
}
async function loadPlayer(at){
  if(!currentVideo)return;const video=currentVideo;
  $('#player').innerHTML='<div class="player-placeholder"><p>Connecting to YouTube…</p></div>';
  try{
    await loadPlayerAPI();if(currentVideo?.id!==video.id)return;
    if(playerInstance){try{playerInstance.destroy();}catch{}}
    $('#player').innerHTML='<div id="video-mount"></div>';
    playerReady=false;
    const position=Number.isFinite(at)?at:positions[video.id]||0;lastPositionSaved=position;
    playerInstance=new window.YT.Player('video-mount',{host:'https://www.youtube-nocookie.com',width:'100%',height:'100%',videoId:video.id,
      playerVars:{autoplay:0,rel:0,playsinline:1,origin:location.origin,start:Math.floor(position)},
      events:{onReady:()=>{playerReady=true;},onStateChange:event=>{if([0,2].includes(event.data))savePosition(true);},onError:()=>{$('#playback-position').textContent='This lesson cannot play here. Try Open on YouTube below.';}}
    });
  }catch(error){$('#player').innerHTML=`<div class="player-placeholder"><p>${escapeHtml(error.message)}</p><button class="primary" id="load-player">Retry player</button></div>`;}
}
function savePosition(force=false){
  if(!authenticated||!currentVideo||!playerReady||!playerInstance?.getCurrentTime)return;
  if(![0,1,2].includes(playerInstance.getPlayerState()))return;
  const position=Math.max(0,Math.floor(playerInstance.getCurrentTime()));
  if(!Number.isFinite(position)||position>604800)return;
  if(!force&&Math.abs(position-lastPositionSaved)<15)return;
  if(position===lastPositionSaved)return;
  lastPositionSaved=position;positions[currentVideo.id]=position;persistExtras();
  emitMutation('lesson',{video:currentVideo,patch:{position}});
}
setInterval(()=>{
  if(currentVideo&&playerReady){const position=playerInstance.getCurrentTime();if(Number.isFinite(position))$('#playback-position').textContent=`At ${stamp(position)} · progress saves about every 15 seconds`;savePosition();}
},1000);
document.addEventListener('visibilitychange',()=>{if(document.hidden)savePosition(true);});
function renderNoteConflict(){
  const conflict=currentVideo&&noteConflicts[currentVideo.id];$('#note-conflict').hidden=!conflict;
  if(conflict)$('#cloud-note-preview').textContent=conflict.content;
}
$('#use-cloud-note').addEventListener('click',()=>{
  if(!currentVideo)return;const id=currentVideo.id;const c=noteConflicts[id];if(!c)return;
  notes[id]=c.content;noteVersions[id]=c.version;delete noteConflicts[id];write('ytguide.notes.v2',notes);$('#lesson-notes').value=notes[id];renderNoteConflict();
  window.dispatchEvent(new CustomEvent('ytguide:resolve-note',{detail:{id,replace:false}}));
});
$('#keep-my-note').addEventListener('click',()=>{
  if(!currentVideo)return;const id=currentVideo.id;const c=noteConflicts[id];if(!c)return;
  noteVersions[id]=c.version;delete noteConflicts[id];renderNoteConflict();
  window.dispatchEvent(new CustomEvent('ytguide:resolve-note',{detail:{id,replace:true}}));
});
$('#export-backup').addEventListener('click',()=>{
  const body={format:'ytguide-workspace',version:3,exportedAt:new Date().toISOString(),...window.YTGuide.state};
  const url=URL.createObjectURL(new Blob([JSON.stringify(body,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='YTGuide-workspace.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});

function persistNavigation(){
  const params=new URLSearchParams(new FormData($('#search-form')));
  history.replaceState(null,'',location.pathname+'?'+params.toString()+'#'+currentView);
}
function restoreNavigation(){
  const params=new URLSearchParams(location.search);
  for(const name of ['topic','language','source','length']){
    const field=$('#'+name),value=params.get(name);
    if(value&&[...field.options].some(o=>o.value===value))field.value=value;
  }
  $('#goal').value=(params.get('goal')||'').slice(0,120);
  const view=location.hash.slice(1);
  currentView=['discover','workspace','about'].includes(view)?view:'discover';
}
for(const name of ['topic','language','source','length'])$('#'+name).addEventListener('change',()=>findLessons());
$('#goal').addEventListener('input',persistNavigation);
window.addEventListener('popstate',()=>{restoreNavigation();showView(currentView,false);findLessons();});

function youtubeSearchURL(){const topic=$('#topic');return 'https://www.youtube.com/results?'+new URLSearchParams({search_query:(topic.value==='custom'?'':topic.selectedOptions[0].textContent+' ')+$('#goal').value+' tutorial'+($('#language').value==='hi'?' in Hindi':'')});}
