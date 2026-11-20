/* Lift — Statische Stammdaten (§3, §4, §6, §7.1, §9, §13, §22)
   Keine Abhängigkeiten. Muss vor store.js geladen werden. */
'use strict';

/* §9.2 Kategorien */
const CATEGORIES = {
  vpush:     'Vertikal Push',
  hpush:     'Horizontal Push',
  vpull:     'Vertikal Pull',
  hpull:     'Horizontal Pull',
  knee:      'Beine (Knie)',
  hip:       'Beine (Hüfte)',
  biceps_c:  'Bizeps Compound',
  biceps_i:  'Bizeps Isolation',
  triceps_c: 'Trizeps Compound',
  triceps_i: 'Trizeps Isolation',
  side_delt: 'Schulter seitlich',
  rear_delt: 'Schulter hinten',
  abs:       'Bauch',
  /* Auf Anweisung des Auftraggebers ergänzt: Cardio wird nicht in Gewicht × Wdh.,
     sondern in Intensität × Dauer (optional Distanz) erfasst. */
  cardio:    'Cardio'
};
const CATEGORY_ORDER = Object.keys(CATEGORIES);

/* Sammelgruppe „Beine" für Filterzeilen (beide Bewegungsmuster zusammen) */
const LEG_CATEGORIES = ['knee', 'hip'];

/* Standarddistanzen für Cardio-PRs — freie Meterwerte bilden keinen Distanz-PR */
const CARDIO_DISTANCES = [500, 1000, 2000, 5000];

/* §8.4 „Arme" als eigene Zielgruppe */
const ARM_CATEGORIES = ['biceps_c', 'biceps_i', 'triceps_c', 'triceps_i'];

/* §4 Equipment-Modi */
const EQUIPMENT_MODES = [
  { id: 'studio',     label: 'Gym' },
  { id: 'barbell',    label: 'Hantel' },
  { id: 'bodyweight', label: 'Calisthenics' }
];

/* §13 Vorinstallierte Gyms */
const BUILTIN_GYMS = [
  { id: 'crunchfit',    label: 'Crunch Fit' },
  { id: 'fitness_first', label: 'Fitness First' },
  { id: 'evo',          label: 'EVO' },
  { id: 'mcfit',        label: 'McFIT' },
  { id: 'holmes_place', label: 'Holmes Place' }
];

/* §9.1 Übungsbibliothek — id, name (Deutsch), category, equipment[], bodyweight,
   perHand (§9.5 Kurzhantel-Regel), isCompound.
   Mindestbibliothek Anhang A (§21) + Pflicht-Erweiterungen (§9.4) + Powerlifting-Pool (§7.1). */
const EXERCISE_LIST = [
  /* --- Knie-dominant --- */
  { id: 'back_squat',        name: 'Kniebeuge (Langhantel)',            category: 'knee', equipment: ['barbell'],                          isCompound: true },
  { id: 'front_squat',       name: 'Frontkniebeuge',                    category: 'knee', equipment: ['barbell'],                          isCompound: true },
  { id: 'hb_squat',          name: 'High-Bar Kniebeuge',                category: 'knee', equipment: ['barbell'],                          isCompound: true },
  { id: 'lb_squat',          name: 'Low-Bar Kniebeuge',                 category: 'knee', equipment: ['barbell'],                          isCompound: true },
  { id: 'hack_squat',        name: 'Hackenschmidt-Kniebeuge',           category: 'knee', equipment: ['studio'],                           isCompound: true },
  { id: 'leg_press',         name: 'Beinpresse 45°',                    category: 'knee', equipment: ['studio'],                           isCompound: true },
  { id: 'bulgarian_split',   name: 'Bulgarian Split Squat',             category: 'knee', equipment: ['studio','barbell','bodyweight'], bodyweight: true, isCompound: true },
  { id: 'pistol_squat',      name: 'Pistol Squat',                      category: 'knee', equipment: ['bodyweight'],   bodyweight: true,   isCompound: true },
  { id: 'goblet_squat',      name: 'Goblet Squat (Kurzhantel)',         category: 'knee', equipment: ['barbell'],      perHand: false,      isCompound: true },
  { id: 'bb_lunge',          name: 'Ausfallschritte (Langhantel)',      category: 'knee', equipment: ['barbell'],                          isCompound: true },

  /* --- Hüft-dominant --- */
  { id: 'hip_thrust',         name: 'Hip Thrust (Langhantel)',          category: 'hip', equipment: ['barbell'],                           isCompound: true },
  { id: 'hip_thrust_machine', name: 'Hip Thrust Maschine',              category: 'hip', equipment: ['studio'],                            isCompound: true },
  { id: 'sl_hip_thrust',      name: 'Einbeiniger Hip Thrust',           category: 'hip', equipment: ['bodyweight'],  bodyweight: true,      isCompound: true },
  { id: 'rdl_db',             name: 'Rumänisches Kreuzheben (Kurzhantel)', category: 'hip', equipment: ['barbell'], perHand: true,          isCompound: true },
  { id: 'sl_rdl',             name: 'Einbeiniges Rumänisches Kreuzheben', category: 'hip', equipment: ['barbell','bodyweight'], bodyweight: true, isCompound: true },
  { id: 'good_morning',       name: 'Good Morning',                     category: 'hip', equipment: ['barbell'],                           isCompound: true },
  { id: 'back_ext',           name: 'Rückenstrecker (Gerät)',           category: 'hip', equipment: ['studio'],      bodyweight: true },
  { id: 'reverse_hyper',      name: 'Reverse Hyperextension',           category: 'hip', equipment: ['bodyweight'],  bodyweight: true },
  { id: 'deadlift',           name: 'Kreuzheben konventionell',         category: 'hip', equipment: ['barbell'],                           isCompound: true },
  { id: 'sumo_deadlift',      name: 'Sumo-Kreuzheben',                  category: 'hip', equipment: ['barbell'],                           isCompound: true },

  /* --- Horizontal Push --- */
  { id: 'db_bench',        name: 'Bankdrücken (Kurzhantel)',            category: 'hpush', equipment: ['barbell'], perHand: true,          isCompound: true },
  { id: 'db_incline',      name: 'Schrägbankdrücken (Kurzhantel)',      category: 'hpush', equipment: ['barbell'], perHand: true,          isCompound: true },
  { id: 'bb_bench',        name: 'Bankdrücken (Langhantel)',            category: 'hpush', equipment: ['barbell'],                         isCompound: true },
  { id: 'smith_bench',     name: 'Bankdrücken (Smith Machine)',         category: 'hpush', equipment: ['studio'],                          isCompound: true },
  { id: 'chest_press',     name: 'Brustpresse Maschine',                category: 'hpush', equipment: ['studio'],                          isCompound: true },
  { id: 'incline_machine', name: 'Schrägbank Maschine',                 category: 'hpush', equipment: ['studio'],                          isCompound: true },
  { id: 'cable_fly',       name: 'Kabel-Fly',                           category: 'hpush', equipment: ['studio'] },
  { id: 'pushup_loaded',   name: 'Liegestütz mit Zusatzgewicht',        category: 'hpush', equipment: ['bodyweight'], bodyweight: true,     isCompound: true },
  { id: 'archer_pushup',   name: 'Archer-Liegestütz',                   category: 'hpush', equipment: ['bodyweight'], bodyweight: true,     isCompound: true },
  { id: 'dips',            name: 'Dips',                                category: 'hpush', equipment: ['bodyweight'], bodyweight: true,     isCompound: true },

  /* --- Vertikal Push --- */
  { id: 'db_ohp',      name: 'Schulterdrücken (Kurzhantel)',            category: 'vpush', equipment: ['barbell'], perHand: true,          isCompound: true },
  { id: 'machine_ohp', name: 'Schulterdrücken Maschine',                category: 'vpush', equipment: ['studio'],                          isCompound: true },
  { id: 'smith_ohp',   name: 'Schulterdrücken (Smith Machine)',         category: 'vpush', equipment: ['studio'],                          isCompound: true },
  { id: 'bb_ohp',      name: 'Overhead Press (Langhantel)',             category: 'vpush', equipment: ['barbell'],                         isCompound: true },
  { id: 'push_press',  name: 'Push Press',                              category: 'vpush', equipment: ['barbell'],                         isCompound: true },
  { id: 'jerk',        name: 'Jerk',                                    category: 'vpush', equipment: ['barbell'],                         isCompound: true },
  { id: 'thrusters',   name: 'Thrusters',                               category: 'vpush', equipment: ['barbell'],                         isCompound: true },
  { id: 'power_clean', name: 'Power Clean',                             category: 'vpush', equipment: ['barbell'],                         isCompound: true },
  { id: 'pike_pushup', name: 'Pike-Liegestütz',                         category: 'vpush', equipment: ['bodyweight'], bodyweight: true,     isCompound: true },
  { id: 'hspu',        name: 'Handstand-Liegestütz',                    category: 'vpush', equipment: ['bodyweight'], bodyweight: true,     isCompound: true },

  /* --- Horizontal Pull --- */
  { id: 'bb_row',            name: 'Langhantelrudern',                  category: 'hpull', equipment: ['barbell'],                         isCompound: true },
  { id: 'db_row',            name: 'Kurzhantelrudern',                  category: 'hpull', equipment: ['barbell'], perHand: true,          isCompound: true },
  { id: 'chest_row_db',      name: 'Brustgestütztes Rudern (Kurzhantel)', category: 'hpull', equipment: ['studio','barbell'], perHand: true, isCompound: true },
  { id: 'chest_row_machine', name: 'Brustgestütztes Rudern Maschine',   category: 'hpull', equipment: ['studio'],                          isCompound: true },
  { id: 'cable_row',         name: 'Kabelrudern sitzend',               category: 'hpull', equipment: ['studio'],                          isCompound: true },
  { id: 'inverted_row',      name: 'Inverted Row',                      category: 'hpull', equipment: ['bodyweight'], bodyweight: true,     isCompound: true },

  /* --- Vertikal Pull --- */
  { id: 'pullup_wide',    name: 'Klimmzug weit',                        category: 'vpull', equipment: ['barbell','bodyweight'], bodyweight: true, isCompound: true },
  { id: 'pullup_close',   name: 'Klimmzug eng',                         category: 'vpull', equipment: ['barbell','bodyweight'], bodyweight: true, isCompound: true },
  { id: 'pullup_neutral', name: 'Klimmzug neutraler Griff',             category: 'vpull', equipment: ['barbell','bodyweight'], bodyweight: true, isCompound: true },
  { id: 'lat_wide',       name: 'Latzug weit',                          category: 'vpull', equipment: ['studio'],                          isCompound: true },
  { id: 'lat_close',      name: 'Latzug eng',                           category: 'vpull', equipment: ['studio'],                          isCompound: true },
  { id: 'lat_neutral',    name: 'Latzug neutraler Griff',               category: 'vpull', equipment: ['studio'],                          isCompound: true },
  { id: 'cable_pullover', name: 'Kabel-Pullover',                       category: 'vpull', equipment: ['studio'] },

  /* --- Bizeps --- */
  { id: 'chinup',        name: 'Chin-up (Untergriff)',                  category: 'biceps_c', equipment: ['barbell','bodyweight'], bodyweight: true, isCompound: true },
  { id: 'machine_chin',  name: 'Assistierter Chin-up (Maschine)',       category: 'biceps_c', equipment: ['studio'],                       isCompound: true },
  { id: 'bb_curl',       name: 'Langhantel-Curl',                       category: 'biceps_i', equipment: ['barbell'] },
  { id: 'db_curl',       name: 'Kurzhantel-Curl',                       category: 'biceps_i', equipment: ['barbell','bodyweight'], perHand: true },
  { id: 'incline_curl',  name: 'Incline-Curl (Kurzhantel)',             category: 'biceps_i', equipment: ['barbell'], perHand: true },
  { id: 'cable_curl',    name: 'Kabel-Curl',                            category: 'biceps_i', equipment: ['studio'] },
  { id: 'machine_curl',  name: 'Curl-Maschine',                         category: 'biceps_i', equipment: ['studio'] },
  { id: 'preacher_curl', name: 'Preacher-Curl',                         category: 'biceps_i', equipment: ['studio','barbell'] },

  /* --- Trizeps --- */
  { id: 'dips_weighted',      name: 'Dips mit Zusatzgewicht',           category: 'triceps_c', equipment: ['studio','barbell'], bodyweight: true, isCompound: true },
  { id: 'bench_dips',         name: 'Bank-Dips',                        category: 'triceps_c', equipment: ['bodyweight'], bodyweight: true, isCompound: true },
  { id: 'skull_crusher',      name: 'Skull Crusher (Langhantel)',       category: 'triceps_i', equipment: ['studio','barbell'] },
  { id: 'skull_crusher_db',   name: 'Skull Crusher (Kurzhantel)',       category: 'triceps_i', equipment: ['barbell'], perHand: true },
  { id: 'diamond_pushup',     name: 'Diamond-Liegestütz',               category: 'triceps_i', equipment: ['bodyweight'], bodyweight: true },
  { id: 'cable_overhead_tri', name: 'Trizepsdrücken über Kopf (Kabel)', category: 'triceps_i', equipment: ['studio'] },
  { id: 'overhead_db_tri',    name: 'Trizepsdrücken über Kopf (Kurzhantel)', category: 'triceps_i', equipment: ['barbell'] },
  { id: 'cable_pushdown',     name: 'Trizepsdrücken am Kabel',          category: 'triceps_i', equipment: ['studio'] },

  /* --- Schulter seitlich / hinten --- */
  { id: 'db_lateral',          name: 'Seitheben (Kurzhantel)',          category: 'side_delt', equipment: ['barbell'], perHand: true },
  { id: 'cable_lateral',       name: 'Seitheben am Kabel',              category: 'side_delt', equipment: ['studio','barbell'] },
  { id: 'machine_lateral',     name: 'Seitheben Maschine',              category: 'side_delt', equipment: ['studio'] },
  { id: 'lean_away_lateral',   name: 'Lean-Away Seitheben',             category: 'side_delt', equipment: ['studio','barbell'], perHand: true },
  { id: 'band_lateral',        name: 'Seitheben mit Band',              category: 'side_delt', equipment: ['bodyweight'], bodyweight: true },
  { id: 'reverse_pec',         name: 'Reverse Butterfly',               category: 'rear_delt', equipment: ['studio'] },
  { id: 'face_pull',           name: 'Face Pull',                       category: 'rear_delt', equipment: ['studio'] },
  { id: 'reverse_fly',         name: 'Reverse Fly (Kurzhantel)',        category: 'rear_delt', equipment: ['barbell'], perHand: true },
  { id: 'band_pull_apart',     name: 'Band Pull-Apart',                 category: 'rear_delt', equipment: ['bodyweight'], bodyweight: true },
  { id: 'cable_rear_delt_fly', name: 'Reverse Fly am Kabel',            category: 'rear_delt', equipment: ['studio'] },

  /* --- Bauch --- */
  { id: 'dragon_flag',       name: 'Dragon Flag',                       category: 'abs', equipment: ['studio','barbell','bodyweight'], bodyweight: true },
  { id: 'dragon_flag_full',  name: 'Dragon Flag (volle Ausführung)',    category: 'abs', equipment: ['studio','barbell','bodyweight'], bodyweight: true },
  { id: 'hanging_leg_raise', name: 'Hängendes Beinheben',               category: 'abs', equipment: ['studio','barbell','bodyweight'], bodyweight: true },
  { id: 'toes_to_bar',       name: 'Toes-to-Bar',                       category: 'abs', equipment: ['bodyweight'], bodyweight: true },
  { id: 'cable_crunch',      name: 'Crunch am Kabel',                   category: 'abs', equipment: ['studio'] },
  { id: 'weighted_situp',    name: 'Sit-up mit Zusatzgewicht',          category: 'abs', equipment: ['studio','barbell'], bodyweight: true },
  { id: 'russian_twist',     name: 'Russian Twist',                     category: 'abs', equipment: ['barbell','bodyweight'], bodyweight: true },
  { id: 'hollow_hold',       name: 'Hollow Hold',                       category: 'abs', equipment: ['bodyweight'], bodyweight: true },
  { id: 'hanging_knee',      name: 'Hängendes Knieheben',               category: 'abs', equipment: ['studio','barbell','bodyweight'], bodyweight: true },

  /* --- Cardio (Intensität × Dauer, optional Distanz) --- */
  { id: 'rower',       name: 'Rudergerät',        category: 'cardio', equipment: ['studio'],     metric: 'cardio', hasDistance: true },
  { id: 'treadmill',   name: 'Laufband',          category: 'cardio', equipment: ['studio'],     metric: 'cardio', hasDistance: true },
  { id: 'elliptical',  name: 'Crosstrainer',      category: 'cardio', equipment: ['studio'],     metric: 'cardio', hasDistance: true },
  { id: 'bike_erg',    name: 'Fahrradergometer',  category: 'cardio', equipment: ['studio'],     metric: 'cardio', hasDistance: true },
  { id: 'stairmaster', name: 'Stairmaster',       category: 'cardio', equipment: ['studio'],     metric: 'cardio' },
  { id: 'ski_erg',     name: 'Ski-Ergometer',     category: 'cardio', equipment: ['studio'],     metric: 'cardio', hasDistance: true },
  { id: 'jump_rope',   name: 'Seilspringen',      category: 'cardio', equipment: ['bodyweight'], metric: 'cardio' }
];

/* §7.1 Powerlifting-Hauptübungspool */
const PL_MAIN_POOL = [
  'front_squat', 'hb_squat', 'lb_squat', 'deadlift', 'sumo_deadlift',
  'bb_bench', 'smith_bench', 'bb_ohp', 'power_clean', 'thrusters', 'jerk', 'bb_lunge'
];

/* §7.3 Oberkörper +2,5 kg / Unterkörper +5 kg */
const PL_LOWER_BODY = ['front_squat','hb_squat','lb_squat','deadlift','sumo_deadlift','bb_lunge'];

/* §6 Feste Trainingspläne d1–d5, §3 Tagesübersicht */
const DAYS = [
  {
    id: 'd1', name: 'Ganzkörper', short: 'D1', type: 'fixed',
    slots: [
      { slotKey: 'd1s1', name: 'Knie-dominant Compound',   category: 'knee',  sets: 4, reps: '6–9',   rest: 180, def: { studio: 'leg_press',          barbell: 'back_squat',    bodyweight: 'bulgarian_split' } },
      { slotKey: 'd1s2', name: 'Horizontal Push Compound', category: 'hpush', sets: 4, reps: '6–9',   rest: 180, def: { studio: 'chest_press',        barbell: 'db_bench',      bodyweight: 'pushup_loaded' } },
      { slotKey: 'd1s3', name: 'Vertikal Pull Compound',   category: 'vpull', sets: 4, reps: '6–9',   rest: 180, def: { studio: 'lat_wide',           barbell: 'pullup_wide',   bodyweight: 'pullup_wide' } },
      { slotKey: 'd1s4', name: 'Hüft-dominant',            category: 'hip',   sets: 4, reps: '6–9',   rest: 150, def: { studio: 'hip_thrust_machine', barbell: 'hip_thrust',    bodyweight: 'sl_hip_thrust' } },
      { slotKey: 'd1s5', name: 'Schulter Press Compound',  category: 'vpush', sets: 4, reps: '6–9',   rest: 120, def: { studio: 'machine_ohp',        barbell: 'db_ohp',        bodyweight: 'pike_pushup' } },
      { slotKey: 'd1s6', name: 'Bauch — Dragon Flag',      category: 'abs',   sets: 3, reps: '5–8',   rest: 90,  def: { studio: 'dragon_flag',        barbell: 'dragon_flag',   bodyweight: 'dragon_flag' } }
    ]
  },
  {
    id: 'd2', name: 'Brust & Rücken', short: 'D2', type: 'fixed',
    slots: [
      { slotKey: 'd2s1', name: 'Horizontal Push (schwer)',            category: 'hpush',     sets: 4, reps: '6–9',   rest: 180, def: { studio: 'incline_machine',    barbell: 'db_incline',      bodyweight: 'archer_pushup' } },
      { slotKey: 'd2s2', name: 'Horizontal Pull (schwer)',            category: 'hpull',     sets: 4, reps: '6–9',   rest: 180, def: { studio: 'chest_row_machine',  barbell: 'bb_row',          bodyweight: 'inverted_row' } },
      { slotKey: 'd2s3', name: 'Vertikal Pull',                       category: 'vpull',     sets: 4, reps: '6–9',   rest: 150, def: { studio: 'lat_close',          barbell: 'pullup_close',    bodyweight: 'pullup_close' } },
      { slotKey: 'd2s4', name: 'Horizontal Push (Volumen)',           category: 'hpush',     sets: 3, reps: '6–9',   rest: 150, def: { studio: 'chest_press',        barbell: 'db_bench',        bodyweight: 'dips' } },
      { slotKey: 'd2s5', name: 'Rücken-Dicke',                        category: 'hpull',     sets: 3, reps: '6–9',   rest: 120, def: { studio: 'chest_row_db',       barbell: 'db_row',          bodyweight: 'inverted_row' } },
      { slotKey: 'd2s6', name: 'Hintere Schulter',                    category: 'rear_delt', sets: 3, reps: '10–12', rest: 90,  def: { studio: 'reverse_pec',        barbell: 'reverse_fly',     bodyweight: 'band_pull_apart' } },
      { slotKey: 'd2s7', name: 'Unterer Rücken (Deadlift-Ersatz)',    category: 'hip',       sets: 3, reps: '8–10',  rest: 120, def: { studio: 'back_ext',           barbell: 'good_morning',    bodyweight: 'reverse_hyper' } },
      { slotKey: 'd2s8', name: 'Bauch — Dragon Flag',                 category: 'abs',       sets: 3, reps: '5–8',   rest: 90,  def: { studio: 'dragon_flag',        barbell: 'dragon_flag',     bodyweight: 'dragon_flag' } }
    ]
  },
  {
    id: 'd3', name: 'Beine & Arme', short: 'D3', type: 'fixed',
    slots: [
      { slotKey: 'd3s1', name: 'Bulgarian Split Squat (Haupt-Bein)',        category: 'knee',      sets: 4, reps: '6–9',   rest: 150, def: { studio: 'bulgarian_split',    barbell: 'bulgarian_split', bodyweight: 'bulgarian_split' } },
      { slotKey: 'd3s2', name: 'Beinpresse 45° (zweiter Bein-Compound)',    category: 'knee',      sets: 3, reps: '8–10',  rest: 150, def: { studio: 'leg_press',          barbell: 'goblet_squat',    bodyweight: 'pistol_squat' } },
      { slotKey: 'd3s3', name: 'Bizeps Compound',                          category: 'biceps_c',  sets: 4, reps: '6–9',   rest: 90,  def: { studio: 'machine_chin',       barbell: 'chinup',          bodyweight: 'chinup' } },
      { slotKey: 'd3s4', name: 'Trizeps Compound',                         category: 'triceps_c', sets: 4, reps: '6–9',   rest: 90,  def: { studio: 'dips_weighted',      barbell: 'dips_weighted',   bodyweight: 'bench_dips' } },
      { slotKey: 'd3s5', name: 'Bizeps Isolation',                         category: 'biceps_i',  sets: 3, reps: '8–10',  rest: 60,  def: { studio: 'machine_curl',       barbell: 'db_curl',         bodyweight: 'db_curl' }, preferSwap: 'preacher_curl' },
      { slotKey: 'd3s6', name: 'Trizeps Isolation — Skull Crusher',        category: 'triceps_i', sets: 3, reps: '8–10',  rest: 60,  def: { studio: 'skull_crusher',      barbell: 'skull_crusher_db', bodyweight: 'diamond_pushup' } },
      { slotKey: 'd3s7', name: 'Trizeps Isolation — Overhead Kabel',      category: 'triceps_i', sets: 2, reps: '10–12', rest: 60,  def: { studio: 'cable_overhead_tri', barbell: 'overhead_db_tri', bodyweight: 'diamond_pushup' } },
      { slotKey: 'd3s8', name: 'Bauch — Dragon Flag (Hauptarbeit)',        category: 'abs',       sets: 4, reps: '4–6',   rest: 120, def: { studio: 'dragon_flag_full',   barbell: 'dragon_flag_full', bodyweight: 'dragon_flag_full' } }
    ]
  },
  {
    id: 'd4', name: 'Schultern & Rücken', short: 'D4', type: 'fixed', optional: true,
    slots: [
      { slotKey: 'd4s1', name: 'Schulter Press Compound (schwer)',  category: 'vpush',     sets: 4, reps: '6–9',   rest: 180, def: { studio: 'smith_ohp',         barbell: 'push_press',      bodyweight: 'hspu' } },
      { slotKey: 'd4s2', name: 'Vertikal Pull Compound',            category: 'vpull',     sets: 4, reps: '6–9',   rest: 150, def: { studio: 'lat_neutral',       barbell: 'pullup_neutral',  bodyweight: 'pullup_neutral' } },
      { slotKey: 'd4s3', name: 'Rudern Compound (Volumen)',         category: 'hpull',     sets: 4, reps: '6–9',   rest: 120, def: { studio: 'cable_row',         barbell: 'chest_row_db',    bodyweight: 'inverted_row' } },
      { slotKey: 'd4s4', name: 'Seitliche Schulter (Schwerpunkt)',  category: 'side_delt', sets: 4, reps: '10–12', rest: 60,  def: { studio: 'machine_lateral',   barbell: 'db_lateral',      bodyweight: 'band_lateral' } },
      { slotKey: 'd4s5', name: 'Seitliche Schulter (Variante)',     category: 'side_delt', sets: 3, reps: '12–15', rest: 60,  def: { studio: 'lean_away_lateral', barbell: 'cable_lateral',   bodyweight: 'band_lateral' } },
      { slotKey: 'd4s6', name: 'Hintere Schulter',                  category: 'rear_delt', sets: 3, reps: '10–12', rest: 60,  def: { studio: 'face_pull',         barbell: 'reverse_fly',     bodyweight: 'band_pull_apart' } },
      { slotKey: 'd4s7', name: 'Bauch — Dragon Flag',               category: 'abs',       sets: 3, reps: '5–8',   rest: 90,  def: { studio: 'dragon_flag',       barbell: 'dragon_flag',     bodyweight: 'dragon_flag' } }
    ]
  },
  {
    id: 'd5', name: 'Pull & Bauch', short: 'D5', type: 'fixed', optional: true,
    slots: [
      { slotKey: 'd5s1', name: 'Vertikal Pull (Volumen)',                     category: 'vpull',     sets: 4, reps: '6–9',   rest: 150, def: { studio: 'lat_wide',           barbell: 'pullup_wide',      bodyweight: 'pullup_wide' } },
      { slotKey: 'd5s2', name: 'Horizontal Pull Compound',                    category: 'hpull',     sets: 4, reps: '6–9',   rest: 120, def: { studio: 'cable_row',          barbell: 'bb_row',           bodyweight: 'inverted_row' } },
      { slotKey: 'd5s3', name: 'Rücken-Dicke (Variante)',                     category: 'hpull',     sets: 3, reps: '6–9',   rest: 120, def: { studio: 'chest_row_machine',  barbell: 'db_row',           bodyweight: 'inverted_row' } },
      { slotKey: 'd5s4', name: 'Hüft-dominant leicht',                        category: 'hip',       sets: 3, reps: '8–10',  rest: 120, def: { studio: 'back_ext',           barbell: 'rdl_db',           bodyweight: 'sl_rdl' } },
      { slotKey: 'd5s5', name: 'Hintere Schulter (Volumen)',                  category: 'rear_delt', sets: 3, reps: '12–15', rest: 60,  def: { studio: 'face_pull',          barbell: 'reverse_fly',      bodyweight: 'band_pull_apart' } },
      { slotKey: 'd5s6', name: 'Bauch — Dragon Flag',                         category: 'abs',       sets: 4, reps: '4–6',   rest: 120, def: { studio: 'dragon_flag_full',   barbell: 'dragon_flag_full', bodyweight: 'dragon_flag_full' } },
      { slotKey: 'd5s7', name: 'Bauch — Hängendes Beinheben/Toes-to-Bar',    category: 'abs',       sets: 3, reps: '8–12',  rest: 90,  def: { studio: 'hanging_leg_raise',  barbell: 'hanging_leg_raise', bodyweight: 'toes_to_bar' } }
    ]
  },
  { id: 'd6', name: 'Powerlifting', short: 'D6', type: 'powerlifting', slots: [] },
  { id: 'dW', name: 'Wildcard',     short: 'DW', type: 'wildcard',     slots: [] }
];

/* §9.6 Muskel-Unterkategorien für eigene Übungen → Mapping auf §9.2-Kategorien */
const SUBCATEGORIES = [
  { id: 'back_width',  label: 'Rücken-Breite',   cat: { compound: 'vpull',     isolation: 'vpull' } },
  { id: 'back_thick',  label: 'Rücken-Dicke',    cat: { compound: 'hpull',     isolation: 'hpull' } },
  { id: 'lower_back',  label: 'Unterer Rücken',  cat: { compound: 'hip',       isolation: 'hip' } },
  { id: 'delt_front',  label: 'Schulter vorne',  cat: { compound: 'vpush',     isolation: 'vpush' } },
  { id: 'delt_side',   label: 'Schulter seitlich', cat: { compound: 'side_delt', isolation: 'side_delt' } },
  { id: 'delt_rear',   label: 'Schulter hinten', cat: { compound: 'rear_delt', isolation: 'rear_delt' } },
  { id: 'chest_upper', label: 'Brust oben',      cat: { compound: 'hpush',     isolation: 'hpush' } },
  { id: 'chest_mid',   label: 'Brust Mitte',     cat: { compound: 'hpush',     isolation: 'hpush' } },
  { id: 'chest_lower', label: 'Brust unten',     cat: { compound: 'hpush',     isolation: 'hpush' } },
  { id: 'biceps',      label: 'Bizeps',          cat: { compound: 'biceps_c',  isolation: 'biceps_i' } },
  { id: 'triceps',     label: 'Trizeps',         cat: { compound: 'triceps_c', isolation: 'triceps_i' } },
  { id: 'abs',         label: 'Bauch',           cat: { compound: 'abs',       isolation: 'abs' } },
  { id: 'quads',       label: 'Quadrizeps',      cat: { compound: 'knee',      isolation: 'knee' } },
  { id: 'hamstrings',  label: 'Hamstrings',      cat: { compound: 'hip',       isolation: 'hip' } },
  { id: 'glutes',      label: 'Gesäß',           cat: { compound: 'hip',       isolation: 'hip' } },
  { id: 'cardio',      label: 'Cardio',          cat: { compound: 'cardio',    isolation: 'cardio' } }
];

/* §22 Anhang B — Standard-Mobility-Routine (Erstbefüllung, editierbar §23.7).
   Rep-basierte Angaben aus Anhang B bleiben im Namen erhalten, da das Datenmodell
   (§17 mobilityRoutine) ausschließlich durationSec kennt. */
const MOBILITY_DEFAULT = {
  warmup: [
    { id: 'w1', name: 'Allgemein (Seilspringen/Rudern/Gehen) 2–3 Min', durationSec: 150, side: false },
    { id: 'w2', name: 'Cat-Cow 8 Wdh.',                                durationSec: 40,  side: false },
    { id: 'w3', name: "World's Greatest Stretch 5/Seite",              durationSec: 45,  side: true },
    { id: 'w4', name: 'Standing Forward Fold 30 Sek',                  durationSec: 30,  side: false },
    { id: 'w5', name: 'Jefferson Curl 2×8',                            durationSec: 60,  side: false },
    { id: 'w6', name: 'Band Pull-Apart 15 Wdh.',                       durationSec: 30,  side: false },
    { id: 'w7', name: 'Schulterkreisen 10/Richtung',                   durationSec: 30,  side: false },
    { id: 'w8', name: 'Spezifisches Warm-up vor erstem Compound (50%×5, 70%×3, 85%×1)', durationSec: 120, side: false }
  ],
  cooldown: [
    { id: 'c1', name: 'Standing Forward Fold 60 Sek×2',                durationSec: 120, side: false },
    { id: 'c2', name: 'Seated Forward Fold 60 Sek×2',                  durationSec: 120, side: false },
    { id: 'c3', name: 'Couch Stretch 45 Sek/Seite',                    durationSec: 45,  side: true },
    { id: 'c4', name: 'Doorway Pec Stretch 45 Sek/Seite',              durationSec: 45,  side: true },
    { id: 'c5', name: '90/90 Hüfte 45 Sek/Seite',                      durationSec: 45,  side: true },
    { id: 'c6', name: "Child's Pose mit gestreckten Armen 60 Sek",     durationSec: 60,  side: false }
  ],
  daily: [
    { id: 'y1', name: 'Standing Forward Fold 2×60 Sek',                durationSec: 120, side: false },
    { id: 'y2', name: 'Jefferson Curl mit leichter Last 2×8',          durationSec: 60,  side: false },
    { id: 'y3', name: 'Couch Stretch 45 Sek/Seite',                    durationSec: 45,  side: true }
  ]
};

const MOBILITY_SECTIONS = [
  { id: 'warmup',   label: 'Warm-up' },
  { id: 'cooldown', label: 'Cool-down' },
  { id: 'daily',    label: 'Daily' }
];
