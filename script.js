'use strict';
/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 9);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = n => `<svg class="i"><use href="#${n}"/></svg>`;
const DAY = 864e5, OPEN = 96;

/* ---------- storage (empty on first launch) ---------- */
const K = { notes: 'nexus2.notes', tasks: 'nexus2.tasks', settings: 'nexus2.settings' };
const read = (k, f) => { try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch { return f; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
let notes = read(K.notes, []);
let tasks = read(K.tasks, []);
let settings = { theme: 'light', lang: 'en', ...read(K.settings, {}) };
const saveNotes = () => write(K.notes, notes);
const saveTasks = () => write(K.tasks, tasks);
const saveSettings = () => write(K.settings, settings);

/* ---------- i18n (UI only, user content is never translated) ---------- */
const L = {
  en: { myNotes: 'My notes', searchPh: 'Search notes…', newNote: 'New note', tasks: 'Tasks', addTask: 'Add task', settings: 'Settings',
    theme: 'Theme', light: 'Light', dark: 'Dark', language: 'Language', reset: 'Reset all data', resetAsk: 'Delete all notes and tasks?',
    delAsk: 'Delete this note?', noNotes: 'No notes yet', noNotesSub: 'Tap “New note” to start', nothing: 'Nothing found',
    nothingSub: 'Try a different word', noTasks: 'No tasks', noTasksSub: 'Tap “Add task” to start', titlePh: 'Title',
    textPh: 'Start writing…', untitled: 'Untitled', noContent: 'No content', today: 'Today', yesterday: 'Yesterday',
    updated: 'updated', nothingYet: 'nothing yet', taskPh: 'Task title', checkPh: 'Add a checklist item…', save: 'Save', cancel: 'Cancel',
    noteW: ['note', 'notes'], taskW: ['item', 'items'] },
  ru: { myNotes: 'Мои заметки', searchPh: 'Поиск заметок…', newNote: 'Новая заметка', tasks: 'Задачи', addTask: 'Добавить задачу', settings: 'Настройки',
    theme: 'Тема', light: 'Светлая', dark: 'Тёмная', language: 'Язык', reset: 'Удалить все данные', resetAsk: 'Удалить все заметки и задачи?',
    delAsk: 'Удалить эту заметку?', noNotes: 'Заметок пока нет', noNotesSub: 'Нажмите «Новая заметка»', nothing: 'Ничего не найдено',
    nothingSub: 'Попробуйте другое слово', noTasks: 'Задач нет', noTasksSub: 'Нажмите «Добавить задачу»', titlePh: 'Заголовок',
    textPh: 'Начните писать…', untitled: 'Без названия', noContent: 'Пусто', today: 'Сегодня', yesterday: 'Вчера',
    updated: 'обновлено', nothingYet: 'пока пусто', taskPh: 'Название задачи', checkPh: 'Добавить пункт…', save: 'Сохранить', cancel: 'Отмена',
    noteW: ['заметка', 'заметки', 'заметок'], taskW: ['задача', 'задачи', 'задач'] }
};
const t = k => L[settings.lang][k];
function count(n, key) {
  const f = t(key);
  if (settings.lang === 'en') return `${n} ${n === 1 ? f[0] : f[1]}`;
  const a = n % 10, b = n % 100;
  return `${n} ${a === 1 && b !== 11 ? f[0] : a >= 2 && a <= 4 && (b < 10 || b >= 20) ? f[1] : f[2]}`;
}
function fmtDate(ts) {
  const d = new Date(ts), today = new Date().setHours(0, 0, 0, 0);
  const diff = Math.round((today - new Date(ts).setHours(0, 0, 0, 0)) / DAY);
  if (diff <= 0) return t('today');
  if (diff === 1) return t('yesterday');
  const loc = settings.lang;
  return d.toLocaleDateString(loc, diff < 7 ? { weekday: 'short' } : { day: 'numeric', month: 'short' });
}
function applyTheme() { document.documentElement.dataset.theme = settings.theme; }
function applyLang() {
  document.documentElement.lang = settings.lang;
  $$('[data-i18n]').forEach(el => el.textContent = t(el.dataset.i18n));
  $$('[data-i18n-ph]').forEach(el => el.placeholder = t(el.dataset.i18nPh));
  $$('#segTheme button').forEach(b => b.classList.toggle('on', b.dataset.v === settings.theme));
  $$('#segLang button').forEach(b => b.classList.toggle('on', b.dataset.v === settings.lang));
  renderAll();
}

/* ---------- shared UI helpers ---------- */
const emptyHTML = (a, b) => `<div class="empty"><b>${a}</b>${b}</div>`;
function removeAnimated(el, done) {
  el.style.height = el.offsetHeight + 'px'; el.style.overflow = 'hidden'; void el.offsetHeight;
  el.style.transition = 'height .25s var(--ease),opacity .25s,margin .25s';
  el.style.height = '0'; el.style.opacity = '0'; el.style.marginBottom = '-12px';
  setTimeout(done, 260);
}
/* swipe left to reveal a delete button; list clicks are handled by the caller */
function enableSwipe(box) {
  let st = null, moved = false;
  box.addEventListener('pointerdown', e => {
    moved = false;
    const sw = e.target.closest('.swipe');
    $$('.swipe.open', box).forEach(o => o !== sw && o.classList.remove('open'));
    if (!sw || e.target.closest('.swipe-del, input')) return;
    st = { sw, fg: $('.swipe-fg', sw), x: e.clientX, y: e.clientY, base: sw.classList.contains('open') ? -OPEN : 0, cur: 0, lock: false };
  });
  box.addEventListener('pointermove', e => {
    if (!st) return;
    const dx = e.clientX - st.x, dy = e.clientY - st.y;
    if (!st.lock) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { st = null; return; }
      if (Math.abs(dx) < 8) return;
      st.lock = true; st.fg.style.transition = 'none'; st.sw.setPointerCapture(e.pointerId);
    }
    st.cur = Math.max(-OPEN - 24, Math.min(0, st.base + dx));
    st.fg.style.transform = `translateX(${st.cur}px)`;
  });
  const end = () => {
    if (!st) return;
    if (st.lock) { moved = true; st.fg.style.transition = ''; st.fg.style.transform = ''; st.sw.classList.toggle('open', st.cur < -OPEN / 2); }
    st = null;
  };
  box.addEventListener('pointerup', end);
  box.addEventListener('pointercancel', end);
  box.addEventListener('click', e => {
    const sw = e.target.closest('.swipe');
    if (moved) { moved = false; e.stopPropagation(); return; }
    if (sw && sw.classList.contains('open') && !e.target.closest('.swipe-del')) { sw.classList.remove('open'); e.stopPropagation(); }
  }, true);
}
const delBtn = `<button class="swipe-del" aria-label="Delete">${icon('trash')}</button>`;

/* ---------- navigation ---------- */
function show(name) {
  $$('.screen:not(.editor)').forEach(s => s.classList.toggle('active', s.id === name));
  $$('#nav button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  renderAll();
}
$('#nav').addEventListener('click', e => { const b = e.target.closest('button'); if (b) show(b.dataset.tab); });

/* ---------- notes ---------- */
let fresh = null;
const sorted = () => [...notes].sort((a, b) => b.updated - a.updated);
const snippet = n => n.text.split('\n').map(s => s.trim()).find(Boolean) || t('noContent');
const noteHTML = n => `
  <div class="swipe${n.id === fresh ? ' pop' : ''}" data-id="${n.id}">${delBtn}
    <div class="swipe-fg card">
      <div class="row1"><span class="t">${esc(n.title || t('untitled'))}</span><span class="d">${fmtDate(n.updated)}</span></div>
      <p class="s">${esc(snippet(n))}</p>
    </div>
  </div>`;
function renderNotes() {
  const q = $('#homeSearch').value.trim().toLowerCase();
  const list = sorted().filter(n => !q || n.title.toLowerCase().includes(q) || n.text.toLowerCase().includes(q));
  $('#notesMeta').textContent = notes.length
    ? `${count(notes.length, 'noteW')} • ${t('updated')} ${fmtDate(sorted()[0].updated).toLowerCase()}`
    : `${count(0, 'noteW')} • ${t('nothingYet')}`;
  $('#notesList').innerHTML = list.length ? list.map(noteHTML).join('')
    : q ? emptyHTML(t('nothing'), t('nothingSub')) : emptyHTML(t('noNotes'), t('noNotesSub'));
  fresh = null;
}
$('#homeSearch').addEventListener('input', renderNotes);
$('#newNote').addEventListener('click', () => openNote(null));
$('#notesList').addEventListener('click', e => {
  const sw = e.target.closest('.swipe'); if (!sw) return;
  if (e.target.closest('.swipe-del'))
    return removeAnimated(sw, () => { notes = notes.filter(n => n.id !== sw.dataset.id); saveNotes(); renderNotes(); });
  openNote(sw.dataset.id);
});

/* ---------- note editor (title + text only) ---------- */
let cur = null, timer;
const eTitle = $('#eTitle'), eText = $('#eText');
const setBar = () => { $('#barTitle').textContent = cur.title.trim() || t('newNote'); };
function openNote(id) {
  cur = id ? notes.find(n => n.id === id) : { id: uid(), title: '', text: '', updated: Date.now() };
  eTitle.value = cur.title; eText.value = cur.text; setBar();
  $('#app').classList.add('in-editor'); $('#editor').classList.add('active');
  if (!id) eTitle.focus();
}
function commit() {
  clearTimeout(timer);
  if (!cur) return;
  cur.updated = Date.now();
  if (!notes.includes(cur)) {
    if (!cur.title.trim() && !cur.text.trim()) return;
    notes.push(cur); fresh = cur.id;
  }
  saveNotes();
}
const touch = () => { clearTimeout(timer); timer = setTimeout(commit, 250); };
function closeEditor() {
  commit(); cur = null;
  $('#editor').classList.remove('active'); $('#app').classList.remove('in-editor');
  renderAll();
}
eTitle.addEventListener('input', () => { cur.title = eTitle.value; setBar(); touch(); });
eTitle.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); eText.focus(); } });
eText.addEventListener('input', () => { cur.text = eText.value; touch(); });
$('#back').addEventListener('click', closeEditor);
$('#menuBtn').addEventListener('click', () => {
  if (!confirm(t('delAsk'))) return;
  clearTimeout(timer); notes = notes.filter(n => n !== cur); saveNotes(); cur = null; closeEditor();
});
window.addEventListener('pagehide', commit);

/* ---------- tasks (title + checklist) ---------- */
const expanded = new Set();
let freshTask = null;
const checkHTML = c => `
  <li class="${c.done ? 'done' : ''}" data-cid="${c.id}">
    <button class="cb" data-act="cb">${icon('check')}</button><span class="ct">${esc(c.text)}</span>
    <button class="cx" data-act="cx" aria-label="Delete">${icon('x')}</button>
  </li>`;
const progress = k => `${k.checks.filter(c => c.done).length}/${k.checks.length}`;
const taskHTML = k => `
  <div class="swipe${k.id === freshTask ? ' pop' : ''}" data-id="${k.id}">${delBtn}
    <div class="swipe-fg task${k.done ? ' done' : ''}${expanded.has(k.id) ? ' expanded' : ''}">
      <div class="thead">
        <button class="circle" data-act="done" aria-label="Done">${icon('check')}</button>
        <span class="tt" data-act="expand">${esc(k.text)}</span>
        ${k.checks.length ? `<span class="prog">${progress(k)}</span>` : ''}
        <button class="chev" data-act="expand" aria-label="Expand">${icon('chev-d')}</button>
      </div>
      <div class="cwrap${k.checks.length > 2 ? ' more' : ''}">
        <ul class="clist">${k.checks.map(checkHTML).join('')}</ul>
        <input class="cadd" placeholder="${esc(t('checkPh'))}" autocomplete="off">
      </div>
    </div>
  </div>`;
function renderTasks() {
  $('#tasksMeta').textContent = `${t('today')} · ${count(tasks.length, 'taskW')}`;
  $('#tasksList').innerHTML = tasks.length ? tasks.map(taskHTML).join('') : emptyHTML(t('noTasks'), t('noTasksSub'));
  freshTask = null;
}
$('#tasksList').addEventListener('click', e => {
  const sw = e.target.closest('.swipe'); if (!sw) return;
  const k = tasks.find(x => x.id === sw.dataset.id), fg = $('.swipe-fg', sw);
  if (e.target.closest('.swipe-del'))
    return removeAnimated(sw, () => { tasks = tasks.filter(x => x !== k); expanded.delete(k.id); saveTasks(); renderTasks(); });
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act;
  if (a === 'done') { k.done = !k.done; fg.classList.toggle('done', k.done); }
  else if (a === 'expand') { fg.classList.toggle('expanded') ? expanded.add(k.id) : expanded.delete(k.id); }
  else {
    const li = b.closest('li'), c = k.checks.find(x => x.id === li.dataset.cid);
    if (a === 'cb') { c.done = !c.done; li.classList.toggle('done', c.done); $('.prog', sw).textContent = progress(k); }
    if (a === 'cx') { k.checks = k.checks.filter(x => x !== c); saveTasks(); return renderTasks(); }
  }
  saveTasks();
});
$('#tasksList').addEventListener('keydown', e => {
  if (e.key !== 'Enter' || !e.target.classList.contains('cadd') || !e.target.value.trim()) return;
  const sw = e.target.closest('.swipe'), k = tasks.find(x => x.id === sw.dataset.id);
  k.checks.push({ id: uid(), text: e.target.value.trim(), done: false }); saveTasks(); renderTasks();
  $(`.swipe[data-id="${k.id}"] .cadd`).focus();
});

/* add-task sheet: title first, then checklist items */
let draft = [];
const sheet = $('#sheet');
const drawDraft = () => {
  $('#sChecks').innerHTML = draft.map((c, i) => `<li data-i="${i}"><span class="cb"></span><span class="ct">${esc(c)}</span><button class="cx" aria-label="Delete">${icon('x')}</button></li>`).join('');
};
function pushDraft() { const v = $('#sAdd').value.trim(); if (v) { draft.push(v); drawDraft(); } $('#sAdd').value = ''; }
const closeSheet = () => sheet.classList.remove('show');
$('#addTask').addEventListener('click', () => {
  draft = []; $('#sTitle').value = ''; $('#sAdd').value = ''; drawDraft();
  sheet.classList.add('show'); setTimeout(() => $('#sTitle').focus(), 250);
});
$('#sTitle').addEventListener('keydown', e => { if (e.key === 'Enter') $('#sAdd').focus(); });
$('#sAdd').addEventListener('keydown', e => { if (e.key === 'Enter') pushDraft(); });
$('#sChecks').addEventListener('click', e => {
  const li = e.target.closest('li'); if (li && e.target.closest('.cx')) { draft.splice(+li.dataset.i, 1); drawDraft(); }
});
$('#sCancel').addEventListener('click', closeSheet);
$('#scrim').addEventListener('click', closeSheet);
$('#sSave').addEventListener('click', () => {
  pushDraft();
  const title = $('#sTitle').value.trim();
  if (!title) { const el = $('#sTitle'); el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); el.focus(); return; }
  const k = { id: uid(), text: title, done: false, checks: draft.map(text => ({ id: uid(), text, done: false })) };
  tasks.push(k); freshTask = k.id; saveTasks(); closeSheet(); renderTasks();
  const list = $('#tasksList'); list.scrollTop = list.scrollHeight;
});

/* ---------- settings ---------- */
$('#segTheme').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; settings.theme = b.dataset.v; saveSettings(); applyTheme(); applyLang(); });
$('#segLang').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; settings.lang = b.dataset.v; saveSettings(); applyLang(); });
$('#resetData').addEventListener('click', () => {
  if (!confirm(t('resetAsk'))) return;
  notes = []; tasks = []; expanded.clear(); saveNotes(); saveTasks(); renderAll();
});

/* ---------- init ---------- */
function renderAll() { renderNotes(); renderTasks(); }
enableSwipe($('#notesList'));
enableSwipe($('#tasksList'));
applyTheme();
applyLang();
