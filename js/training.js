/* Lift — Training-Screen (§3, §4, §5, §7, §8, §11, §12, §23.3, §25, §26, §27, §29, §32.3/.5/.6) */
'use strict';

/* ---------- Tages-/Slot-Zugriff ---------- */
function exerciseRepTarget(exerciseId) {
  const saved = store.exerciseRepTargets[exerciseId];
  if (saved && typeof saved.min === 'number' && typeof saved.max === 'number') return saved;
  return null;
}
function setExerciseRepTarget(exerciseId, min, max) {
  if (!isFinite(min) || !isFinite(max) || min < 1 || max < min) return false;
  store.exerciseRepTargets[exerciseId] = { min: Math.round(min), max: Math.round(max) };
  return true;
}
function lastExerciseVariantId(exerciseId, gymId) {
  const key = (gymId || store.gymId) + ':' + exerciseId;
  const id = store.activeExerciseVariants[key];
  return (store.exerciseVariants || []).some(v => v.id === id && v.exerciseId === exerciseId && v.gymId === (gymId || store.gymId)) ? id : null;
}
function rememberExerciseVariant(exerciseId, gymId, variantId) {
  const key = (gymId || store.gymId) + ':' + exerciseId;
  if (variantId) store.activeExerciseVariants[key] = variantId;
  else delete store.activeExerciseVariants[key];
}
function getDay(dayId) {
  if (typeof dayId === 'string' && dayId.indexOf('plan_') === 0) {
    const planId = dayId.slice(5);
    const plan = (store && store.namedTrainingPlans || []).find(p => p.id === planId);
    if (plan) return { id: dayId, name: plan.name, short: 'Plan', type: 'named', slots: [] };
  }
  const base = DAYS.find(d => d.id === dayId) || DAYS[0];
  const custom = store && store.customFixedPlans ? store.customFixedPlans[dayId] : null;
  if (!isObj(custom) || !Array.isArray(custom.slots)) return base;
  return {
    id: base.id,
    name: typeof custom.name === 'string' && custom.name.trim() ? custom.name.trim() : base.name,
    short: base.short,
    type: base.type,
    optional: base.optional,
    slots: custom.slots.filter(isObj).map((slot, i) => ({
      slotKey: typeof slot.slotKey === 'string' ? slot.slotKey : dayId + 's' + (i + 1),
      name: typeof slot.name === 'string' ? slot.name : 'Übung ' + (i + 1),
      category: CATEGORIES[slot.category] ? slot.category : 'abs',
      sets: Math.min(12, Math.max(1, typeof slot.sets === 'number' ? parseInt(slot.sets, 10) : 3)),
      reps: typeof slot.reps === 'string' ? slot.reps : '8–12',
      rest: Math.min(600, Math.max(0, typeof slot.rest === 'number' ? parseInt(slot.rest, 10) : 90)),
      def: isObj(slot.def) ? slot.def : { studio: slot.exerciseId, barbell: slot.exerciseId, bodyweight: slot.exerciseId },
      exerciseId: typeof slot.exerciseId === 'string' ? slot.exerciseId : null
    }))
  };
}
function getDaySlotDef(dayId, slotKey) {
  const d = getDay(dayId);
  return d.slots.find(s => s.slotKey === slotKey) || null;
}

/* §5 Default-Übung eines Slots: Override → Equipment-Default, Pain-Flags respektieren (§14) */
function resolveSlotExercise(dayId, slotDef, mode) {
  if (slotDef.exerciseId && getExercise(slotDef.exerciseId) && !isPainFlagged(slotDef.exerciseId)) return slotDef.exerciseId;
  const ov = store.slotOverrides[dayId] && store.slotOverrides[dayId][slotDef.slotKey];
  if (ov && getExercise(ov) && !isPainFlagged(ov)) {
    const ex = getExercise(ov);
    /* §4: Overrides werden respektiert, solange sie zur Kategorie des Slots passen */
    if (ex.category === slotDef.category) return ov;
  }
  const def = slotDef.def[mode];
  if (def && !isPainFlagged(def)) return def;
  /* §15.2 / §26 Auto-Ersatz: erste verfügbare Übung derselben Kategorie */
  const alt = exercisesFor(slotDef.category, mode)[0] || exercisesFor(slotDef.category, mode, { ignoreEquipment: true })[0];
  return alt ? alt.id : (def || '');
}

/* ---------- Session-Aufbau ---------- */
function buildSlotFromDef(dayId, slotDef, mode) {
  const exId = resolveSlotExercise(dayId, slotDef, mode);
  const repTarget = exerciseRepTarget(exId);
  const targetReps = repTarget ? repTarget.min + '–' + repTarget.max : slotDef.reps;
  const last = lastWeightFor(exId, currentExerciseScope(exId));
  const sets = [];
  for (let i = 0; i < slotDef.sets; i++) {
    sets.push({ w: (isBodyweightExercise(exId) && last === null) ? null : last, r: 0, done: false });
  }
  return {
    slotKey: slotDef.slotKey,
    exerciseId: exId,
    variantId: lastExerciseVariantId(exId, store.gymId),
    originalExerciseId: exId,
    category: slotDef.category,
    sets: sets,
    targetSets: slotDef.sets,
    targetReps: targetReps,
    targetWeight: last,
    restSec: slotDef.rest,
    slotName: slotDef.name,
    isPowerliftingMain: false,
    skipped: false
  };
}

function startFixedSession(dayId) {
  const day = getDay(dayId);
  const mode = store.equipmentMode;
  const sess = {
    id: uid('s'),
    dayId: dayId,
    dateISO: todayISO(),
    gymId: store.gymId,
    equipment: mode,
    mode: null,
    slots: day.slots.map(sd => buildSlotFromDef(dayId, sd, mode)),
    finished: false,
    finishedEarly: false
  };
  store.activeSession = sess;
  saveStore();
  render();
}

/* §7 Powerlifting-Session */
function startPowerliftingSession(mainIds, assistIds) {
  const mode = store.equipmentMode;
  const slots = [];
  mainIds.forEach((exId, i) => {
    const tm = store.powerlifting.tm[exId];
    const work = (typeof tm === 'number' && isFinite(tm)) ? round25(tm * 0.8) : null; /* §7.3 / §32.4 */
    const sets = [];
    for (let k = 0; k < 5; k++) sets.push({ w: work, r: 0, done: false });
    const ex = getExercise(exId);
    slots.push({
      slotKey: 'd6m' + (i + 1),
      exerciseId: exId,
      originalExerciseId: exId,
      category: ex ? ex.category : 'knee',
      sets: sets,
      targetSets: 5,
      targetReps: '5',
      targetWeight: work,
      restSec: 180,
      slotName: 'Hauptübung ' + (i + 1) + ' — 5×5 @ 80 % TM',
      isPowerliftingMain: true,
      skipped: false
    });
  });
  assistIds.forEach((exId, i) => {
    const ex = getExercise(exId);
    const last = lastWeightFor(exId, currentExerciseScope(exId));
    const sets = [];
    for (let k = 0; k < 3; k++) sets.push({ w: last, r: 0, done: false });
    slots.push({
      slotKey: 'd6a' + (i + 1),
      exerciseId: exId,
      originalExerciseId: exId,
      category: ex ? ex.category : 'abs',
      sets: sets,
      targetSets: 3,
      targetReps: '8–12',
      targetWeight: last,
      restSec: 90,
      slotName: 'Assistance ' + (i + 1),
      isPowerliftingMain: false,
      skipped: false
    });
  });
  store.activeSession = {
    id: uid('s'), dayId: 'd6', dateISO: todayISO(), gymId: store.gymId,
    equipment: mode, mode: null, slots: slots, finished: false, finishedEarly: false
  };
  saveStore();
  closeSheet();
  render();
}

/* Cardio-Slot (optionaler Zusatz am Ende einer Einheit) */
function buildCardioSlot(exId, index, optional) {
  const ex = getExercise(exId);
  return {
    slotKey: 'cardio' + (index + 1),
    exerciseId: exId,
    originalExerciseId: exId,
    category: 'cardio',
    sets: [{ intensity: null, sec: 0, dist: null, done: false }],
    targetSets: 1,
    targetReps: '—',
    targetWeight: null,
    restSec: 0,
    slotName: (optional ? 'Cardio (optional)' : 'Cardio') + (ex && ex.hasDistance ? ' · Distanz möglich' : ''),
    isPowerliftingMain: false,
    isCardio: true,
    optional: optional !== false,
    skipped: false
  };
}

/* §8 Wildcard-Session — Modus A (frei), B (PR-Versuch), C (zeitbasiert) */
function startWildcardSession(mode, exIds, cfg) {
  let slots;
  if (mode === 'B') slots = buildModeBSlots(exIds, cfg || {});
  else if (mode === 'C') slots = buildModeCSlots(exIds, cfg || {});
  else slots = exIds.map((exId, i) => {
    const ex = getExercise(exId);
    if (isCardioExercise(exId)) return buildCardioSlot(exId, i, false);
    const last = lastWeightFor(exId, currentExerciseScope(exId));
    const preset = cfg && cfg.perEx && cfg.perEx[exId] ? cfg.perEx[exId] : null;
    const w = (preset && typeof preset.w === 'number') ? preset.w : last;
    const sets = [];
    for (let k = 0; k < 3; k++) sets.push({ w: w, r: 0, done: false });
    const variantId = cfg && cfg.variantIds ? cfg.variantIds[exId] : null;
    return {
      variantId: variantId || null,
      slotKey: 'dWs' + (i + 1),
      exerciseId: exId,
      originalExerciseId: exId,
      category: ex ? ex.category : 'abs',
      sets: sets,
      targetSets: 3,
      targetReps: (preset && preset.reps) ? String(preset.reps) : '8–12',
      targetWeight: w,
      restSec: 90,
      slotName: 'Freie Übung ' + (i + 1),
      isPowerliftingMain: false,
      skipped: false
    };
  });

  store.wildcard.currentMode = mode;
  store.wildcard.modeC = mode === 'C' ? clone(cfg) : null;
  const sess = {
    id: uid('s'), dayId: 'dW', dateISO: todayISO(), gymId: store.gymId,
    equipment: store.equipmentMode, mode: mode, slots: slots,
    finished: false, finishedEarly: false
  };
  if (mode === 'C') {
    sess.modeC = {
      type: cfg.type, name: cfg.name || defaultConditioningName(cfg, exIds),
      durationSec: cfg.durationSec, intervalSec: cfg.intervalSec,
      rounds: cfg.rounds, order: cfg.order,
      perEx: clone(cfg.perEx || {}),
      exIds: exIds.slice(),
      startedAt: null, elapsed: 0, running: false,
      curIdx: 0, curRound: 1, doneIntervals: 0,
      completedRounds: 0, partialReps: 0, finishedRun: false
    };
  }
  if (mode === 'B') {
    sess.modeB = { prKind: cfg.prKind || 'weight', ref: cfg.ref || null, mainId: exIds[0] || null, fallbackAdded: false };
  }
  store.activeSession = sess;
  saveStore();
  closeSheet();
  render();
}

/* Modus B: eine Hauptübung + optionaler Nebenlift.
   Abweichung von §25 auf Anweisung des Auftraggebers: die Aufwärmsätze
   werden aus dem Bestwert berechnet (50 % × 5, 70 % × 3, 85 % × 1,
   gerundet auf 2,5 kg) und sind als Aufwärmen markiert — ohne PR-Wertung. */
function buildModeBSlots(exIds, cfg) {
  const mainId = exIds[0];
  const slots = [];
  const scope = currentExerciseScope(mainId);
  const pr = getPr(scope, mainId);
  const ref = (cfg.ref !== null && cfg.ref !== undefined && isFinite(cfg.ref) && cfg.ref > 0)
    ? cfg.ref
    : (pr && typeof pr.best_weight === 'number' ? pr.best_weight : null);
  const prKind = cfg.prKind === 'reps' ? 'reps' : 'weight';
  const attempts = Math.min(3, Math.max(1, parseInt(cfg.attempts, 10) || 3));
  const sets = [];
  [[50, 5], [70, 3], [85, 1]].forEach(pair => {
    sets.push({
      w: ref !== null ? round25(ref * pair[0] / 100) : null,
      r: 0, done: false, warmup: true, pct: pair[0], tr: pair[1], restSec: 240
    });
  });
  const attemptW = ref !== null ? (prKind === 'weight' ? round25(ref + 2.5) : ref) : null;
  for (let i = 0; i < attempts; i++) {
    sets.push({ w: attemptW, r: 0, done: false, attempt: true, restSec: 240 });
  }
  const ex = getExercise(mainId);
  slots.push({
    slotKey: 'dWb1',
    exerciseId: mainId,
    originalExerciseId: mainId,
    category: ex ? ex.category : 'hpush',
    sets: sets,
    targetSets: sets.length,
    targetReps: prKind === 'weight' ? '1' : 'max',
    targetWeight: attemptW,
    restSec: 240,
    slotName: 'Hauptübung — PR-Versuch (' + (prKind === 'weight' ? 'Gewicht' : 'Wiederholungen') + ')',
    prRef: ref,
    prKind: prKind,
    isPowerliftingMain: false,
    skipped: false
  });
  if (exIds[1]) {
    const sec = getExercise(exIds[1]);
    const last = lastWeightFor(exIds[1], currentExerciseScope(exIds[1]));
    const s2 = [];
    for (let k = 0; k < 3; k++) s2.push({ w: last, r: 0, done: false });
    slots.push({
      slotKey: 'dWb2',
      exerciseId: exIds[1],
      originalExerciseId: exIds[1],
      category: sec ? sec.category : 'abs',
      sets: s2,
      targetSets: 3,
      targetReps: '6–10',
      targetWeight: last,
      restSec: 120,
      slotName: 'Nebenlift (optional)',
      optional: true,
      isPowerliftingMain: false,
      skipped: false
    });
  }
  return slots;
}

/* Modus C: je Übung ein Slot; die Sätze entstehen im Ablauf des Runners. */
function buildModeCSlots(exIds, cfg) {
  return exIds.map((exId, i) => {
    const ex = getExercise(exId);
    const p = (cfg.perEx && cfg.perEx[exId]) ? cfg.perEx[exId] : {};
    return {
      slotKey: 'dWc' + (i + 1),
      exerciseId: exId,
      originalExerciseId: exId,
      category: ex ? ex.category : 'abs',
      sets: [],
      targetSets: 0,
      targetReps: p.reps ? String(p.reps) : '—',
      targetWeight: (typeof p.w === 'number') ? p.w : null,
      restSec: 0,
      slotName: (cfg.type === 'emom' ? 'EMOM' : 'AMRAP') + ' · ' + (p.reps || '?') + ' Wdh.',
      isPowerliftingMain: false,
      skipped: false
    };
  });
}

function defaultConditioningName(cfg, exIds) {
  if (cfg.type === 'emom') {
    return 'EMOM ' + Math.round((cfg.intervalSec || 60)) + 's × ' + (cfg.rounds || 0) + ' · ' + exIds.length + ' Übungen';
  }
  return 'AMRAP ' + Math.round((cfg.durationSec || 0) / 60) + ' Min · ' + exIds.length + ' Übungen';
}

/* ---------- Aktiver Slot ---------- */
function setIsClosed(s) { return s.done === true || s.skip === true; }
function activeSlotIndex(sess) {
  for (let i = 0; i < sess.slots.length; i++) {
    const sl = sess.slots[i];
    if (sl.skipped) continue;
    if (sl.sets.some(s => !setIsClosed(s))) return i;
  }
  return -1;
}
function currentSetIndex(slot) {
  for (let i = 0; i < slot.sets.length; i++) if (!setIsClosed(slot.sets[i])) return i;
  return -1;
}

/* ---------- Pausentimer (§5, §27 lautlos) ---------- */
let restTimer = { slotKey: null, endsAt: 0, handle: null };

function timerEndHaptic() {
  try { if (navigator.vibrate) navigator.vibrate(180); } catch (e) { logError(e); }
}

function startRestTimer(slotKey, seconds) {
  clearRestTimer();
  restTimer.slotKey = slotKey;
  restTimer.endsAt = Date.now() + seconds * 1000;
  restTimer.handle = setInterval(() => {
    const el = q('#rest-timer');
    const left = Math.ceil((restTimer.endsAt - Date.now()) / 1000);
    if (left <= 0) {
      timerEndHaptic();
      clearRestTimer();
      if (el) el.textContent = '';
      return;
    }
    if (el) el.textContent = fmtDuration(left);
  }, 250);
}
function clearRestTimer() {
  if (restTimer.handle) clearInterval(restTimer.handle);
  restTimer = { slotKey: null, endsAt: 0, handle: null };
}
function restLeft() {
  if (!restTimer.slotKey) return 0;
  return Math.max(0, Math.ceil((restTimer.endsAt - Date.now()) / 1000));
}

function lastNoteForExercise(exerciseId, gymId) {
  for (let i = store.sessions.length - 1; i >= 0; i--) {
    const sess = store.sessions[i];
    if (!sess || sess.gymId !== gymId) continue;
    for (let j = (sess.slots || []).length - 1; j >= 0; j--) {
      const slot = sess.slots[j];
      if (!slot || slot.exerciseId !== exerciseId) continue;
      for (let k = (slot.sets || []).length - 1; k >= 0; k--) {
        const set = slot.sets[k];
        if (set && typeof set.note === 'string' && set.note.trim()) return set.note.trim();
      }
    }
  }
  return null;
}

/* ---------- Satz bestätigen ---------- */
onAct('set.confirm', () => {
  const sess = store.activeSession;
  if (!sess) return;
  const si = activeSlotIndex(sess);
  if (si < 0) return;
  const slot = sess.slots[si];
  const ki = currentSetIndex(slot);
  if (ki < 0) return;
  const set = slot.sets[ki];

  /* Cardio-Satz: Dauer oder Distanz genügt */
  if (slot.isCardio) {
    const hasSec = typeof set.sec === 'number' && set.sec > 0;
    const hasDist = typeof set.dist === 'number' && set.dist > 0;
    if (!hasSec && !hasDist) { skipCurrentSet(slot, set); return; }
    commitSet(sess, slot, set);
    return;
  }

  /* Auf Anweisung des Auftraggebers: leere Sätze werden übersprungen —
     nichts wird gespeichert, kein Pausentimer, keine PR-Prüfung. */
  const hasReps = typeof set.r === 'number' && set.r > 0;
  const hasWeight = typeof set.w === 'number' && isFinite(set.w) && set.w > 0;
  if (!hasReps && !hasWeight) { skipCurrentSet(slot, set); return; }
  if (!hasReps) { skipCurrentSet(slot, set); return; }

  /* Wdh. ohne Gewicht: bei Körpergewichtsübungen gültig, sonst kurze Rückfrage */
  if (!hasWeight && !isBodyweightExercise(slot.exerciseId)) {
    confirmSheet({
      title: 'Gewicht fehlt',
      text: 'Für diesen Satz ist kein Gewicht eingetragen. Trotzdem speichern?',
      okLabel: 'Trotzdem speichern'
    }, () => { commitSet(sess, slot, set); });
    return;
  }
  commitSet(sess, slot, set);
});

/* Leerer Satz: bleibt abgeschwächt als „nicht ausgeführt" stehen */
function skipCurrentSet(slot, set) {
  set.skip = true;
  set.done = false;
  clearRestTimer();
  saveStore();
  render();
}

function commitSet(sess, slot, set) {
  set.done = true;
  delete set.skip;
  store.counters.completedSets++;

  if (slot.isCardio) {
    const scope = sessionExerciseScope(sess, slot.exerciseId);
    const prs = evaluateCardioSetForPr(scope, slot.exerciseId, set.intensity, set.sec, set.dist);
    prs.forEach(p => toast(p.text, { level: p.level, sub: exerciseName(slot.exerciseId) }));
    stopCardioTimer();
    saveStore();
    render();
    return;
  }

  /* §12 PR-Prüfung mit eigener Celebration je PR-Art.
     Aufwärmsätze und zeitbasierte Einheiten sind ausgenommen. */
  if (set.warmup !== true && sess.mode !== 'C') {
    const scope = sessionExerciseScope(sess, slot.exerciseId);
    const prs = evaluateSetForPr(scope, slot.exerciseId, set.w, set.r);
    prs.forEach(p => toast(p.text, { level: p.level, sub: exerciseName(slot.exerciseId) }));
  }

  const wasLastSet = currentSetIndex(slot) < 0;

  /* §11 Doppelprogression + Plateau-Erkennung nach Abschluss der Übung */
  if (wasLastSet && !slot.isPowerliftingMain && sess.mode !== 'B' && sess.mode !== 'C') evaluateProgression(slot);
  if (wasLastSet && sess.mode === 'B' && slot.prKind) offerRepFallback(sess, slot);

  saveStore();

  /* §5 Pausentimer nach jedem Satz außer nach dem letzten Satz einer Übung */
  if (!wasLastSet) startRestTimer(slot.slotKey, set.restSec || slot.restSec || 90);
  else clearRestTimer();

  render();
}

/* Modus B: nach erfolglosem Gewichtsversuch Wiederholungs-PR anbieten */
function offerRepFallback(sess, slot) {
  if (!sess.modeB || sess.modeB.fallbackAdded) return;
  if (slot.prKind !== 'weight') return;
  const ref = slot.prRef;
  if (ref === null || ref === undefined) return;
  const attempts = slot.sets.filter(s => s.attempt && (s.done || s.skip === true));
  if (!attempts.length) return;
  const success = attempts.some(s => s.done && typeof s.w === 'number' && s.w > ref && s.r >= 1);
  if (success) return;
  toast('Versuch nicht geschafft', {
    level: 1, sticky: true,
    sub: 'Wiederholungs-PR beim letzten Gewicht versuchen? (' + fmtKg(ref) + ')',
    actionLabel: 'Satz anhängen',
    action: 'wc.repFallback'
  });
}
onAct('wc.repFallback', () => {
  const sess = store.activeSession; if (!sess || !sess.modeB) return;
  const slot = sess.slots.find(s => s.slotKey === 'dWb1'); if (!slot) return;
  slot.sets.push({ w: slot.prRef, r: 0, done: false, attempt: true, restSec: 240 });
  slot.targetSets = slot.sets.length;
  sess.modeB.fallbackAdded = true;
  saveStore();
  render();
});

onAct('set.reset', () => {
  const sess = store.activeSession;
  if (!sess) return;
  const si = activeSlotIndex(sess);
  const slot = si >= 0 ? sess.slots[si] : sess.slots[sess.slots.length - 1];
  if (!slot) return;
  /* Letzten bestätigten oder übersprungenen Satz zurücksetzen */
  for (let i = slot.sets.length - 1; i >= 0; i--) {
    const s = slot.sets[i];
    if (s.done) {
      s.done = false;
      if (store.counters.completedSets > 0) store.counters.completedSets--;
      break;
    }
    if (s.skip === true) { delete s.skip; break; }
  }
  clearRestTimer();
  saveStore();
  render();
});

/* §11: Verlaufvergleich bei gleichem Gewicht, über die letzten fünf relevanten Sessions.
   Drei aufeinanderfolgende Session-Durchschnitte ohne Verbesserung lösen das Plateau aus. */
function sessionAverageRepsAtWeight(exerciseId, weight) {
  const sessionAverages = [];
  const relevant = store.sessions.slice().reverse().slice(0, 5);
  relevant.forEach(sess => {
    const reps = [];
    (sess.slots || []).forEach(slot => {
      if (slot.exerciseId !== exerciseId || slot.skipped) return;
      (slot.sets || []).filter(set =>
        set.done && set.skip !== true && typeof set.r === 'number' && set.r > 0 &&
        typeof set.w === 'number' && set.w === weight
      ).forEach(set => reps.push(set.r));
    });
    if (reps.length) sessionAverages.push(reps.reduce((sum, rep) => sum + rep, 0) / reps.length);
  });
  if (sessionAverages.length < 3) return null;
  return {
    average: sessionAverages.reduce((sum, value) => sum + value, 0) / sessionAverages.length,
    count: sessionAverages.length
  };
}

function evaluateProgression(slot) {
  const done = slot.sets.filter(s => s.done);
  if (!done.length) return;
  const exId = slot.exerciseId;
  const targetCount = typeof slot.targetSets === 'number' ? slot.targetSets : slot.sets.length;
  const range = parseRepRange(slot.targetReps);

  const weights = {};
  done.filter(s => typeof s.w === 'number' && s.w > 0).forEach(s => { weights[String(s.w)] = s.w; });
  const compared = Object.keys(weights).map(k => {
    const weight = weights[k];
    const current = done.filter(s => s.w === weight && s.r > 0);
    if (!current.length) return null;
    const currentAverage = current.reduce((sum, s) => sum + s.r, 0) / current.length;
    const previousAverage = sessionAverageRepsAtWeight(exId, weight);
    return previousAverage === null ? null : { weight: weight, currentAverage: currentAverage, previousAverage: previousAverage.average, matchingSessions: previousAverage.count };
  }).filter(Boolean);

  if (!compared.length) {
    if (done.length >= targetCount && done.every(s => s.r >= range.max)) {
      store.plateauStreak[exId] = 0;
      slot._progressHint = 'up';
      toast('Gewicht erhöhen', { level: 1, sub: exerciseName(exId) + ' — alle Sätze im oberen Rep-Bereich' });
    }
    return;
  }

  const noImprovement = compared.every(c => c.currentAverage <= c.previousAverage);
  if (noImprovement) {
    store.plateauStreak[exId] = (store.plateauStreak[exId] || 0) + 1;
    if (store.plateauStreak[exId] >= 3 && store.plateauMode[exId] !== 'dismissed') {
      store.plateauMode[exId] = 'watch';
      const details = compared.map(c => fmtKg(c.weight) + ': jetzt ' + fmtNum(c.currentAverage) + ' / ' + c.matchingSessions + ' Sessions vorher Ø ' + fmtNum(c.previousAverage) + ' Wdh.').join(' · ');
      toast('Plateau erkannt', { level: 1, sticky: true, sub: exerciseName(exId) + ' — ' + details });
    }
  } else {
    store.plateauStreak[exId] = 0;
  }

  if (done.length >= targetCount && done.every(s => s.r >= range.max)) {
    slot._progressHint = 'up';
  }
}

/* ---------- Eingaben (Autosave §1.9) ---------- */
onAct('set.w', (d, el) => {
  const sess = store.activeSession; if (!sess) return;
  const slot = sess.slots.find(s => s.slotKey === d.slot); if (!slot) return;
  const set = slot.sets[parseInt(d.i, 10)]; if (!set) return;
  const raw = String(el.value).replace(',', '.').trim();
  const v = parseFloat(raw);
  /* §10: leeres Feld bei Bodyweight = null, nicht 0 */
  set.w = (raw === '' || !isFinite(v)) ? null : v;
  saveStore();
});
onAct('set.r', (d, el) => {
  const sess = store.activeSession; if (!sess) return;
  const slot = sess.slots.find(s => s.slotKey === d.slot); if (!slot) return;
  const set = slot.sets[parseInt(d.i, 10)]; if (!set) return;
  const v = parseInt(String(el.value).trim(), 10);
  set.r = isFinite(v) && v > 0 ? v : 0;
  saveStore();
});
 onAct('set.variant', (d, el) => {
  const sess = store.activeSession; if (!sess) return;
  const slot = sess.slots.find(s => s.slotKey === d.slot); if (!slot) return;
  slot.variantId = String(el.value || '') || null;
  rememberExerciseVariant(slot.exerciseId, sess.gymId, slot.variantId);
  saveStore();
  render();
});
 onAct('slot.variantAdd', d => {
  const sess = store.activeSession; if (!sess) return;
  const slot = sess.slots.find(s => s.slotKey === d.slot); if (!slot) return;
  openSheet({
    title: 'Variante hinzufügen',
    sub: exerciseName(slot.exerciseId) + ' · ' + gymLabel(sess.gymId),
    body: '<div class="stack">' +
      '<div class="field-block"><label>Hersteller/Modell</label>' +
        '<input class="input" id="slot-variant-name" placeholder="z. B. Life Fitness"></div>' +
      '<button class="btn primary block" data-act="slot.variantSave" data-slot="' + esc(slot.slotKey) + '">Variante speichern</button>' +
    '</div>'
  });
});
 onAct('slot.variantSave', d => {
  const sess = store.activeSession; if (!sess) return;
  const slot = sess.slots.find(s => s.slotKey === d.slot); if (!slot) return;
  const name = String((q('#slot-variant-name') || {}).value || '').trim();
  if (!name) { toast('Bitte Hersteller oder Modell eingeben', { level: 0 }); return; }
  const variant = { id: uid('ev'), gymId: sess.gymId, exerciseId: slot.exerciseId, name: name };
  store.exerciseVariants.push(variant);
  slot.variantId = variant.id;
  rememberExerciseVariant(slot.exerciseId, sess.gymId, variant.id);
  saveStore();
  closeSheet();
  render();
  toast('Maschinenvariante gespeichert', { level: 2, sub: name });
});
/* ---------- Cardio-Eingaben ---------- */
function cardioSetOf(d) {
  const sess = store.activeSession; if (!sess) return null;
  const slot = sess.slots.find(s => s.slotKey === d.slot); if (!slot) return null;
  const set = slot.sets[parseInt(d.i, 10)]; if (!set) return null;
  return { sess: sess, slot: slot, set: set };
}
onAct('cardio.intensity', (d, el) => {
  const c = cardioSetOf(d); if (!c) return;
  const raw = String(el.value).replace(',', '.').trim();
  const v = parseFloat(raw);
  c.set.intensity = (raw === '' || !isFinite(v)) ? null : v;
  saveStore();
});
onAct('cardio.min', (d, el) => {
  const c = cardioSetOf(d); if (!c) return;
  const v = parseInt(String(el.value).trim(), 10);
  const mins = isFinite(v) && v > 0 ? v : 0;
  c.set.sec = mins * 60 + (c.set.sec % 60);
  saveStore();
});
onAct('cardio.sec', (d, el) => {
  const c = cardioSetOf(d); if (!c) return;
  const v = parseInt(String(el.value).trim(), 10);
  const secs = isFinite(v) && v > 0 ? Math.min(59, v) : 0;
  c.set.sec = Math.floor(c.set.sec / 60) * 60 + secs;
  saveStore();
});
onAct('cardio.dist', (d, el) => {
  const c = cardioSetOf(d); if (!c) return;
  const val = String(el.value);
  if (val === 'custom') { c.set._custom = true; c.set.dist = null; }
  else if (val === '') { c.set._custom = false; c.set.dist = null; }
  else { c.set._custom = false; c.set.dist = parseInt(val, 10); }
  saveStore();
  render();
});
onAct('cardio.distFree', (d, el) => {
  const c = cardioSetOf(d); if (!c) return;
  const v = parseInt(String(el.value).trim(), 10);
  c.set.dist = isFinite(v) && v > 0 ? v : null;
  c.set._freeDist = true;   /* freie Distanz — ohne PR-Wertung */
  saveStore();
});

/* Mitlaufende Dauer für Cardio */
let cardioTimer = { slotKey: null, i: -1, startedAt: 0, base: 0, handle: null };
function stopCardioTimer() {
  if (cardioTimer.handle) clearInterval(cardioTimer.handle);
  cardioTimer = { slotKey: null, i: -1, startedAt: 0, base: 0, handle: null };
}
onAct('cardio.timer', d => {
  const c = cardioSetOf(d); if (!c) return;
  const i = parseInt(d.i, 10);
  if (cardioTimer.handle && cardioTimer.slotKey === d.slot && cardioTimer.i === i) {
    /* Stoppen — gemessene Zeit übernehmen */
    c.set.sec = cardioTimer.base + Math.round((Date.now() - cardioTimer.startedAt) / 1000);
    stopCardioTimer();
    saveStore();
    render();
    return;
  }
  stopCardioTimer();
  cardioTimer.slotKey = d.slot;
  cardioTimer.i = i;
  cardioTimer.base = c.set.sec || 0;
  cardioTimer.startedAt = Date.now();
  cardioTimer.handle = setInterval(() => {
    const el = q('#cardio-timer');
    if (!el) return;
    const sec = cardioTimer.base + Math.round((Date.now() - cardioTimer.startedAt) / 1000);
    el.textContent = fmtSecs(sec);
  }, 500);
  render();
});

/* Optionaler Cardio-Slot am Ende der Einheit (nicht am Powerlifting-Tag) */
onAct('cardio.add', () => {
  const list = allExercises().filter(e => isCardioExercise(e.id) && !isPainFlagged(e.id));
  openSheet({
    title: 'Cardio hinzufügen',
    sub: 'Optional — zählt nicht in das kg-Volumen',
    body: exerciseListHtml(list, 'cardio.pick')
  });
});
onAct('cardio.pick', d => {
  const sess = store.activeSession; if (!sess) return;
  const n = sess.slots.filter(s => s.isCardio).length;
  sess.slots.push(buildCardioSlot(d.id, n, true));
  saveStore();
  closeSheet();
  render();
});

onAct('set.note', (d, el) => {
  const sess = store.activeSession; if (!sess) return;
  const slot = sess.slots.find(s => s.slotKey === d.slot); if (!slot) return;
  const ki = Math.max(0, currentSetIndex(slot));
  const set = slot.sets[ki]; if (!set) return;
  const v = String(el.value);
  if (v) set.note = v; else delete set.note;
  saveStore();
});

/* ---------- Tages- und Equipmentwahl ---------- */
onAct('day.select', d => {
  ui.selectedDay = d.day;
  render();
});

function customPlanForDay(dayId) {
  const day = getDay(dayId);
  const existing = store.customFixedPlans[dayId];
  if (isObj(existing) && Array.isArray(existing.slots)) return existing;
  return {
    name: day.name,
    slots: day.slots.map(sd => ({
      slotKey: sd.slotKey,
      name: sd.name,
      category: sd.category,
      sets: sd.sets,
      reps: sd.reps,
      rest: sd.rest,
      exerciseId: resolveSlotExercise(dayId, sd, store.equipmentMode),
      def: sd.def
    }))
  };
}

function renderDayEditor(dayId) {
  const plan = customPlanForDay(dayId);
  const body = '<div class="stack">' +
    '<div class="field-block"><label>Name des Trainings</label>' +
      '<input class="input" value="' + esc(plan.name || '') + '" data-change="day.planName" data-day="' + esc(dayId) + '"></div>' +
    '<div class="list">' + plan.slots.map((slot, i) =>
      '<div class="card pad-s"><div class="row-between"><div style="min-width:0"><div class="li-name">' + esc(exerciseName(slot.exerciseId)) + '</div>' +
      '<div class="li-meta">' + esc(CATEGORIES[slot.category] || slot.category) + '</div></div>' +
      '<button class="icon-btn sm" data-act="day.slotRemove" data-day="' + esc(dayId) + '" data-i="' + i + '" aria-label="Übung entfernen">✕</button></div>' +
      '<div class="cardio-grid mt">' +
      '<div class="field-block"><label>Sätze</label><input class="input" type="number" min="1" max="12" value="' + slot.sets + '" data-change="day.slotSets" data-day="' + esc(dayId) + '" data-i="' + i + '"></div>' +
      '<div class="field-block"><label>Wdh.</label><input class="input" value="' + esc(slot.reps) + '" data-change="day.slotReps" data-day="' + esc(dayId) + '" data-i="' + i + '"></div>' +
      '<div class="field-block"><label>Pause s</label><input class="input" type="number" min="0" max="600" value="' + slot.rest + '" data-change="day.slotRest" data-day="' + esc(dayId) + '" data-i="' + i + '"></div>' +
      '</div></div>'
    ).join('') + '</div>' +
    '<button class="btn ghost block" data-act="day.slotAdd" data-day="' + esc(dayId) + '">+ Übung hinzufügen</button>' +
    '<button class="btn primary block big" data-act="day.editSave" data-day="' + esc(dayId) + '">Training speichern</button>' +
    '<button class="btn danger block" data-act="day.editReset" data-day="' + esc(dayId) + '">Auf Standard zurücksetzen</button>' +
  '</div>';
  openSheet({ title: 'Training bearbeiten', sub: (DAYS.find(d => d.id === dayId) || {}).name || '', body: body });
}

onAct('day.edit', d => renderDayEditor(d.day));
 onAct('day.planName', (d, el) => { const plan = customPlanForDay(d.day); plan.name = String(el.value); store.customFixedPlans[d.day] = plan; saveStore(); });
 onAct('day.slotSets', (d, el) => { const plan = customPlanForDay(d.day); const v = parseInt(el.value, 10); if (plan.slots[d.i]) plan.slots[d.i].sets = Math.min(12, Math.max(1, v || 1)); store.customFixedPlans[d.day] = plan; saveStore(); });
 onAct('day.slotReps', (d, el) => { const plan = customPlanForDay(d.day); if (plan.slots[d.i]) {
  const reps = String(el.value).trim() || '8–12';
  plan.slots[d.i].reps = reps;
  const range = parseRepRange(reps);
  setExerciseRepTarget(plan.slots[d.i].exerciseId, range.min, range.max);
 }
 store.customFixedPlans[d.day] = plan; saveStore(); });
 onAct('day.slotRest', (d, el) => { const plan = customPlanForDay(d.day); const v = parseInt(el.value, 10); if (plan.slots[d.i]) plan.slots[d.i].rest = Math.min(600, Math.max(0, v || 0)); store.customFixedPlans[d.day] = plan; saveStore(); });
 onAct('day.slotRemove', d => { const plan = customPlanForDay(d.day); plan.slots.splice(parseInt(d.i, 10), 1); store.customFixedPlans[d.day] = plan; saveStore(); renderDayEditor(d.day); });
 onAct('day.slotAdd', d => openSheet({ title: 'Übung hinzufügen', sub: 'Aus der gesamten Bibliothek', body: exerciseListHtml(allExercises().filter(e => !isPainFlagged(e.id)), 'day.slotPick', 'data-day="' + esc(d.day) + '"') }));
 onAct('day.slotPick', d => { const ex = getExercise(d.id); if (!ex) return; const plan = customPlanForDay(d.day); plan.slots.push({ slotKey: d.day + 's' + uid('slot'), name: ex.name, category: ex.category, sets: 3, reps: '8–12', rest: 90, exerciseId: ex.id, def: { studio: ex.id, barbell: ex.id, bodyweight: ex.id } }); store.customFixedPlans[d.day] = plan; saveStore(); renderDayEditor(d.day); });
 onAct('day.editSave', d => { saveStore(); closeSheet(); render(); toast('Training gespeichert', { level: 2, sub: customPlanForDay(d.day).name }); });
 onAct('day.editReset', d => confirmSheet({ title: 'Training zurücksetzen', text: 'Die eigene Kopie dieses Tages wird entfernt.', okLabel: 'Zurücksetzen' }, () => { delete store.customFixedPlans[d.day]; saveStore(); closeSheet(); render(); }));
onAct('equip.set', d => {           /* §20.1 Single-Tap */
  store.equipmentMode = d.mode;
  saveStore();
  render();
});
onAct('session.start', () => {
  const day = getDay(ui.selectedDay);
  if (day.type === 'powerlifting') openPowerliftingSetup();
  else if (day.type === 'wildcard') openWildcardSetup();
  else startFixedSession(day.id);
});

/* ---------- Einheit beenden (§5, §29, §32.3) ---------- */
onAct('session.finish', () => {
  const sess = store.activeSession; if (!sess) return;
  const open = sess.slots.filter(sl => !sl.skipped && sl.sets.some(s => !setIsClosed(s))).length;
  confirmSheet({
    title: 'Einheit beenden',
    text: open > 0
      ? open + ' Übung(en) sind nicht abgeschlossen und werden als „übersprungen" markiert.'
      : 'Alle Übungen sind abgeschlossen.',
    okLabel: 'Einheit beenden'
  }, finishSession);
});

function finishSession() {
  const sess = store.activeSession; if (!sess) return;
  let early = false;
  sess.slots.forEach(sl => {
    const anyDone = sl.sets.some(s => s.done);
    if (!anyDone) { sl.skipped = true; early = true; }   /* §5 / §32.6 */
    else if (sl.sets.some(s => !setIsClosed(s))) { early = true; }
    /* nicht bestätigte und übersprungene Sätze werden nicht gespeichert;
       die geplante Satzzahl bleibt in targetSets erhalten („2 von 4 Sätzen") */
    sl.sets = sl.sets.filter(s => s.done);
  });
  sess.finished = true;
  sess.finishedEarly = early;

  /* §15.1 Kategorietreue: session-lokale Cross-Category-Tausche zurückführen */
  sess.slots.forEach(sl => {
    const def = getDaySlotDef(sess.dayId, sl.slotKey);
    if (!def) return;
    const ex = getExercise(sl.exerciseId);
    if (ex && ex.category !== def.category) {
      const ov = store.slotOverrides[sess.dayId];
      if (ov && ov[sl.slotKey] === sl.exerciseId) delete ov[sl.slotKey];
    }
  });

  /* §7.3 Powerlifting-Progression / Deload */
  if (sess.dayId === 'd6') applyPowerliftingProgression(sess);

  /* Zeitbasierte Einheit: Konditionierungs-Rekord je Vorlagenname fortschreiben */
  let condMsg = null;
  if (sess.mode === 'C' && sess.modeC) {
    const mc = sess.modeC;
    const res = applyConditioningResult(
      mc.name, mc.type, mc.completedRounds || 0, mc.partialReps || 0,
      { durationSec: mc.durationSec, intervalSec: mc.intervalSec, order: mc.order, exIds: mc.exIds }
    );
    if (res && res.isRecord) condMsg = 'Konditionierungs-Rekord — ' + mc.name;
  }

  store.sessions.push(sess);
  store.activeSession = null;
  store.counters.workoutsCompleted++;
  clearRestTimer();
  stopCardioTimer();
  stopModeCTimer();
  saveStore();

  checkExportReminder();
  render();
  const cardioSec = sessionCardioSecs(sess);
  const sub = fmtNum(sessionVolume(sess)) + ' kg Volumen'
    + (cardioSec > 0 ? ' · ' + Math.round(cardioSec / 60) + ' Cardio-Minuten' : '');
  toast('Einheit gespeichert', { level: 2, sub: sub });
  if (condMsg) toast(condMsg, { level: 3 });
}

/* §7.3 TM-Steigerung / Deload */
function applyPowerliftingProgression(sess) {
  sess.slots.forEach(sl => {
    if (!sl.isPowerliftingMain) return;
    const exId = sl.exerciseId;
    const tm = store.powerlifting.tm[exId];
    if (typeof tm !== 'number' || !isFinite(tm)) return;
    const done = sl.sets.filter(s => s.done);
    const allFive = done.length >= 5 && done.every(s => s.r >= 5);
    if (allFive) {
      const inc = PL_LOWER_BODY.indexOf(exId) !== -1 ? 5 : 2.5;
      store.powerlifting.tm[exId] = round25(tm + inc);
      store.powerlifting.streakNoProgress[exId] = 0;
    } else {
      const n = (store.powerlifting.streakNoProgress[exId] || 0) + 1;
      if (n >= 3) {
        store.powerlifting.tm[exId] = round25(tm * 0.9);   /* Deload 10 % */
        store.powerlifting.streakNoProgress[exId] = 0;
        toast('Deload: TM um 10 % reduziert', { level: 1, sub: exerciseName(exId) });
      } else {
        store.powerlifting.streakNoProgress[exId] = n;
      }
    }
  });
}

/* §29 + §32.3 Export-Erinnerung nach Einheitsende */
function checkExportReminder() {
  const total = store.counters.workoutsCompleted;
  const sessionsSinceExport = countSessionsSinceExport();
  const daysSinceExport = store.lastExportAt
    ? Math.floor((nowTs() - store.lastExportAt) / 86400000)
    : null;

  const byCount = sessionsSinceExport >= 10;
  const byTime = store.lastExportAt !== null && daysSinceExport >= 14;
  if (!byCount && !byTime) return;

  /* §29: lastArchiveReminderAt verhindert wiederholte Erinnerungen vor der nächsten 10er-Schwelle */
  const remindedAt = store.lastArchiveReminderAt || 0;
  if (byCount && !byTime && remindedAt >= total) return;
  if (!byCount && byTime && (nowTs() - remindedAt) < 14 * 86400000 && remindedAt > 0) return;

  store.lastArchiveReminderAt = byCount ? total : nowTs();
  saveStore();
  toast('Export empfohlen', {
    level: 1, sticky: true,
    sub: byCount
      ? 'Du hast 10 weitere Einheiten aufgezeichnet — Export empfohlen, um Speicherplatz zu sichern.'
      : 'Letzter Export vor ' + daysSinceExport + ' Tagen — Export empfohlen, um Datenverlust zu vermeiden.',
    actionLabel: 'Zum Export',
    action: 'nav.export'
  });
}
function countSessionsSinceExport() {
  if (!store.lastExportAt) return store.sessions.length;
  return store.sessions.filter(s => {
    const t = Date.parse(s.dateISO + 'T23:59:59');
    return isFinite(t) ? t >= store.lastExportAt : true;
  }).length;
}
onAct('nav.export', () => { ui.tab = 'more'; ui.moreView = 'data'; render(); });

onAct('session.discard', () => {
  confirmSheet({
    title: 'Einheit verwerfen',
    text: 'Die laufende Einheit wird ohne Speichern gelöscht.',
    okLabel: 'Verwerfen'
  }, () => {
    store.activeSession = null;
    clearRestTimer();
    saveStore();
    render();
  });
});

/* ---------- Slot-Aktionen: Tausch / Override (§5, §15, §26) ---------- */
onAct('slot.open', d => {
  const sess = store.activeSession; if (!sess) return;
  const slot = sess.slots.find(s => s.slotKey === d.slot); if (!slot) return;
  const def = getDaySlotDef(sess.dayId, slot.slotKey);
  const sameCat = exercisesFor(slot.category, sess.equipment)
    .filter(e => e.id !== slot.exerciseId);
  /* §6.3: preacher_curl im Tausch-Sheet von d3s5 bevorzugt anzeigen */
  if (def && def.preferSwap) {
    const i = sameCat.findIndex(e => e.id === def.preferSwap);
    if (i > 0) sameCat.unshift(sameCat.splice(i, 1)[0]);
  }
  openSheet({
    title: 'Übung tauschen',
    sub: (slot.slotName || slot.slotKey) + ' · ' + (CATEGORIES[slot.category] || slot.category),
    body:
      '<div class="stack">' +
        '<div class="card pad-s"><div class="card-title" style="font-size:16px">' + esc(exerciseName(slot.exerciseId)) + '</div>' +
        '<div class="card-sub">aktuelle Übung</div></div>' +
        kicker('Alternativen — gleiche Kategorie') +
        exerciseListHtml(sameCat, 'slot.swapPick', 'data-slot="' + esc(slot.slotKey) + '"') +
        kicker('Andere Kategorie (nur diese Session)') +
        '<button class="btn ghost block" data-act="slot.crossOpen" data-slot="' + esc(slot.slotKey) + '">Aus gesamter Bibliothek wählen</button>' +
        (def ? '<button class="btn ghost block" data-act="slot.makeDefault" data-slot="' + esc(slot.slotKey) + '">Aktuelle Übung als Standard für diesen Slot</button>' : '') +
        '<button class="btn ghost block" data-act="slot.skip" data-slot="' + esc(slot.slotKey) + '">Übung überspringen</button>' +
      '</div>'
  });
});

onAct('slot.swapPick', d => {
  const sess = store.activeSession; if (!sess) return;
  const slot = sess.slots.find(s => s.slotKey === d.slot); if (!slot) return;
  applySwap(sess, slot, d.id);
  closeSheet();
  render();
});

onAct('slot.crossOpen', d => {
  const sess = store.activeSession; if (!sess) return;
  const list = exercisesFor(null, sess.equipment).filter(e => e.category !== getSlotCategory(sess, d.slot));
  openSheet({
    title: 'Gesamte Bibliothek',
    sub: 'Kategoriefremder Tausch gilt nur für diese Session.',
    body: exerciseListHtml(list, 'slot.swapPick', 'data-slot="' + esc(d.slot) + '"')
  });
});
function getSlotCategory(sess, slotKey) {
  const sl = sess.slots.find(s => s.slotKey === slotKey);
  return sl ? sl.category : null;
}

function applySwap(sess, slot, newId) {
  const fromId = slot.exerciseId;
  if (!newId || newId === fromId) return;
  const ex = getExercise(newId); if (!ex) return;
  slot.exerciseId = newId;
  slot.variantId = lastExerciseVariantId(newId, sess.gymId);
  const last = lastWeightFor(newId, sessionScope(sess));
  slot.targetWeight = last;
  slot.sets.forEach(s => { if (!s.done) s.w = last; });
  store.swapLog.push({ dayId: sess.dayId, slotKey: slot.slotKey, fromId: fromId, toId: newId, dateISO: todayISO() });

  /* §26 Ähnlichkeitslogik: 5 gleiche Tausche in 8 Wochen → Vorschlag */
  if (ex.category === slot.category && !store.autoSwapAsked[fromId + '>' + newId]) {
    const cutoff = Date.now() - 56 * 86400000;
    const n = store.swapLog.filter(l => l.fromId === fromId && l.toId === newId &&
      (Date.parse(l.dateISO) || 0) >= cutoff).length;
    if (n >= 5) {
      store.autoSwapAsked[fromId + '>' + newId] = true;
      toast('Häufiger Tausch erkannt', {
        level: 1, sticky: true,
        sub: exerciseName(newId) + ' 5× in 8 Wochen statt ' + exerciseName(fromId) + ' — dauerhaft übernehmen?',
        actionLabel: 'Übernehmen',
        action: 'slot.acceptPermanent'
      });
      ui._pendingPermanent = { dayId: sess.dayId, slotKey: slot.slotKey, toId: newId };
    }
  }
  saveStore();
}
onAct('slot.acceptPermanent', () => {
  const p = ui._pendingPermanent; if (!p) return;
  if (!store.slotOverrides[p.dayId]) store.slotOverrides[p.dayId] = {};
  store.slotOverrides[p.dayId][p.slotKey] = p.toId;
  ui._pendingPermanent = null;
  saveStore();
  toast('Als Standard übernommen', { level: 2 });
});

onAct('slot.makeDefault', d => {
  const sess = store.activeSession; if (!sess) return;
  const slot = sess.slots.find(s => s.slotKey === d.slot); if (!slot) return;
  const def = getDaySlotDef(sess.dayId, slot.slotKey);
  const ex = getExercise(slot.exerciseId);
  if (!def || !ex || ex.category !== def.category) {
    toast('Nur Übungen derselben Kategorie können Standard werden', { level: 0 });
    return;
  }
  if (!store.slotOverrides[sess.dayId]) store.slotOverrides[sess.dayId] = {};
  store.slotOverrides[sess.dayId][slot.slotKey] = slot.exerciseId;
  saveStore();
  closeSheet();
  toast('Neuer Standard gesetzt', { level: 2, sub: ex.name });
});

onAct('slot.skip', d => {
  const sess = store.activeSession; if (!sess) return;
  const slot = sess.slots.find(s => s.slotKey === d.slot); if (!slot) return;
  slot.skipped = true;
  clearRestTimer();
  saveStore();
  closeSheet();
  render();
});
onAct('slot.unskip', d => {
  const sess = store.activeSession; if (!sess) return;
  const slot = sess.slots.find(s => s.slotKey === d.slot); if (!slot) return;
  slot.skipped = false;
  saveStore();
  render();
});
onAct('slot.jump', d => {
  const sess = store.activeSession; if (!sess) return;
  /* Alle davorliegenden offenen Slots bleiben unberührt; Sprung durch temporäres Vorziehen */
  const i = sess.slots.findIndex(s => s.slotKey === d.slot);
  if (i < 0) return;
  const slot = sess.slots[i];
  if (slot.skipped) { slot.skipped = false; saveStore(); render(); return; }
  const cur = activeSlotIndex(sess);
  if (cur === i) return;
  sess.slots.splice(i, 1);
  sess.slots.splice(Math.max(0, cur), 0, slot);
  clearRestTimer();
  saveStore();
  render();
});

/* ---------- Powerlifting-Setup (§7, §32.5) ---------- */
function openPowerliftingSetup() {
  ui._plMain = ui._plMain || [];
  ui._plAssist = ui._plAssist || [];
  renderPlSheet();
}
function renderPlSheet() {
  const pool = PL_MAIN_POOL.filter(id => !isPainFlagged(id)).map(getExercise).filter(Boolean);
  const main = ui._plMain, assist = ui._plAssist;
  const body =
    '<div class="stack">' +
      kicker('3 Hauptübungen wählen (' + main.length + '/3)') +
      '<div class="list">' + pool.map(e => {
        const on = main.indexOf(e.id) !== -1;
        const tm = store.powerlifting.tm[e.id];
        return '<button class="list-item ' + (on ? 'is-active' : '') + '" data-act="pl.toggleMain" data-id="' + esc(e.id) + '">' +
          '<span class="statusdot ' + (on ? 'done' : '') + '">' + (on ? '✓' : '') + '</span>' +
          '<div class="li-main"><div class="li-name">' + esc(e.name) + '</div>' +
          '<div class="li-meta">' + (typeof tm === 'number' ? 'TM ' + fmtKg(tm) + ' · Arbeitsgewicht ' + fmtKg(round25(tm * 0.8)) : 'TM festlegen') + '</div></div>' +
        '</button>';
      }).join('') + '</div>' +
      (main.length ? kicker('Training-Max je Hauptübung (auf 2,5 kg gerundet)') +
        '<div class="stack">' + main.map(id =>
          '<div class="card pad-s">' +
            '<div class="row-between"><div style="min-width:0"><div class="li-name">' + esc(exerciseName(id)) + '</div>' +
            '<div class="li-meta">' + (typeof store.powerlifting.tm[id] === 'number'
              ? 'TM ' + fmtKg(store.powerlifting.tm[id]) + ' → 5×5 @ ' + fmtKg(round25(store.powerlifting.tm[id] * 0.8))
              : 'TM festlegen') + '</div></div></div>' +
            '<div class="row mt" style="gap:8px">' +
              '<div class="field" style="flex:1"><div class="field-label">1RM (kg)</div>' +
                '<input class="num input" type="number" inputmode="decimal" step="0.5" placeholder="1RM" data-change="pl.from1rm" data-id="' + esc(id) + '"></div>' +
              '<div class="field" style="flex:1"><div class="field-label">TM direkt (kg)</div>' +
                '<input class="num input" type="number" inputmode="decimal" step="0.5" placeholder="TM festlegen" value="' +
                  (typeof store.powerlifting.tm[id] === 'number' ? store.powerlifting.tm[id] : '') +
                  '" data-change="pl.setTm" data-id="' + esc(id) + '"></div>' +
            '</div>' +
          '</div>'
        ).join('') + '</div>' : '') +
      kicker('Assistance-Übungen (0–3, aktuell ' + assist.length + ')') +
      '<button class="btn ghost block" data-act="pl.addAssist">+ Assistance hinzufügen</button>' +
      (assist.length ? '<div class="list">' + assist.map((id, i) =>
        '<div class="list-item"><div class="li-main"><div class="li-name">' + esc(exerciseName(id)) + '</div>' +
        '<div class="li-meta">' + esc(CATEGORIES[(getExercise(id) || {}).category] || '') + '</div></div>' +
        '<button class="icon-btn sm" data-act="pl.removeAssist" data-i="' + i + '">✕</button></div>'
      ).join('') + '</div>' : '') +
      '<button class="btn primary block big" data-act="pl.start" ' + (main.length === 3 ? '' : 'disabled') + '>' +
        'Powerlifting starten (5×5 @ 80 % TM)</button>' +
      '<p class="small muted center">Start ist auch ohne hinterlegten 1RM möglich.</p>' +
    '</div>';
  openSheet({ title: 'Powerlifting — D6', sub: '3 Hauptübungen + 0–3 Assistance', body: body });
}
onAct('pl.toggleMain', d => {
  const i = ui._plMain.indexOf(d.id);
  if (i !== -1) ui._plMain.splice(i, 1);
  else if (ui._plMain.length < 3) {
    ui._plMain.push(d.id);
    if (typeof store.powerlifting.tm[d.id] !== 'number') {
      const scopes = prScopesForExercise(d.id);
      let best = null;
      scopes.forEach(sc => {
        const pr = getPr(sc, d.id);
        if (pr && typeof pr.best_1rm === 'number') best = best === null ? pr.best_1rm : Math.max(best, pr.best_1rm);
        else if (pr && typeof pr.best_weight === 'number') best = best === null ? pr.best_weight : Math.max(best, pr.best_weight);
      });
      if (best !== null) {
        store.powerlifting.tm[d.id] = round25(best * 0.9);
        saveStore();
      }
    }
  } else { toast('Es sind bereits 3 Hauptübungen gewählt', { level: 0 }); return; }
  renderPlSheet();
});
onAct('pl.from1rm', (d, el) => {
  const v = parseFloat(String(el.value).replace(',', '.'));
  if (!isFinite(v) || v <= 0) return;
  store.powerlifting.tm[d.id] = round25(v * 0.9);   /* §7.3 / §32.4 */
  saveStore();
  renderPlSheet();
});
onAct('pl.setTm', (d, el) => {
  const raw = String(el.value).replace(',', '.').trim();
  if (raw === '') { delete store.powerlifting.tm[d.id]; saveStore(); renderPlSheet(); return; }
  const v = parseFloat(raw);
  if (!isFinite(v) || v <= 0) return;
  store.powerlifting.tm[d.id] = v;   /* §32.4: gerundeter Wert frei überschreibbar */
  saveStore();
  renderPlSheet();
});
onAct('pl.addAssist', () => {
  if (ui._plAssist.length >= 3) { toast('Maximal 3 Assistance-Übungen', { level: 0 }); return; }
  openSheet({
    title: 'Assistance wählen',
    sub: 'Gesamte Übungsbibliothek',
    body: exerciseListHtml(allExercises().filter(e => !isPainFlagged(e.id)), 'pl.pickAssist')
  });
});
onAct('pl.pickAssist', d => {
  if (ui._plAssist.indexOf(d.id) === -1) ui._plAssist.push(d.id);
  renderPlSheet();
});
onAct('pl.removeAssist', d => { ui._plAssist.splice(parseInt(d.i, 10), 1); renderPlSheet(); });
onAct('pl.start', () => {
  if (ui._plMain.length !== 3) return;
  const m = ui._plMain.slice(), a = ui._plAssist.slice();
  ui._plMain = []; ui._plAssist = [];
  startPowerliftingSession(m, a);
});

/* ---------- Wildcard-Setup (§8) ---------- */
function openWildcardSetup() {
  openSheet({
    title: 'Wildcard — DW',
    sub: 'Drei Modi, jeweils mit eigenem Start-Button',
    body:
      '<div class="stack">' +
        wcCard('A', 'Freie Zusammenstellung', 'Beliebig viele Übungen aus der gesamten Bibliothek, normale Progression. Als Vorlage speicherbar.') +
        wcCard('B', 'Kraft & PR-Versuch', 'Eine Hauptübung mit berechnetem Aufwärmen und PR-Versuch, dazu ein optionaler Nebenlift.') +
        wcCard('C', 'Zeitbasiert (AMRAP / EMOM)', 'Dauer, Übungen und Zielwiederholungen. Ergebnisse zählen nicht in die Kraft-PRs.') +
      '</div>'
  });
}
function wcCard(mode, title, text) {
  return '<div class="card">' +
    '<div class="kicker">Modus ' + mode + '</div>' +
    '<div class="card-title">' + esc(title) + '</div>' +
    '<div class="card-sub" style="margin-top:6px">' + esc(text) + '</div>' +
    '<button class="btn primary block mt" data-act="wc.open" data-mode="' + mode + '">Modus ' + mode + ' starten</button>' +
  '</div>';
}

onAct('wc.open', d => {
  ui._wcMode = d.mode;
  ui._wcPicks = [];
  ui._wcPerEx = {};
  ui._wcSrc = 'all';
  ui._wcCat = 'all';
  ui._wcName = '';
  ui._wcC = { type: 'amrap', durationSec: 600, intervalSec: 60, rounds: 4, order: 'rotate' };
  ui._wcVariants = ui._wcVariants || {};
  ui._wcB = { prKind: 'weight', attempts: 3, targetW: null };
  renderWcPicker();
});

/* Quelle der Übungen — ersetzt den früheren Equipment-Umschalter am Wildcard-Tag */
const WC_SOURCES = [
  { id: 'all', label: 'Alle' },
  { id: 'studio', label: 'Gym' },
  { id: 'barbell', label: 'Hantel' },
  { id: 'bodyweight', label: 'Calisthenics' }
];

function wcBaseList() {
  const src = ui._wcSrc || 'all';
  let list = allExercises().filter(e => !isPainFlagged(e.id));
  if (src !== 'all') list = list.filter(e => (e.equipment || []).indexOf(src) !== -1);
  if (ui._wcMode === 'B') list = list.filter(e => e.isCompound && !isCardioExercise(e.id));
  return list;
}
function filterWcList(list) {
  const c = ui._wcCat || 'all';
  if (c === 'all') return list;
  if (c === 'compound') return list.filter(e => e.isCompound === true);
  if (c === 'arms') return list.filter(e => ARM_CATEGORIES.indexOf(e.category) !== -1);
  if (MUSCLE_GROUP_FILTERS.some(g => g.id === c) && c !== 'compound') {
    return list.filter(e => muscleGroupForExercise(e.id) === c);
  }
  return list.filter(e => e.category === c);
}
function canStartWc() {
  const n = ui._wcPicks.length;
  if (ui._wcMode === 'B') return n >= 1 && n <= 2;
  return n >= 1;
}
function wcPerEx(exId) {
  if (!ui._wcPerEx[exId]) ui._wcPerEx[exId] = { w: null, reps: null };
  return ui._wcPerEx[exId];
}

function renderWcPicker() {
  const mode = ui._wcMode, picks = ui._wcPicks;
  const armGroup = ARM_CATEGORIES.map(c => CATEGORIES[c]).join(', ');
  const body =
    '<div class="stack">' +
      (mode === 'C' ? modeCControls() : '') +
      (mode === 'B' ? modeBControls() : '') +
      (mode !== 'B' ? wcTemplateBlock(mode) : '') +
      kicker(mode === 'B'
        ? 'Hauptübung + optionaler Nebenlift (' + picks.length + '/2)'
        : 'Übungen wählen (' + picks.length + ')') +
      wcPicksHtml() +
      '<div class="chips">' + WC_SOURCES.map(s =>
        '<button class="chip ' + ((ui._wcSrc || 'all') === s.id ? 'on' : '') + '" data-act="wc.src" data-src="' + s.id + '">' +
        esc(s.label) + '</button>').join('') + '</div>' +
      '<div class="chips">' + MUSCLE_GROUP_FILTERS.map(g =>
        '<button class="chip ' + ((ui._wcCat || 'all') === g.id ? 'on' : '') + '" data-act="wc.cat" data-cat="' + g.id + '">' +
        esc(g.label) + '</button>').join('') +
      '</div>' +
      '<p class="tiny muted">Zielgruppe „Arme": ' + esc(armGroup) + '</p>' +
      exerciseListHtml(filterWcList(wcBaseList()), 'wc.pick') +
      (mode !== 'B' ? wcSaveTemplateHtml(mode) : '') +
      '<button class="btn primary block big" data-act="wc.start" ' + (canStartWc() ? '' : 'disabled') + '>Modus ' + mode + ' starten</button>' +
    '</div>';
  openSheet({ title: 'Wildcard Modus ' + mode, sub: 'Auswahl zusammenstellen', body: body });
}

function wcPicksHtml() {
  const picks = ui._wcPicks;
  if (!picks.length) return '';
  const withInputs = ui._wcMode !== 'B';
  return '<div class="stack" style="gap:6px">' + picks.map((id, i) => {
    const p = wcPerEx(id);
    const cardio = isCardioExercise(id);
    const role = ui._wcMode === 'B' ? (i === 0 ? 'Hauptübung' : 'Nebenlift (optional)') : null;
    const variants = (store.exerciseVariants || []).filter(v => v.gymId === store.gymId && v.exerciseId === id);
    const selectedVariant = ui._wcVariants[id] || '';
    return '<div class="card pad-s">' +
      '<div class="row-between"><div style="min-width:0">' +
        '<div class="li-name">' + esc(exerciseName(id)) + '</div>' +
        '<div class="li-meta">' + esc(role || CATEGORIES[(getExercise(id) || {}).category] || '') + '</div>' +
      '</div><button class="icon-btn sm" data-act="wc.remove" data-i="' + i + '">✕</button></div>' +
      (variants.length ? '<div class="field-block mt"><label>Maschinenvariante</label><select class="input" data-change="wc.variant" data-id="' + esc(id) + '">' +
        '<option value=""' + (!selectedVariant ? ' selected' : '') + '>Standard / keine Angabe</option>' +
        variants.map(v => '<option value="' + esc(v.id) + '"' + (selectedVariant === v.id ? ' selected' : '') + '>' + esc(v.name) + '</option>').join('') +
        '</select></div>' : '') +
      ((withInputs && !cardio) ?
        '<div class="row mt" style="gap:8px">' +
          '<div class="field-block" style="flex:1"><label>Wdh.</label>' +
            '<input class="input" type="number" inputmode="numeric" min="1" value="' + (p.reps === null ? '' : p.reps) + '" ' +
            'data-change="wc.perR" data-id="' + esc(id) + '"></div>' +
          '<div class="field-block" style="flex:1"><label>Gewicht (kg)</label>' +
            '<input class="input" type="number" inputmode="decimal" step="0.5" value="' + (p.w === null ? '' : p.w) + '" ' +
            'data-change="wc.perW" data-id="' + esc(id) + '"></div>' +
        '</div>' : '') +
    '</div>';
  }).join('') + '</div>';
}

/* ---- Modus B: Ziel, Aufwärmen, PR-Art ---- */
function modeBControls() {
  const b = ui._wcB;
  const mainId = ui._wcPicks[0] || null;
  let info = '<p class="tiny muted">Erst Hauptübung wählen — danach erscheint das Ziel.</p>';
  let ref = null;
  if (mainId) {
    const scope = currentExerciseScope(mainId);
    const pr = getPr(scope, mainId);
    ref = (pr && typeof pr.best_weight === 'number') ? pr.best_weight : null;
    const repsAtBest = (pr && ref !== null && pr.prByWeight) ? pr.prByWeight[String(ref)] : null;
    if (ref !== null) {
      info = '<div class="tiles">' +
        '<div class="tile"><div class="tl-lb">Bestgewicht</div><div class="tl-v">' + esc(fmtKg(ref)) + '</div>' +
          '<div class="tiny muted">' + esc(scopeLabel(scope)) + '</div></div>' +
        '<div class="tile"><div class="tl-lb">Max. Wdh. dabei</div><div class="tl-v">' + (repsAtBest ? repsAtBest : '—') + '</div></div>' +
        '<div class="tile"><div class="tl-lb">Gesch. 1RM</div><div class="tl-v">' +
          esc(pr && typeof pr.best_1rm === 'number' ? fmtKg(pr.best_1rm) : '—') + '</div></div>' +
      '</div>';
    } else {
      info = '<div class="field-block"><label>Zielgewicht für heute (kg)</label>' +
        '<input class="input" type="number" inputmode="decimal" step="0.5" value="' + (b.targetW === null ? '' : b.targetW) + '" ' +
        'data-change="wc.bTarget"></div>' +
        '<p class="tiny muted">Noch kein Bestwert vorhanden — das Zielgewicht dient als Rechenbasis für das Aufwärmen.</p>';
    }
  }
  const base = ref !== null ? ref : b.targetW;
  const warm = base !== null && base !== undefined && isFinite(base)
    ? [[50, 5], [70, 3], [85, 1]].map(p => fmtKg(round25(base * p[0] / 100)) + ' × ' + p[1]).join(' · ')
    : null;
  return '<div class="card">' +
    '<div class="kicker">Ziel</div>' + info +
    '<div class="kicker mt">PR-Art</div>' +
    '<div class="segmented mt">' +
      '<button class="' + (b.prKind === 'weight' ? 'on' : '') + '" data-act="wc.bKind" data-k="weight">Gewicht</button>' +
      '<button class="' + (b.prKind === 'reps' ? 'on' : '') + '" data-act="wc.bKind" data-k="reps">Wiederholungen</button>' +
    '</div>' +
    '<div class="kicker mt">Versuchssätze</div>' +
    '<div class="stepper mt">' +
      '<button data-act="wc.bAttempts" data-v="-1">−</button>' +
      '<span>' + b.attempts + '</span>' +
      '<button data-act="wc.bAttempts" data-v="1">+</button>' +
    '</div>' +
    (warm ? '<div class="hint neutral mt">Aufwärmen: ' + esc(warm) + ' — als Aufwärmen markiert, ohne PR-Wertung.</div>' : '') +
    '<div class="hint neutral">Pause vor den Versuchen: 240 s.</div>' +
  '</div>';
}
onAct('wc.bKind', d => { ui._wcB.prKind = d.k; renderWcPicker(); });
onAct('wc.bAttempts', d => {
  const v = parseInt(d.v, 10);
  ui._wcB.attempts = Math.min(3, Math.max(1, ui._wcB.attempts + v));
  renderWcPicker();
});
onAct('wc.bTarget', (d, el) => {
  const raw = String(el.value).replace(',', '.').trim();
  const v = parseFloat(raw);
  ui._wcB.targetW = (raw === '' || !isFinite(v) || v <= 0) ? null : v;
  renderWcPicker();
});

/* ---- Modus C: AMRAP / EMOM ---- */
function modeCControls() {
  const c = ui._wcC;
  const isAmrap = c.type === 'amrap';
  return '<div class="card"><div class="kicker">Zeitformat</div>' +
    '<div class="segmented mt">' +
      '<button class="' + (isAmrap ? 'on' : '') + '" data-act="wc.cType" data-t="amrap">AMRAP</button>' +
      '<button class="' + (!isAmrap ? 'on' : '') + '" data-act="wc.cType" data-t="emom">EMOM</button>' +
    '</div>' +
    (isAmrap
      ? '<div class="kicker mt">Gesamtdauer</div>' +
        '<div class="stepper mt">' +
          '<button data-act="wc.cDur" data-v="-30">−30 s</button>' +
          '<span>' + esc(fmtSecs(c.durationSec)) + '</span>' +
          '<button data-act="wc.cDur" data-v="30">+30 s</button>' +
        '</div>'
      : '<div class="kicker mt">Intervalllänge</div>' +
        '<div class="stepper mt">' +
          '<button data-act="wc.cInt" data-v="-30">−30 s</button>' +
          '<span>' + esc(fmtSecs(c.intervalSec)) + '</span>' +
          '<button data-act="wc.cInt" data-v="30">+30 s</button>' +
        '</div>' +
        '<div class="kicker mt">Runden</div>' +
        '<div class="stepper mt">' +
          '<button data-act="wc.cRounds" data-v="-1">−</button>' +
          '<span>' + c.rounds + '</span>' +
          '<button data-act="wc.cRounds" data-v="1">+</button>' +
        '</div>' +
        '<div class="kicker mt">Ablauf</div>' +
        '<div class="segmented mt">' +
          '<button class="' + (c.order === 'rotate' ? 'on' : '') + '" data-act="wc.cOrder" data-o="rotate">Übungen rotieren</button>' +
          '<button class="' + (c.order === 'all' ? 'on' : '') + '" data-act="wc.cOrder" data-o="all">Alle pro Intervall</button>' +
        '</div>' +
        '<p class="tiny muted" style="margin-top:6px">„Übungen rotieren": je Intervall eine Übung, eine Runde ist ein voller Durchlauf. „Alle pro Intervall": jedes Intervall enthält alle Übungen.</p>') +
    '<div class="hint neutral mt">' + (isAmrap
      ? 'Zielwiederholungen und Gewichte je Übung unten eintragen. Bestätigen springt zur nächsten Übung, die Zeit läuft weiter.'
      : 'Läuft ohne Bestätigung durch. Jedes Intervall wird mit den eingetragenen Werten als geschafft verbucht. Am Ende kannst du die Rundenzahl korrigieren.') + '</div>' +
  '</div>';
}
onAct('wc.cType', d => { ui._wcC.type = d.t; renderWcPicker(); });
onAct('wc.cDur', d => {
  const v = parseInt(d.v, 10);
  ui._wcC.durationSec = Math.max(30, ui._wcC.durationSec + v);
  renderWcPicker();
});
onAct('wc.cInt', d => {
  const v = parseInt(d.v, 10);
  ui._wcC.intervalSec = Math.max(30, ui._wcC.intervalSec + v);
  renderWcPicker();
});
onAct('wc.cRounds', d => {
  const v = parseInt(d.v, 10);
  ui._wcC.rounds = Math.max(1, ui._wcC.rounds + v);
  renderWcPicker();
});
onAct('wc.cOrder', d => { ui._wcC.order = d.o; renderWcPicker(); });

/* ---- Vorlagen (Modus A und C) ---- */
function wcTemplateBlock(mode) {
  const list = templatesForMode(mode);
  if (!list.length) return '';
  return kicker('Vorlagen') + '<div class="stack" style="gap:6px">' + list.map(t =>
    '<div class="card pad-s">' +
      '<div class="row-between"><div style="min-width:0">' +
        '<div class="li-name">' + esc(t.name) + '</div>' +
        '<div class="li-meta">' + t.exerciseIds.length + ' Übungen' +
          (t.mode === 'C' && t.config ? ' · ' + esc(t.config.type === 'emom' ? 'EMOM' : 'AMRAP') : '') + '</div>' +
      '</div></div>' +
      '<div class="row mt" style="gap:8px">' +
        '<button class="btn sm" data-act="wc.tplLoad" data-id="' + esc(t.id) + '">Laden</button>' +
        '<button class="btn sm ghost" data-act="wc.tplDel" data-id="' + esc(t.id) + '">Löschen</button>' +
      '</div>' +
      '<div class="field-block mt"><label>Umbenennen</label>' +
        '<input class="input" type="text" value="' + esc(t.name) + '" data-change="wc.tplRename" data-id="' + esc(t.id) + '"></div>' +
    '</div>'
  ).join('') + '</div>';
}
function wcSaveTemplateHtml(mode) {
  return '<div class="card pad-s"><div class="kicker">Als Vorlage speichern</div>' +
    '<div class="field-block mt"><label>Name</label>' +
      '<input class="input" type="text" placeholder="z. B. Kurzes Ganzkörper-AMRAP" value="' + esc(ui._wcName || '') + '" data-change="wc.name"></div>' +
    '<button class="btn ghost block mt" data-act="wc.tplSave">Vorlage speichern</button>' +
    '<p class="tiny muted" style="margin-top:6px">Gespeichert werden Übungen in dieser Reihenfolge, Gewichte und Wiederholungen' +
      (mode === 'C' ? ', Zeitformat, Dauer bzw. Intervall, Runden und Ablauf.' : '.') + ' Bestehende Vorlagen werden nie automatisch überschrieben.</p>' +
  '</div>';
}
onAct('wc.name', (d, el) => { ui._wcName = String(el.value); });
onAct('wc.tplSave', () => {
  if (!ui._wcPicks.length) { toast('Erst Übungen wählen', { level: 0 }); return; }
  const name = String(ui._wcName || '').trim();
  if (!name) { toast('Bitte einen Namen eintragen', { level: 0 }); return; }
  const cfg = { perEx: {} };
  ui._wcPicks.forEach(id => { cfg.perEx[id] = clone(wcPerEx(id)); });
  if (ui._wcMode === 'C') {
    cfg.type = ui._wcC.type;
    cfg.durationSec = ui._wcC.durationSec;
    cfg.intervalSec = ui._wcC.intervalSec;
    cfg.rounds = ui._wcC.rounds;
    cfg.order = ui._wcC.order;
  }
  const t = saveWildcardTemplate(name, ui._wcMode, ui._wcPicks, cfg);
  if (!t) { toast('Vorlage konnte nicht gespeichert werden', { level: 0 }); return; }
  ui._wcName = '';
  toast('Vorlage gespeichert', { level: 2, sub: t.name });
  renderWcPicker();
});
onAct('wc.tplLoad', d => {
  const t = store.wildcardTemplates.find(x => x.id === d.id);
  if (!t) return;
  ui._wcPicks = t.exerciseIds.filter(id => getExercise(id)).slice();
  ui._wcPerEx = {};
  Object.keys((t.config && t.config.perEx) || {}).forEach(id => {
    const p = t.config.perEx[id];
    ui._wcPerEx[id] = {
      w: (p && typeof p.w === 'number') ? p.w : null,
      reps: (p && typeof p.reps === 'number') ? p.reps : null
    };
  });
  if (t.mode === 'C' && t.config) {
    ui._wcC = {
      type: t.config.type === 'emom' ? 'emom' : 'amrap',
      durationSec: typeof t.config.durationSec === 'number' ? t.config.durationSec : 600,
      intervalSec: typeof t.config.intervalSec === 'number' ? t.config.intervalSec : 60,
      rounds: typeof t.config.rounds === 'number' ? t.config.rounds : 4,
      order: t.config.order === 'all' ? 'all' : 'rotate'
    };
  }
  ui._wcName = t.name;
  ui._wcTplName = t.name;
  toast('Vorlage geladen', { level: 1, sub: t.name });
  renderWcPicker();
});
onAct('wc.tplDel', d => {
  const t = store.wildcardTemplates.find(x => x.id === d.id);
  if (!t) return;
  confirmSheet({ title: 'Vorlage löschen', text: '„' + t.name + '" wird gelöscht.', okLabel: 'Löschen' }, () => {
    deleteWildcardTemplate(d.id);
    renderWcPicker();
  });
});
onAct('wc.tplRename', (d, el) => {
  const ok = renameWildcardTemplate(d.id, el.value);
  if (!ok) toast('Name konnte nicht geändert werden', { level: 0 });
  renderWcPicker();
});

onAct('wc.src', d => { ui._wcSrc = d.src; renderWcPicker(); });
onAct('wc.cat', d => { ui._wcCat = d.cat; renderWcPicker(); });
onAct('wc.perR', (d, el) => {
  const v = parseInt(String(el.value).trim(), 10);
  wcPerEx(d.id).reps = isFinite(v) && v > 0 ? v : null;
});
onAct('wc.perW', (d, el) => {
  const raw = String(el.value).replace(',', '.').trim();
  const v = parseFloat(raw);
  wcPerEx(d.id).w = (raw === '' || !isFinite(v)) ? null : v;
});
onAct('wc.pick', d => {
  if (ui._wcMode === 'B' && ui._wcPicks.length >= 2) { toast('Modus B: eine Hauptübung + ein Nebenlift', { level: 0 }); return; }
  if (ui._wcPicks.indexOf(d.id) === -1) {
    ui._wcPicks.push(d.id);
    if (!ui._wcVariants) ui._wcVariants = {};
    ui._wcVariants[d.id] = lastExerciseVariantId(d.id, store.gymId) || '';
    const p = wcPerEx(d.id);
    if (p.w === null) {
      const last = lastWeightFor(d.id, currentExerciseScope(d.id));
      if (last !== null) p.w = last;
    }
  }
  renderWcPicker();
});
onAct('wc.remove', d => { ui._wcPicks.splice(parseInt(d.i, 10), 1); renderWcPicker(); });
 onAct('wc.variant', (d, el) => {
  ui._wcVariants[d.id] = String(el.value || '');
  rememberExerciseVariant(d.id, store.gymId, ui._wcVariants[d.id] || null);
});
onAct('wc.start', () => {
  if (!canStartWc()) return;
  const mode = ui._wcMode, picks = ui._wcPicks.slice();
  const perEx = {};
  picks.forEach(id => { perEx[id] = clone(wcPerEx(id)); });
  if (mode === 'B') {
    const mainId = picks[0];
    const pr = getPr(currentExerciseScope(mainId), mainId);
    const ref = (pr && typeof pr.best_weight === 'number') ? pr.best_weight : ui._wcB.targetW;
    if (ref === null || ref === undefined) {
      toast('Zielgewicht für heute eintragen', { level: 0, sub: 'Ohne Bestwert braucht das Aufwärmen eine Rechenbasis.' });
      return;
    }
    startWildcardSession('B', picks, { prKind: ui._wcB.prKind, attempts: ui._wcB.attempts, ref: ref });
    return;
  }
  if (mode === 'C') {
    const c = ui._wcC;
    const cfg = {
      type: c.type, durationSec: c.durationSec, intervalSec: c.intervalSec,
      rounds: c.rounds, order: c.order, perEx: perEx,
      name: ui._wcTplName || null
    };
    startWildcardSession('C', picks, cfg);
    return;
  }
  startWildcardSession('A', picks, { perEx: perEx, variantIds: ui._wcVariants || {} });
});

/* ---------- Modus C: Ablauf (AMRAP / EMOM) ---------- */
let modeCTimer = null;

function stopModeCTimer() {
  if (modeCTimer) clearInterval(modeCTimer);
  modeCTimer = null;
}
function mcElapsed(mc) {
  if (!mc.running || !mc.startedAt) return mc.elapsed || 0;
  return (mc.elapsed || 0) + (Date.now() - mc.startedAt) / 1000;
}
function emomIntervalsTotal(mc) {
  const n = Math.max(1, mc.exIds.length);
  return mc.order === 'all' ? mc.rounds : mc.rounds * n;
}
function mcRepsFor(mc, exId) {
  const p = mc.perEx && mc.perEx[exId] ? mc.perEx[exId] : null;
  return (p && typeof p.reps === 'number' && p.reps > 0) ? p.reps : 1;
}
function mcWeightFor(mc, exId) {
  const p = mc.perEx && mc.perEx[exId] ? mc.perEx[exId] : null;
  return (p && typeof p.w === 'number') ? p.w : null;
}
function mcBookSet(sess, exId) {
  const mc = sess.modeC;
  const slot = sess.slots.find(s => s.exerciseId === exId);
  if (!slot) return;
  slot.sets.push({ w: mcWeightFor(mc, exId), r: mcRepsFor(mc, exId), done: true });
  slot.targetSets = slot.sets.length;
  store.counters.completedSets++;
}
function mcClearSets(sess) {
  sess.slots.forEach(sl => { sl.sets = []; sl.targetSets = 0; });
}

/* Ton + Aufblinken beim Intervallwechsel (iOS Safari kennt keine Vibration) */
function mcBeep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!window._liftAudio) window._liftAudio = new Ctx();
    const ctx = window._liftAudio;
    if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.36);
  } catch (e) { /* Ton ist nur Zusatz */ }
}
function mcFlash() {
  const el = q('#mc-card');
  if (!el) return;
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
}

onAct('mc.start', () => {
  const sess = store.activeSession; if (!sess || !sess.modeC) return;
  const mc = sess.modeC;
  if (mc.finishedRun) return;
  mc.running = true;
  mc.startedAt = Date.now();
  mcBeep();
  saveStore();
  ensureModeCTimer();
  render();
});
onAct('mc.pause', () => {
  const sess = store.activeSession; if (!sess || !sess.modeC) return;
  const mc = sess.modeC;
  if (!mc.running) return;
  mc.elapsed = mcElapsed(mc);
  mc.running = false;
  mc.startedAt = null;
  stopModeCTimer();
  saveStore();
  render();
});
onAct('mc.next', () => {
  const sess = store.activeSession; if (!sess || !sess.modeC) return;
  const mc = sess.modeC;
  if (mc.type !== 'amrap' || !mc.running) return;
  const exId = mc.exIds[mc.curIdx];
  mcBookSet(sess, exId);
  mc.curIdx++;
  if (mc.curIdx >= mc.exIds.length) { mc.curIdx = 0; mc.curRound++; }
  saveStore();
  render();
});
onAct('mc.stop', () => {
  const sess = store.activeSession; if (!sess || !sess.modeC) return;
  confirmSheet({
    title: 'Ablauf beenden',
    text: 'Der Zeitablauf wird beendet und das Ergebnis erfasst.',
    okLabel: 'Beenden'
  }, () => { finalizeModeC(store.activeSession); });
});

function ensureModeCTimer() {
  if (modeCTimer) return;
  modeCTimer = setInterval(tickModeC, 200);
}
function tickModeC() {
  const sess = store.activeSession;
  if (!sess || !sess.modeC || !sess.modeC.running) { stopModeCTimer(); return; }
  const mc = sess.modeC;
  const el = q('#mc-clock');
  const sub = q('#mc-sub');
  const elapsed = mcElapsed(mc);

  if (mc.type === 'amrap') {
    const left = Math.max(0, mc.durationSec - elapsed);
    if (el) el.textContent = fmtSecs(Math.ceil(left));
    if (left <= 0) { finalizeModeC(sess); return; }
    return;
  }

  /* EMOM: läuft ohne Bestätigung durch */
  const total = emomIntervalsTotal(mc);
  const idx = Math.floor(elapsed / mc.intervalSec);
  const leftInInterval = mc.intervalSec - (elapsed - idx * mc.intervalSec);
  if (el) el.textContent = fmtSecs(Math.ceil(Math.max(0, leftInInterval)));

  while (mc.doneIntervals < Math.min(idx, total)) {
    bookEmomInterval(sess, mc.doneIntervals);
    mc.doneIntervals++;
    if (mc.doneIntervals < total) { mcBeep(); mcFlash(); }
  }
  if (mc.doneIntervals >= total) { finalizeModeC(sess); return; }
  if (sub) sub.textContent = emomSubline(mc);
}
function bookEmomInterval(sess, index) {
  const mc = sess.modeC;
  const n = mc.exIds.length;
  if (mc.order === 'all') mc.exIds.forEach(id => mcBookSet(sess, id));
  else mcBookSet(sess, mc.exIds[index % n]);
  mc.completedRounds = mc.order === 'all' ? (index + 1) : Math.floor((index + 1) / n);
  saveStore();
}
function emomSubline(mc) {
  const n = Math.max(1, mc.exIds.length);
  const total = emomIntervalsTotal(mc);
  const cur = Math.min(total, mc.doneIntervals + 1);
  if (mc.order === 'all') return 'Runde ' + cur + ' von ' + mc.rounds + ' · alle Übungen';
  const round = Math.floor(mc.doneIntervals / n) + 1;
  const inRound = (mc.doneIntervals % n) + 1;
  return 'Runde ' + Math.min(round, mc.rounds) + ' von ' + mc.rounds + ' · Übung ' + inRound + ' von ' + n;
}
function emomCurrentExercise(mc) {
  if (mc.order === 'all') return null;
  const n = Math.max(1, mc.exIds.length);
  const currentIndex = Math.floor(mcElapsed(mc) / mc.intervalSec);
  const intervalIndex = Math.min(mc.doneIntervals, emomIntervalsTotal(mc) - 1);
  return mc.exIds[((Math.max(currentIndex, intervalIndex)) % n)];
}

function finalizeModeC(sess) {
  timerEndHaptic();
  const mc = sess.modeC;
  mc.elapsed = Math.min(mcElapsed(mc), mc.type === 'amrap' ? mc.durationSec : emomIntervalsTotal(mc) * mc.intervalSec);
  mc.running = false;
  mc.startedAt = null;
  mc.finishedRun = true;
  stopModeCTimer();

  if (mc.type === 'amrap') {
    mc.completedRounds = Math.max(0, mc.curRound - 1);
    mc.partialReps = mc.curIdx;
    saveStore();
    openSheet({
      title: 'Zeit ist um',
      sub: mc.completedRounds + ' volle Runden erfasst',
      body: '<div class="stack">' +
        '<div class="field-block"><label>Übungen in der angebrochenen Runde</label>' +
          '<input class="input" type="number" inputmode="numeric" min="0" max="' + Math.max(0, mc.exIds.length - 1) + '" ' +
          'value="' + mc.partialReps + '" data-change="mc.partial"></div>' +
        '<p class="tiny muted">Ergebnis: ' + mc.completedRounds + ' Runden + ' + mc.partialReps + ' Übungen.</p>' +
        '<button class="btn primary block" data-act="mc.confirmEnd">Ergebnis übernehmen</button>' +
      '</div>'
    });
    return;
  }

  const total = emomIntervalsTotal(mc);
  mc.completedRounds = mc.order === 'all' ? mc.doneIntervals : Math.floor(mc.doneIntervals / Math.max(1, mc.exIds.length));
  saveStore();
  openSheet({
    title: 'Alle ' + mc.rounds + ' Runden geschafft?',
    sub: 'Erfasst: ' + mc.completedRounds + ' Runden',
    body: '<div class="stack">' +
      '<button class="btn primary block" data-act="mc.confirmEnd">Ja, alle geschafft</button>' +
      '<div class="field-block"><label>Anzahl anpassen</label>' +
        '<input class="input" type="number" inputmode="numeric" min="0" max="' + mc.rounds + '" ' +
        'value="' + mc.completedRounds + '" data-change="mc.adjust"></div>' +
      '<p class="tiny muted">Weniger Runden entfernen die zu viel verbuchten Sätze.</p>' +
      '<button class="btn ghost block" data-act="mc.confirmEnd">Übernehmen</button>' +
    '</div>'
  });
}
onAct('mc.partial', (d, el) => {
  const sess = store.activeSession; if (!sess || !sess.modeC) return;
  const v = parseInt(String(el.value).trim(), 10);
  sess.modeC.partialReps = isFinite(v) && v > 0 ? Math.min(v, Math.max(0, sess.modeC.exIds.length - 1)) : 0;
  saveStore();
});
onAct('mc.adjust', (d, el) => {
  const sess = store.activeSession; if (!sess || !sess.modeC) return;
  const mc = sess.modeC;
  const v = parseInt(String(el.value).trim(), 10);
  const rounds = isFinite(v) && v > 0 ? Math.min(v, mc.rounds) : 0;
  mc.completedRounds = rounds;
  /* Sätze neu verbuchen, damit Volumen und Runden zusammenpassen */
  mcClearSets(sess);
  const n = Math.max(1, mc.exIds.length);
  const intervals = mc.order === 'all' ? rounds : rounds * n;
  mc.doneIntervals = intervals;
  for (let i = 0; i < intervals; i++) {
    if (mc.order === 'all') mc.exIds.forEach(id => mcBookSet(sess, id));
    else mcBookSet(sess, mc.exIds[i % n]);
  }
  saveStore();
});
onAct('mc.confirmEnd', () => {
  closeSheet();
  saveStore();
  render();
});

function renderModeCRunner(sess) {
  const mc = sess.modeC;
  const isAmrap = mc.type === 'amrap';
  const elapsed = mcElapsed(mc);
  const clock = isAmrap
    ? Math.max(0, Math.ceil(mc.durationSec - elapsed))
    : Math.ceil(Math.max(0, mc.intervalSec - (elapsed % mc.intervalSec)));
  let html = '<div class="stack">';

  if (mc.finishedRun) {
    html += '<div class="card"><div class="kicker">' + esc(isAmrap ? 'AMRAP beendet' : 'EMOM beendet') + '</div>' +
      '<div class="card-title">' + mc.completedRounds + ' Runden' +
        (isAmrap && mc.partialReps ? ' + ' + mc.partialReps + ' Übungen' : '') + '</div>' +
      '<div class="card-sub">' + esc(mc.name) + '</div>';
    const rec = conditioningRecord(mc.name);
    if (rec) html += '<div class="hint neutral mt">Bisheriger Rekord: ' + rec.bestRounds + ' Runden' +
      (rec.bestPartial ? ' + ' + rec.bestPartial : '') + '</div>';
    html += '<button class="btn primary block big mt" data-act="session.finish">Einheit beenden</button></div>';
  } else {
    const curEx = isAmrap ? mc.exIds[mc.curIdx] : emomCurrentExercise(mc);
    html += '<div class="active-card" id="mc-card">' +
      '<div class="kicker">' + esc(isAmrap ? 'AMRAP' : 'EMOM') + ' · ' + esc(mc.name) + '</div>' +
      '<div class="mc-clock" id="mc-clock">' + esc(fmtSecs(clock)) + '</div>' +
      '<div class="mc-sub" id="mc-sub">' + esc(isAmrap
        ? ('Runde ' + mc.curRound + ' · Übung ' + (mc.curIdx + 1) + ' von ' + mc.exIds.length)
        : emomSubline(mc)) + '</div>';

    if (curEx) {
      html += '<div class="mc-ex">' + esc(exerciseName(curEx)) + '</div>' +
        '<div class="mc-target">' + mcRepsFor(mc, curEx) + ' Wdh.' +
        (mcWeightFor(mc, curEx) !== null ? ' · ' + esc(fmtKg(mcWeightFor(mc, curEx))) : '') + '</div>';
    } else {
      html += '<div class="mc-ex">Alle Übungen pro Intervall</div>' +
        '<div class="mc-target">' + mc.exIds.map(id =>
          esc(exerciseName(id)) + ' ' + mcRepsFor(mc, id) + '×').join(' · ') + '</div>';
    }

    html += '<div class="row mt">';
    if (!mc.running) {
      html += '<button class="btn primary big" style="flex:1" data-act="mc.start">' +
        (elapsed > 0 ? 'Fortsetzen' : 'Ablauf starten') + '</button>';
    } else {
      if (isAmrap) html += '<button class="btn primary big" style="flex:1" data-act="mc.next">Übung geschafft</button>';
      html += '<button class="btn ghost big" ' + (isAmrap ? '' : 'style="flex:1"') + ' data-act="mc.pause">Pause</button>';
    }
    html += '</div>';
    html += '<button class="btn ghost block mt" data-act="mc.stop">Ablauf beenden</button>';
    html += '</div>';
  }

  html += kicker('Übungen');
  html += '<div class="list">' + sess.slots.map(sl =>
    '<div class="list-item">' +
      '<div class="li-main"><div class="li-name">' + esc(exerciseName(sl.exerciseId)) + '</div>' +
      '<div class="li-meta">' + esc(CATEGORIES[sl.category] || sl.category) + ' · ' +
        sl.sets.filter(s => s.done).length + ' Sätze verbucht</div></div>' +
      '<div class="li-right">' + (sl.targetWeight !== null && sl.targetWeight !== undefined ? esc(fmtKg(sl.targetWeight)) : '—') + '</div>' +
    '</div>').join('') + '</div>';
  html += '<div class="hint neutral">Zeitbasierte Einheiten erzeugen keine Kraft-PRs. Das Volumen zählt mit, der Rundenrekord steht im Fortschritt.</div>';
  html += '<button class="btn ghost block" data-act="session.finish">Einheit beenden</button>';
  html += '<button class="btn danger block" data-act="session.discard">Einheit verwerfen</button>';
  html += '</div>';
  return html;
}

/* ---------- Rendering: Training-Screen (§23.3) ---------- */
function renderTraining() {
  const sess = store.activeSession;
  let html = kicker('Training') + screenTitle('Training');

  /* Tageskarten horizontal (§23.3) */
  const activeDayId = sess ? sess.dayId : ui.selectedDay;
  html += '<div class="daystrip">' + DAYS.map(d => {
    const on = d.id === activeDayId;
    const meta = d.type === 'fixed' ? d.slots.length + ' Übungen'
      : (d.type === 'powerlifting' ? '3 Haupt + 0–3' : 'variabel');
    return '<button class="daycard ' + (on ? 'on' : '') + '" data-act="day.select" data-day="' + d.id + '"' +
      (sess ? ' disabled' : '') + '>' +
      '<span class="d-id">' + esc(d.short) + (d.optional ? ' · optional' : '') + '</span>' +
      '<span class="d-name">' + esc(d.name) + '</span>' +
      '<span class="d-meta">' + esc(meta) + '</span>' +
    '</button>';
  }).join('') + '</div>';

  /* Equipment-Umschalter (§3, §23.3) — am Wildcard-Tag entfällt er,
     dort steuert die Quelle der Übungsauswahl (Abweichung auf Wunsch des Spec-Owners) */
  const dayForStrip = getDay(activeDayId);
  if (!dayForStrip || dayForStrip.type !== 'wildcard') {
  html += '<div class="segmented mb">' + EQUIPMENT_MODES.map(m =>
    '<button class="' + (store.equipmentMode === m.id ? 'on' : '') + '" data-act="equip.set" data-mode="' + m.id + '">' +
    esc(m.label) + '</button>').join('') + '</div>';
  }

  if (!sess) return html + renderDayPreview(getDay(ui.selectedDay));
  return html + renderActiveSession(sess);
}

function renderDayPreview(day) {
  let html = '<div class="stack">';
  html += '<div class="card"><div class="kicker">' + esc(day.short) + (day.optional ? ' · optional' : '') + '</div>' +
    '<div class="card-title">' + esc(day.name) + '</div>' +
    '<div class="card-sub">' + esc(gymLabel(store.gymId)) + ' · ' +
      esc((EQUIPMENT_MODES.find(m => m.id === store.equipmentMode) || {}).label) + '</div>' +
    (day.type === 'wildcard' ? '' :
      '<button class="btn primary block big mt" data-act="session.start">' +
        (day.type === 'fixed' ? 'Einheit starten' : 'Powerlifting einrichten') +
      '</button>') + '</div>';

  if (day.type === 'wildcard') {
    /* §8 / §20.4: alle drei Modi direkt sichtbar, jeder mit eigenem Start-Button */
    html += kicker('Drei Modi');
    html += wcCard('A', 'Freie Zusammenstellung', 'Beliebig viele Slots aus der gesamten Bibliothek, normale Progression.');
    html += wcCard('B', 'Kraft & PR-Versuch', '1–2 schwere Compounds, Warm-up und PR-Versuch. Auch Wiederholungs-PRs werden gefeiert.');
    html += wcCard('C', 'Zeitbasiert (AMRAP / EMOM)', 'Dauer, Übungen und Zielreps. Ergebnisse zählen nicht in normale Kraft-PRs.');
  } else if (day.type === 'fixed') {
    html += '<button class="btn ghost block mb" data-act="day.edit" data-day="' + esc(day.id) + '">Training bearbeiten</button>';
    html += kicker('Übungen') + '<div class="list">' + day.slots.map(sd => {
      const exId = resolveSlotExercise(day.id, sd, store.equipmentMode);
      const last = lastWeightFor(exId, currentScope());
      return '<div class="list-item">' +
        '<div class="li-main"><div class="li-name">' + esc(exerciseName(exId)) + '</div>' +
        '<div class="li-meta">' + esc(CATEGORIES[sd.category]) + ' · ' + sd.sets + ' × ' + esc(sd.reps) +
          ' · Pause ' + sd.rest + 's</div></div>' +
        '<div class="li-right">' + (last !== null ? esc(fmtKg(last)) + (isPerHand(exId) ? '<br><span class="tiny">je Hantel</span>' : '') : '—') + '</div>' +
      '</div>';
    }).join('') + '</div>';
  } else if (day.type === 'powerlifting') {
    html += kicker('Training-Max') + plTilesHtml();
  }
  html += '</div>';
  return html;
}

function plTilesHtml() {
  const ids = Object.keys(store.powerlifting.tm).slice(0, 3);
  if (!ids.length) return emptyBox('Noch kein Training-Max hinterlegt — beim Einrichten festlegen.');
  return '<div class="tiles">' + ids.map(id =>
    '<div class="tile"><div class="tl-lb">' + esc(exerciseName(id)) + '</div>' +
    '<div class="tl-v">' + esc(fmtKg(store.powerlifting.tm[id])) + '</div>' +
    '<div class="tiny muted">5×5 @ ' + esc(fmtKg(round25(store.powerlifting.tm[id] * 0.8))) + '</div></div>'
  ).join('') + '</div>';
}

/* Cardio-Satzzeilen: Intensität frei, Dauer mit Stoppuhr, Distanz optional */
function cardioSetsHtml(slot, ki) {
  const hasDist = cardioHasDistance(slot.exerciseId);
  const running = cardioTimer.handle && cardioTimer.slotKey === slot.slotKey;
  return '<div class="stack mt" style="gap:10px">' + slot.sets.map((s, i) => {
    const isCur = i === ki;
    const mins = Math.floor((s.sec || 0) / 60), secs = (s.sec || 0) % 60;
    const isCustom = s._custom === true || (typeof s.dist === 'number' && CARDIO_DISTANCES.indexOf(s.dist) === -1);
    const dis = s.done ? 'disabled ' : '';
    if (!isCur && !s.done && s.skip !== true) return '';
    return '<div class="card pad-s ' + (s.skip === true ? 'skipped' : '') + '"' +
      (s.skip === true ? ' style="opacity:.42"' : '') + '>' +
      '<div class="row-between"><div class="kicker">Einheit ' + (i + 1) + '</div>' +
        '<div>' + (s.done ? '✓' : (s.skip === true ? 'nicht ausgeführt' : '')) + '</div></div>' +
      '<div class="cardio-grid mt">' +
        '<div class="field-block"><label>Intensität</label>' +
          '<input class="input" type="number" inputmode="decimal" step="0.5" placeholder="z. B. 8" ' +
          'value="' + (s.intensity === null || s.intensity === undefined ? '' : s.intensity) + '" ' + dis +
          'data-change="cardio.intensity" data-slot="' + esc(slot.slotKey) + '" data-i="' + i + '"></div>' +
        '<div class="field-block"><label>Minuten</label>' +
          '<input class="input" type="number" inputmode="numeric" min="0" placeholder="0" ' +
          'value="' + (mins || '') + '" ' + dis +
          'data-change="cardio.min" data-slot="' + esc(slot.slotKey) + '" data-i="' + i + '"></div>' +
        '<div class="field-block"><label>Sekunden</label>' +
          '<input class="input" type="number" inputmode="numeric" min="0" max="59" placeholder="0" ' +
          'value="' + (secs || '') + '" ' + dis +
          'data-change="cardio.sec" data-slot="' + esc(slot.slotKey) + '" data-i="' + i + '"></div>' +
      '</div>' +
      (hasDist ?
        '<div class="cardio-grid mt">' +
          '<div class="field-block" style="flex:2"><label>Distanz (optional)</label>' +
            '<select class="input" ' + dis + 'data-change="cardio.dist" data-slot="' + esc(slot.slotKey) + '" data-i="' + i + '">' +
              '<option value=""' + (!isCustom && (s.dist === null || s.dist === undefined) ? ' selected' : '') + '>keine</option>' +
              CARDIO_DISTANCES.map(m => '<option value="' + m + '"' + (!isCustom && s.dist === m ? ' selected' : '') + '>' +
                esc(fmtMeters(m)) + '</option>').join('') +
              '<option value="custom"' + (isCustom ? ' selected' : '') + '>eigene Distanz</option>' +
            '</select></div>' +
          (isCustom ? '<div class="field-block" style="flex:1"><label>Meter</label>' +
            '<input class="input" type="number" inputmode="numeric" min="1" placeholder="m" ' +
            'value="' + (typeof s.dist === 'number' ? s.dist : '') + '" ' + dis +
            'data-change="cardio.distFree" data-slot="' + esc(slot.slotKey) + '" data-i="' + i + '"></div>' : '') +
        '</div>' +
        (isCustom ? '<p class="tiny muted" style="margin-top:6px">Eigene Distanzen zählen nicht für Bestzeiten.</p>' : '')
        : '') +
      (isCur && !s.done ?
        '<div class="row-between mt"><span class="cardio-clock" id="cardio-timer">' + esc(fmtSecs(s.sec || 0)) + '</span>' +
        '<button class="btn sm ' + (running ? 'danger' : 'ghost') + '" data-act="cardio.timer" data-slot="' + esc(slot.slotKey) + '" data-i="' + i + '">' +
        (running ? 'Stoppuhr stoppen' : 'Stoppuhr starten') + '</button></div>' : '') +
    '</div>';
  }).join('') + '</div>';
}

/* Modus B: Zielanzeige über den Versuchen */
function modeBTargetHtml(sess, slot) {
  if (!sess.modeB || sess.modeB.mainId !== slot.exerciseId) return '';
  const b = sess.modeB;
  const scope = sessionExerciseScope(sess, slot.exerciseId);
  const pr = getPr(scope, slot.exerciseId);
  const best = pr && typeof pr.best_weight === 'number' ? pr.best_weight : null;
  const repsAtBest = (pr && best !== null && pr.prByWeight) ? pr.prByWeight[String(best)] : null;
  return '<div class="tiles mt">' +
    '<div class="tile"><div class="tl-lb">Bestgewicht</div><div class="tl-v">' +
      esc(best !== null ? fmtKg(best) : '—') + '</div>' +
      '<div class="tiny muted">' + esc(scopeLabel(scope)) + '</div></div>' +
    '<div class="tile"><div class="tl-lb">Max. Wdh. dabei</div><div class="tl-v">' + (repsAtBest || '—') + '</div></div>' +
    '<div class="tile"><div class="tl-lb">Gesch. 1RM</div><div class="tl-v">' +
      esc(pr && typeof pr.best_1rm === 'number' ? fmtKg(pr.best_1rm) : '—') + '</div>' +
      '<div class="tiny muted">' + esc(b.prKind === 'reps' ? 'Ziel: Wdh.' : 'Ziel: Gewicht') + '</div></div>' +
  '</div>';
}

function renderActiveSession(sess) {
  /* Zeitbasierte Einheit hat einen eigenen Ablauf */
  if (sess.mode === 'C' && sess.modeC) return renderModeCRunner(sess);

  const si = activeSlotIndex(sess);
  let html = '<div class="stack">';

  if (si < 0) {
    html += '<div class="card"><div class="card-title">Alle Übungen erledigt</div>' +
      '<div class="card-sub">Volumen dieser Einheit: ' + esc(fmtNum(sessionVolume(sess))) + ' kg' +
        (sessionCardioSecs(sess) > 0 ? ' · ' + Math.round(sessionCardioSecs(sess) / 60) + ' Cardio-Minuten' : '') + '</div>' +
      '<button class="btn primary block big mt" data-act="session.finish">Einheit beenden</button></div>';
  } else {
    const slot = sess.slots[si];
    const ki = currentSetIndex(slot);
    const bw = isBodyweightExercise(slot.exerciseId);
    const rl = restLeft();
    const cardio = slot.isCardio === true;

    const exerciseVariants = (store.exerciseVariants || []).filter(v => v.gymId === sess.gymId && v.exerciseId === slot.exerciseId);
    html += '<div class="active-card">' +
      '<div class="active-head">' +
        '<div style="flex:1;min-width:0">' +
          '<div class="active-name">' + esc(exerciseName(slot.exerciseId)) + '</div>' +
          (sess.equipment === 'studio'
            ? '<div class="field-block mt"><label>Maschinenvariante</label><select class="input" data-change="set.variant" data-slot="' + esc(slot.slotKey) + '">' +
              '<option value=""' + (!slot.variantId ? ' selected' : '') + '>Standard / keine Angabe</option>' +
              exerciseVariants.map(v => '<option value="' + esc(v.id) + '"' + (slot.variantId === v.id ? ' selected' : '') + '>' + esc(v.name) + '</option>').join('') +
              '</select><button class="btn sm ghost mt" data-act="slot.variantAdd" data-slot="' + esc(slot.slotKey) + '">+ Variante für diese Übung</button></div>'
            : '') +
          '<div class="active-target">' + esc(slot.slotName || '') +
          ' · Ziel <button class="btn sm ghost" data-act="target.edit" data-slot="' + esc(slot.slotKey) + '">' + esc(slot.targetReps) + ' Wdh.</button>' +
            (cardio ? ' · Dauer und Intensität eintragen'
                    : ' · ' + slot.targetSets + ' × ' + esc(slot.targetReps) + ' Wdh.') +
            (slot.isPowerliftingMain ? ' · 80 % TM' : '') + '</div>' +
        '</div>' +
        '<div class="timer" id="rest-timer">' + (rl > 0 ? esc(fmtDuration(rl)) : '') + '</div>' +
      '</div>';

    if (cardio) html += cardioSetsHtml(slot, ki);
    else html += modeBTargetHtml(sess, slot) + '<div class="stack mt" style="gap:6px">' + slot.sets.map((s, i) => {
      const isCur = i === ki;
      const wPlaceholder = slot.isPowerliftingMain && s.w === null ? 'TM festlegen' : (bw ? '+ Zusatz' : 'kg');
      const label = s.warmup === true
        ? 'Aufwärmen' + (s.pct ? ' ' + s.pct + ' %' : '')
        : (s.attempt === true ? 'Versuch ' + (s.tr || (i + 1)) : null);
      const pr = getPr(currentExerciseScope(slot.exerciseId), slot.exerciseId);
      const prAtWeight = s.w && pr && pr.prByWeight ? pr.prByWeight[String(s.w)] : null;
      return '<div class="setrow ' + (isCur ? 'current' : '') +
        (s.skip === true ? ' skipped' : '') + (s.warmup === true ? ' warmup' : '') + '">' +
        '<span class="set-no">' + (label ? esc(label) : (i + 1)) + '</span>' +
        '<div class="field">' + (i === 0 ? '<div class="field-label">Gewicht</div>' : '') +
          '<input class="num" type="number" inputmode="decimal" step="0.5" placeholder="' + esc(wPlaceholder) + '" ' +
          'value="' + (s.w === null || s.w === undefined ? '' : s.w) + '" ' +
          (s.done ? 'disabled ' : '') + 'data-input="set.w" data-slot="' + esc(slot.slotKey) + '" data-i="' + i + '"></div>' +
        '<div class="field">' + (i === 0 ? '<div class="field-label">Wdh.</div>' : '') +
          '<input class="num" type="number" inputmode="numeric" min="1" placeholder="' + esc(prAtWeight ? String(prAtWeight) : 'Wdh.') + '" ' +
          'value="' + (s.r ? s.r : '') + '" ' +
          (s.done ? 'disabled ' : '') + 'data-input="set.r" data-slot="' + esc(slot.slotKey) + '" data-i="' + i + '"></div>' +
        '<span class="statusdot ' + (s.done ? 'done' : '') + '">' +
          (s.done ? '✓' : (s.skip === true ? '–' : '')) + '</span>' +
      '</div>' +
      (s.skip === true ? '<div class="tiny muted" style="padding-left:34px">nicht ausgeführt</div>' : '');
    }).join('') + '</div>';

    if (!cardio && isPerHand(slot.exerciseId)) html += '<div class="per-hand">Gewicht je Hantel</div>';
    if (!cardio && bw) html += '<div class="hint neutral">Körpergewichtsübung — Gewichtsfeld optional als Zusatzgewicht.</div>';
    if (cardio) html += '<div class="hint neutral">Zählt nicht in das kg-Volumen. Freie Distanzen werden nicht als Bestzeit gewertet.</div>';

    const range = parseRepRange(slot.targetReps);
    const doneSets = slot.sets.filter(s => s.done && s.warmup !== true);
    if (!cardio && doneSets.length && doneSets.every(s => s.r >= range.max) && ki >= 0) {
      html += '<div class="hint">Gewicht erhöhen — bisherige Sätze im oberen Rep-Bereich.</div>';
    }
    if ((store.plateauStreak[slot.exerciseId] || 0) >= 3 && store.plateauMode[slot.exerciseId] !== 'dismissed') {
      html += '<div class="hint">Plateau: Keine Verbesserung in 3 aufeinanderfolgenden Sessions — Vergleich mit mindestens 3 der letzten 5 Sessions bei gleichem Gewicht. ' +
        '<button class="btn sm ghost" style="margin-left:6px" data-act="plateau.dismiss" data-id="' + esc(slot.exerciseId) + '">Ignorieren</button></div>';
    }

    const currentSet = slot.sets[Math.max(0, ki)] || {};
    const previousNote = currentSet.note ? null : lastNoteForExercise(slot.exerciseId, sess.gymId);
    html += '<textarea class="note" placeholder="' + esc(previousNote || 'Notiz zum aktuellen Satz (optional)') + '" data-input="set.note" data-slot="' +
      esc(slot.slotKey) + '">' + esc(currentSet.note || '') + '</textarea>';

    html += '<div class="row mt">' +
      '<button class="btn primary big" style="flex:1" data-act="set.confirm">Satz bestätigen</button>' +
      '<button class="icon-btn" data-act="set.reset" title="Letzten Satz zurücksetzen" aria-label="Letzten Satz zurücksetzen">↺</button>' +
      '<button class="icon-btn" data-act="slot.open" data-slot="' + esc(slot.slotKey) + '" title="Übung tauschen" aria-label="Übung tauschen">⇄</button>' +
    '</div>';
    html += '</div>';
  }

  /* Slot-Liste des Tages (§23.3) */
  html += kicker('Einheit — ' + getDay(sess.dayId).name +
    (sess.mode ? ' · Modus ' + sess.mode : ''));
  html += '<div class="list">' + sess.slots.map((sl, i) => {
    const doneN = sl.sets.filter(s => s.done).length;
    const planned = Math.max(sl.targetSets || 0, sl.sets.length);
    const lastW = (sl.sets.filter(s => s.done).slice(-1)[0] || {}).w;
    const cardioSl = sl.isCardio === true;
    const doneCardio = sl.sets.filter(s => s.done).reduce((a, s) => a + (s.sec || 0), 0);
    const meta = cardioSl
      ? (CATEGORIES[sl.category] || 'Cardio') + (sl.optional ? ' · optional' : '') +
        (sl.skipped ? ' · übersprungen' : ' · ' + (doneCardio > 0 ? fmtSecs(doneCardio) : 'noch offen'))
      : (CATEGORIES[sl.category] || sl.category) + ' · ' + sl.targetSets + ' × ' + sl.targetReps +
        (sl.skipped ? ' · übersprungen' : ' · ' + doneN + ' von ' + planned + ' Sätzen');
    return '<button class="list-item ' + (i === si ? 'is-active' : '') + (sl.skipped ? ' is-skipped' : '') + '" ' +
      'data-act="slot.jump" data-slot="' + esc(sl.slotKey) + '">' +
      '<div class="li-main">' +
        '<div class="li-name">' + esc(exerciseName(sl.exerciseId)) + '</div>' +
        '<div class="li-meta">' + esc(meta) + '</div>' +
      '</div>' +
      '<div class="li-right">' + (sl.skipped ? '<span class="badge">übersprungen</span>'
        : (cardioSl ? (doneCardio > 0 ? esc(fmtSecs(doneCardio)) : '—')
          : (lastW !== undefined && lastW !== null ? esc(fmtKg(lastW)) : (sl.targetWeight !== null && sl.targetWeight !== undefined ? esc(fmtKg(sl.targetWeight)) : '—')))) + '</div>' +
    '</button>';
  }).join('') + '</div>';

  /* Optionaler Cardio-Abschluss — an allen Tagen außer Powerlifting (§8) */
  if (sess.dayId !== 'd6') {
    html += '<button class="btn ghost block" data-act="cardio.add">+ Cardio hinzufügen (optional)</button>';
  }

  html += '<button class="btn ghost block" data-act="session.savePlan">Aktuelles Training speichern</button>';
  html += '<button class="btn ghost block" data-act="session.finish">Einheit beenden</button>';
  html += '<button class="btn danger block" data-act="session.discard">Einheit verwerfen</button>';
  html += '</div>';
  return html;
}

onAct('session.savePlan', () => {
  const sess = store.activeSession; if (!sess) return;
  openSheet({
    title: 'Training speichern', sub: 'Als benannten Plan',
    body: '<div class="stack"><div class="field-block"><label>Planname</label><input class="input" id="save-plan-name" value="' + esc(sess.name || getDay(sess.dayId).name || '') + '"></div>' +
      '<button class="btn primary block" data-act="session.savePlanConfirm">Speichern</button></div>'
  });
});
 onAct('session.savePlanConfirm', () => {
  const sess = store.activeSession; if (!sess) return;
  const name = String((q('#save-plan-name') || {}).value || '').trim();
  if (!name) { toast('Bitte einen Namen eingeben', { level: 0 }); return; }
  const slots = sess.slots.filter(sl => !sl.skipped).map(sl => ({
    slotKey: 'plan_' + uid('s'), exerciseId: sl.exerciseId, name: sl.slotName || exerciseName(sl.exerciseId),
    category: sl.category, sets: sl.targetSets || sl.sets.length || 3, reps: sl.targetReps || '8–12', rest: sl.restSec || 90
  }));
  if (!slots.length) { toast('Keine Übungen zum Speichern', { level: 0 }); return; }
  store.namedTrainingPlans.push({ id: uid('plan'), name: name, slots: slots, updatedAt: nowTs() });
  saveStore(); closeSheet(); toast('Training gespeichert', { level: 2, sub: name });
});

onAct('target.edit', d => {
  const sess = store.activeSession; if (!sess) return;
  const slot = sess.slots.find(s => s.slotKey === d.slot); if (!slot) return;
  const range = exerciseRepTarget(slot.exerciseId) || parseRepRange(slot.targetReps);
  openSheet({
    title: 'Wiederholungsziel',
    sub: exerciseName(slot.exerciseId),
    body: '<div class="stack">' +
      '<div class="cardio-grid">' +
        '<div class="field-block"><label>Mindest-Wdh.</label><input class="input" type="number" min="1" id="target-min" value="' + range.min + '"></div>' +
        '<div class="field-block"><label>Maximal-Wdh.</label><input class="input" type="number" min="1" id="target-max" value="' + range.max + '"></div>' +
      '</div>' +
      '<button class="btn primary block" data-act="target.save" data-slot="' + esc(slot.slotKey) + '">Ziel speichern</button>' +
    '</div>'
  });
});
 onAct('target.save', d => {
  const sess = store.activeSession; if (!sess) return;
  const slot = sess.slots.find(s => s.slotKey === d.slot); if (!slot) return;
  const min = parseInt(String((q('#target-min') || {}).value || ''), 10);
  const max = parseInt(String((q('#target-max') || {}).value || ''), 10);
  if (!setExerciseRepTarget(slot.exerciseId, min, max)) { toast('Bitte ein gültiges Ziel eingeben', { level: 0 }); return; }
  slot.targetReps = min + '–' + max;
  store.plateauStreak[slot.exerciseId] = 0;
  store.plateauMode[slot.exerciseId] = null;
  saveStore();
  closeSheet();
  render();
  toast('Wiederholungsziel gespeichert', { level: 2, sub: min + '–' + max + ' Wdh.' });
});

onAct('plateau.dismiss', d => {
  store.plateauMode[d.id] = 'dismissed';
  store.plateauDismissed[d.id] = nowTs();
  saveStore();
  render();
});

/* Timer nach Re-Render weiterlaufen lassen */
function afterRenderTraining() {
  if (restTimer.slotKey && restLeft() <= 0) clearRestTimer();
  /* Zeitablauf nach Re-Render bzw. App-Neustart weiterlaufen lassen */
  const sess = store.activeSession;
  if (sess && sess.modeC && sess.modeC.running) {
    if (!sess.modeC.startedAt) sess.modeC.startedAt = Date.now();
    ensureModeCTimer();
  } else if (!sess || !sess.modeC) {
    stopModeCTimer();
  }
  /* gewählten Tag in der horizontalen Leiste sichtbar halten (§23.3) */
  const strip = q('.daystrip');
  const active = q('.daystrip .daycard.on');
  if (strip && active) {
    const left = active.offsetLeft - (strip.clientWidth - active.offsetWidth) / 2;
    strip.scrollLeft = Math.max(0, left);
  }
}
