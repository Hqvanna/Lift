/* Lift — Bootstrap (§1.3, §1.7, §1.9, §24.3 kein Splash) */
'use strict';

/* Globale Fehlererfassung → §32.2 errorLog */
window.addEventListener('error', function (ev) {
  logError(ev.error || { message: ev.message, stack: (ev.filename || '') + ':' + (ev.lineno || 0) });
});
window.addEventListener('unhandledrejection', function (ev) {
  logError(ev.reason || { message: 'Unbehandelte Promise-Ablehnung' });
});

/* Doppel-Tap-Zoom unterdrücken (§1.4) */
document.addEventListener('gesturestart', e => e.preventDefault());

function boot() {
  loadStore();

  /* §1.9 Autosave: unterbrochene Session automatisch fortsetzen */
  if (store.activeSession) {
    ui.tab = 'training';
    ui.selectedDay = store.activeSession.dayId;
  } else {
    ui.selectedDay = 'd1';
  }

  render();

  /* §1.3 Service-Worker; §32.1 Update ohne Banner */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(e => logError(e));
    });
  }

  /* Sicherheitsnetz: beim Verlassen/Hintergrund noch einmal persistieren */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveStore();
  });
  window.addEventListener('pagehide', () => saveStore());
}

boot();
