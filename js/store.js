/* Lift — Store, Migration, PR-Logik (§17, §12, §32.2, §32.4)
   Ein einziger localStorage-Key (§1.2). */
'use strict';

const STORE_KEY = 'lift.store';   /* §1.2 — ein einziger Store-Key */
const STORE_VERSION = 8;          /* §17 / §28 */

let store = null;

/* ---------- Hilfsfunktionen ---------- */

function clone(v) { return JSON.parse(JSON.stringify(v)); }
function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function nowTs() { return Date.now(); }
function todayISO() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function uid(prefix) {
  return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
/* §32.4 Rundung auf die nächsten 2,5 kg */
function round25(kg) {
  if (typeof kg !== 'number' || !isFinite(kg)) return null;
  return Math.round(kg / 2.5) * 2.5;
}
/* §12 Epley */
function epley1RM(w, r) {
  if (typeof w !== 'number' || !isFinite(w) || w <= 0) return null;
  if (typeof r !== 'number' || !isFinite(r) || r <= 0) return null;
  return Math.round(w * (1 + r / 30) * 10) / 10;
}

/* ---------- Default-Store (§17) ---------- */

function defaultStore() {
  return {
    version: STORE_VERSION,
    gymId: 'crunchfit',
    bodyweightKg: 75,
    equipmentMode: 'studio',
    customGyms: [],
    customExercises: [],
    exerciseVariants: [],
    activeExerciseVariants: {},
    customFixedPlans: {},
    namedTrainingPlans: [],
    slotOverrides: {},
    painFlags: {},
    prs: {},
    sessions: [],
    swapLog: [],
    plateauStreak: {},
    exerciseRepTargets: {},
    plateauMode: {},
    plateauDismissed: {},
    autoSwapAsked: {},
    counters: { completedSets: 0, workoutsCompleted: 0 },
    powerlifting: { tm: {}, streakNoProgress: {} },
    wildcard: { currentMode: null, modeC: null },
    /* Benannte Wildcard-Zusammenstellungen (Modus A und C), inkl. Gewichten */
    wildcardTemplates: [],
    /* Konditionierungs-Rekorde je Vorlagen-/Einheitsname (getrennt von Kraft-PRs) */
    conditioningRecords: {},
    activeSession: null,
    mobilityRoutine: clone(MOBILITY_DEFAULT),
    lastArchiveReminderAt: 0,
    errorLog: [],
    lastExportAt: null
  };
}

/* ---------- migrateStore (§1.8, §17, §28, §33) — idempotent ---------- */

function migrateStore(raw) {
  const s = isObj(raw) ? raw : {};
  const d = defaultStore();

  /* Skalare Felder */
  if (typeof s.gymId !== 'string' || !s.gymId) s.gymId = d.gymId;
  if (typeof s.bodyweightKg !== 'number' || !isFinite(s.bodyweightKg)) s.bodyweightKg = d.bodyweightKg;
  if (['studio', 'barbell', 'bodyweight'].indexOf(s.equipmentMode) === -1) s.equipmentMode = d.equipmentMode;
  if (typeof s.lastArchiveReminderAt !== 'number') s.lastArchiveReminderAt = 0;
  if (!(typeof s.lastExportAt === 'number' || s.lastExportAt === null)) s.lastExportAt = null;
  if (s.lastExportAt === undefined) s.lastExportAt = null;

  /* Arrays */
  ['customGyms', 'customExercises', 'sessions', 'swapLog', 'errorLog'].forEach(k => {
    if (!Array.isArray(s[k])) s[k] = [];
  });
  /* §32.2 Ringpuffer max. 5 */
  if (s.errorLog.length > 5) s.errorLog = s.errorLog.slice(-5);

  /* Objekte */
  ['slotOverrides', 'painFlags', 'prs', 'plateauStreak', 'exerciseRepTargets', 'plateauMode',
   'plateauDismissed', 'autoSwapAsked', 'conditioningRecords', 'customFixedPlans'].forEach(k => {
    if (!isObj(s[k])) s[k] = {};
  });

  /* Varianten pro Stammübung und Gym absichern */
  if (!Array.isArray(s.exerciseVariants)) s.exerciseVariants = [];
  s.exerciseVariants = s.exerciseVariants.filter(isObj).map(v => ({
    id: typeof v.id === 'string' && v.id ? v.id : uid('ev'),
    gymId: typeof v.gymId === 'string' ? v.gymId : s.gymId,
    exerciseId: typeof v.exerciseId === 'string' ? v.exerciseId : '',
    name: typeof v.name === 'string' ? v.name.trim() : ''
  })).filter(v => v.exerciseId && v.name);
  if (!isObj(s.activeExerciseVariants)) s.activeExerciseVariants = {};
  if (!Array.isArray(s.namedTrainingPlans)) s.namedTrainingPlans = [];
  s.namedTrainingPlans = s.namedTrainingPlans.filter(isObj).map(p => ({
    id: typeof p.id === 'string' && p.id ? p.id : uid('plan'),
    name: typeof p.name === 'string' && p.name.trim() ? p.name.trim() : 'Unbenanntes Training',
    slots: Array.isArray(p.slots) ? p.slots.filter(isObj).map((slot, i) => ({
      slotKey: typeof slot.slotKey === 'string' ? slot.slotKey : 'plan_s' + (i + 1),
      exerciseId: typeof slot.exerciseId === 'string' ? slot.exerciseId : '',
      name: typeof slot.name === 'string' ? slot.name : 'Übung',
      category: CATEGORIES[slot.category] ? slot.category : 'abs',
      sets: Math.min(12, Math.max(1, typeof slot.sets === 'number' ? parseInt(slot.sets, 10) : 3)),
      reps: typeof slot.reps === 'string' ? slot.reps : '8–12',
      rest: Math.min(600, Math.max(0, typeof slot.rest === 'number' ? parseInt(slot.rest, 10) : 90))
    })) : [],
    updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : nowTs()
  }));

  /* Wildcard-Vorlagen absichern */
  if (!Array.isArray(s.wildcardTemplates)) s.wildcardTemplates = [];
  s.wildcardTemplates = s.wildcardTemplates.filter(isObj).map(t => ({
    id: typeof t.id === 'string' && t.id ? t.id : uid('wt'),
    name: typeof t.name === 'string' && t.name ? t.name : 'Ohne Namen',
    mode: (t.mode === 'A' || t.mode === 'C') ? t.mode : 'A',
    exerciseIds: Array.isArray(t.exerciseIds) ? t.exerciseIds.filter(x => typeof x === 'string') : [],
    config: isObj(t.config) ? t.config : {},
    updatedAt: typeof t.updatedAt === 'number' ? t.updatedAt : nowTs()
  }));

  /* Zähler */
  if (!isObj(s.counters)) s.counters = { completedSets: 0, workoutsCompleted: 0 };
  if (typeof s.counters.completedSets !== 'number') s.counters.completedSets = 0;
  if (typeof s.counters.workoutsCompleted !== 'number') s.counters.workoutsCompleted = 0;

  /* Powerlifting (§7.3) */
  if (!isObj(s.powerlifting)) s.powerlifting = { tm: {}, streakNoProgress: {} };
  if (!isObj(s.powerlifting.tm)) s.powerlifting.tm = {};
  if (!isObj(s.powerlifting.streakNoProgress)) s.powerlifting.streakNoProgress = {};

  /* Wildcard (§8) */
  if (!isObj(s.wildcard)) s.wildcard = { currentMode: null, modeC: null };
  if ([null, 'A', 'B', 'C'].indexOf(s.wildcard.currentMode) === -1) s.wildcard.currentMode = null;
  if (s.wildcard.modeC === undefined) s.wildcard.modeC = null;

  /* Aktive Session (§1.9 Autosave) */
  if (s.activeSession !== null && !isObj(s.activeSession)) s.activeSession = null;
  if (s.activeSession === undefined) s.activeSession = null;
  if (isObj(s.activeSession)) normalizeSession(s.activeSession);

  /* Mobility-Routine (§17, Anhang B) */
  if (!isObj(s.mobilityRoutine)) s.mobilityRoutine = clone(MOBILITY_DEFAULT);
  MOBILITY_SECTIONS.forEach(sec => {
    if (!Array.isArray(s.mobilityRoutine[sec.id])) {
      s.mobilityRoutine[sec.id] = clone(MOBILITY_DEFAULT[sec.id]);
    } else {
      s.mobilityRoutine[sec.id] = s.mobilityRoutine[sec.id]
        .filter(isObj)
        .map((p, i) => ({
          id: typeof p.id === 'string' && p.id ? p.id : uid('m'),
          name: typeof p.name === 'string' ? p.name : 'Position',
          /* §32.7 Mindestdauer 5 Sekunden */
          durationSec: Math.max(5, typeof p.durationSec === 'number' && isFinite(p.durationSec)
            ? Math.round(p.durationSec) : 30),
          side: p.side === true,
          order: i
        }));
    }
  });

  /* Sessions normalisieren (§10 w==0 → null, §5 skipped) */
  s.sessions = s.sessions.filter(isObj);
  s.sessions.forEach(normalizeSession);

  /* Umstieg auf v7: PRs werden nach Geltungsbereich statt nach Gym geführt.
     Umstieg auf v8: Der Geltungsbereich richtet sich nach der Übung selbst
     (Hantelübung → Hantel-Topf, Körpergewicht → Calisthenics, Maschine → Gym),
     nicht mehr nach dem Modus der Einheit. Beides wird über je einen Marker
     genau einmal ausgeführt → idempotent. */
  if (s.prScopePerExerciseV8 !== true) {
    rebuildPrsFromSessions(s);
    s.prScopeMigratedV7 = true;
    s.prScopePerExerciseV8 = true;
  }

  /* PRs: Struktur pro (scope, exerciseId) (§12) */
  Object.keys(s.prs).forEach(gid => {
    if (!isObj(s.prs[gid])) { s.prs[gid] = {}; return; }
    Object.keys(s.prs[gid]).forEach(exId => {
      const p = s.prs[gid][exId];
      if (!isObj(p)) { s.prs[gid][exId] = emptyPrBucket(); return; }
      if (isCardioExercise(exId)) {
        if (p.best_intensity === undefined) p.best_intensity = null;
        if (p.longest_total === undefined) p.longest_total = null;
        if (!isObj(p.longestByIntensity)) p.longestByIntensity = {};
        if (!isObj(p.bestTimeByDistance)) p.bestTimeByDistance = {};
        return;
      }
      if (p.best_weight === undefined) p.best_weight = null;
      if (p.max_reps === undefined) p.max_reps = null;
      if (p.best_1rm === undefined) p.best_1rm = null;
      if (!isObj(p.prByWeight)) p.prByWeight = {};
    });
  });

  /* Custom-Übungen absichern (§9.1) */
  s.customExercises = s.customExercises.filter(e => isObj(e) && typeof e.id === 'string' && e.id).map(e => ({
    id: e.id,
    name: typeof e.name === 'string' && e.name ? e.name : e.id,
    category: CATEGORIES[e.category] ? e.category : 'abs',
    equipment: Array.isArray(e.equipment) && e.equipment.length ? e.equipment : ['studio', 'barbell', 'bodyweight'],
    bodyweight: e.bodyweight === true,
    isCompound: e.isCompound === true,
    metric: e.metric === 'cardio' || e.category === 'cardio' ? 'cardio' : 'strength',
    hasDistance: e.hasDistance === true,
    isCustom: true,
    subcategory: typeof e.subcategory === 'string' ? e.subcategory : null,
    painCheck: e.painCheck === true
  }));

  /* Custom-Gyms absichern (§13) */
  s.customGyms = s.customGyms.filter(g => isObj(g) && typeof g.id === 'string' && g.id)
    .map(g => ({ id: g.id, label: typeof g.label === 'string' && g.label ? g.label : g.id }));

  /* painFlags: nur echte true-Werte behalten (§30) */
  Object.keys(s.painFlags).forEach(k => { if (s.painFlags[k] !== true) delete s.painFlags[k]; });

  /* §28 Version anheben */
  s.version = STORE_VERSION;

  /* Unbekannte Legacy-Felder werden bewusst nicht gelöscht (Robustheit §1.7),
     außer dem entfernten Streak-Feld (§23.6: kein entsprechendes Datenfeld im Store). */
  if ('streak' in s) delete s.streak;
  if ('dayStreak' in s) delete s.dayStreak;
  if ('powerliftingMode' in s) delete s.powerliftingMode; /* §19 */

  /* Defaults für alles, was noch fehlt */
  Object.keys(d).forEach(k => { if (s[k] === undefined) s[k] = d[k]; });

  return s;
}

function normalizeSession(sess) {
  if (typeof sess.id !== 'string' || !sess.id) sess.id = uid('s');
  if (typeof sess.dayId !== 'string') sess.dayId = 'd1';
  if (typeof sess.dateISO !== 'string') sess.dateISO = todayISO();
  if (typeof sess.gymId !== 'string') sess.gymId = 'crunchfit';
  if (['studio', 'barbell', 'bodyweight'].indexOf(sess.equipment) === -1) sess.equipment = 'studio';
  if ([null, 'A', 'B', 'C'].indexOf(sess.mode) === -1) sess.mode = null;
  if (sess.mode === undefined) sess.mode = null;
  sess.finished = sess.finished === true;
  sess.finishedEarly = sess.finishedEarly === true;
  if (!Array.isArray(sess.slots)) sess.slots = [];
  sess.slots = sess.slots.filter(isObj);
  sess.slots.forEach(slot => {
    if (typeof slot.slotKey !== 'string' || !slot.slotKey) slot.slotKey = uid('sk');
    if (typeof slot.exerciseId !== 'string') slot.exerciseId = '';
    if (typeof slot.variantId !== 'string') slot.variantId = null;
    if (typeof slot.originalExerciseId !== 'string') slot.originalExerciseId = slot.exerciseId;
    if (!CATEGORIES[slot.category]) {
      const ex = getExercise(slot.exerciseId);
      slot.category = ex ? ex.category : 'abs';
    }
    if (!Array.isArray(slot.sets)) slot.sets = [];
    const bw = isBodyweightExercise(slot.exerciseId);
    const cardio = isCardioExercise(slot.exerciseId);
    slot.sets = slot.sets.filter(isObj).map(st => {
      if (cardio) {
        const out = {
          intensity: (typeof st.intensity === 'number' && isFinite(st.intensity)) ? st.intensity : null,
          sec: (typeof st.sec === 'number' && isFinite(st.sec) && st.sec > 0) ? Math.round(st.sec) : 0,
          dist: (typeof st.dist === 'number' && isFinite(st.dist) && st.dist > 0) ? Math.round(st.dist) : null,
          done: st.done === true
        };
        if (st.skip === true) out.skip = true;
        if (typeof st.note === 'string' && st.note) out.note = st.note;
        return out;
      }
      let w = (typeof st.w === 'number' && isFinite(st.w)) ? st.w : null;
      /* §17: w == 0 bei Bodyweight-Sätzen auf null normalisieren (§10) */
      if (bw && w === 0) w = null;
      const out = {
        w: w,
        r: (typeof st.r === 'number' && isFinite(st.r)) ? st.r : 0,
        done: st.done === true
      };
      /* Nicht ausgeführter Satz: bleibt sichtbar, zählt aber nirgends mit */
      if (st.skip === true) out.skip = true;
      /* Aufwärmsatz (Wildcard Modus B): keine PR-Wertung */
      if (st.warmup === true) out.warmup = true;
      if (typeof st.pct === 'number' && isFinite(st.pct)) out.pct = st.pct;
      if (typeof st.tr === 'number' && isFinite(st.tr)) out.tr = st.tr;
      if (st.attempt === true) out.attempt = true;
      if (typeof st.restSec === 'number' && isFinite(st.restSec)) out.restSec = st.restSec;
      if (typeof st.note === 'string' && st.note) out.note = st.note;
      return out;
    });
    if (typeof slot.targetSets !== 'number') slot.targetSets = slot.sets.length || 3;
    if (typeof slot.targetReps !== 'string') slot.targetReps = '8–12';
    if (slot.targetWeight === undefined) slot.targetWeight = null;
    slot.isPowerliftingMain = slot.isPowerliftingMain === true;
    slot.skipped = slot.skipped === true;
    slot.isCardio = cardio;
    slot.optional = slot.optional === true;
    if (typeof slot.restSec !== 'number') delete slot.restSec;
  });
}

/* ---------- Laden / Speichern ---------- */

function loadStore() {
  let raw = null;
  try {
    const txt = localStorage.getItem(STORE_KEY);
    if (txt) raw = JSON.parse(txt);
  } catch (e) {
    raw = null;
  }
  store = migrateStore(raw || {});
  saveStore();
  return store;
}

function saveStore() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
    return true;
  } catch (e) {
    logError(e);
    return false;
  }
}

/* §32.2 Fehlerprotokoll — Ringpuffer, max. 5 Einträge */
function logError(err) {
  try {
    if (!store || !Array.isArray(store.errorLog)) return;
    const stack = (err && err.stack ? String(err.stack) : '').split('\n').slice(0, 3).join(' | ').slice(0, 400);
    store.errorLog.push({
      message: String((err && err.message) || err || 'Unbekannter Fehler').slice(0, 300),
      stack: stack,
      timestamp: nowTs()
    });
    while (store.errorLog.length > 5) store.errorLog.shift();
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch (e) { /* niemals im Fehlerpfad erneut werfen */ }
}

/* ---------- Übungs-Zugriff (§1.7 defensiv gegen unbekannte IDs) ---------- */

let _exIndex = null;
function exerciseIndex() {
  if (_exIndex) return _exIndex;
  _exIndex = {};
  EXERCISE_LIST.forEach(e => { _exIndex[e.id] = e; });
  return _exIndex;
}
function allExercises() {
  const custom = (store && Array.isArray(store.customExercises)) ? store.customExercises : [];
  return EXERCISE_LIST.concat(custom);
}
function getExercise(id) {
  if (!id) return null;
  const base = exerciseIndex()[id];
  if (base) return base;
  if (store && Array.isArray(store.customExercises)) {
    const c = store.customExercises.find(e => e.id === id);
    if (c) return c;
  }
  return null;
}
function exerciseName(id) {
  const ex = getExercise(id);
  if (ex) return ex.name;
  return id ? 'Unbekannte Übung (' + id + ')' : 'Keine Übung';
}
function isBodyweightExercise(id) {
  const ex = getExercise(id);
  return !!(ex && ex.bodyweight);
}
function isPerHand(id) {
  const ex = getExercise(id);
  return !!(ex && ex.perHand);
}
/* §14/§30: markierte Übungen erscheinen in keiner Auswahl */
function isPainFlagged(id) {
  return !!(store && store.painFlags && store.painFlags[id] === true);
}
/* §5 Tausch-Sheet: gleiche Kategorie, nach Equipment gefiltert, ohne Pain-Flags */
function exercisesFor(category, mode, opts) {
  const o = opts || {};
  return allExercises().filter(e => {
    if (category && e.category !== category) return false;
    if (!o.includePain && isPainFlagged(e.id)) return false;
    if (mode && !o.ignoreEquipment) {
      const eq = Array.isArray(e.equipment) ? e.equipment : [];
      if (eq.indexOf(mode) === -1) return false;
    }
    return true;
  });
}

/* ---------- Gyms (§13) ---------- */
function allGyms() {
  return BUILTIN_GYMS.concat((store && store.customGyms) || []);
}
function gymLabel(id) {
  const g = allGyms().find(x => x.id === id);
  return g ? g.label : (id || '—');
}

/* ---------- Messart einer Übung ---------- */
function isCardioExercise(id) {
  const e = getExercise(id);
  return !!e && (e.metric === 'cardio' || e.category === 'cardio');
}
function cardioHasDistance(id) {
  const e = getExercise(id);
  return !!e && e.hasDistance === true;
}
function emptyPrBucket(exerciseId) {
  if (isCardioExercise(exerciseId)) {
    return { best_intensity: null, longest_total: null, longestByIntensity: {}, bestTimeByDistance: {} };
  }
  return { best_weight: null, max_reps: null, prByWeight: {}, best_1rm: null };
}

/* Baut alle PRs aus der Einheiten-Historie neu auf — der Geltungsbereich
   ergibt sich aus der Übung selbst (siehe scopeForExercise). */
function rebuildPrsFromSessions(s) {
  const prs = {};
  (Array.isArray(s.sessions) ? s.sessions : []).forEach(sess => {
    if (!isObj(sess) || !Array.isArray(sess.slots)) return;
    /* Konditionierungseinheiten (Wildcard Modus C) erzeugen keine Kraft-PRs */
    if (sess.mode === 'C') return;
    sess.slots.forEach(sl => {
      if (!isObj(sl) || sl.skipped || !sl.exerciseId || !Array.isArray(sl.sets)) return;
      const scope = scopeForExercise(sl.exerciseId, sess.equipment, sess.gymId);
      if (!prs[scope]) prs[scope] = {};
      if (!prs[scope][sl.exerciseId]) prs[scope][sl.exerciseId] = emptyPrBucket(sl.exerciseId);
      const b = prs[scope][sl.exerciseId];
      const cardio = isCardioExercise(sl.exerciseId);
      sl.sets.forEach(st => {
        if (!isObj(st) || !st.done || st.skip === true) return;
        if (cardio) {
          applyCardioSetToBucket(b, sl.exerciseId, st.intensity, st.sec, st.dist);
          return;
        }
        if (st.warmup === true) return; /* Aufwärmen zählt nicht als PR */
        const r = st.r, w = st.w;
        if (typeof r !== 'number' || !isFinite(r) || r <= 0) return;
        if (typeof w !== 'number' || !isFinite(w) || w <= 0) {
          if (b.max_reps === null || r > b.max_reps) b.max_reps = r;
          return;
        }
        if (b.best_weight === null || w > b.best_weight) b.best_weight = w;
        const key = String(w);
        if (b.prByWeight[key] === undefined || b.prByWeight[key] === null || r > b.prByWeight[key]) b.prByWeight[key] = r;
        const e1 = epley1RM(w, r);
        if (e1 !== null && (b.best_1rm === null || e1 > b.best_1rm)) b.best_1rm = e1;
      });
    });
  });
  s.prs = prs;
}

/* ---------- Geltungsbereich für PRs, Historie und Progression ----------
   Abweichung vom Lastenheft §12/§13 auf Anweisung des Auftraggebers:
   Maschinen unterscheiden sich von Studio zu Studio, deshalb bleibt der
   Gym-Modus pro Gym getrennt. Hanteln und der eigene Körper sind überall
   genormt — Hantel- und Calisthenics-Werte werden daher studioübergreifend
   in je einem gemeinsamen Topf geführt. */
const SCOPE_BARBELL = 'mode:barbell';
const SCOPE_BODYWEIGHT = 'mode:bodyweight';

function scopeFor(equipmentMode, gymId) {
  if (equipmentMode === 'barbell') return SCOPE_BARBELL;
  if (equipmentMode === 'bodyweight') return SCOPE_BODYWEIGHT;
  return gymId || store.gymId;
}
function currentScope() { return scopeFor(store.equipmentMode, store.gymId); }
function sessionScope(sess) { return sess ? scopeFor(sess.equipment, sess.gymId) : currentScope(); }

/* Auf Anweisung des Auftraggebers (Erweiterung zu §12/§13): Der PR-Topf richtet
   sich nach der Übung selbst, nicht nach dem Modus der Einheit — eine
   Hantelübung zählt immer in den Hantel-Topf, eine Körpergewichtsübung immer
   in den Calisthenics-Topf, eine Maschine in das jeweilige Gym. Hat eine Übung
   mehrere Equipment-Optionen, entscheidet die gewählte Variante (= Modus). */
function equipmentClassFor(exerciseId, equipmentMode) {
  const ex = getExercise(exerciseId);
  const eq = (ex && Array.isArray(ex.equipment) && ex.equipment.length) ? ex.equipment : ['studio'];
  if (ex && ex.bodyweight === true && eq.indexOf('bodyweight') !== -1) return 'bodyweight';
  if (eq.length === 1) return eq[0];
  if (equipmentMode && eq.indexOf(equipmentMode) !== -1) return equipmentMode;
  if (eq.indexOf('studio') !== -1) return 'studio';
  if (eq.indexOf('barbell') !== -1) return 'barbell';
  return 'bodyweight';
}
function scopeForExercise(exerciseId, equipmentMode, gymId) {
  const cls = equipmentClassFor(exerciseId, equipmentMode);
  if (cls === 'barbell') return SCOPE_BARBELL;
  if (cls === 'bodyweight') return SCOPE_BODYWEIGHT;
  return gymId || (store ? store.gymId : 'crunchfit');
}
/* Geltungsbereich einer Übung im aktuellen Kontext bzw. in einer Einheit */
function currentExerciseScope(exerciseId) {
  return scopeForExercise(exerciseId, store.equipmentMode, store.gymId);
}
function sessionExerciseScope(sess, exerciseId) {
  if (!sess) return currentExerciseScope(exerciseId);
  return scopeForExercise(exerciseId, sess.equipment, sess.gymId);
}
/* Alle Geltungsbereiche, in denen es zu dieser Übung PRs gibt */
function prScopesForExercise(exerciseId) {
  const out = [];
  Object.keys(store.prs || {}).forEach(scope => {
    const g = store.prs[scope];
    if (isObj(g) && isObj(g[exerciseId])) out.push(scope);
  });
  return out;
}
function scopeLabel(scope) {
  if (scope === SCOPE_BARBELL) return 'Hantel';
  if (scope === SCOPE_BODYWEIGHT) return 'Calisthenics';
  return gymLabel(scope);
}
function isGymScope(scope) { return scope !== SCOPE_BARBELL && scope !== SCOPE_BODYWEIGHT; }

/* ---------- PR-Logik (§12) ---------- */

function prBucket(scope, exerciseId) {
  if (!store.prs[scope]) store.prs[scope] = {};
  if (!store.prs[scope][exerciseId]) store.prs[scope][exerciseId] = emptyPrBucket(exerciseId);
  const b = store.prs[scope][exerciseId];
  if (isCardioExercise(exerciseId)) {
    if (!isObj(b.longestByIntensity)) b.longestByIntensity = {};
    if (!isObj(b.bestTimeByDistance)) b.bestTimeByDistance = {};
    if (b.best_intensity === undefined) b.best_intensity = null;
    if (b.longest_total === undefined) b.longest_total = null;
    return b;
  }
  if (!isObj(b.prByWeight)) b.prByWeight = {};
  return b;
}
function getPr(scope, exerciseId) {
  const g = store.prs[scope];
  if (!g || !g[exerciseId]) return null;
  return g[exerciseId];
}

/* Prüft einen bestätigten Satz und aktualisiert PRs.
   Rückgabe: Array von { type, text, level } für Celebrations (§12). */
function evaluateSetForPr(scope, exerciseId, w, r) {
  const results = [];
  if (!exerciseId) return results;
  if (typeof r !== 'number' || !isFinite(r) || r <= 0) return results;

  const b = prBucket(scope, exerciseId);
  const bw = isBodyweightExercise(exerciseId);
  const hasWeight = typeof w === 'number' && isFinite(w) && w > 0;

  if (!hasWeight) {
    /* §10 / §12 max_reps — Bodyweight ohne Zusatzgewicht */
    if (b.max_reps === null || r > b.max_reps) {
      b.max_reps = r;
      results.push({ type: 'max_reps', level: 2, text: 'Wiederholungs-PR — ' + r + ' Wdh. ohne Zusatzgewicht' });
    }
  } else {
    /* max_weight */
    if (b.best_weight === null || w > b.best_weight) {
      b.best_weight = w;
      results.push({ type: 'max_weight', level: 3, text: 'Kraft-PR — ' + fmtKg(w) + (isPerHand(exerciseId) ? ' je Hantel' : '') });
    }
    /* rep_at_weight — WICHTIG (§12, Testkriterium 9):
       gleiches Gewicht + mehr Wdh. als zuvor = PR, unabhängig von best_weight */
    const key = String(w);
    const prevReps = b.prByWeight[key];
    if (prevReps === undefined || prevReps === null || r > prevReps) {
      b.prByWeight[key] = r;
      results.push({
        type: 'rep_at_weight', level: 1,
        text: (prevReps !== undefined && prevReps !== null)
          ? 'Wiederholungs-PR bei ' + fmtKg(w) + ' — ' + r + ' Wdh. (vorher ' + prevReps + ')'
          : 'Wiederholungs-PR bei ' + fmtKg(w) + ' — ' + r + ' Wdh.'
      });
    }
    /* estimated_1rm (Epley) */
    const e1 = epley1RM(w, r);
    if (e1 !== null && (b.best_1rm === null || e1 > b.best_1rm)) {
      b.best_1rm = e1;
      results.push({ type: 'estimated_1rm', level: 2, text: 'Geschätzter 1RM-PR — ' + fmtKg(e1) });
    }
    /* Bodyweight mit Zusatzgewicht: max_reps bleibt unberührt (§10) */
    if (bw) { /* getrennte Erfassung, nichts zu tun */ }
  }
  return results;
}

/* ---------- Cardio-Rekorde ----------
   Zwei Kennzahlen: beste Zeit auf einer Standarddistanz und längste Dauer
   bei einer bestimmten Intensität. Freie Distanzen werden nicht gewertet. */
function applyCardioSetToBucket(b, exerciseId, intensity, sec, dist) {
  const hasInt = typeof intensity === 'number' && isFinite(intensity) && intensity > 0;
  const hasSec = typeof sec === 'number' && isFinite(sec) && sec > 0;
  const hasDist = typeof dist === 'number' && isFinite(dist) && dist > 0;
  const results = [];
  if (!hasSec && !hasDist) return results;

  if (hasSec && (b.longest_total === null || sec > b.longest_total)) b.longest_total = sec;

  if (hasInt) {
    if (b.best_intensity === null || intensity > b.best_intensity) b.best_intensity = intensity;
    if (hasSec) {
      const key = String(intensity);
      const prev = b.longestByIntensity[key];
      if (prev === undefined || prev === null || sec > prev) {
        b.longestByIntensity[key] = sec;
        results.push({
          type: 'cardio_duration', level: 2,
          text: 'Dauer-PR bei Intensität ' + fmtNum(intensity) + ' — ' + fmtSecs(sec)
            + ((prev !== undefined && prev !== null) ? ' (vorher ' + fmtSecs(prev) + ')' : '')
        });
      }
    }
  }
  if (hasDist && hasSec && CARDIO_DISTANCES.indexOf(dist) !== -1) {
    const dk = String(dist);
    const prevT = b.bestTimeByDistance[dk];
    if (prevT === undefined || prevT === null || sec < prevT) {
      b.bestTimeByDistance[dk] = sec;
      results.push({
        type: 'cardio_time', level: 3,
        text: 'Zeit-PR über ' + fmtMeters(dist) + ' — ' + fmtSecs(sec)
          + ((prevT !== undefined && prevT !== null) ? ' (vorher ' + fmtSecs(prevT) + ')' : '')
      });
    }
  }
  return results;
}
function evaluateCardioSetForPr(scope, exerciseId, intensity, sec, dist) {
  if (!exerciseId) return [];
  const b = prBucket(scope, exerciseId);
  return applyCardioSetToBucket(b, exerciseId, intensity, sec, dist);
}

/* Cardio-Minuten (zusätzliche Kennzahl im Fortschritt) */
function sessionCardioSecs(s) {
  let sec = 0;
  (s.slots || []).forEach(sl => {
    if (sl.skipped || !isCardioExercise(sl.exerciseId)) return;
    (sl.sets || []).forEach(st => {
      if (!st.done || st.skip === true) return;
      if (typeof st.sec === 'number' && isFinite(st.sec)) sec += st.sec;
    });
  });
  return sec;
}
function totalCardioSecs() {
  return store.sessions.reduce((acc, s) => acc + sessionCardioSecs(s), 0);
}

function fmtSecs(sec) {
  if (typeof sec !== 'number' || !isFinite(sec) || sec <= 0) return '—';
  const t = Math.round(sec);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  const pad = n => (n < 10 ? '0' + n : String(n));
  return h > 0 ? (h + ':' + pad(m) + ':' + pad(s)) : (m + ':' + pad(s));
}
function fmtMeters(m) {
  if (typeof m !== 'number' || !isFinite(m)) return '—';
  return m >= 1000 ? (fmtNum(m / 1000) + ' km') : (m + ' m');
}

/* ---------- Konditionierungs-Rekorde (Wildcard Modus C) ----------
   Getrennt von den Kraft-PRs, je Vorlagen- bzw. Einheitsname. */
function conditioningRecord(name) {
  const key = String(name || '').trim();
  if (!key) return null;
  return store.conditioningRecords[key] || null;
}
function applyConditioningResult(name, type, rounds, partialReps, extra) {
  const key = String(name || '').trim();
  if (!key) return null;
  const prev = store.conditioningRecords[key] || null;
  const entry = {
    name: key,
    type: type,
    bestRounds: rounds,
    bestPartial: (typeof partialReps === 'number' && isFinite(partialReps)) ? partialReps : 0,
    dateISO: todayISO(),
    attempts: prev && typeof prev.attempts === 'number' ? prev.attempts + 1 : 1,
    details: isObj(extra) ? extra : {}
  };
  const better = !prev
    || rounds > prev.bestRounds
    || (rounds === prev.bestRounds && entry.bestPartial > (prev.bestPartial || 0));
  if (!better) {
    prev.attempts = entry.attempts;
    prev.lastISO = todayISO();
    store.conditioningRecords[key] = prev;
    return { isRecord: false, record: prev };
  }
  entry.lastISO = todayISO();
  store.conditioningRecords[key] = entry;
  return { isRecord: true, record: entry, previous: prev };
}

function fmtKg(v) {
  if (v === null || v === undefined || !isFinite(v)) return '—';
  const r = Math.round(v * 10) / 10;
  return (Number.isInteger(r) ? String(r) : String(r).replace('.', ',')) + ' kg';
}
function fmtNum(v) {
  if (v === null || v === undefined || !isFinite(v)) return '—';
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : String(r).replace('.', ',');
}

/* ---------- Historie / Auswertung (§16, §23.8, §32.6) ---------- */

/* Letztes verwendetes Gewicht einer Übung im aktuellen Geltungsbereich (Startwert §11) */
function lastWeightFor(exerciseId, scope) {
  for (let i = store.sessions.length - 1; i >= 0; i--) {
    const s = store.sessions[i];
    if (sessionExerciseScope(s, exerciseId) !== scope) continue;
    for (let j = s.slots.length - 1; j >= 0; j--) {
      const sl = s.slots[j];
      if (sl.exerciseId !== exerciseId || sl.skipped) continue;
      for (let k = sl.sets.length - 1; k >= 0; k--) {
        if (sl.sets[k].done && sl.sets[k].skip !== true && sl.sets[k].warmup !== true) return sl.sets[k].w;
      }
    }
  }
  return null;
}
function lastRepsFor(exerciseId, scope) {
  for (let i = store.sessions.length - 1; i >= 0; i--) {
    const s = store.sessions[i];
    if (sessionExerciseScope(s, exerciseId) !== scope) continue;
    for (let j = s.slots.length - 1; j >= 0; j--) {
      const sl = s.slots[j];
      if (sl.exerciseId !== exerciseId || sl.skipped) continue;
      for (let k = sl.sets.length - 1; k >= 0; k--) {
        if (sl.sets[k].done && sl.sets[k].skip !== true && sl.sets[k].warmup !== true) return sl.sets[k].r;
      }
    }
  }
  return null;
}

/* §23.8 kumuliertes Gesamtvolumen (Summe w×r aller abgeschlossenen Sätze) */
function volumeSeries() {
  const perDay = {};
  store.sessions.forEach(s => {
    let v = 0;
    s.slots.forEach(sl => {
      if (sl.skipped) return; /* §32.6 nicht in Auswertung */
      if (sl.isCardio || isCardioExercise(sl.exerciseId)) return; /* Cardio bleibt aus dem kg-Volumen */
      sl.sets.forEach(st => {
        if (!st.done || st.skip === true) return;
        const w = (typeof st.w === 'number' && isFinite(st.w)) ? st.w : 0;
        v += w * (st.r || 0);
      });
    });
    if (v > 0) perDay[s.dateISO] = (perDay[s.dateISO] || 0) + v;
  });
  const dates = Object.keys(perDay).sort();
  let acc = 0;
  return dates.map(d => { acc += perDay[d]; return { dateISO: d, value: Math.round(acc) }; });
}

function sessionVolume(s) {
  let v = 0;
  s.slots.forEach(sl => {
    if (sl.skipped) return;
    if (sl.isCardio || isCardioExercise(sl.exerciseId)) return;
    sl.sets.forEach(st => {
      if (!st.done || st.skip === true) return;
      const w = (typeof st.w === 'number' && isFinite(st.w)) ? st.w : 0;
      v += w * (st.r || 0);
    });
  });
  return Math.round(v);
}

/* Verlauf pro Übung (§16) */
function historyFor(exerciseId) {
  const out = [];
  store.sessions.forEach(s => {
    s.slots.forEach(sl => {
      if (sl.exerciseId !== exerciseId) return;
      out.push({
        dateISO: s.dateISO, gymId: s.gymId, skipped: sl.skipped,
        scope: sessionExerciseScope(s, exerciseId),
        mode: s.mode || null,
        sets: sl.sets.filter(st => st.done && st.skip !== true),
        plannedSets: (typeof sl.targetSets === 'number' ? sl.targetSets : sl.sets.length),
        targetReps: sl.targetReps
      });
    });
  });
  return out.reverse();
}

/* ---------- Rep-Range-Auswertung für Doppelprogression (§11) ---------- */
function parseRepRange(str) {
  const m = String(str || '').match(/(\d+)\s*[–\-]\s*(\d+)/);
  if (m) return { min: parseInt(m[1], 10), max: parseInt(m[2], 10) };
  const n = parseInt(str, 10);
  if (isFinite(n)) return { min: n, max: n };
  return { min: 8, max: 12 };
}

/* ---------- Zusammenfassung über alle Geltungsbereiche (Reiter „Alle") ----------
   Zeigt den absolut besten Wert einer Übung samt Herkunft; die Aufschlüsselung
   je Geltungsbereich bleibt im Detail erhalten. */
function aggregatedPr(exerciseId) {
  const scopes = prScopesForExercise(exerciseId);
  if (!scopes.length) return null;
  const out = { exerciseId: exerciseId, scopes: scopes, cardio: isCardioExercise(exerciseId) };
  if (out.cardio) {
    out.best_intensity = null; out.best_intensity_scope = null;
    out.longest_total = null;  out.longest_total_scope = null;
    out.bestTimeByDistance = {};
    scopes.forEach(sc => {
      const b = store.prs[sc][exerciseId];
      if (typeof b.best_intensity === 'number' && (out.best_intensity === null || b.best_intensity > out.best_intensity)) {
        out.best_intensity = b.best_intensity; out.best_intensity_scope = sc;
      }
      if (typeof b.longest_total === 'number' && (out.longest_total === null || b.longest_total > out.longest_total)) {
        out.longest_total = b.longest_total; out.longest_total_scope = sc;
      }
      Object.keys(b.bestTimeByDistance || {}).forEach(d => {
        const t = b.bestTimeByDistance[d];
        const cur = out.bestTimeByDistance[d];
        if (typeof t === 'number' && (!cur || t < cur.sec)) out.bestTimeByDistance[d] = { sec: t, scope: sc };
      });
    });
    return out;
  }
  out.best_weight = null; out.best_weight_scope = null;
  out.max_reps = null;    out.max_reps_scope = null;
  out.best_1rm = null;    out.best_1rm_scope = null;
  scopes.forEach(sc => {
    const b = store.prs[sc][exerciseId];
    if (typeof b.best_weight === 'number' && (out.best_weight === null || b.best_weight > out.best_weight)) {
      out.best_weight = b.best_weight; out.best_weight_scope = sc;
    }
    if (typeof b.max_reps === 'number' && (out.max_reps === null || b.max_reps > out.max_reps)) {
      out.max_reps = b.max_reps; out.max_reps_scope = sc;
    }
    if (typeof b.best_1rm === 'number' && (out.best_1rm === null || b.best_1rm > out.best_1rm)) {
      out.best_1rm = b.best_1rm; out.best_1rm_scope = sc;
    }
  });
  return out;
}
/* Enthält ein PR-Topf überhaupt einen Wert? (nur Übungen mit PR anzeigen) */
function prHasValue(b, exerciseId) {
  if (!isObj(b)) return false;
  if (isCardioExercise(exerciseId)) {
    return b.best_intensity !== null || b.longest_total !== null
      || Object.keys(b.bestTimeByDistance || {}).length > 0
      || Object.keys(b.longestByIntensity || {}).length > 0;
  }
  return b.best_weight !== null || b.max_reps !== null || b.best_1rm !== null
    || Object.keys(b.prByWeight || {}).length > 0;
}

/* ---------- Wildcard-Vorlagen (Modus A und C) ---------- */
function templatesForMode(mode) {
  return store.wildcardTemplates
    .filter(t => t.mode === mode)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}
function saveWildcardTemplate(name, mode, exerciseIds, config) {
  const nm = String(name || '').trim();
  if (!nm) return null;
  const t = {
    id: uid('wt'), name: nm, mode: mode,
    exerciseIds: exerciseIds.slice(),
    config: clone(config || {}),
    updatedAt: nowTs()
  };
  /* Kein automatisches Überschreiben: gleicher Name wird eindeutig gemacht */
  let final = nm, n = 2;
  while (store.wildcardTemplates.some(x => x.name === final)) { final = nm + ' (' + n + ')'; n++; }
  t.name = final;
  store.wildcardTemplates.push(t);
  saveStore();
  return t;
}
function renameWildcardTemplate(id, name) {
  const t = store.wildcardTemplates.find(x => x.id === id);
  const nm = String(name || '').trim();
  if (!t || !nm) return false;
  if (store.wildcardTemplates.some(x => x.id !== id && x.name === nm)) return false;
  t.name = nm; t.updatedAt = nowTs();
  saveStore();
  return true;
}
function deleteWildcardTemplate(id) {
  const i = store.wildcardTemplates.findIndex(x => x.id === id);
  if (i === -1) return false;
  store.wildcardTemplates.splice(i, 1);
  saveStore();
  return true;
}
