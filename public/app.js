'use strict';
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
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
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
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
  return `<article class="video-card"><button class="thumb-button" data-watch="${video.id}" aria-label="Watch ${escapeHtml(video.title)}"><span class="thumb-fallback" aria-hidden="true"><span>YTGuide / ${escapeHtml(({python:"PYTHON",web:"WEB DEVELOPMENT",java:"JAVA",ml:"MACHINE LEARNING",sql:"SQL",linux:"LINUX & BASH",dsa:"DATA STRUCTURES"})[video.topic] || "STUDY LESSON")}</span><strong>${escapeHtml(video.title)}</strong><i>YOUR NEXT LESSON ↗</i></span><img src="https://i.ytimg.com/vi/${video.id}/hqdefault.jpg" alt="" loading="lazy" width="480" height="270"><span class="rank-badge">${workspace === true ? 'SAVED LESSON' : `PICK ${String(index+1).padStart(2,'0')}`}</span><span class="play" aria-hidden="true">▶</span></button><div class="card-body"><div class="card-meta"><span>${escapeHtml(languageLabel(video.language))}</span><span>${escapeHtml(durationLabel(video.duration))}</span></div>${done ? '<span class="complete-badge">✓ Marked complete</span>' : ''}<h3 class="card-title">${escapeHtml(video.title)}</h3><p class="card-channel">${escapeHtml(video.channel)}</p><details class="match-details"><summary>Why this lesson?</summary><p>${escapeHtml(video.reason || 'You saved this lesson to your workspace.')}.</p><p>Text relevance, not a quality score. ${video.source === 'youtube' ? 'Retrieved from YouTube.' : 'From the study catalogue.'}</p></details><div class="card-actions"><button class="watch-button" data-watch="${video.id}">Watch lesson <span aria-hidden="true">↗</span></button><button class="save-button" data-save="${video.id}" aria-pressed="${isSaved(video.id)}" aria-label="${isSaved(video.id)?'Unsave':'Save'} ${escapeHtml(video.title)}">${isSaved(video.id)?'✓':'+'}</button></div></div></article>`;
}
function updateWorkspace() {
  $('#saved-count').textContent = saved.length;
  $('#stat-saved').textContent = saved.length;
  $('#stat-complete').textContent = completed.length;
  $('#stat-notes').textContent = Object.values(notes).filter(n => n.trim()).length;
  if (currentView === 'workspace') {
    $('#workspace-results').innerHTML = saved.length ? saved.map((v, i) => card(v, i, true)).join('') : '<div class="empty-state"><h3>Your next chapter starts with a save.</h3><p>Tap + on a lesson to keep it here. Your notes and progress stay on this device.</p><button class="primary" data-view="discover">Discover lessons ↗</button></div>';
  }
  $$('[data-save]').forEach(button => {
    const v = [...videos, ...saved].find(v => v.id === button.dataset.save);
    const selected = isSaved(button.dataset.save);
    button.setAttribute('aria-pressed', String(selected));
    button.setAttribute('aria-label', `${selected ? 'Unsave' : 'Save'} ${v?.title || 'lesson'}`);
    button.textContent = selected ? '✓' : '+';
  });
  if (currentVideo) $('#save-lesson').textContent = isSaved(currentVideo.id) ? 'Remove from saved −' : 'Save lesson +';
}
function toggleSave(video) {
  if (!video) return;
  const before = isSaved(video.id);
  if (!before && saved.length >= 300) { toast('Your workspace holds 300 lessons. Remove one to make room.'); return; }
  saved = before ? saved.filter(v => v.id !== video.id) : [{...video}, ...saved];
  const stored = write('ytguide.saved.v2', saved);
  updateWorkspace();
  if (stored) toast(before ? 'Lesson removed. Your notes are still here.' : 'Lesson saved to your workspace.');
}
function showView(view, moveFocus = true) {
  if (!['discover','workspace','about'].includes(view)) return;
  currentView = view;
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
    $('#results').innerHTML = videos.length ? videos.map((v, i) => card(v, i)).join('') : '<div class="empty-state"><h3>No lessons match these filters.</h3><p>Try any language or any length. We prefer an honest empty result to an unrelated lesson.</p><button class="secondary" id="clear-filters">Reset filters</button></div>';
  } catch (error) {
    if (ownGeneration !== generation) return;
    $('#result-meta').textContent = '';
    $('#results').innerHTML = `<div class="empty-state"><h3>Let’s try that again.</h3><p>${escapeHtml(error.name === 'AbortError' ? 'The search took too long. Please retry.' : error.message)}</p><button class="primary" id="retry-search">Retry search ↗</button></div>`;
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
  $('#lesson-title').textContent = video.title;
  $('#lesson-channel').textContent = video.channel;
  $('#youtube-link').href = `https://www.youtube.com/watch?v=${video.id}`;
  $('#lesson-notes').value = notes[video.id] || '';
  $('#note-status').textContent = 'Notes save on this device.';
  $('#mark-complete').textContent = completed.includes(video.id) ? 'Marked complete ✓' : 'Mark complete ✓';
  $('#mark-complete').setAttribute('aria-pressed', String(completed.includes(video.id)));
  $('#player').innerHTML = '<div class="player-placeholder"><p>Ready when you are.</p><button class="primary" id="load-player">Load YouTube player ▶</button><p>Loading connects to YouTube. No autoplay.</p></div>';
  updateWorkspace();
  $('#lesson-dialog').showModal();
}
$('#lesson-dialog').addEventListener('close', () => {
  $('#player').replaceChildren(); currentVideo = null;
  document.body.append($('#timer-widget'));
  $('#timer-widget').classList.remove('embedded');
});
$('#close-lesson').addEventListener('click', () => $('#lesson-dialog').close());
$('#lesson-notes').addEventListener('input', () => {
  if (!currentVideo) return;
  if (!Object.hasOwn(notes,currentVideo.id) && Object.keys(notes).length >= 300) {
    $('#note-status').textContent = 'Notes limit reached. Export your existing notes first.'; return;
  }
  notes[currentVideo.id] = $('#lesson-notes').value;
  const stored = write('ytguide.notes.v2', notes);
  $('#note-status').textContent = stored ? 'Saved on this device ✓' : 'Not saved. Copy or export your notes before leaving.';
  updateWorkspace();
});
$('#save-lesson').addEventListener('click', () => toggleSave(currentVideo));
$('#mark-complete').addEventListener('click', () => {
  if (!currentVideo) return;
  const id = currentVideo.id;
  completed = completed.includes(id) ? completed.filter(v => v !== id) : [...completed, id];
  write('ytguide.completed.v2', completed);
  $('#mark-complete').textContent = completed.includes(id) ? 'Marked complete ✓' : 'Mark complete ✓';
  $('#mark-complete').setAttribute('aria-pressed', String(completed.includes(id)));
  if (videos.length) $('#results').innerHTML = videos.map((v, i) => card(v, i)).join('');
  updateWorkspace();
});
$('#export-notes').addEventListener('click', () => {
  const entries = Object.entries(notes).filter(([,text]) => text.trim());
  if (!entries.length) { toast('Write a lesson note first, then export it here.'); return; }
  const text = '# My YTGuide study notes\n\n' + entries.map(([id,note]) => {
    const video = [...saved,...videos].find(v => v.id === id);
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
  if (button.dataset.watch) openLesson([...videos,...saved].find(v => v.id === button.dataset.watch));
  if (button.dataset.save) toggleSave([...videos,...saved].find(v => v.id === button.dataset.save));
  if (button.id === 'load-player' && currentVideo) {
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube-nocookie.com/embed/${currentVideo.id}?rel=0&playsinline=1`;
    iframe.title = currentVideo.title;
    iframe.allow = 'accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen';
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.allowFullscreen = true;
    $('#player').replaceChildren(iframe);
  }
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
updateWorkspace();
findLessons();
