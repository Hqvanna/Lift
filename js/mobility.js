/* Lift — Mobility-Screen (§2, §22, §23.4, §23.7, §32.7, §32.8) */
'use strict';

function sectionTotalSec(list) {
  return list.reduce((a, p) => a + p.durationSec * (p.side ? 2 : 1), 0);
}
function currentRoutine() {
  return store.mobilityRoutine[ui.mobilitySection] || [];
}

function renderMobility() {
  if (ui.runner) return renderRunner();

  const list = currentRoutine();
  let html = kicker('Mobility') + screenTitle('Mobility');
  html += '<p class="small muted mb">Kurze Mobility-Routine für Warm-up, Cool-down und den Alltag. ' +
    'Dauer und Reihenfolge sind frei anpassbar.</p>';

  html += '<div class="segmented mb">' + MOBILITY_SECTIONS.map(s =>
    '<button class="' + (ui.mobilitySection === s.id ? 'on' : '') + '" data-act="mob.section" data-id="' + s.id + '">' +
    esc(s.label) + '</button>').join('') + '</div>';

  html += '<div class="stack">';

  /* §23.4 Übersichtskarte */
  html += '<div class="card">' +
    '<div class="row-between">' +
      '<div><div class="kicker">Gesamtdauer</div>' +
      '<div class="card-title">' + esc(fmtDurationLong(sectionTotalSec(list))) + '</div>' +
      '<div class="card-sub">' + list.length + ' Position' + (list.length === 1 ? '' : 'en') + '</div></div>' +
    '</div>' +
    '<div class="row mt">' +
      '<button class="btn primary big" style="flex:1" data-act="mob.start" ' + (list.length ? '' : 'disabled') + '>Starten</button>' +
      '<button class="icon-btn" data-act="mob.toggleEdit" aria-label="Routine bearbeiten">' + (ui.mobilityEdit ? '✓' : '✎') + '</button>' +
    '</div>' +
  '</div>';

  if (!list.length) {
    /* §32.8 */
    html += emptyBox('Keine Positionen — Übungen hinzufügen');
  } else {
    html += '<div class="list">' + list.map((p, i) => {
      if (!ui.mobilityEdit) {
        return '<div class="list-item">' +
          '<span class="set-no mono" style="width:20px;color:var(--text-secondary)">' + (i + 1) + '</span>' +
          '<div class="li-main"><div class="li-name">' + esc(p.name) + '</div>' +
          (p.side ? '<div class="li-meta">je Seite</div>' : '') + '</div>' +
          '<div class="li-right mono">' + esc(fmtDurationLong(p.durationSec)) + '</div></div>';
      }
      /* §23.7 Bearbeitungsmodus */
      return '<div class="list-item">' +
        '<div class="li-main">' +
          '<input class="input" style="min-height:40px;font-size:14px" value="' + esc(p.name) + '" ' +
            'data-change="mob.rename" data-i="' + i + '">' +
          '<div class="row" style="margin-top:6px;gap:8px">' +
            '<input class="input" style="min-height:38px;width:82px;text-align:center" type="number" inputmode="numeric" min="5" ' +
              'value="' + p.durationSec + '" data-change="mob.duration" data-i="' + i + '">' +
            '<span class="tiny muted">Sek</span>' +
            '<button class="badge ' + (p.side ? 'on' : '') + '" data-act="mob.toggleSide" data-i="' + i + '">je Seite</button>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:6px">' +
          '<button class="icon-btn sm" data-act="mob.up" data-i="' + i + '" aria-label="Nach oben"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
          '<button class="icon-btn sm" data-act="mob.down" data-i="' + i + '" aria-label="Nach unten"' + (i === list.length - 1 ? ' disabled' : '') + '>↓</button>' +
          '<button class="icon-btn sm" data-act="mob.remove" data-i="' + i + '" aria-label="Entfernen">✕</button>' +
        '</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  if (ui.mobilityEdit) {
    html += '<button class="btn ghost block" data-act="mob.add">+ Position hinzufügen</button>';
    html += '<p class="tiny muted center">Mindestdauer 5 Sekunden pro Position.</p>';
    html += '<button class="btn danger block" data-act="mob.reset">Zurücksetzen auf Standard</button>';
  } else {
    html += '<button class="btn ghost block" data-act="mob.toggleEdit">Routine bearbeiten</button>';
  }

  html += '</div>';
  return html;
}

onAct('mob.section', d => { ui.mobilitySection = d.id; render(); });
onAct('mob.toggleEdit', () => { ui.mobilityEdit = !ui.mobilityEdit; render(); });

onAct('mob.rename', (d, el) => {
  const list = currentRoutine();
  const p = list[parseInt(d.i, 10)]; if (!p) return;
  const v = String(el.value).trim();
  p.name = v || 'Position';
  saveStore();
});
onAct('mob.duration', (d, el) => {
  const list = currentRoutine();
  const p = list[parseInt(d.i, 10)]; if (!p) return;
  let v = parseInt(String(el.value).trim(), 10);
  if (!isFinite(v) || v < 5) {
    /* §32.7 automatische Anhebung mit Hinweistext */
    v = 5;
    toast('Mindestdauer 5 Sekunden — Wert angehoben', { level: 0 });
  }
  p.durationSec = v;
  saveStore();
  render();
});
onAct('mob.toggleSide', d => {
  const list = currentRoutine();
  const p = list[parseInt(d.i, 10)]; if (!p) return;
  p.side = !p.side;
  saveStore();
  render();
});
onAct('mob.up', d => {
  const list = currentRoutine();
  const i = parseInt(d.i, 10);
  if (i <= 0) return;
  list.splice(i - 1, 0, list.splice(i, 1)[0]);
  list.forEach((p, k) => { p.order = k; });
  saveStore();
  render();
});
onAct('mob.down', d => {
  const list = currentRoutine();
  const i = parseInt(d.i, 10);
  if (i >= list.length - 1) return;
  list.splice(i + 1, 0, list.splice(i, 1)[0]);
  list.forEach((p, k) => { p.order = k; });
  saveStore();
  render();
});
onAct('mob.remove', d => {
  const list = currentRoutine();
  list.splice(parseInt(d.i, 10), 1);
  list.forEach((p, k) => { p.order = k; });
  saveStore();
  render();
});
onAct('mob.add', () => {
  openSheet({
    title: 'Position hinzufügen',
    sub: MOBILITY_SECTIONS.find(s => s.id === ui.mobilitySection).label,
    body:
      '<div class="stack">' +
        '<div class="field-block"><label>Name</label>' +
          '<input class="input" id="mob-new-name" placeholder="z. B. Couch Stretch"></div>' +
        '<div class="field-block"><label>Dauer in Sekunden (min. 5)</label>' +
          '<input class="input" id="mob-new-dur" type="number" inputmode="numeric" min="5" value="45"></div>' +
        '<label class="row small"><input type="checkbox" id="mob-new-side" style="width:20px;height:20px"> je Seite</label>' +
        '<button class="btn primary block big" data-act="mob.addSave">Hinzufügen</button>' +
      '</div>'
  });
});
onAct('mob.addSave', () => {
  const name = String((q('#mob-new-name') || {}).value || '').trim();
  let dur = parseInt(String((q('#mob-new-dur') || {}).value || '').trim(), 10);
  const side = !!(q('#mob-new-side') || {}).checked;
  if (!name) { toast('Bitte einen Namen eingeben', { level: 0 }); return; }
  if (!isFinite(dur) || dur < 5) { dur = 5; toast('Mindestdauer 5 Sekunden — Wert angehoben', { level: 0 }); }
  const list = currentRoutine();
  list.push({ id: uid('m'), name: name, durationSec: dur, side: side, order: list.length });
  saveStore();
  closeSheet();
  render();
});
onAct('mob.reset', () => {
  const secLabel = MOBILITY_SECTIONS.find(s => s.id === ui.mobilitySection).label;
  confirmSheet({
    title: 'Zurücksetzen auf Standard',
    text: 'Abschnitt „' + secLabel + '" wird auf die Standard-Routine aus Anhang B zurückgesetzt.',
    okLabel: 'Zurücksetzen'
  }, () => {
    store.mobilityRoutine[ui.mobilitySection] = clone(MOBILITY_DEFAULT[ui.mobilitySection]);
    saveStore();
    render();
    toast('Standard-Routine wiederhergestellt', { level: 2 });
  });
});

/* ---------- Runner ---------- */
let runnerHandle = null;

onAct('mob.start', () => {
  const list = currentRoutine();
  if (!list.length) return;
  /* Positionen „je Seite" ergeben zwei Schritte */
  const steps = [];
  list.forEach(p => {
    if (p.side) {
      steps.push({ name: p.name, durationSec: p.durationSec, sideLabel: 'linke Seite' });
      steps.push({ name: p.name, durationSec: p.durationSec, sideLabel: 'rechte Seite' });
    } else {
      steps.push({ name: p.name, durationSec: p.durationSec, sideLabel: null });
    }
  });
  ui.runner = { steps: steps, i: 0, left: steps[0].durationSec, paused: false };
  render();
  tickRunner();
});

function tickRunner() {
  if (runnerHandle) clearInterval(runnerHandle);
  runnerHandle = setInterval(() => {
    const r = ui.runner;
    if (!r) { clearInterval(runnerHandle); runnerHandle = null; return; }
    if (r.paused) return;
    r.left--;
    if (r.left <= 0) {
      if (r.i >= r.steps.length - 1) {
        stopRunner();
        render();
        toast('Routine abgeschlossen', { level: 2 });
        return;
      }
      r.i++;
      r.left = r.steps[r.i].durationSec;
      render();
      return;
    }
    const t = q('#runner-time');
    if (t) t.textContent = fmtDuration(r.left);
    const bar = q('#runner-bar');
    if (bar) bar.style.width = (100 * (1 - r.left / r.steps[r.i].durationSec)).toFixed(1) + '%';
  }, 1000);
}
function stopRunner() {
  if (runnerHandle) clearInterval(runnerHandle);
  runnerHandle = null;
  ui.runner = null;
}

function renderRunner() {
  const r = ui.runner;
  const step = r.steps[r.i];
  const pct = 100 * (1 - r.left / step.durationSec);
  return '<div class="runner">' +
    '<div class="r-step">Schritt ' + (r.i + 1) + ' von ' + r.steps.length + '</div>' +
    '<div class="r-name">' + esc(step.name) + '</div>' +
    (step.sideLabel ? '<div class="r-side">' + esc(step.sideLabel) + '</div>' : '') +
    '<div class="r-time" id="runner-time">' + esc(fmtDuration(r.left)) + '</div>' +
    '<div class="progressbar"><i id="runner-bar" style="width:' + pct.toFixed(1) + '%"></i></div>' +
    '<div class="stack">' +
      '<button class="btn primary block big" data-act="mob.pause">' + (r.paused ? 'Fortsetzen' : 'Pause') + '</button>' +
      '<button class="btn ghost block" data-act="mob.next">Nächste Position</button>' +
      '<button class="btn danger block" data-act="mob.stop">Beenden</button>' +
    '</div>' +
  '</div>';
}
onAct('mob.pause', () => { ui.runner.paused = !ui.runner.paused; render(); });
onAct('mob.next', () => {
  const r = ui.runner;
  if (r.i >= r.steps.length - 1) { stopRunner(); render(); return; }
  r.i++;
  r.left = r.steps[r.i].durationSec;
  render();
});
onAct('mob.stop', () => { stopRunner(); render(); });
