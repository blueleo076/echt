/* ECHT – Einstieg: Einrichten, Entsperren, Backup einspielen. */
(function () {
  'use strict';
  const Echt = (window.Echt = window.Echt || {});
  const { t } = Echt.i18n;
  const { h, icon, clear, toast, confirmDialog } = Echt.ui;
  const store = Echt.store;
  const C = window.EchtCore;

  const MIN_PASS = 10;

  function hero(sub) {
    return h('div', { class: 'hero' },
      h('img', { class: 'logo', src: 'icon.svg', alt: '' }),
      h('h1', { text: 'ECHT' }),
      h('p', { class: 'lead', text: sub }));
  }

  /**
   * Erster Start: Sprache wählen. Der Text steht bewusst in beiden Sprachen (wer die Wahl nicht versteht, kann sie nicht treffen);
   * vorgeschlagen wird die Sprache des Browsers.
   */
  function chooseLanguage(app, onDone) {
    const i18n = Echt.i18n;
    const suggested = i18n.detectLang();
    clear(app).append(h('div', { class: 'gate' },
      hero('Sprache wählen · Choose your language'),
      h('div', { class: 'stack' }, Object.entries(i18n.LANGS).map(([code, info]) => h('button', {
        type: 'button', class: 'btn block' + (code === suggested ? '' : ' secondary'), lang: code, text: info.name,
        onClick: () => { i18n.setLang(code, true); onDone(); },
      })))));
  }

  /** Sprachwechsel für Bildschirme ohne Tresor (Einrichten, Entsperren, öffentliche Prüfseite): ein Knopf je anderer Sprache. */
  function langSwitch(onChange) {
    const i18n = Echt.i18n;
    return h('span', { class: 'row' }, Object.entries(i18n.LANGS).filter(([code]) => code !== i18n.lang()).map(([code, info]) => h('button', {
      type: 'button', class: 'btn ghost small', lang: code, text: info.name,
      onClick: () => { i18n.setLang(code, true); onChange(); },
    })));
  }

  function fatal(app, title, text) {
    clear(app).append(h('div', { class: 'gate' }, hero(t('Dein Echtheits-Tresor')), Echt.ui.banner('bad', title, h('p', { text }))));
  }

  /** Passwort-Vorschlag: 6 zufällige Wörter aus der Wortliste (48 Bit) in der gewählten Sprache, leicht aufzuschreiben und zu tippen. */
  function suggestPassphrase() {
    const lang = Echt.i18n.lang();
    return Array.from(C.randomBytes(6), (b) => C.localizeWord(C.WORDS[b], lang)).join('-');
  }

  /** Erste Einrichtung in einem Schritt: Name, Passwort (sichtbar, damit kein zweites Feld nötig ist), fertig. */
  function setup(app, onReady) {
    const name = h('input', { type: 'text', maxLength: 40, autocomplete: 'nickname', placeholder: t('z. B. Anna') });
    const pass = h('input', { type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, 'aria-describedby': 'pass-help' });
    const err = h('p', { class: 'hint bad', role: 'alert' });
    const note = h('p', { class: 'hint', hidden: true, text: t('Schreibe dir diese Wörter auf einen Zettel. Ohne sie kommt niemand an deine Daten, auch wir nicht.') });
    const submit = h('button', { type: 'submit', class: 'btn block', text: t('Los geht’s') });
    let hidden = false;

    const toggle = h('button', {
      type: 'button', class: 'btn ghost small', text: t('Verbergen'),
      onClick: () => { hidden = !hidden; pass.type = hidden ? 'password' : 'text'; toggle.textContent = hidden ? t('Anzeigen') : t('Verbergen'); },
    });
    const suggest = h('button', {
      type: 'button', class: 'btn secondary small',
      onClick: () => {
        pass.value = suggestPassphrase();
        hidden = false; pass.type = 'text'; toggle.textContent = t('Verbergen');
        note.hidden = false; err.textContent = '';
      },
    }, icon('key'), t('Passwort vorschlagen'));

    async function create(passphrase) {
      submit.disabled = true;
      submit.textContent = t('Wird angelegt …');
      try {
        await store.create(name.value.trim(), passphrase);
        onReady();
      } catch (e) {
        err.textContent = e && e.message === 'vault-exists'
          ? t('In einem anderen Fenster wurde schon ein Tresor angelegt. Lade die Seite neu und entsperre ihn dort.')
          : t('Das hat nicht geklappt. Bitte versuche es erneut.');
        submit.disabled = false;
        submit.textContent = t('Los geht’s');
      }
    }

    const form = h('form', {
      class: 'card',
      onSubmit: async (ev) => {
        ev.preventDefault();
        err.textContent = '';
        if (!Echt.ui.cleanName(name.value)) { err.textContent = t('Wie heißt du? Bitte gib einen Namen ein.'); name.focus(); return; }
        if (pass.value.length < MIN_PASS) { err.textContent = t('Das Passwort braucht mindestens {MIN_PASS} Zeichen. Tipp: „Passwort vorschlagen“.', { MIN_PASS: MIN_PASS }); pass.focus(); return; }
        await create(pass.value);
      },
    },
      h('label', { class: 'field' }, h('span', { text: t('Wie heißt du?') }), name,
        h('small', { text: t('So sehen dich die Menschen, mit denen du dich verbindest.') })),
      h('label', { class: 'field' }, h('span', { text: t('Dein Passwort') }), pass,
        h('small', { id: 'pass-help', text: t('Mindestens {MIN_PASS} Zeichen, am besten ein Satz oder der Vorschlag. Vergisst du es, gibt es keine Rettung ohne Backup.', { MIN_PASS: MIN_PASS }) })),
      h('div', { class: 'row' }, suggest, toggle),
      note, err, submit);

    clear(app).append(h('div', { class: 'gate' },
      hero(t('Schütze dich vor Anrufen mit geklonter Stimme und vor gefälschten Beweisen. Alles bleibt auf deinem Gerät.')),
      form,
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn ghost small', text: t('Backup wiederherstellen'), onClick: () => restore(app, onReady, () => setup(app, onReady)) }))));
    name.focus();
  }

  function restore(app, onReady, back) {
    const file = h('input', { type: 'file', accept: '.echt-backup,.json,application/json', 'aria-label': t('Backup-Datei') });
    const pass = h('input', { type: 'password', autocomplete: 'current-password' });
    const err = h('p', { class: 'hint bad', role: 'alert' });
    const submit = h('button', { type: 'submit', class: 'btn block', text: t('Wiederherstellen') });

    const form = h('form', {
      class: 'card',
      onSubmit: async (ev) => {
        ev.preventDefault();
        err.textContent = '';
        if (!file.files[0]) { err.textContent = t('Bitte wähle deine Backup-Datei.'); return; }
        submit.disabled = true;
        submit.textContent = t('Wird entschlüsselt …');
        const reset = () => { submit.disabled = false; submit.textContent = t('Wiederherstellen'); };
        try {
          const env = JSON.parse(await file.files[0].text());
          const info = await store.readBackup(env, pass.value);
          const st = info.state;
          if (store.has()) {
            const ok = await confirmDialog({
              title: t('Vorhandenen Tresor ersetzen?'),
              body: t('{describeBackup} Auf diesem Gerät liegt schon ein Tresor. Das Backup ersetzt ihn unwiderruflich, samt Schlüssel, Kreis und Journal. Prüfe, ob es das richtige und das neueste Backup ist.', { describeBackup: store.describeBackup(info) }),
              confirmLabel: t('Ersetzen'), danger: true, typeToConfirm: t('ERSETZEN'),
            });
            if (!ok) { reset(); return; }
          }
          let vaultPass = pass.value;
          if (vaultPass.length < MIN_PASS) {
            vaultPass = await Echt.ui.newPasswordDialog({ title: t('Neues Tresor-Passwort'), text: t('Das Backup-Passwort ist kürzer als {MIN_PASS} Zeichen. Vergib ein neues Passwort für den Tresor auf diesem Gerät.', { MIN_PASS: MIN_PASS }) });
            if (!vaultPass) { reset(); return; }
          }
          await store.adopt(st, vaultPass);
          toast(vaultPass === pass.value ? t('Backup eingespielt. Das Backup-Passwort ist jetzt dein Tresor-Passwort.') : t('Backup eingespielt.'));
          onReady();
        } catch (e) {
          err.textContent = e && e.message === 'decrypt-failed'
            ? t('Passwort falsch oder Datei beschädigt.')
            : t('Diese Datei ist kein gültiges ECHT-Backup.');
          reset();
        }
      },
    },
      h('label', { class: 'field' }, h('span', { text: t('Backup-Datei') }), file),
      h('label', { class: 'field' }, h('span', { text: t('Backup-Passwort') }), pass,
        h('small', { text: t('Es wird zugleich dein neues Tresor-Passwort. Du kannst es später ändern.') })),
      err, submit);

    clear(app).append(h('div', { class: 'gate' },
      hero(t('Backup wiederherstellen')), form,
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn ghost small', text: t('Zurück'), onClick: back }))));
  }

  /** Gespeicherte Daten sind beschädigt: Es gibt immer einen Ausweg (Backup einspielen oder neu beginnen). */
  function broken(app, onReady) {
    clear(app).append(h('div', { class: 'gate' },
      hero(t('Dein Tresor lässt sich nicht lesen.')),
      Echt.ui.banner('bad', t('Gespeicherte Daten beschädigt'), h('p', { text: t('Spiele ein Backup ein oder beginne neu. Beginnst du neu, werden die beschädigten Daten gelöscht.') })),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn', onClick: () => restore(app, onReady, () => broken(app, onReady)) }, t('Backup einspielen')),
        h('button', {
          type: 'button', class: 'btn danger',
          onClick: async () => {
            const ok = await confirmDialog({ title: t('Neu beginnen?'), body: t('Die beschädigten Daten werden gelöscht. Danach legst du einen neuen Tresor an.'), confirmLabel: t('Löschen und neu beginnen'), danger: true, typeToConfirm: t('LÖSCHEN') });
            if (ok) { store.wipe(); setup(app, onReady); }
          },
        }, t('Neu beginnen')))));
  }

  function unlock(app, onReady) {
    const pass = h('input', { type: 'password', autocomplete: 'current-password', 'aria-label': t('Tresor-Passwort') });
    const err = h('p', { class: 'hint bad', role: 'alert' });
    const submit = h('button', { type: 'submit', class: 'btn block' }, icon('lock'), t('Entsperren'));

    const form = h('form', {
      class: 'card',
      onSubmit: async (ev) => {
        ev.preventDefault();
        err.textContent = '';
        submit.disabled = true;
        try {
          await store.unlock(pass.value);
          pass.value = '';
          onReady();
        } catch (e) {
          err.textContent = e && e.message === 'decrypt-failed' ? t('Das Passwort stimmt nicht.') : t('Der Tresor konnte nicht gelesen werden.');
          pass.select();
          setTimeout(() => { submit.disabled = false; }, 800);
        }
      },
    }, h('label', { class: 'field' }, h('span', { text: t('Tresor-Passwort') }), pass), err, submit);

    clear(app).append(h('div', { class: 'gate' },
      hero(t('Dein Tresor ist gesperrt.')), form,
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn ghost small', text: t('Backup wiederherstellen'), onClick: () => restore(app, onReady, () => unlock(app, onReady)) }),
        h('button', {
          type: 'button', class: 'btn ghost small', text: t('Passwort vergessen?'),
          onClick: async () => {
            const ok = await confirmDialog({
              title: t('Tresor löschen?'),
              body: t('Ohne Passwort kann der Tresor nicht geöffnet werden. Du kannst ihn löschen und neu beginnen oder ein Backup einspielen. Alle lokalen Daten, auch dein Schlüssel und alle Geheimnisse, sind dann weg.'),
              confirmLabel: t('Endgültig löschen'), danger: true, typeToConfirm: t('LÖSCHEN'),
            });
            if (ok) { store.wipe(); setup(app, onReady); }
          },
        }))));
    pass.focus();
  }

  Echt.gate = { setup, unlock, restore, broken, fatal, chooseLanguage, langSwitch };
})();
