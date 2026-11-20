/* Lift — Fortschritt-Screen (§16, §23.5, §23.8, §32.6) */
'use strict';

function renderProgress() {
  if (ui.detailExercise) return renderExerciseDetail(ui.detailExercise);

  let html = kicker('Fortschritt') + screenTitle('Fortschritt');
  html += '<div class="stack">';

  /* Kennzahlen */
  const series = volumeSeries();
  const total = series.length ? series[series.length - 1].value : 0;
  const cardioSecs = totalCardioSecs();
  html += '<div class="tiles">' +
    '<div class="tile"><div class="tl-lb">Einheiten</div><div class="tl-v">' + store.counters.workoutsCompleted + '</div></div>' +
    '<div class="tile"><div class="tl-lb">Sätze</div><div class="tl-v">' + store.counters.completedSets + '</div></div>' +
    '<div class="tile"><div class="tl-lb">Volumen</div><div class="tl-v">' + esc(fmtNum(total)) + '</div>' +
      '<div class="tiny muted">kg × Wdh.</div></div>' +
    '<div class="tile"><div class="tl-lb">Cardio-Minuten</div><div class="tl-v">' +
      esc(fmtNum(Math.round(cardioSecs / 60))) + '</div>' +
      '<div class="tiny muted">ohne kg-Volumen</div></div>' +
  '</div>';

  /* §23.8 Volumen-Trend als Liniendiagramm, kumuliert, alle Zeit */
  html += kicker('Volumen-Trend — kumuliert, alle Zeit');
  html += '<div class="chartbox">' + volumeChartSvg(series) + '</div>';

  /* §23.5 Powerlifting-Panel: drei Kacheln mit Training-Max */
  const plIds = Object.keys(store.powerlifting.tm);
  const hasPlSessions = store.sessions.some(s => s.dayId === 'd6');
  if (plIds.length || hasPlSessions) {
    html += kicker('Powerlifting — Training-Max');
    html += plPanelHtml(plIds);
  }

  /* PR-Übersicht: Reiter nach Geltungsbereich, darunter Kategorie-Chips */
  html += kicker('PR-Übersicht');
  html += '<div class="chips">' + PR_TABS.map(t =>
    '<button class="chip ' + (prScope() === t.id ? 'on' : '') + '" data-act="pr.scope" data-s="' + t.id + '">' +
    esc(t.label) + '</button>').join('') + '</div>';
  if (prScope() === 'gym') {
    const gyms = allGyms();
    if (gyms.length > 1) {
      html += '<div class="chips">' + gyms.map(g =>
        '<button class="chip ' + (prGymId() === g.id ? 'on' : '') + '" data-act="pr.gym" data-id="' + esc(g.id) + '">' +
        esc(g.name) + '</button>').join('') + '</div>' +
        '<p class="tiny muted">Nur Anzeige — das aktive Gym für das Training bleibt ' + esc(gymLabel(store.gymId)) + '.</p>';
    }
  }
  html += '<div class="chips">' +
    '<button class="chip ' + (ui.prFilter === 'all' ? 'on' : '') + '" data-act="pr.filter" data-cat="all">Alle</button>' +
    '<button class="chip ' + (ui.prFilter === 'arms' ? 'on' : '') + '" data-act="pr.filter" data-cat="arms">Arme</button>' +
    CATEGORY_ORDER.map(c =>
      '<button class="chip ' + (ui.prFilter === c ? 'on' : '') + '" data-act="pr.filter" data-cat="' + c + '">' +
      esc(CATEGORIES[c]) + '</button>').join('') +
  '</div>';
  html += prListHtml();

  /* Konditionierung: Rundenrekorde aus zeitbasierten Einheiten */
  const condNames = Object.keys(store.conditioningRecords || {});
  if (condNames.length) {
    html += kicker('Konditionierung — Rundenrekorde');
    html += '<div class="list">' + condNames.sort().map(n => {
      const r = store.conditioningRecords[n];
      return '<div class="list-item"><div class="li-main">' +
        '<div class="li-name">' + esc(n) + '</div>' +
        '<div class="li-meta">' + esc(r.type === 'emom' ? 'EMOM' : 'AMRAP') +
          (r.lastDateISO ? ' · letzte Einheit ' + esc(fmtDateDE(r.lastDateISO)) : '') +
          ' · ' + (r.attempts || 0) + '× gemacht</div>' +
      '</div><div class="li-right">' + (r.bestRounds || 0) + ' Runden' +
        (r.bestPartial ? '<br><span class="tiny">+ ' + r.bestPartial + '</span>' : '') + '</div></div>';
    }).join('') + '</div>';
  }

  /* Verlauf: Sessions */
  html += kicker('Letzte Einheiten');
  html += sessionListHtml();

  html += '</div>';
  return html;
}

onAct('pr.filter', d => { ui.prFilter = d.cat; render(); });
onAct('pr.scope', d => { ui.prScope = d.s; render(); });
/* Reiner Anzeigefilter — store.gymId bleibt unverändert */
onAct('pr.gym', d => { ui.prGym = d.id; render(); });

const PR_TABS = [
  { id: 'all', label: 'Alle' },
  { id: 'gym', label: 'Gym' },
  { id: 'barbell', label: 'Hantel' },
  { id: 'bodyweight', label: 'Calisthenics' }
];
function prScope() {
  return PR_TABS.some(t => t.id === ui.prScope) ? ui.prScope : 'all';
}
function prGymId() {
  const gyms = allGyms();
  if (ui.prGym && gyms.some(g => g.id === ui.prGym)) return ui.prGym;
  return store.gymId;
}
/* Welcher PR-Topf wird gerade gezeigt? null = alle zusammengefasst */
function activePrScopeKey() {
  const t = prScope();
  if (t === 'all') return null;
  if (t === 'barbell') return SCOPE_BARBELL;
  if (t === 'bodyweight') return SCOPE_BODYWEIGHT;
  return prGymId();
}

/* ---------- PR-Liste (§16) ---------- */
function prListHtml() {
  const scopeKey = activePrScopeKey();
  let ids;
  if (scopeKey === null) {
    const seen = {};
    Object.keys(store.prs || {}).forEach(sc => {
      Object.keys(store.prs[sc] || {}).forEach(id => {
        if (prHasValue(store.prs[sc][id], id)) seen[id] = true;
      });
    });
    ids = Object.keys(seen);
  } else {
    const bucket = store.prs[scopeKey] || {};
    ids = Object.keys(bucket).filter(id => prHasValue(bucket[id], id));
  }

  if (ui.prFilter === 'arms') {
    ids = ids.filter(id => ARM_CATEGORIES.indexOf(((getExercise(id) || {}).category)) !== -1);
  } else if (ui.prFilter !== 'all') {
    ids = ids.filter(id => (getExercise(id) || {}).category === ui.prFilter);
  }

  const val = id => {
    const p = scopeKey === null ? aggregatedPr(id) : store.prs[scopeKey][id];
    if (!p) return 0;
    return p.best_1rm || p.best_weight || p.max_reps || p.longest_total || p.best_intensity || 0;
  };
  ids.sort((a, b) => val(b) - val(a));
  if (!ids.length) {
    return emptyBox(scopeKey === null
      ? 'Noch keine PRs in diesem Filter.'
      : 'Noch keine PRs in ' + scopeLabel(scopeKey) + ' in diesem Filter.');
  }

  return '<div class="stack" style="gap:10px">' + ids.map(id => {
    const agg = scopeKey === null;
    const p = agg ? aggregatedPr(id) : store.prs[scopeKey][id];
    const ex = getExercise(id);
    const perHand = isPerHand(id);
    const cardio = isCardioExercise(id);
    let vals = '';
    if (cardio) {
      if (p.longest_total !== null && p.longest_total !== undefined) {
        vals += '<span class="pr-val">Längste Dauer<b>' + esc(fmtSecs(p.longest_total)) + '</b></span>';
      }
      if (p.best_intensity !== null && p.best_intensity !== undefined) {
        vals += '<span class="pr-val">Höchste Intensität<b>' + esc(fmtNum(p.best_intensity)) + '</b></span>';
      }
      const dists = Object.keys(p.bestTimeByDistance || {}).sort((a, b) => parseFloat(a) - parseFloat(b));
      if (dists.length) {
        const d0 = dists[0];
        const t0 = agg ? p.bestTimeByDistance[d0].sec : p.bestTimeByDistance[d0];
        vals += '<span class="pr-val">Beste Zeit ' + esc(fmtMeters(parseFloat(d0))) + '<b>' + esc(fmtSecs(t0)) + '</b></span>';
      }
    } else {
      if (p.best_weight !== null && p.best_weight !== undefined) {
        vals += '<span class="pr-val">Bestgewicht<b>' + esc(fmtKg(p.best_weight)) + (perHand ? ' /H' : '') + '</b></span>';
      }
      if (p.max_reps !== null && p.max_reps !== undefined) {
        vals += '<span class="pr-val">Max. Wdh.<b>' + p.max_reps + '</b></span>';
      }
      if (p.best_1rm !== null && p.best_1rm !== undefined) {
        vals += '<span class="pr-val">Gesch. 1RM<b>' + esc(fmtKg(p.best_1rm)) + '</b></span>';
      }
    }
    const origin = agg ? prOriginLabel(p) : null;
    return '<button class="pr-card" data-act="pr.detail" data-id="' + esc(id) + '">' +
      '<span class="pr-trophy">🏆</span>' +
      '<span style="flex:1;min-width:0">' +
        '<span class="pr-name" style="display:block">' + esc(exerciseName(id)) + '</span>' +
        '<span class="pr-cat" style="display:block">' + esc(CATEGORIES[(ex || {}).category] || 'Unbekannt') +
          (origin ? ' · ' + esc(origin) : '') + '</span>' +
        '<span class="pr-vals">' + vals + '</span>' +
      '</span>' +
      '<span class="chev">›</span>' +
    '</button>';
  }).join('') + '</div>';
}

/* Herkunft des besten Werts im Reiter „Alle" */
function prOriginLabel(p) {
  const sc = p.best_weight_scope || p.best_1rm_scope || p.max_reps_scope
    || p.longest_total_scope || p.best_intensity_scope || null;
  if (!sc) return (p.scopes && p.scopes.length === 1) ? scopeLabel(p.scopes[0]) : null;
  return scopeLabel(sc) + (p.scopes && p.scopes.length > 1 ? ' + ' + (p.scopes.length - 1) + ' weitere' : '');
}

onAct('pr.detail', d => { ui.detailExercise = d.id; window.scrollTo(0, 0); render(); });
onAct('pr.back', () => { ui.detailExercise = null; render(); });

/* ---------- Powerlifting-Panel (§16, §23.5) ---------- */
function plPanelHtml(plIds) {
  const ids = plIds.slice(0, 3);
  let html = '';
  if (ids.length) {
    html += '<div class="tiles">' + ids.map(id =>
      '<div class="tile"><div class="tl-lb">' + esc(exerciseName(id)) + '</div>' +
      '<div class="tl-v">' + esc(fmtKg(store.powerlifting.tm[id])) + '</div>' +
      '<div class="tiny muted">5×5 @ ' + esc(fmtKg(round25(store.powerlifting.tm[id] * 0.8))) + '</div></div>'
    ).join('') + '</div>';
  } else {
    html += emptyBox('Noch kein Training-Max hinterlegt.');
  }
  /* TM-Verlauf aus den d6-Sessions */
  const plSessions = store.sessions.filter(s => s.dayId === 'd6').slice(-6).reverse();
  if (plSessions.length) {
    html += '<div class="list" style="margin-top:10px">' + plSessions.map(s =>
      '<div class="list-item"><div class="li-main">' +
        '<div class="li-name">' + esc(fmtDateDE(s.dateISO)) + '</div>' +
        '<div class="li-meta">' + esc(s.slots.filter(sl => sl.isPowerliftingMain).map(sl => exerciseName(sl.exerciseId)).join(' · ')) + '</div>' +
      '</div><div class="li-right">' + esc(fmtNum(sessionVolume(s))) + ' kg</div></div>'
    ).join('') + '</div>';
  }
  return html;
}

/* ---------- Volumen-Diagramm: Linie, kumuliert (§23.8) ---------- */
function volumeChartSvg(series) {
  const W = 320, H = 150, padL = 6, padR = 6, padT = 10, padB = 22;
  if (!series.length) {
    return '<div class="empty">Noch keine abgeschlossenen Sätze — der Volumen-Trend erscheint nach der ersten Einheit.</div>';
  }
  const pts = series.length === 1 ? [series[0], series[0]] : series;
  const maxV = Math.max.apply(null, pts.map(p => p.value)) || 1;
  const n = pts.length;
  const iw = W - padL - padR, ih = H - padT - padB;
  const x = i => padL + (n === 1 ? iw / 2 : (i * iw) / (n - 1));
  const y = v => padT + ih - (v / maxV) * ih;

  const line = pts.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.value).toFixed(1)).join(' ');
  const area = line + ' L ' + x(n - 1).toFixed(1) + ' ' + (padT + ih) + ' L ' + x(0).toFixed(1) + ' ' + (padT + ih) + ' Z';

  const grid = [0, 0.5, 1].map(f =>
    '<line x1="' + padL + '" y1="' + (padT + ih - f * ih).toFixed(1) + '" x2="' + (W - padR) +
    '" y2="' + (padT + ih - f * ih).toFixed(1) + '" stroke="#2A2A2C" stroke-width="1"/>').join('');

  const dots = pts.map((p, i) =>
    '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(p.value).toFixed(1) + '" r="' + (n > 30 ? 1.2 : 2.4) + '" fill="#D7FF3B"/>').join('');

  return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Kumuliertes Gesamtvolumen">' +
    grid +
    '<path d="' + area + '" fill="rgba(215,255,59,0.10)"/>' +
    '<path d="' + line + '" fill="none" stroke="#D7FF3B" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
    dots +
    '<text x="' + padL + '" y="' + (H - 6) + '" fill="#8A8A8E" font-size="9" font-family="ui-monospace,monospace">' +
      esc(fmtDateDE(series[0].dateISO)) + '</text>' +
    '<text x="' + (W - padR) + '" y="' + (H - 6) + '" fill="#8A8A8E" font-size="9" text-anchor="end" font-family="ui-monospace,monospace">' +
      esc(fmtDateDE(series[series.length - 1].dateISO)) + '</text>' +
    '<text x="' + (padL + 3) + '" y="' + (padT + 9) + '" fill="#8A8A8E" font-size="9" font-family="ui-monospace,monospace">' +
      esc(fmtNum(maxV)) + ' kg</text>' +
  '</svg>';
}

/* ---------- Session-Liste ---------- */
function sessionListHtml() {
  const list = store.sessions.slice(-12).reverse();
  if (!list.length) return emptyBox('Noch keine abgeschlossenen Einheiten.');
  return '<div class="list">' + list.map((s, idx) => {
    const day = getDay(s.dayId);
    const skipped = s.slots.filter(sl => sl.skipped).length;
    return '<button class="list-item" data-act="session.detail" data-i="' + (store.sessions.length - 1 - idx) + '">' +
      '<div class="li-main">' +
        '<div class="li-name">' + esc(day.name) + ' · ' + esc(fmtDateDE(s.dateISO)) + '</div>' +
        '<div class="li-meta">' + esc(gymLabel(s.gymId)) + ' · ' + s.slots.length + ' Übungen' +
          (skipped ? ' · ' + skipped + '× übersprungen' : '') +
          (s.mode ? ' · Modus ' + esc(s.mode) : '') + '</div>' +
      '</div>' +
      '<div class="li-right">' + esc(fmtNum(sessionVolume(s))) + ' kg</div>' +
      '<span class="chev">›</span>' +
    '</button>';
  }).join('') + '</div>';
}

onAct('session.detail', d => {
  const s = store.sessions[parseInt(d.i, 10)];
  if (!s) return;
  const day = getDay(s.dayId);
  openSheet({
    title: day.name + ' · ' + fmtDateDE(s.dateISO),
    sub: gymLabel(s.gymId) + ' · ' + (EQUIPMENT_MODES.find(m => m.id === s.equipment) || {}).label +
      (s.finishedEarly ? ' · vorzeitig beendet' : ''),
    body: '<div class="list">' + s.slots.map(sl => {
      if (sl.skipped) {
        /* §32.6 grau/deaktiviert, Label „übersprungen", ohne Werte */
        return '<div class="list-item is-skipped">' +
          '<div class="li-main"><div class="li-name">' + esc(exerciseName(sl.exerciseId)) + '</div>' +
          '<div class="li-meta">' + esc(CATEGORIES[sl.category] || sl.category) + '</div></div>' +
          '<div class="li-right"><span class="badge">übersprungen</span></div></div>';
      }
      const sets = sl.sets.filter(x => x.done);
      if (sl.isCardio) {
        const secs = sets.reduce((a, x) => a + (x.sec || 0), 0);
        return '<div class="list-item">' +
          '<div class="li-main"><div class="li-name">' + esc(exerciseName(sl.exerciseId)) + '</div>' +
          '<div class="li-meta">' + esc(sets.map(x =>
            (x.intensity !== null && x.intensity !== undefined ? 'Int. ' + fmtNum(x.intensity) + ' · ' : '') +
            fmtSecs(x.sec || 0) + (x.dist ? ' · ' + fmtMeters(x.dist) : '')).join('  |  ')) + '</div></div>' +
          '<div class="li-right">' + esc(fmtSecs(secs)) + '</div></div>';
      }
      return '<div class="list-item">' +
        '<div class="li-main"><div class="li-name">' + esc(exerciseName(sl.exerciseId)) + '</div>' +
        '<div class="li-meta">' + sets.map(x =>
          (x.w === null || x.w === undefined ? 'KG' : fmtNum(x.w)) + '×' + x.r).join('  ·  ') + '</div></div>' +
        '<div class="li-right">' + sets.length + ' von ' + Math.max(sl.targetSets || 0, sets.length) + ' Sätzen</div></div>';
    }).join('') + '</div>'
  });
});

/* ---------- Verlauf pro Übung (§16) ---------- */
function renderExerciseDetail(exId) {
  const scopeKey = activePrScopeKey();
  const cardio = isCardioExercise(exId);
  const p = (scopeKey === null ? aggregatedPr(exId) : (store.prs[scopeKey] || {})[exId]) || {};
  const hist = historyFor(exId);
  const perHand = isPerHand(exId);
  const scopes = prScopesForExercise(exId).filter(sc => prHasValue(store.prs[sc][exId], exId));

  if (cardio) return renderCardioDetail(exId, p, scopeKey, scopes, hist);

  let html = '<button class="btn sm ghost mb" data-act="pr.back">‹ Zurück</button>';
  html += kicker(CATEGORIES[(getExercise(exId) || {}).category] || 'Übung');
  html += '<h1 class="screen-title" style="font-size:26px;text-transform:none">' + esc(exerciseName(exId)) + '</h1>';
  html += '<div class="stack">';

  html += '<div class="tiles">' +
    '<div class="tile"><div class="tl-lb">Bestgewicht</div><div class="tl-v">' +
      esc(fmtKg(p.best_weight === undefined ? null : p.best_weight)) + '</div>' +
      (perHand ? '<div class="tiny muted">je Hantel</div>' : '') + '</div>' +
    '<div class="tile"><div class="tl-lb">Max. Wdh.</div><div class="tl-v">' +
      (p.max_reps === null || p.max_reps === undefined ? '—' : p.max_reps) + '</div></div>' +
    '<div class="tile"><div class="tl-lb">Gesch. 1RM</div><div class="tl-v">' +
      esc(fmtKg(p.best_1rm === undefined ? null : p.best_1rm)) + '</div></div>' +
  '</div>';

  /* Aufschlüsselung je Geltungsbereich (Gym, Hantel, Calisthenics) */
  if (scopes.length) {
    html += kicker(scopeKey === null ? 'Aufschlüsselung je Bereich' : 'Auch in anderen Bereichen');
    html += '<div class="list">' + scopes.map(sc => {
      const b = store.prs[sc][exId];
      return '<div class="list-item' + (sc === scopeKey ? ' is-active' : '') + '">' +
        '<div class="li-main"><div class="li-name">' + esc(scopeLabel(sc)) + '</div>' +
        '<div class="li-meta">' +
          (b.best_weight !== null ? 'Best ' + fmtKg(b.best_weight) : 'Best —') + ' · ' +
          (b.max_reps !== null ? b.max_reps + ' Wdh.' : '— Wdh.') + '</div></div>' +
        '<div class="li-right">' + esc(b.best_1rm !== null ? fmtKg(b.best_1rm) : '—') +
          '<br><span class="tiny">1RM</span></div></div>';
    }).join('') + '</div>';
  }

  /* rep_at_weight-Bestwerte */
  const byW = (scopeKey === null ? mergedPrByWeight(exId) : (p.prByWeight || {}));
  const wKeys = Object.keys(byW).sort((a, b) => parseFloat(b) - parseFloat(a));
  if (wKeys.length) {
    html += kicker('Beste Wiederholungen je Last');
    html += '<div class="list">' + wKeys.slice(0, 8).map(k =>
      '<div class="list-item"><div class="li-main"><div class="li-name">' + esc(fmtKg(parseFloat(k))) + '</div></div>' +
      '<div class="li-right">' + byW[k] + ' Wdh.</div></div>').join('') + '</div>';
  }

  html += kicker('Verlauf');
  if (!hist.length) {
    html += emptyBox('Noch keine Historie für diese Übung.');
  } else {
    html += '<div class="list">' + hist.slice(0, 25).map(h => {
      if (h.skipped) {
        /* §32.6 */
        return '<div class="list-item is-skipped">' +
          '<div class="li-main"><div class="li-name">' + esc(fmtDateDE(h.dateISO)) + '</div>' +
          '<div class="li-meta">' + esc(gymLabel(h.gymId)) + '</div></div>' +
          '<div class="li-right"><span class="badge">übersprungen</span></div></div>';
      }
      let vol = 0;
      h.sets.forEach(s => { vol += (s.w || 0) * (s.r || 0); });
      const isPr = h.sets.some(s => s.w !== null && s.w !== undefined && p.best_weight !== null && s.w >= p.best_weight);
      return '<div class="list-item">' +
        '<div class="li-main"><div class="li-name">' + esc(fmtDateDE(h.dateISO)) +
          (isPr ? ' <span class="badge on">PR</span>' : '') + '</div>' +
        '<div class="li-meta">' + h.sets.map(s =>
          (s.w === null || s.w === undefined ? 'KG' : fmtNum(s.w)) + '×' + s.r).join('  ·  ') +
          '</div></div>' +
        '<div class="li-right">' + esc(fmtNum(vol)) + ' kg<br><span class="tiny">' + esc(gymLabel(h.gymId)) + '</span></div></div>';
    }).join('') + '</div>';
  }

  html += '</div>';
  return html;
}

/* Beste Wiederholungen je Last über alle Bereiche zusammengefasst */
function mergedPrByWeight(exId) {
  const out = {};
  prScopesForExercise(exId).forEach(sc => {
    const byW = (store.prs[sc][exId] || {}).prByWeight || {};
    Object.keys(byW).forEach(k => {
      if (!out[k] || byW[k] > out[k]) out[k] = byW[k];
    });
  });
  return out;
}

/* Cardio-Detail: Bestzeiten je Standarddistanz, längste Dauer je Intensität */
function renderCardioDetail(exId, p, scopeKey, scopes, hist) {
  const agg = scopeKey === null;
  let html = '<button class="btn sm ghost mb" data-act="pr.back">‹ Zurück</button>';
  html += kicker('Cardio');
  html += '<h1 class="screen-title" style="font-size:26px;text-transform:none">' + esc(exerciseName(exId)) + '</h1>';
  html += '<div class="stack">';

  html += '<div class="tiles">' +
    '<div class="tile"><div class="tl-lb">Längste Dauer</div><div class="tl-v">' +
      esc(typeof p.longest_total === 'number' ? fmtSecs(p.longest_total) : '—') + '</div></div>' +
    '<div class="tile"><div class="tl-lb">Höchste Intensität</div><div class="tl-v">' +
      esc(typeof p.best_intensity === 'number' ? fmtNum(p.best_intensity) : '—') + '</div></div>' +
  '</div>';

  const dists = Object.keys(p.bestTimeByDistance || {}).sort((a, b) => parseFloat(a) - parseFloat(b));
  if (dists.length) {
    html += kicker('Bestzeiten je Standarddistanz');
    html += '<div class="list">' + dists.map(d => {
      const v = p.bestTimeByDistance[d];
      const sec = agg ? v.sec : v;
      return '<div class="list-item"><div class="li-main">' +
        '<div class="li-name">' + esc(fmtMeters(parseFloat(d))) + '</div>' +
        (agg && v.scope ? '<div class="li-meta">' + esc(scopeLabel(v.scope)) + '</div>' : '') +
        '</div><div class="li-right">' + esc(fmtSecs(sec)) + '</div></div>';
    }).join('') + '</div>';
  }

  /* Längste Dauer je Intensität — nur im gewählten Bereich eindeutig */
  const byInt = {};
  (agg ? scopes : [scopeKey]).forEach(sc => {
    const b = (store.prs[sc] || {})[exId] || {};
    Object.keys(b.longestByIntensity || {}).forEach(k => {
      if (!byInt[k] || b.longestByIntensity[k] > byInt[k]) byInt[k] = b.longestByIntensity[k];
    });
  });
  const intKeys = Object.keys(byInt).sort((a, b) => parseFloat(b) - parseFloat(a));
  if (intKeys.length) {
    html += kicker('Längste Dauer je Intensität');
    html += '<div class="list">' + intKeys.slice(0, 10).map(k =>
      '<div class="list-item"><div class="li-main"><div class="li-name">Intensität ' + esc(fmtNum(parseFloat(k))) + '</div></div>' +
      '<div class="li-right">' + esc(fmtSecs(byInt[k])) + '</div></div>').join('') + '</div>';
  }

  html += kicker('Verlauf');
  if (!hist.length) {
    html += emptyBox('Noch keine Historie für diese Übung.');
  } else {
    html += '<div class="list">' + hist.slice(0, 25).map(h => {
      if (h.skipped) {
        return '<div class="list-item is-skipped"><div class="li-main">' +
          '<div class="li-name">' + esc(fmtDateDE(h.dateISO)) + '</div></div>' +
          '<div class="li-right"><span class="badge">übersprungen</span></div></div>';
      }
      const secs = h.sets.reduce((a, s) => a + (s.sec || 0), 0);
      return '<div class="list-item"><div class="li-main">' +
        '<div class="li-name">' + esc(fmtDateDE(h.dateISO)) + '</div>' +
        '<div class="li-meta">' + esc(h.sets.map(s =>
          (s.intensity !== null && s.intensity !== undefined ? 'Int. ' + fmtNum(s.intensity) + ' · ' : '') +
          fmtSecs(s.sec || 0) + (s.dist ? ' · ' + fmtMeters(s.dist) : '')).join('  |  ')) + '</div></div>' +
        '<div class="li-right">' + esc(fmtSecs(secs)) + '</div></div>';
    }).join('') + '</div>';
  }

  html += '</div>';
  return html;
}

function afterRenderProgress() { /* keine nachgelagerte Bindung nötig */ }
