/* Lift — Mehr-Screen (§2, §9.6, §13, §14, §18, §30, §32.9) */
'use strict';

function renderMore() {
  if (ui.moreView === 'gyms')   return renderGyms();
  if (ui.moreView === 'pain')   return renderPainFilter();
  if (ui.moreView === 'custom') return renderCustomExercises();
  if (ui.moreView === 'data')   return renderData();
  if (ui.moreView === 'plans')  return renderNamedPlans();
  if (ui.moreView === 'directory') return renderExerciseDirectory();

  let html = kicker('Mehr') + screenTitle('Mehr');
  html += '<div class="stack">';

  /* Training-Einstellungen */
  html += kicker('Training');
  html += '<div class="card">' +
    '<div class="kicker">Equipment-Modus</div>' +
    '<div class="segmented mt">' + EQUIPMENT_MODES.map(m =>
      '<button class="' + (store.equipmentMode === m.id ? 'on' : '') + '" data-act="equip.set" data-mode="' + m.id + '">' +
      esc(m.label) + '</button>').join('') + '</div>' +
  '</div>';

  html += '<div class="card">' +
    '<div class="field-block"><label>Körpergewicht (kg)</label>' +
    '<input class="input" type="number" inputmode="decimal" step="0.5" value="' + esc(store.bodyweightKg) + '" data-change="set.bodyweight"></div>' +
    '<p class="tiny muted">Wird nur für Volumen-Diagramme verwendet.</p>' +
  '</div>';

  html += '<div class="list">' +
    navItem('gyms', 'Gyms', gymLabel(store.gymId) + ' aktiv · ' + allGyms().length + ' verfügbar') +
    navItem('plans', 'Trainingspläne', store.namedTrainingPlans.length + ' eigene Pläne') +
    navItem('directory', 'Übungsverzeichnis', allExercises().length + ' Übungen') +
    navItem('pain', 'Verletzungs-Filter', activePainCount() + ' aktive Filter') +
    navItem('custom', 'Eigene Übungen', store.customExercises.length + ' angelegt') +
    navItem('data', 'Daten', 'Import / Export · ' + store.sessions.length + ' Einheiten') +
  '</div>';

  html += kicker('Info');
  html += '<div class="card"><div class="card-sub">' +
    'Lift — Offline-PWA, Version ' + STORE_VERSION + '. Alle Daten bleiben ausschließlich auf diesem Gerät ' +
    '(kein Konto, keine Cloud, kein Tracking).</div>' +
    '<p class="tiny muted">Stand 8: Cardio, PR-Reiter, Wildcard-Modi A/B/C, leere Sätze werden übersprungen.</p>' +
    '<button class="btn sm block mt" data-act="app.update">Nach Aktualisierung suchen</button>' +
    '<p class="tiny muted">Lädt die App neu und verwirft alte zwischengespeicherte Dateien. Deine Daten bleiben erhalten.</p>' +
  '</div>';

  html += '</div>';
  return html;
}

function navItem(view, name, meta) {
  return '<button class="list-item" data-act="more.open" data-view="' + view + '">' +
    '<div class="li-main"><div class="li-name">' + esc(name) + '</div>' +
    '<div class="li-meta">' + esc(meta) + '</div></div><span class="chev">›</span></button>';
}
/* Der Host liefert JS/CSS mit vier Stunden Cache-Lebensdauer aus. Dieser Knopf
   verwirft Service-Worker-Caches und lädt die App mit frischer Adresse neu. */
onAct('app.update', () => {
  saveStore();
  const done = () => {
    const u = new URL(window.location.href);
    u.searchParams.set('u', String(Date.now()));
    window.location.replace(u.toString());
  };
  const jobs = [];
  try {
    if (window.caches && caches.keys) {
      jobs.push(caches.keys().then(ks => Promise.all(ks.map(k => caches.delete(k)))));
    }
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
      jobs.push(navigator.serviceWorker.getRegistrations()
        .then(rs => Promise.all(rs.map(r => (r.update ? r.update().catch(() => null) : null))))
        .then(() => navigator.serviceWorker.getRegistrations())
        .then(rs => Promise.all(rs.map(r => r.unregister().catch(() => null)))));
    }
  } catch (e) { /* ohne Service-Worker einfach neu laden */ }
  toast('Aktualisierung wird geladen', { level: 1 });
  Promise.all(jobs).catch(() => null).then(done);
  setTimeout(done, 2500);
});

onAct('more.open', d => { ui.moreView = d.view; window.scrollTo(0, 0); render(); });
onAct('more.back', () => { ui.moreView = null; render(); });

function renderNamedPlans() {
  let html = subHeader('Trainingspläne') + '<div class="stack">';
  if (!store.namedTrainingPlans.length) html += '<div class="empty">Noch keine eigenen Trainingspläne.</div>';
  html += '<div class="list">' + store.namedTrainingPlans.map(p =>
    '<div class="list-item"><div class="li-main"><div class="li-name">' + esc(p.name) + '</div>' +
      '<div class="li-meta">' + p.slots.length + ' Übungen</div></div>' +
      '<button class="badge" data-act="plan.load" data-id="' + esc(p.id) + '">Laden</button>' +
      '<button class="badge" data-act="plan.delete" data-id="' + esc(p.id) + '">Löschen</button></div>'
  ).join('') + '</div>';
  html += '<button class="btn primary block big" data-act="plan.create">+ Eigenen Plan erstellen</button></div>';
  return html;
}

onAct('plan.create', () => {
  openSheet({
    title: 'Neuen Plan erstellen', sub: 'Eine leere benannte Zusammenstellung',
    body: '<div class="stack"><div class="field-block"><label>Name</label>' +
      '<input class="input" id="plan-name" placeholder="z. B. Push Zuhause"></div>' +
      '<button class="btn primary block" data-act="plan.addFirst">Plan erstellen</button></div>'
  });
});
onAct('plan.addFirst', () => {
  const name = String((q('#plan-name') || {}).value || '').trim();
  if (!name) { toast('Bitte einen Namen eingeben', { level: 0 }); return; }
  store.namedTrainingPlans.push({ id: uid('plan'), name: name, slots: [], updatedAt: nowTs() });
  saveStore(); closeSheet(); render();
  openPlanEditor(store.namedTrainingPlans[store.namedTrainingPlans.length - 1].id);
});

function openPlanEditor(planId) {
  const plan = store.namedTrainingPlans.find(p => p.id === planId); if (!plan) return;
  const body = '<div class="stack"><div class="field-block"><label>Planname</label>' +
    '<input class="input" value="' + esc(plan.name) + '" data-change="plan.rename" data-id="' + esc(plan.id) + '"></div>' +
    '<div class="list">' + plan.slots.map((slot, i) =>
      '<div class="card pad-s"><div class="li-name">' + esc(exerciseName(slot.exerciseId)) + '</div>' +
      '<div class="cardio-grid mt"><div class="field-block"><label>Sätze</label><input class="input" type="number" min="1" max="12" value="' + slot.sets + '" data-change="plan.slotSets" data-id="' + esc(plan.id) + '" data-i="' + i + '"></div>' +
      '<div class="field-block"><label>Wdh.</label><input class="input" value="' + esc(slot.reps) + '" data-change="plan.slotReps" data-id="' + esc(plan.id) + '" data-i="' + i + '"></div>' +
      '<div class="field-block"><label>Pause s</label><input class="input" type="number" min="0" max="600" value="' + slot.rest + '" data-change="plan.slotRest" data-id="' + esc(plan.id) + '" data-i="' + i + '"></div></div></div>'
    ).join('') + '</div>' +
    '<button class="btn ghost block" data-act="plan.addExercise" data-id="' + esc(plan.id) + '">+ Übung hinzufügen</button>' +
    '<button class="btn primary block big" data-act="plan.start" data-id="' + esc(plan.id) + '">Plan laden</button></div>';
  openSheet({ title: 'Trainingsplan', sub: plan.name, body: body });
}
 onAct('plan.load', d => openPlanEditor(d.id));
 onAct('plan.rename', (d, el) => { const p = store.namedTrainingPlans.find(x => x.id === d.id); if (p) { p.name = String(el.value).trim() || p.name; p.updatedAt = nowTs(); saveStore(); } });
 onAct('plan.slotSets', (d, el) => { const p = store.namedTrainingPlans.find(x => x.id === d.id); if (p && p.slots[d.i]) p.slots[d.i].sets = Math.min(12, Math.max(1, parseInt(el.value, 10) || 1)); saveStore(); });
 onAct('plan.slotReps', (d, el) => { const p = store.namedTrainingPlans.find(x => x.id === d.id); if (p && p.slots[d.i]) p.slots[d.i].reps = String(el.value).trim() || '8–12'; saveStore(); });
 onAct('plan.slotRest', (d, el) => { const p = store.namedTrainingPlans.find(x => x.id === d.id); if (p && p.slots[d.i]) p.slots[d.i].rest = Math.min(600, Math.max(0, parseInt(el.value, 10) || 0)); saveStore(); });
 onAct('plan.addExercise', d => openSheet({ title: 'Übung auswählen', sub: 'Zum benannten Plan', body: exerciseListHtml(allExercises().filter(e => !isPainFlagged(e.id)), 'plan.pickExercise', 'data-plan="' + esc(d.id) + '"') }));
 onAct('plan.pickExercise', d => { const p = store.namedTrainingPlans.find(x => x.id === d.plan); const ex = getExercise(d.id); if (!p || !ex) return; p.slots.push({ slotKey: 'plan_' + uid('s'), exerciseId: ex.id, name: ex.name, category: ex.category, sets: 3, reps: '8–12', rest: 90 }); p.updatedAt = nowTs(); saveStore(); openPlanEditor(p.id); });
 onAct('plan.start', d => {
  const p = store.namedTrainingPlans.find(x => x.id === d.id); if (!p) return;
  const sess = { id: uid('s'), dayId: 'plan_' + p.id, dateISO: todayISO(), gymId: store.gymId, equipment: store.equipmentMode, mode: null, name: p.name, slots: p.slots.map((slot, i) => { const exId = slot.exerciseId; const ex = getExercise(exId); const last = lastWeightFor(exId, currentExerciseScope(exId)); const sets = []; for (let k = 0; k < slot.sets; k++) sets.push({ w: last, r: 0, done: false }); return { slotKey: 'named_s' + (i + 1), exerciseId: exId, originalExerciseId: exId, variantId: lastExerciseVariantId(exId, store.gymId), category: ex ? ex.category : slot.category, sets: sets, targetSets: slot.sets, targetReps: slot.reps, targetWeight: last, restSec: slot.rest, slotName: slot.name, isPowerliftingMain: false, skipped: false }; }), finished: false, finishedEarly: false };
  store.activeSession = sess; saveStore(); closeSheet(); ui.moreView = null; ui.tab = 'training'; render();
});
 onAct('plan.delete', d => confirmSheet({ title: 'Plan löschen', text: 'Dieser benannte Trainingsplan wird entfernt.', okLabel: 'Plan löschen' }, () => { store.namedTrainingPlans = store.namedTrainingPlans.filter(p => p.id !== d.id); saveStore(); render(); }));
onAct('set.bodyweight', (d, el) => {
  const v = parseFloat(String(el.value).replace(',', '.'));
  if (isFinite(v) && v > 0) { store.bodyweightKg = v; saveStore(); }
});

function subHeader(title) {
  return '<button class="btn sm ghost mb" data-act="more.back">‹ Mehr</button>' +
    kicker(title) + screenTitle(title);
}

/* ---------- Gyms (§13) ---------- */
function renderGyms() {
  let html = subHeader('Gyms');
  html += '<div class="stack">';
  html += '<p class="small muted">Die Gym-Wahl trennt PRs und Historie nur im Modus „Gym“ — ' +
    'Maschinen unterscheiden sich je Studio. Hantel und Calisthenics sind überall genormt und ' +
    'werden studioübergreifend geführt.</p>';
  html += '<div class="list">' + allGyms().map(g =>
    '<button class="list-item ' + (store.gymId === g.id ? 'is-active' : '') + '" data-act="gym.set" data-id="' + esc(g.id) + '">' +
      '<span class="statusdot ' + (store.gymId === g.id ? 'done' : '') + '">' + (store.gymId === g.id ? '✓' : '') + '</span>' +
      '<div class="li-main"><div class="li-name">' + esc(g.label) + '</div>' +
      '<div class="li-meta">' + prCountForGym(g.id) + ' PRs</div></div>' +
    '</button>').join('') + '</div>';
  html += '<div class="card"><div class="field-block"><label>Neues Gym</label>' +
    '<input class="input" id="gym-new" placeholder="Name des Studios"></div>' +
    '<button class="btn primary block mt" data-act="gym.add">Gym hinzufügen</button></div>';
  html += '<button class="btn ghost block big" data-act="gym.variants">Maschinenvarianten verwalten</button>';
  html += '</div>';
  return html;
}
function prCountForGym(id) {
  const b = store.prs[id];
  return b ? Object.keys(b).length : 0;
}
onAct('gym.set', d => {                 /* §20.1 Single-Tap */
  store.gymId = d.id;
  saveStore();
  render();
});
onAct('gym.add', () => {
  const el = q('#gym-new');
  const label = String((el || {}).value || '').trim();
  if (!label) { toast('Bitte einen Namen eingeben', { level: 0 }); return; }
  store.customGyms.push({ id: uid('gym'), label: label });
  saveStore();
  render();
  toast('Gym hinzugefügt', { level: 2, sub: label });
});
onAct('gym.variants', () => {
  renderGymVariantSheet();
});

function gymVariants(exerciseId) {
  return store.exerciseVariants.filter(v => v.gymId === store.gymId && v.exerciseId === exerciseId);
}
function activeGymVariant(exerciseId) {
  const key = store.gymId + ':' + exerciseId;
  const id = store.activeExerciseVariants[key];
  return store.exerciseVariants.find(v => v.id === id && v.gymId === store.gymId && v.exerciseId === exerciseId) || null;
}
function renderGymVariantSheet() {
  const list = allExercises().filter(e => e.equipment && e.equipment.indexOf('studio') !== -1 && !isPainFlagged(e.id));
  const variants = store.exerciseVariants.filter(v => v.gymId === store.gymId);
  openSheet({
    title: 'Maschinenvarianten',
    sub: gymLabel(store.gymId),
    body: '<div class="stack">' +
      '<div class="field-block"><label>Stammübung auswählen</label>' +
        '<select class="input" id="ev-exercise">' + list.map(e =>
          '<option value="' + esc(e.id) + '">' + esc(e.name) + '</option>').join('') + '</select></div>' +
      '<div class="field-block"><label>Hersteller/Modell</label>' +
        '<input class="input" id="ev-name" placeholder="z. B. Life Fitness"></div>' +
      '<button class="btn primary block" data-act="gym.variantAdd">Variante hinzufügen</button>' +
      (variants.length
        ? '<div class="list">' + variants.map(v =>
          '<div class="list-item"><div class="li-main"><div class="li-name">' + esc(exerciseName(v.exerciseId)) + '</div>' +
          '<div class="li-meta">' + esc(v.name) + '</div></div>' +
          '<button class="badge" data-act="gym.variantRemove" data-id="' + esc(v.id) + '">entfernen</button></div>').join('') + '</div>'
        : '<div class="empty">Noch keine Varianten für dieses Gym</div>') +
    '</div>'
  });
}
 onAct('gym.variantAdd', () => {
  const exerciseId = String((q('#ev-exercise') || {}).value || '');
  const name = String((q('#ev-name') || {}).value || '').trim();
  if (!exerciseId || !name) { toast('Übung und Modell angeben', { level: 0 }); return; }
  store.exerciseVariants.push({ id: uid('ev'), gymId: store.gymId, exerciseId: exerciseId, name: name });
  saveStore();
  renderGymVariantSheet();
  toast('Maschinenvariante gespeichert', { level: 2, sub: name });
});
 onAct('gym.variantRemove', d => {
  store.exerciseVariants = store.exerciseVariants.filter(v => v.id !== d.id);
  Object.keys(store.activeExerciseVariants).forEach(k => { if (store.activeExerciseVariants[k] === d.id) delete store.activeExerciseVariants[k]; });
  saveStore();
  renderGymVariantSheet();
});



/* ---------- Verletzungs-Filter (§14, §30, §32.9) ---------- */
function activePainCount() {
  return Object.keys(store.painFlags).filter(k => store.painFlags[k] === true).length;
}
function renderPainFilter() {
  const active = Object.keys(store.painFlags).filter(k => store.painFlags[k] === true);
  let html = subHeader('Verletzungs-Filter');
  html += '<div class="stack">';
  html += '<p class="small muted">Markierte Übungen erscheinen weder in Defaults noch in Tausch-, Wildcard- ' +
    'oder Powerlifting-Auswahlen. Es werden ausschließlich aktive Filter angezeigt.</p>';

  /* §30: nur aktive Filter anzeigen */
  html += '<div class="list">' +
    (active.length ? active.map(id =>
      '<div class="list-item">' +
        '<span class="statusdot done">✓</span>' +
        '<div class="li-main"><div class="li-name">' + esc(exerciseName(id)) + '</div>' +
        '<div class="li-meta">' + esc(CATEGORIES[(getExercise(id) || {}).category] || 'Unbekannte Kategorie') + '</div></div>' +
        '<button class="badge" data-act="pain.remove" data-id="' + esc(id) + '">entfernen</button>' +
      '</div>').join('') : '<div class="empty">Keine aktiven Filter</div>') +
    '<button class="list-item" data-act="pain.addOpen">' +
      '<div class="li-main"><div class="li-name accent">+ Übung hinzufügen</div>' +
      '<div class="li-meta">Auswahl aus der gesamten Bibliothek</div></div><span class="chev">›</span></button>' +
  '</div>';
  html += '</div>';
  return html;
}
onAct('pain.addOpen', () => {
  /* §32.9: ausschließlich bestehende Bibliothek inkl. eigener Übungen, kein Zugang zu §9.6 */
  const list = allExercises().filter(e => store.painFlags[e.id] !== true);
  openSheet({
    title: 'Übung hinzufügen',
    sub: 'Bestehende Bibliothek inklusive eigener Übungen',
    body: '<div class="chips">' +
        '<button class="chip ' + (!ui._painCat || ui._painCat === 'all' ? 'on' : '') + '" data-act="pain.cat" data-cat="all">Alle</button>' +
        CATEGORY_ORDER.map(c => '<button class="chip ' + (ui._painCat === c ? 'on' : '') + '" data-act="pain.cat" data-cat="' + c + '">' +
          esc(CATEGORIES[c]) + '</button>').join('') +
      '</div>' +
      exerciseListHtml(ui._painCat && ui._painCat !== 'all' ? list.filter(e => e.category === ui._painCat) : list, 'pain.add')
  });
});
onAct('pain.cat', d => { ui._painCat = d.cat; onActRunPainAdd(); });
function onActRunPainAdd() { ACTIONS['pain.addOpen'](); }
onAct('pain.add', d => {              /* §20.1 Single-Tap */
  store.painFlags[d.id] = true;
  saveStore();
  closeSheet();
  render();
  toast('Filter aktiviert', { level: 2, sub: exerciseName(d.id) });
});
onAct('pain.remove', d => {
  delete store.painFlags[d.id];       /* §30: Entfernen setzt den Flag zurück */
  saveStore();
  render();
});

/* ---------- Eigene Übungen (§9.6) ---------- */
function renderCustomExercises() {
  let html = subHeader('Eigene Übungen');
  html += '<div class="stack">';
  html += '<div class="list">' +
    (store.customExercises.length ? store.customExercises.map(e =>
      '<div class="list-item">' +
        '<div class="li-main"><div class="li-name">' + esc(e.name) + '</div>' +
        '<div class="li-meta">' + esc(CATEGORIES[e.category] || e.category) +
          ' · ' + esc((e.equipment || []).map(m => (EQUIPMENT_MODES.find(x => x.id === m) || {}).label || m).join(', ')) +
          (e.isCompound ? ' · Compound' : ' · Isolation') + '</div></div>' +
        '<button class="badge" data-act="custom.remove" data-id="' + esc(e.id) + '">entfernen</button>' +
      '</div>').join('') : '<div class="empty">Noch keine eigenen Übungen</div>') +
  '</div>';
  html += '<button class="btn primary block big" data-act="custom.addOpen">+ Eigene Übung anlegen</button>';
  html += '<p class="tiny muted center">Neu angelegte Übungen erscheinen automatisch auch im Verletzungs-Filter.</p>';
  html += '</div>';
  return html;
}
onAct('custom.addOpen', () => {
  openSheet({
    title: 'Eigene Übung anlegen',
    sub: 'Vorauswahl für Muskelgruppe, Equipment und Typ',
    body:
      '<div class="stack">' +
        '<div class="field-block"><label>Name</label>' +
          '<input class="input" id="cx-name" placeholder="z. B. Kabelzug einarmig"></div>' +
        '<div class="field-block"><label>Muskel-Unterkategorie</label>' +
          '<select class="input" id="cx-sub">' + SUBCATEGORIES.map(s =>
            '<option value="' + esc(s.id) + '">' + esc(s.label) + '</option>').join('') + '</select></div>' +
        '<div class="field-block"><label>Kategorie</label>' +
          '<select class="input" id="cx-type"><option value="compound">Compound</option>' +
          '<option value="isolation">Isolation</option></select></div>' +
        '<div class="field-block"><label>Equipment</label>' +
          '<select class="input" id="cx-equip">' + EQUIPMENT_MODES.map(m =>
            '<option value="' + esc(m.id) + '">' + esc(m.label) + '</option>').join('') +
          '<option value="all">Alle Modi</option></select></div>' +
        '<label class="row small"><input type="checkbox" id="cx-bw" style="width:20px;height:20px"> Körpergewichtsübung</label>' +
        '<label class="row small"><input type="checkbox" id="cx-dist" style="width:20px;height:20px"> Distanz messbar (nur bei Cardio)</label>' +
        '<p class="tiny muted">Unterkategorie „Cardio": erfasst Intensität und Dauer statt Gewicht und Wiederholungen.</p>' +
        '<button class="btn primary block big" data-act="custom.save">Anlegen</button>' +
      '</div>'
  });
});
onAct('custom.save', () => {
  const name = String((q('#cx-name') || {}).value || '').trim();
  if (!name) { toast('Bitte einen Namen eingeben', { level: 0 }); return; }
  const subId = (q('#cx-sub') || {}).value;
  const type = (q('#cx-type') || {}).value;
  const equip = (q('#cx-equip') || {}).value;
  const bw = !!(q('#cx-bw') || {}).checked;
  const sub = SUBCATEGORIES.find(s => s.id === subId) || SUBCATEGORIES[0];
  const ex = {
    id: uid('cx'),
    name: name,
    category: sub.cat[type],
    equipment: equip === 'all' ? ['studio', 'barbell', 'bodyweight'] : [equip],
    bodyweight: bw,
    isCompound: type === 'compound',
    isCustom: true,
    subcategory: sub.id
  };
  /* Cardio-Übung: Intensität und Dauer statt Gewicht und Wiederholungen */
  if (sub.id === 'cardio') {
    ex.metric = 'cardio';
    ex.isCompound = false;
    ex.bodyweight = false;
    if (!!(q('#cx-dist') || {}).checked) ex.hasDistance = true;
  }
  store.customExercises.push(ex);
  saveStore();
  closeSheet();
  render();
  toast('Übung angelegt', { level: 2, sub: name + ' · ' + CATEGORIES[ex.category] });
});
function renderExerciseDirectory() {
  let html = subHeader('Übungsverzeichnis') + '<div class="stack">';
  html += '<div class="field-block"><label>Suche</label><input class="input" id="exercise-search" placeholder="Übung oder Muskelgruppe" value="' + esc(ui.exerciseSearch || '') + '" data-input="exercise.search"></div>';
  html += '<div class="chips">' + MUSCLE_GROUP_FILTERS.map(g =>
    '<button class="chip ' + ((ui.exerciseGroup || 'all') === g.id ? 'on' : '') + '" data-act="exercise.filter" data-group="' + g.id + '">' + esc(g.label) + '</button>').join('') + '</div>';
  let list = allExercises().filter(e => !isPainFlagged(e.id));
  const term = String(ui.exerciseSearch || '').trim().toLowerCase();
  if (term) list = list.filter(e => (exerciseName(e.id) + ' ' + CATEGORIES[e.category] + ' ' + (e.subcategory || '')).toLowerCase().indexOf(term) !== -1);
  if (ui.exerciseGroup === 'compound') list = list.filter(e => e.isCompound === true);
  else if (ui.exerciseGroup && ui.exerciseGroup !== 'all') list = list.filter(e => muscleGroupForExercise(e.id) === ui.exerciseGroup);
  list.sort((a, b) => String(a.name).localeCompare(String(b.name), 'de'));
  html += '<div class="list">' + list.map(e => {
    const variants = (store.exerciseVariants || []).filter(v => v.gymId === store.gymId && v.exerciseId === e.id).map(v => v.name);
    return '<div class="list-item"><div class="li-main"><div class="li-name">' + esc(e.name) + '</div>' +
      '<div class="li-meta">' + esc(CATEGORIES[e.category] || e.category) +
      (e.isCompound ? ' · Compound' : ' · Isolation') +
      (variants.length ? ' · Varianten: ' + esc(variants.join(', ')) : '') + '</div></div>' +
      (e.equipment && e.equipment.indexOf('studio') !== -1 ? '<button class="badge" data-act="exercise.variantOpen" data-id="' + esc(e.id) + '">Variante</button>' : '') +
    '</div>';
  }).join('') + '</div></div>';
  return html;
}
 onAct('exercise.search', (d, el) => { ui.exerciseSearch = String(el.value || ''); render(); });
 onAct('exercise.filter', d => { ui.exerciseGroup = d.group; render(); });
 onAct('exercise.variantOpen', d => {
  openSheet({ title: 'Maschinenvariante', sub: exerciseName(d.id) + ' · ' + gymLabel(store.gymId), body:
    '<div class="stack"><div class="field-block"><label>Hersteller/Modell</label><input class="input" id="directory-variant-name" placeholder="z. B. Life Fitness"></div>' +
    '<button class="btn primary block" data-act="exercise.variantSave" data-id="' + esc(d.id) + '">Variante speichern</button></div>'
  });
});
 onAct('exercise.variantSave', d => {
  const name = String((q('#directory-variant-name') || {}).value || '').trim();
  if (!name) { toast('Bitte Hersteller oder Modell eingeben', { level: 0 }); return; }
  store.exerciseVariants.push({ id: uid('ev'), gymId: store.gymId, exerciseId: d.id, name: name });
  rememberExerciseVariant(d.id, store.gymId, store.exerciseVariants[store.exerciseVariants.length - 1].id);
  saveStore(); closeSheet(); render(); toast('Variante gespeichert', { level: 2, sub: name });
});

onAct('custom.remove', d => {
  confirmSheet({
    title: 'Übung entfernen',
    text: 'Bereits aufgezeichnete Sätze dieser Übung bleiben in der Historie erhalten.',
    okLabel: 'Entfernen'
  }, () => {
    store.customExercises = store.customExercises.filter(e => e.id !== d.id);
    saveStore();
    render();
  });
});

/* ---------- Daten: Import / Export (§18, §32.3) ---------- */
function renderData() {
  const since = store.lastExportAt
    ? 'Letzter Export: ' + fmtDateDE(new Date(store.lastExportAt).toISOString().slice(0, 10))
    : 'Noch kein Export durchgeführt';
  let html = subHeader('Daten');
  html += '<div class="stack">';
  html += '<div class="card"><div class="kicker">Export</div>' +
    '<div class="card-sub" style="margin-top:6px">' + esc(since) + ' · ' + store.sessions.length + ' Einheiten, ' +
      Object.keys(store.prs).length + ' Gym-Datensätze</div>' +
    '<button class="btn primary block mt" data-act="data.export">Export als JSON-Datei</button></div>';

  html += '<div class="card"><div class="kicker">Import</div>' +
    '<div class="card-sub" style="margin-top:6px">Alte Exporte werden automatisch migriert.</div>' +
    '<input type="file" accept="application/json,.json" id="import-file" style="display:none" data-change="data.importFile">' +
    '<button class="btn ghost block mt" data-act="data.importOpen">Datei auswählen</button></div>';

  html += '<div class="card"><div class="kicker">Gezielt löschen</div>' +
    '<div class="card-sub" style="margin-top:6px">Vor dem Löschen bleibt ein lokales JSON-Backup möglich.</div>' +
    '<button class="btn ghost block mt" data-act="data.deleteHistory">Einheitenhistorie löschen</button>' +
    '<button class="btn ghost block mt" data-act="data.deletePrs">Alle PR-Daten löschen</button>' +
    '<button class="btn ghost block mt" data-act="data.deletePlans">Alle Trainingsvorlagen löschen</button>' +
    '<button class="btn ghost block mt" data-act="data.deleteConditioning">AMRAP-/EMOM-Rekorde löschen</button></div>';
  html += '</div>';
  return html;
}

onAct('data.export', () => {
  try {
    const name = 'lift-export-' + todayISO() + '.json';
    store.lastExportAt = nowTs();          /* §18 / §32.3 */
    saveStore();
    const blob = new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
    render();
    toast('Export erstellt', { level: 2, sub: name });
  } catch (e) {
    logError(e);
    toast('Export fehlgeschlagen', { level: 0, sub: String(e && e.message) });
  }
});

onAct('data.importOpen', () => { const f = q('#import-file'); if (f) f.click(); });

onAct('data.importFile', (d, el) => {
  const file = el.files && el.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let parsed = null;
    try {
      parsed = JSON.parse(String(reader.result));
    } catch (e) {
      logError(e);
      toast('Datei ist kein gültiges JSON', { level: 0 });
      return;
    }
    if (!parsed || typeof parsed !== 'object') { toast('Datei enthält keine Lift-Daten', { level: 0 }); return; }
    confirmSheet({
      title: 'Import bestätigen',
      text: 'Alle aktuellen Daten werden durch den Inhalt der Datei ersetzt.',
      okLabel: 'Importieren'
    }, () => applyImport(parsed));
  };
  reader.onerror = () => { logError(reader.error || { message: 'Datei konnte nicht gelesen werden' }); toast('Datei konnte nicht gelesen werden', { level: 0 }); };
  reader.readAsText(file);
});

function applyImport(parsed) {
  /* §18: Erfolgsstatus direkt nach erfolgreichem Speichern setzen —
     nachgelagerte Renderfehler dürfen den Import nicht als fehlgeschlagen anzeigen. */
  let saved = false;
  try {
    const migrated = migrateStore(parsed);
    store = migrated;
    saved = saveStore();
  } catch (e) {
    logError(e);
    toast('Import fehlgeschlagen', { level: 0, sub: String(e && e.message) });
    return;
  }
  if (!saved) { toast('Import fehlgeschlagen — Speicher voll?', { level: 0 }); return; }
  toast('Import erfolgreich', { level: 2, sub: store.sessions.length + ' Einheiten übernommen' });
  try {
    ui.moreView = 'data';
    ui.detailExercise = null;
    ui.selectedDay = store.activeSession ? store.activeSession.dayId : 'd1';
    render();
  } catch (e) {
    logError(e);
    showError(e);
  }
}

function backupBeforeScopedDelete(title, text, action) {
  confirmSheet({ title: title, text: text + ' Vor dem Löschen wird das Export-Backup erzeugt.', okLabel: 'Backup & Löschen' }, () => {
    try {
      const blob = new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'lift-sicherungsbackup-' + todayISO() + '.json';
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
    } catch (e) { logError(e); }
    action(); saveStore(); render(); toast('Bereich gelöscht', { level: 2 });
  });
}
 onAct('data.deleteHistory', () => backupBeforeScopedDelete('Einheitenhistorie löschen', 'Alle abgeschlossenen und aktiven Einheiten werden entfernt.', () => {
  store.sessions = []; store.activeSession = null; store.counters.completedSets = 0; store.counters.workoutsCompleted = 0;
}));
 onAct('data.deletePrs', () => backupBeforeScopedDelete('PR-Daten löschen', 'Alle Kraft-, Cardio- und Wiederholungs-PRs werden entfernt.', () => { store.prs = {}; }));
 onAct('data.deletePlans', () => backupBeforeScopedDelete('Trainingsvorlagen löschen', 'Eigene Trainingspläne, D1-D5-Kopien und Wildcard-Vorlagen werden entfernt.', () => {
  store.namedTrainingPlans = []; store.customFixedPlans = {}; store.wildcardTemplates = [];
}));
 onAct('data.deleteConditioning', () => backupBeforeScopedDelete('Konditionsrekorde löschen', 'AMRAP-/EMOM-Rekorde werden entfernt. Einheitenhistorie bleibt erhalten.', () => { store.conditioningRecords = {}; }));
