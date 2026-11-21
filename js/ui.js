/* Lift — UI-Kern: Router, Rendering, Toasts, Sheets (§1.7, §2, §23.2) */
'use strict';

const ui = {
  tab: 'training',
  /* Training */
  selectedDay: 'd1',
  slotSheetKey: null,
  /* Fortschritt */
  prFilter: 'all',
  prScope: 'all',      /* Reiter: all | gym | barbell | bodyweight */
  prGym: null,         /* nur Anzeige-Filter — ändert das aktive Gym nicht */
  detailExercise: null,
  /* Mobility */
  mobilitySection: 'warmup',
  mobilityEdit: false,
  runner: null,
  /* Mehr */
  moreView: null,
  exerciseSearch: '',
  exerciseGroup: 'all',
  /* Sonstiges */
  lastError: null
};

const TABS = [
  { id: 'training',   label: 'Training' },
  { id: 'mobility',   label: 'Mobility' },
  { id: 'progress',   label: 'Fortschritt' },
  { id: 'more',       label: 'Mehr' }
];

/* ---------- HTML-Helfer ---------- */
function esc(v) {
  return String(v === null || v === undefined ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function q(sel, root) { return (root || document).querySelector(sel); }
function qa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

/* ---------- Aktions-Registry (Event-Delegation, ein Tap = eine Aktion §20.1) ---------- */
const ACTIONS = {};
function onAct(name, fn) { ACTIONS[name] = fn; }

document.addEventListener('click', function (ev) {
  const t = ev.target.closest('[data-act]');
  if (!t) return;
  const name = t.getAttribute('data-act');
  const fn = ACTIONS[name];
  if (!fn) return;
  ev.preventDefault();
  try {
    fn(t.dataset, t, ev);
  } catch (e) {
    logError(e);
    showError(e);
  }
}, false);

/* Eingabefelder: Autosave sofort (§1.9) */
document.addEventListener('input', function (ev) {
  const t = ev.target.closest('[data-input]');
  if (!t) return;
  const fn = ACTIONS[t.getAttribute('data-input')];
  if (!fn) return;
  try { fn(t.dataset, t, ev); } catch (e) { logError(e); }
}, false);
document.addEventListener('change', function (ev) {
  const t = ev.target.closest('[data-change]');
  if (!t) return;
  const fn = ACTIONS[t.getAttribute('data-change')];
  if (!fn) return;
  try { fn(t.dataset, t, ev); } catch (e) { logError(e); showError(e); }
}, false);

/* ---------- Toasts (§12 eigene Celebration je PR-Art) ---------- */
function toast(text, opts) {
  const o = opts || {};
  const box = q('#toasts');
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'toast lv' + (o.level || 0);
  el.innerHTML = esc(text) + (o.sub ? '<span class="t-sub">' + esc(o.sub) + '</span>' : '') +
    (o.actionLabel ? '<span class="t-act" data-act="' + esc(o.action) + '">' + esc(o.actionLabel) + '</span>' : '');
  el.addEventListener('click', () => el.remove());
  box.appendChild(el);
  const ttl = o.sticky ? 12000 : (o.level >= 3 ? 4200 : 3000);
  setTimeout(() => { el.remove(); }, ttl);
}

/* ---------- Sheets ---------- */
let sheetOnClose = null;
function openSheet(cfg) {
  const root = q('#sheet-root');
  root.innerHTML =
    '<div class="sheet-backdrop" data-act="sheet.backdrop">' +
      '<div class="sheet" id="sheet-inner">' +
        '<div class="sheet-grab"></div>' +
        (cfg.title ? '<h3>' + esc(cfg.title) + '</h3>' : '') +
        (cfg.sub ? '<p class="sheet-sub">' + esc(cfg.sub) + '</p>' : '') +
        '<div id="sheet-body">' + (cfg.body || '') + '</div>' +
      '</div>' +
    '</div>';
  sheetOnClose = cfg.onClose || null;
  if (cfg.onMount) cfg.onMount(q('#sheet-body'));
}
function closeSheet() {
  q('#sheet-root').innerHTML = '';
  const cb = sheetOnClose; sheetOnClose = null;
  if (cb) cb();
}
function isSheetOpen() { return !!q('#sheet-inner'); }
/* Nur ein Tap direkt auf den Hintergrund schließt — Taps im Sheet bleiben in der Delegation (§20.1) */
onAct('sheet.backdrop', (d, el, ev) => { if (ev && ev.target === el) closeSheet(); });
onAct('sheet.close', () => closeSheet());

/* Bestätigungsdialog (§18 Import, Zurücksetzen etc.) */
function confirmSheet(cfg, onYes) {
  openSheet({
    title: cfg.title,
    sub: cfg.text,
    body:
      '<div class="stack">' +
      '<button class="btn primary block big" data-act="confirm.yes">' + esc(cfg.okLabel || 'Bestätigen') + '</button>' +
      '<button class="btn ghost block" data-act="sheet.close">Abbrechen</button>' +
      '</div>',
    onMount: () => {
      ACTIONS['confirm.yes'] = () => { closeSheet(); onYes(); };
    }
  });
}

/* ---------- Fehlerkarte statt White-Screen (§1.7) ---------- */
function showError(err) {
  ui.lastError = err;
  const app = q('#app');
  if (!app) return;
  const card = document.createElement('div');
  card.className = 'errorcard';
  card.innerHTML =
    '<h2>Ein Fehler ist aufgetreten</h2>' +
    '<pre>' + esc(String((err && err.message) || err)) + '</pre>' +
    '<button class="btn sm ghost" data-act="error.dismiss">Ausblenden</button>';
  app.insertBefore(card, app.firstChild);
}
onAct('error.dismiss', () => { ui.lastError = null; render(); });

/* ---------- Tab-Icons (§23.2 outline / aktiv gefüllt) ---------- */
function tabIcon(id, active) {
  const s = 'class="t-ic" viewBox="0 0 24 24" fill="' + (active ? 'currentColor' : 'none') +
            '" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';
  if (id === 'training') return '<svg ' + s + '><path d="M13 2 4.5 13.5H10l-1 8.5 8.5-11.5H12l1-8.5Z"/></svg>';
  if (id === 'mobility') return '<svg ' + s + '><circle cx="12" cy="4.6" r="2.1"/><path d="M12 7.2v5.4M12 12.6 7 21M12 12.6 17 21M6.5 10.2 12 9.4l5.5.8"/></svg>';
  if (id === 'progress') return '<svg ' + s + ' fill="none"><path d="M3 20.5h18"/><path d="M4.5 15.5 9.5 10l3.5 3 6-7"/><path d="M15.5 6h3.5v3.5"/></svg>';
  return '<svg ' + s + ' fill="none"><path d="M12 5v14M5 12h14"/></svg>';
}

function renderTabbar() {
  const bar = q('#tabbar');
  bar.innerHTML = TABS.map(t =>
    '<button class="' + (ui.tab === t.id ? 'on' : '') + '" data-act="nav.tab" data-tab="' + t.id + '">' +
      tabIcon(t.id, ui.tab === t.id) +
      '<span class="t-lb">' + esc(t.label) + '</span>' +
    '</button>'
  ).join('');
}
onAct('nav.tab', d => {
  if (ui.runner) stopRunner();
  closeSheet();
  ui.tab = d.tab;
  ui.moreView = null;
  ui.detailExercise = null;
  ui.mobilityEdit = false;
  window.scrollTo(0, 0);
  render();
});

/* ---------- Haupt-Render mit globalem try/catch (§1.7) ---------- */
function render() {
  const app = q('#app');
  try {
    let html = '';
    if (ui.tab === 'training')      html = renderTraining();
    else if (ui.tab === 'mobility') html = renderMobility();
    else if (ui.tab === 'progress') html = renderProgress();
    else                            html = renderMore();
    app.innerHTML = html;
    renderTabbar();
    if (ui.tab === 'training' && typeof afterRenderTraining === 'function') afterRenderTraining();
    if (ui.tab === 'progress' && typeof afterRenderProgress === 'function') afterRenderProgress();
  } catch (e) {
    logError(e);
    app.innerHTML =
      '<div class="errorcard">' +
        '<h2>Anzeige-Fehler</h2>' +
        '<pre>' + esc(String((e && e.message) || e)) + '</pre>' +
        '<button class="btn sm ghost" data-act="error.reset">Ansicht zurücksetzen</button>' +
      '</div>';
    try { renderTabbar(); } catch (e2) { /* ignorieren */ }
  }
}
onAct('error.reset', () => {
  ui.detailExercise = null; ui.moreView = null; ui.slotSheetKey = null;
  ui.mobilityEdit = false; ui.runner = null;
  render();
});

/* ---------- Kleine Bausteine ---------- */
function kicker(text) { return '<p class="kicker">' + esc(text) + '</p>'; }
function screenTitle(text) { return '<h1 class="screen-title">' + esc(text) + '</h1>'; }
function fmtDuration(sec) {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m + ':' + String(r).padStart(2, '0');
}
function fmtDurationLong(sec) {
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return s + ' Sek';
  const m = Math.floor(s / 60), r = s % 60;
  return r === 0 ? m + ' Min' : m + ' Min ' + r + ' Sek';
}
function fmtDateDE(iso) {
  const p = String(iso || '').split('-');
  if (p.length !== 3) return String(iso || '—');
  return p[2] + '.' + p[1] + '.' + p[0];
}
function emptyBox(text) { return '<div class="list"><div class="empty">' + esc(text) + '</div></div>'; }

/* Übungs-Auswahlliste für Sheets */
function exerciseListHtml(list, actName, extra) {
  if (!list.length) return '<div class="empty">Keine passenden Übungen</div>';
  const muscleRank = { chest: 1, back: 2, shoulders: 3, arms: 4, legs: 5, abs: 6, cardio: 7 };
  const sorted = list.slice().sort((a, b) => {
    const ga = muscleRank[muscleGroupForExercise(a.id)] || 8;
    const gb = muscleRank[muscleGroupForExercise(b.id)] || 8;
    if (ga !== gb) return ga - gb;
    return String(a.name || '').localeCompare(String(b.name || ''), 'de');
  });
  return '<div class="list">' + sorted.map(e =>
    '<button class="list-item" data-act="' + esc(actName) + '" data-id="' + esc(e.id) + '"' +
      (extra ? ' ' + extra : '') + '>' +
      '<div class="li-main">' +
        '<div class="li-name">' + esc(e.name) + '</div>' +
        '<div class="li-meta">' + esc(CATEGORIES[e.category] || e.category) +
          ((store && store.gymId && store.exerciseVariants)
            ? (() => { const variants = store.exerciseVariants.filter(v => v.gymId === store.gymId && v.exerciseId === e.id).map(v => v.name); return variants.length ? ' · Varianten: ' + esc(variants.join(', ')) : ''; })()
            : '') +
          (e.isCustom ? ' · eigene Übung' : '') +
          (e.bodyweight ? ' · Körpergewicht' : '') + '</div>' +
      '</div>' +
      '<span class="chev">›</span>' +
    '</button>'
  ).join('') + '</div>';
}
