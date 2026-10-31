/* ECHT – Einstellungen: Profil, Sicherheit, Backup, Journal, Anker, Selbsttest. */
(function () {
  'use strict';
  const Echt = (window.Echt = window.Echt || {});
  const { t } = Echt.i18n;
  const { h, rich, icon, toast, copy, share, download, modal, confirmDialog, promptDialog, banner, fmtDate, today } = Echt.ui;
  const store = Echt.store;
  const C = window.EchtCore;

  const MIN_PASS = 10;

  // Festes Referenzbeispiel: schützt davor, dass sich die Code-Ableitung unbemerkt ändert.
  const KAT = {
    secret: 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8',
    step: 1000,
    live: { a: 'lilie lampe honig', b: 'atlas ring erbse' },
    duress: { a: 'wabe nest geige', b: 'kuh marder gabel' },
    challenge: '123456',
    response: { a: 'topf radio schwan', b: 'butter papier storch' },
    pair: 'e26cec02645d',
  };

  const field = (label, input) => h('label', { class: 'field' }, h('span', { text: label }), input);

  function section(title, ...kids) {
    return h('section', { class: 'card stack' }, h('h2', { text: title }), kids);
  }

  // ------------------------------------------------------------- Passwort ----

  async function changePassword() {
    const has = store.hasPassphrase();
    const cur = h('input', { type: 'password', autocomplete: 'current-password' });
    const p1 = h('input', { type: 'password', autocomplete: 'new-password' });
    const p2 = h('input', { type: 'password', autocomplete: 'new-password' });
    const err = h('p', { class: 'hint bad', role: 'alert' });
    const res = await modal({
      title: has ? t('Passwort ändern') : t('Passwort setzen'),
      body: h('div', null, has ? field(t('Aktuelles Passwort'), cur) : null, field(t('Neues Passwort (mind. {MIN_PASS} Zeichen)', { MIN_PASS: MIN_PASS }), p1), field(t('Wiederholen'), p2), err),
      actions: [
        { label: t('Abbrechen'), value: null },
        {
          label: t('Speichern'), kind: 'primary', primary: true, value: true,
          validate: async () => {
            if (has && !(await store.checkPassphrase(cur.value))) { err.textContent = t('Das aktuelle Passwort stimmt nicht.'); return false; }
            if (p1.value.length < MIN_PASS) { err.textContent = t('Das neue Passwort ist zu kurz.'); return false; }
            if (p1.value !== p2.value) { err.textContent = t('Die beiden Passwörter sind nicht gleich.'); return false; }
            return true;
          },
        },
      ],
      dismissValue: null,
    });
    if (res === true) {
      await store.changePassphrase(p1.value);
      toast(t('Passwort gespeichert'));
      Echt.render();
    }
  }

  // --------------------------------------------------------------- Backup ----

  async function exportBackup() {
    const p1 = h('input', { type: 'password', autocomplete: 'new-password' });
    const p2 = h('input', { type: 'password', autocomplete: 'new-password' });
    const err = h('p', { class: 'hint bad', role: 'alert' });
    const res = await modal({
      title: t('Verschlüsseltes Backup'),
      body: h('div', null,
        h('p', { class: 'small', text: t('Das Backup enthält deinen Schlüssel, alle Geheimnisse und dein Journal, geschützt durch dieses Passwort. Bewahre Datei und Passwort getrennt und sicher auf.') }),
        field(t('Backup-Passwort (mind. {MIN_PASS} Zeichen)', { MIN_PASS: MIN_PASS }), p1), field(t('Wiederholen'), p2), err),
      actions: [
        { label: t('Abbrechen'), value: null },
        {
          label: t('Backup erstellen'), kind: 'primary', primary: true, value: true,
          validate: async () => {
            if (p1.value.length < MIN_PASS) { err.textContent = t('Das Passwort ist zu kurz.'); return false; }
            if (p1.value !== p2.value) { err.textContent = t('Die beiden Passwörter sind nicht gleich.'); return false; }
            return true;
          },
        },
      ],
      dismissValue: null,
    });
    if (res !== true) return;
    toast(t('Backup wird erstellt …'));
    const env = await store.exportBackup(p1.value);
    download('echt-backup-' + today() + '.echt-backup', JSON.stringify(env), 'application/json');
    toast(t('Backup gespeichert'));
  }

  async function restoreBackup() {
    const file = h('input', { type: 'file', accept: '.echt-backup,.json,application/json' });
    const pass = h('input', { type: 'password', autocomplete: 'current-password' });
    const err = h('p', { class: 'hint bad', role: 'alert' });
    let restored = null;
    let restoredInfo = null;
    const res = await modal({
      title: t('Backup einspielen'),
      body: h('div', null,
        banner('warn', t('Ersetzt alle aktuellen Daten'), h('p', { text: t('Schlüssel, Kreis und Journal dieses Geräts werden durch das Backup ersetzt.') })),
        field(t('Backup-Datei'), file), field(t('Backup-Passwort'), pass), err),
      actions: [
        { label: t('Abbrechen'), value: null },
        {
          label: t('Einspielen'), kind: 'danger', primary: true, value: true,
          validate: async () => {
            if (!file.files[0]) { err.textContent = t('Bitte wähle eine Datei.'); return false; }
            try {
              restoredInfo = await store.readBackup(JSON.parse(await file.files[0].text()), pass.value);
              restored = restoredInfo.state;
              return true;
            } catch (e) {
              err.textContent = e.message === 'decrypt-failed' ? t('Passwort falsch oder Datei beschädigt.') : t('Das ist kein gültiges ECHT-Backup.');
              return false;
            }
          },
        },
      ],
      dismissValue: null,
    });
    if (res === true && restored) {
      const sure = await confirmDialog({
        title: t('Dieses Backup einspielen?'),
        body: t('{describeBackup} Es ersetzt den aktuellen Tresor. Prüfe, ob es das richtige und das neueste Backup ist.', { describeBackup: store.describeBackup(restoredInfo) }),
        confirmLabel: t('Einspielen'), danger: true,
      });
      if (!sure) return;
      let vaultPass = pass.value;
      if (vaultPass.length < MIN_PASS) {
        vaultPass = await Echt.ui.newPasswordDialog({ title: t('Neues Tresor-Passwort'), text: t('Das Backup-Passwort ist kürzer als {MIN_PASS} Zeichen. Vergib ein neues Passwort für diesen Tresor.', { MIN_PASS: MIN_PASS }) });
        if (!vaultPass) return;
      }
      await store.adopt(restored, vaultPass);
      toast(vaultPass === pass.value ? t('Backup eingespielt. Das Backup-Passwort ist jetzt dein Tresor-Passwort.') : t('Backup eingespielt.'));
      Echt.render();
    }
  }

  // ------------------------------------------------------ Journal & Anker ----

  // Gründe erst beim Anzeigen übersetzen (die Sprache kann im Betrieb wechseln).
  const whyText = (reason, fallback) => {
    const text = {
      link: () => t('Verkettung unterbrochen'),
      start: () => t('der Anfang des Journals fehlt'),
      signer: () => t('Siegel eines fremden Schlüssels'),
      seal: () => t('Signatur oder Aufbau fehlerhaft'),
    }[reason];
    return text ? text() : fallback;
  };

  async function checkJournal(out) {
    const s = store.state;
    const r = await C.verifyChain(s.seals, { keyId: s.profile.identity.keyId });
    const warn = r.warnings && r.warnings.length
      ? h('p', { class: 'small', text: t('Hinweis: Bei {length} Siegel(n) liegt der Zeitpunkt vor dem des Vorgängers. Das passiert, wenn die Geräteuhr zurückgestellt wurde.', { length: r.warnings.length }) })
      : null;
    Echt.ui.clear(out).append(r.ok
      ? banner('ok', t('Journal in Ordnung'), h('div', null, h('p', { text: t('{length} Siegel, alle gültig und lückenlos verkettet.', { length: s.seals.length }) }), warn))
      : banner('bad', t('Problem im Journal'), h('p', { text: t('Siegel Nr. {v} besteht die Prüfung nicht ({whyText}).', { v: (r.index + 1), whyText: whyText(r.reason, t('unbekannter Fehler')) }) })));
  }

  function anchorText(seal, n) {
    const line = C.makeAnchor(seal, n, new Date());
    return line;
  }

  async function createAnchor(out) {
    const s = store.state;
    if (!s.seals.length) {
      Echt.ui.clear(out).append(banner('info', t('Noch nichts zu verankern'), h('p', { text: t('Erstelle zuerst mindestens ein Siegel.') })));
      return;
    }
    const last = s.seals[s.seals.length - 1];
    const line = anchorText(last, s.seals.length);
    Echt.ui.clear(out).append(h('div', { class: 'stack' },
      banner('info', t('Anker bereit'), h('p', { text: t('Schicke diese Zeile an dich selbst, an eine vertraute Person oder poste sie öffentlich. Ab dann kann niemand mehr behaupten, das Journal bis Siegel Nr. {length} sei später entstanden. Für Außenstehende speicherst du danach im jeweiligen Siegel den „Zeitbeleg“ (Journal-Auszug).', { length: s.seals.length }) })),
      h('div', { class: 'codebox', text: line }),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn', onClick: () => copy(line, t('Anker kopiert')) }, icon('copy'), t('Kopieren')),
        navigator.share ? h('button', { type: 'button', class: 'btn secondary', onClick: () => share({ title: t('ECHT-Anker'), text: line }) }, icon('share'), t('Teilen')) : null)));
  }

  async function verifyAnchor(text, out) {
    const s = store.state;
    const a = C.parseAnchor(text);
    if (!a) { Echt.ui.clear(out).append(banner('warn', t('Kein Anker erkannt'), h('p', { text: t('Füge genau die Zeile ein, ohne weiteren Text; sie beginnt mit „ECHT-ANKER/1“.') }))); return; }
    const idx = s.seals.findIndex((x) => x.id === a.head);
    if (idx < 0 || a.keyId !== s.profile.identity.keyId) {
      Echt.ui.clear(out).append(banner('bad', t('Passt nicht zu deinem Journal'), h('p', { text: t('Das Siegel mit dieser Kennung fehlt in deinem Journal oder gehört zu einem anderen Schlüssel.') })));
      return;
    }
    if (a.n !== idx + 1) {
      Echt.ui.clear(out).append(banner('bad', t('Passt nicht zu deinem Journal'), h('p', { text: t('Die Zeile nennt Stand Nr. {n}, dieses Siegel hat in deinem Journal aber die Nr. {v}.', { n: a.n, v: (idx + 1) }) })));
      return;
    }
    const r = await C.verifyChain(s.seals.slice(0, idx + 1), { keyId: s.profile.identity.keyId });
    if (!r.ok) {
      Echt.ui.clear(out).append(banner('bad', t('Journal bis zum Anker beschädigt'), h('p', { text: t('Siegel Nr. {v} besteht die Prüfung nicht.', { v: (r.index + 1) }) })));
      return;
    }
    const sealed = Date.parse(s.seals[idx].body.createdAt);
    const claimed = Date.parse(a.at);
    const impossible = Number.isNaN(claimed) || claimed < sealed;
    Echt.ui.clear(out).append(banner(impossible ? 'warn' : 'ok', impossible ? t('Stand passt, Datum nicht') : t('Anker passt zum Journal'),
      h('div', null,
        h('p', { text: t('Stand Nr. {v} ist in deinem Journal enthalten, und alles bis dahin ist lückenlos und unverändert.', { v: (idx + 1) }) }),
        h('p', { class: 'small', text: impossible
          ? t('Das Datum in der Zeile liegt vor dem Siegel selbst. Das kann nicht stimmen.')
          : t('Das Datum „{fmtDate}“ steht nur in der Zeile. Belegt ist es erst dadurch, dass du die Zeile zu diesem Zeitpunkt jemandem gegeben oder veröffentlicht hast.', { fmtDate: fmtDate(a.at) }) }))));
  }

  // ----------------------------------------------------------- Selbsttest ----

  async function selfTest(out) {
    const results = [];
    const check = async (name, fn) => {
      try { results.push([name, !!(await fn())]); } catch (e) { results.push([name, false]); }
    };
    await check(t('Kryptografie im Browser verfügbar'), () => C.hasCrypto());
    await check(t('Live-Code entspricht dem Referenzwert'), async () => (await Promise.all(['a', 'b'].map((r) => C.liveWords(KAT.secret, KAT.step, false, r)))).every((w, i) => w.join(' ') === KAT.live['ab'[i]]));
    await check(t('Notfall-Code entspricht dem Referenzwert'), async () => (await Promise.all(['a', 'b'].map((r) => C.liveWords(KAT.secret, KAT.step, true, r)))).every((w, i) => w.join(' ') === KAT.duress['ab'[i]]));
    await check(t('Rückfrage-Antwort entspricht dem Referenzwert'), async () => (await Promise.all(['a', 'b'].map((r) => C.responseWords(KAT.secret, KAT.challenge, false, r)))).every((w, i) => w.join(' ') === KAT.response['ab'[i]]));
    await check(t('Verbindungs-Nr. entspricht dem Referenzwert'), async () => (await C.pairId(KAT.secret)) === KAT.pair);
    await check(t('Siegel erzeugen und prüfen'), async () => {
      const id = await C.generateIdentity();
      const seal = await C.createSeal(id, 'Test', { type: 'text', name: '', size: 1, sha256: await C.sha256Hex(C.textBytes('x')) });
      const bad = JSON.parse(JSON.stringify(seal));
      bad.body.note = 'manipuliert';
      return (await C.verifySeal(seal)).ok && !(await C.verifySeal(bad)).ok;
    });
    await check(t('Verschlüsselung (AES-GCM) Rundreise'), async () => {
      const env = await C.encryptWithPassphrase({ a: 1 }, 'passwort', { iterations: 1000 });
      return (await C.decryptWithPassphrase(env, 'passwort')).a === 1;
    });
    await check(t('Dein Journal ist lückenlos'), async () => (await C.verifyChain(store.state.seals, { keyId: store.state.profile.identity.keyId })).ok);
    const ok = results.every((r) => r[1]);
    Echt.ui.clear(out).append(h('div', { class: 'stack' },
      banner(ok ? 'ok' : 'bad', ok ? t('Alle Tests bestanden') : t('Mindestens ein Test ist fehlgeschlagen'), null),
      h('ul', { class: 'list' }, results.map(([name, pass]) => h('li', { class: 'item' },
        h('span', { class: 'chip ' + (pass ? 'ok' : 'bad') }, icon(pass ? 'check' : 'x'), pass ? 'OK' : t('Fehler')), h('span', { class: 'grow', text: name }))))));
  }

  // ----------------------------------------------------------------- Seite ---

  function view() {
    const s = store.state;
    const root = h('div', { class: 'stack' });
    root.append(h('h1', { text: t('Tresor') }));

    // Als App installieren: danach öffnet sich ECHT per Symbol, auch ohne gestarteten Server und ohne Internet.
    const standalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
    if (!standalone) {
      const offer = Echt.installPrompt;
      root.append(section(t('Als App installieren'),
        h('p', { class: 'small', text: t('Dann öffnet sich ECHT wie ein normales Programm mit eigenem Symbol. Du musst nichts mehr starten, und es funktioniert ohne Internet.') }),
        offer
          ? h('button', { type: 'button', class: 'btn', onClick: async () => { offer.prompt(); try { await offer.userChoice; } catch (e) { /* abgebrochen */ } Echt.installPrompt = null; Echt.render(); } }, icon('download'), t('Installieren'))
          : h('p', { class: 'small muted', text: t('Im Browser-Menü steht „App installieren“ (Chrome, Edge) oder „Zum Startbildschirm hinzufügen“ (Handy). Das klappt, wenn du ECHT über localhost oder https geöffnet hast.') })));
    }

    root.append(section(t('Profil'),
      h('dl', { class: 'kv' },
        h('dt', { text: t('Name') }), h('dd', { text: s.profile.name }),
        h('dt', { text: t('Schlüssel-ID') }), h('dd', { class: 'mono', text: C.formatKeyId(s.profile.identity.keyId) })),
      h('p', { class: 'small muted', text: t('Die Schlüssel-ID ist der Fingerabdruck deiner Siegel. Andere erkennen daran, dass ein Siegel von dir stammt.') }),
      h('button', {
        type: 'button', class: 'btn secondary small',
        onClick: async () => {
          const v = await promptDialog({ title: t('Namen ändern'), label: t('Dein Name'), value: s.profile.name, maxLength: 40 });
          if (v && v.trim()) { s.profile.name = v.trim(); await store.save(); Echt.render(); }
        },
      }, t('Namen ändern'))));

    const i18n = Echt.i18n;
    root.append(section(t('Sprache'),
      h('div', { class: 'row' }, Object.entries(i18n.LANGS).map(([code, info]) => h('button', {
        type: 'button', class: 'btn' + (code === i18n.lang() ? '' : ' secondary'), lang: code, text: info.name, 'aria-pressed': code === i18n.lang() ? 'true' : 'false',
        onClick: () => { i18n.setLang(code, true); Echt.render(); },
      }))),
      h('p', { class: 'small muted', text: t('Die Wort-Codes sind in beiden Sprachen dieselben: Wer ECHT auf Deutsch nutzt und wer es auf Englisch nutzt, kann sich gegenseitig prüfen.') })));

    const lockSel = h('select', {
      'aria-label': t('Automatisch sperren nach'),
      onChange: async (e) => { s.settings.autoLockMin = parseInt(e.target.value, 10); await store.save(); toast(t('Gespeichert')); },
    }, [[1, t('1 Minute')], [5, t('5 Minuten')], [15, t('15 Minuten')], [0, t('nie')]].map(([v, l]) => h('option', { value: String(v), selected: s.settings.autoLockMin === v, text: l })));

    root.append(section(t('Sicherheit'),
      store.hasPassphrase()
        ? banner('ok', t('Tresor ist verschlüsselt'), h('p', { text: t('AES-256, Schlüssel aus deinem Passwort (PBKDF2, 600.000 Runden).') }))
        : banner('warn', t('Tresor ohne Passwort'), h('p', { text: t('Wer dieses Gerät benutzt, kann deine Codes und Schlüssel lesen. Setze ein Passwort.') })),
      field(t('Automatisch sperren nach'), lockSel),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn secondary', onClick: changePassword }, icon('key'), store.hasPassphrase() ? t('Passwort ändern') : t('Passwort setzen')),
        store.hasPassphrase() ? h('button', { type: 'button', class: 'btn secondary', onClick: () => Echt.lock() }, icon('lock'), t('Jetzt sperren')) : null)));

    root.append(section(t('Backup'),
      h('p', { class: 'small', text: t('Geht dieses Gerät verloren, sind Schlüssel und Kreis weg. Ein verschlüsseltes Backup ist die einzige Rettung. Es gibt keinen Server, der etwas wiederherstellen könnte.') }),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn', onClick: exportBackup }, icon('download'), t('Backup speichern')),
        h('button', { type: 'button', class: 'btn secondary', onClick: restoreBackup }, t('Backup einspielen')))));

    const journalOut = h('div', { 'aria-live': 'polite' });
    const anchorOut = h('div', { 'aria-live': 'polite' });
    const anchorIn = h('input', { type: 'text', 'aria-label': t('Anker einfügen'), placeholder: 'ECHT-ANKER/1 n=… head=… key=… at=…', spellcheck: false, autocomplete: 'off' });
    root.append(section(t('Journal & Anker'),
      h('p', { class: 'small', text: t('Dein Journal ist eine Kette: jedes Siegel enthält die Kennung des vorherigen. Ein Anker ist der aktuelle Stand als eine Zeile. Gibst du ihn aus der Hand, ist der Zeitpunkt deiner Siegel unabhängig belegt.') }),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn secondary', onClick: () => checkJournal(journalOut) }, icon('check'), t('Journal prüfen')),
        h('button', { type: 'button', class: 'btn secondary', onClick: () => createAnchor(anchorOut) }, icon('anchor'), t('Anker erzeugen'))),
      journalOut, anchorOut,
      field(t('Anker prüfen'), anchorIn),
      h('button', { type: 'button', class: 'btn secondary small', onClick: () => verifyAnchor(anchorIn.value, anchorOut) }, t('Anker abgleichen'))));

    const testOut = h('div', { 'aria-live': 'polite' });
    root.append(section(t('Selbsttest'),
      h('p', { class: 'small', text: t('Prüft, ob die Kryptografie auf diesem Gerät richtig rechnet.') }),
      h('button', { type: 'button', class: 'btn secondary', onClick: () => selfTest(testOut) }, t('Selbsttest starten')), testOut));

    root.append(h('details', { class: 'more' }, h('summary', { text: t('Was ECHT kann und was nicht') }),
      h('div', { class: 'stack' },
        h('p', null, rich('<b>Wort-Codes: </b>Drei Wörter aus 256 ergeben rund 16,7 Millionen Möglichkeiten. Der Code gilt nur wenige Minuten. Ein Betrüger hat deshalb praktisch einen einzigen Versuch. Er schützt nicht, wenn jemand dein entsperrtes Gerät oder den Einladungs-Code in der Hand hat.')),
        h('p', null, rich('<b>Siegel: </b>Sie belegen, dass ein Inhalt seit dem Versiegeln unverändert ist und von diesem Schlüssel stammt. Ob der Inhalt wahr ist, belegen sie nicht.')),
        h('p', null, rich('<b>Zeitpunkt: </b>Er stammt von der Uhr des Geräts. Unabhängig belegt ist er erst durch einen weitergegebenen Anker.')),
        h('p', null, rich('<b>Verlust: </b>Ohne Backup und Passwort gibt es keinen Zugang mehr. Das ist gewollt: Es gibt keine Hintertür.')),
        h('p', null, rich('<b>Prüfstand: </b>ECHT verwendet nur die im Browser eingebauten, geprüften Kryptofunktionen (WebCrypto). Das Programm selbst wurde noch nicht von Dritten auditiert.')))));

    root.append(section(t('Gefahrenzone'),
      h('p', { class: 'small', text: t('Löscht Schlüssel, Kreis und Journal von diesem Gerät. Ohne Backup ist das endgültig.') }),
      h('button', {
        type: 'button', class: 'btn danger',
        onClick: async () => {
          const ok = await confirmDialog({ title: t('Alles löschen?'), body: t('Schlüssel, Geheimnisse und Siegel werden von diesem Gerät entfernt.'), confirmLabel: t('Alles löschen'), danger: true, typeToConfirm: t('LÖSCHEN') });
          if (ok) { store.wipe(); location.hash = ''; Echt.render(); }
        },
      }, icon('trash'), t('Alles löschen'))));

    root.append(h('p', { class: 'small muted center', text: t('ECHT 1.0 · alles bleibt auf deinem Gerät') }),
      h('p', { class: 'small muted center' }, h('a', { href: 'https://github.com/blueleo076/echt', target: '_blank', rel: 'noopener noreferrer', text: t('Quellcode und Lizenz (AGPL-3.0)') })));
    return root;
  }

  Echt.settings = { render: view, KAT };
})();
