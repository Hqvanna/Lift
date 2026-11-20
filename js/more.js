/* Lift — Mehr-Screen (§2, §9.6, §13, §14, §18, §30, §32.9) */
'use strict';

function renderMore() {
  if (ui.moreView === 'gyms')   return renderGyms();
  if (ui.moreView === 'pain')   return renderPainFilter();
  if (ui.moreView === 'custom') return renderCustomExercises();
  if (ui.moreView === 'data')   return renderData();

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
      (BUILTIN_GYMS.some(b => b.id === g.id) ? '' :
        '<span class="badge" data-act="gym.remove" data-id="' + esc(g.id) + '">entfernen</span>') +
    '</button>').join('') + '</div>';
  html += '<div class="card"><div class="field-block"><label>Neues Gym</label>' +
    '<input class="input" id="gym-new" placeholder="Name des Studios"></div>' +
    '<button class="btn primary block mt" data-act="gym.add">Gym hinzufügen</button></div>';
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
onAct('gym.remove', d => {
  confirmSheet({
    title: 'Gym entfernen',
    text: 'PRs und Historie dieses Gyms bleiben in den Daten erhalten, das Gym ist aber nicht mehr auswählbar.',
    okLabel: 'Entfernen'
  }, () => {
    store.customGyms = store.customGyms.filter(g => g.id !== d.id);
    if (store.gymId === d.id) store.gymId = BUILTIN_GYMS[0].id;
    saveStore();
    render();
  });
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

  html += '<div class="card"><div class="kicker">Zurücksetzen</div>' +
    '<div class="card-sub" style="margin-top:6px">Löscht alle lokalen Daten unwiderruflich.</div>' +
    '<button class="btn danger block mt" data-act="data.wipe">Alle Daten löschen</button></div>';
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

onAct('data.wipe', () => {
  confirmSheet({
    title: 'Alle Daten löschen',
    text: 'Sessions, PRs, Einstellungen und eigene Übungen werden unwiderruflich entfernt.',
    okLabel: 'Endgültig löschen'
  }, () => {
    try { localStorage.removeItem(STORE_KEY); } catch (e) { logError(e); }
    store = migrateStore({});
    saveStore();
    ui.moreView = null;
    render();
    toast('Alle Daten gelöscht', { level: 2 });
  });
});
