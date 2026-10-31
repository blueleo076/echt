/* ECHT – Start, Routing, Gerüst, automatische Sperre. */
(function () {
  'use strict';

  // Nicht in fremde Seiten einbettbar (Schutz vor Clickjacking). Per <meta> lässt sich frame-ancestors
  // nicht setzen, darum die Prüfung hier; Hoster setzen zusätzlich den Header (siehe serve.mjs).
  if (window.top !== window.self) {
    const box = document.getElementById('app');
    box.textContent = window.EchtI18n.t('ECHT lässt sich nicht in andere Seiten einbetten. Bitte öffne die App direkt in einem eigenen Fenster.');
    return;
  }

  const Echt = (window.Echt = window.Echt || {});
  const { t } = Echt.i18n;
  const { h, icon, clear } = Echt.ui;
  const store = Echt.store;
  const C = window.EchtCore;
  const app = document.getElementById('app');

  const tabs = () => [['circle', t('Kreis'), 'users'], ['seals', t('Siegel'), 'seal'], ['verify', t('Prüfen'), 'search'], ['settings', t('Tresor'), 'sliders']];

  let token = 0;
  let lastHash = null;
  let lastActive = Date.now();

  const parts = () => location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const touch = () => { lastActive = Date.now(); };

  /** Sperrt diesen Tresor. `quiet`: kein Signal an andere Fenster (wenn die Sperre von dort kam). */
  function lock(reason, quiet) {
    Echt.ui.closeAllModals(); // offene Dialoge (z. B. Einladungs-Code) dürfen nicht über dem Sperrbildschirm stehen bleiben
    const wasOpen = store.isUnlocked();
    store.lock();
    if (wasOpen && !quiet) store.signalLock();
    clear(document.getElementById('toasts'));
    render().then(() => { if (reason) Echt.ui.toast(reason); });
  }

  // Auto-Sperre nach Untätigkeit. Zeitstempel statt Timer: greift auch nach Standby oder gedrosselten Hintergrund-Tabs.
  function checkIdle() {
    if (!store.isUnlocked() || !store.hasPassphrase()) return;
    const min = store.state.settings.autoLockMin;
    if (min > 0 && Date.now() - lastActive > min * 60000) lock();
  }

  function shell(active, content) {
    clear(app).append(
      h('header', { class: 'topbar' },
        h('span', { class: 'brand' }, h('img', { class: 'logo', src: 'icon.svg', alt: '' }), 'ECHT'),
        store.hasPassphrase() ? h('button', { type: 'button', class: 'btn ghost small', 'aria-label': t('Tresor sperren'), onClick: () => lock() }, icon('lock'), t('Sperren')) : null),
      h('main', { class: 'main', id: 'main', tabindex: -1 }, content),
      h('nav', { class: 'tabbar', 'aria-label': t('Hauptmenü') }, tabs().map(([key, label, ic]) =>
        h('a', { class: 'tab', href: '#/' + key, 'aria-current': active === key ? 'page' : null }, icon(ic), label))));
  }

  function publicShell(content) {
    clear(app).append(
      h('header', { class: 'topbar' },
        h('span', { class: 'brand' }, h('img', { class: 'logo', src: 'icon.svg', alt: '' }), 'ECHT'),
        h('span', { class: 'row' }, Echt.gate.langSwitch(render), h('a', { class: 'btn ghost small', href: '#/circle' }, icon('lock'), t('Zum Tresor')))),
      h('main', { class: 'main', id: 'main', tabindex: -1 }, content));
  }

  /** Unter Einrichten und Entsperren: Sprachwechsel und der Weg zur öffentlichen Prüfseite. */
  function addGateExtras() {
    const g = app.querySelector('.gate');
    if (!g) return;
    g.append(h('p', { class: 'center small' }, h('a', { href: '#/verify', text: t('Nur ein Siegel prüfen (ohne Tresor)') })),
      h('div', { class: 'row' }, Echt.gate.langSwitch(render)));
  }

  async function render() {
    const mine = ++token;
    Echt.ui.runCleanups();
    document.title = t('ECHT – Dein Echtheits-Tresor');
    const p = parts();

    if (!C.hasCrypto()) {
      Echt.gate.fatal(app, t('Kryptografie nicht verfügbar'), t('Dieser Browser stellt die nötigen Sicherheitsfunktionen nicht bereit. Öffne ECHT über https:// oder http://localhost mit einem aktuellen Browser.'));
      return;
    }

    if (!store.isUnlocked()) {
      if (p[0] === 'verify') { publicShell(Echt.verify.render(p)); return; }
      if (!store.storageAvailable()) {
        Echt.gate.fatal(app, t('Speicher gesperrt'), t('Der Browser erlaubt kein lokales Speichern (privates Fenster oder blockierte Website-Daten). Ohne Speicher kann ECHT deinen Schlüssel nicht aufbewahren.'));
        return;
      }
      if (!store.has()) {
        if (!Echt.i18n.hasChoice()) { Echt.gate.chooseLanguage(app, render); return; } // erster Start
        Echt.gate.setup(app, render);
        addGateExtras();
        return;
      }
      if (!store.isReadable()) { Echt.gate.broken(app, render); return; }
      Echt.gate.unlock(app, render); // ein Tresor öffnet sich nie ohne Passwort
      addGateExtras();
      return;
    }

    touch();
    const section = p[0] || 'circle';
    let node;
    try {
      switch (section) {
        case 'circle': node = Echt.circle.render(p); break;
        case 'seals': node = Echt.seals.render(p); break;
        case 'verify': node = Echt.verify.render(p); break;
        case 'settings': node = Echt.settings.render(p); break;
        default: location.replace('#/circle'); return;
      }
      node = await node;
    } catch (e) {
      node = Echt.ui.banner('bad', t('Das hat nicht geklappt'), h('p', { text: t('Beim Anzeigen ist ein Fehler aufgetreten. Bitte lade die Seite neu.') }));
    }
    if (mine !== token) return;

    shell(section, node);
    const main = document.getElementById('main');
    if (location.hash !== lastHash) {
      window.scrollTo(0, 0);
      main.focus({ preventScroll: true });
    }
    lastHash = location.hash;
  }

  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => addEventListener(ev, touch, { passive: true }));
  setInterval(checkIdle, 5000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkIdle(); });

  // Mehrere Fenster: Sperren, Ändern und Löschen in einem Fenster gelten für alle.
  store.onStale = () => lock(t('Der Tresor wurde in einem anderen Fenster geändert. Bitte entsperre ihn erneut.'), true);
  window.addEventListener('storage', (e) => {
    const relevant = e.key === null || e.key === store.KEY || e.key === store.LOCK_SIGNAL;
    if (!relevant) return;
    Echt.ui.closeAllModals(); // veraltete Dialoge (z. B. „Backup ersetzen?“) dürfen nach einer Änderung anderswo nichts mehr auslösen
    if (!store.isUnlocked()) { if (e.key !== store.LOCK_SIGNAL) render(); return; }
    if (e.key === store.LOCK_SIGNAL) lock(t('Der Tresor wurde in einem anderen Fenster gesperrt.'), true);
    else lock(t('Der Tresor wurde in einem anderen Fenster geändert. Bitte entsperre ihn erneut.'), true);
  });

  window.addEventListener('hashchange', render);
  window.addEventListener('unhandledrejection', (e) => {
    const m = e.reason && e.reason.message;
    if (m === 'decrypt-failed' || m === 'stale') return;
    Echt.ui.toast(t('Etwas ist schiefgelaufen. Bitte versuche es erneut.'), 'bad');
  });

  // „Als App installieren“: Der Browser meldet, dass ECHT installierbar ist. Den Knopf zeigen die Einstellungen.
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); Echt.installPrompt = e; });
  window.addEventListener('appinstalled', () => { Echt.installPrompt = null; });

  Echt.render = render;
  Echt.lock = () => lock();

  // Offline-Fähigkeit (nur über http/https, nicht bei ?nosw)
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    if (/[?&]nosw\b/.test(location.search)) {
      navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
    } else {
      // Trusted Types: Die CSP erlaubt nur diese eine Richtlinie, und sie liefert ausschließlich die Adresse des eigenen Workers.
      const policy = window.trustedTypes
        ? window.trustedTypes.createPolicy('echt-sw', { createScriptURL: (u) => { if (u !== 'sw.js') throw new Error('bad-url'); return u; } })
        : null;
      navigator.serviceWorker.register(policy ? policy.createScriptURL('sw.js') : 'sw.js').catch(() => { /* optional */ });
    }
  }

  render();
})();
