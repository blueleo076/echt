/* ECHT – Vertrauenskreis: Personen verbinden, Wort-Codes zeigen und prüfen, Rückfragen. */
(function () {
  'use strict';
  const Echt = (window.Echt = window.Echt || {});
  const { t } = Echt.i18n;
  const { h, rich, icon, toast, copy, share, confirmDialog, promptDialog, modal, wordsEl, banner, every, later, onCleanup, fmtDate, safeText, cleanName } = Echt.ui;
  const store = Echt.store;
  const C = window.EchtCore;

  // Texte erst beim Anzeigen übersetzen (die Sprache kann im Betrieb wechseln), darum Funktionen statt Konstanten.
  const takenMsg = () => t('Diesen Namen oder einen, der genauso aussieht, gibt es schon im Kreis. Wähle einen eindeutigen, z. B. „Papa (Handy)“.');
  const exoticMsg = () => t('Der Name enthält ungewöhnliche Buchstaben (etwa Kapitälchen oder Lautschrift), die normalen Buchstaben zum Verwechseln ähnlich sehen. Verwende gewöhnliche Buchstaben.');
  const mixedMsg = () => t('Der Name mischt Schriften (etwa lateinische mit kyrillischen Buchstaben). Das sieht täuschend echt aus und ist ein beliebter Trick. Schreibe den Namen durchgehend in einer Schrift.');

  /**
   * Fehlertext, wenn der Name nicht erlaubt ist, sonst null. Verglichen wird das „Skelett“ des Namens
   * (ohne Akzente, unsichtbare Zeichen, Groß-/Kleinschreibung, Lookalikes wie kyrillisches а), damit niemand
   * einen zweiten, gleich aussehenden Kontakt anlegen kann, dessen Siegel dann als „aus dem Kreis“ erscheinen.
   */
  const nameError = (name, exceptId) => {
    if (C.mixesScripts(name)) return mixedMsg();
    if (C.hasExoticLetters(name)) return exoticMsg();
    const key = C.nameKey(name);
    return store.state.contacts.some((c) => c.id !== exceptId && C.nameKey(c.name) === key) ? takenMsg() : null;
  };

  /** Verhindert Mehrfach-Ausführung, solange die vorige läuft (Doppelklick auf „Absenden“ darf nichts doppelt anlegen). */
  const once = (fn) => {
    let busy = false;
    return async (ev) => {
      ev.preventDefault();
      if (busy) return;
      busy = true;
      try { await fn(ev); } finally { busy = false; }
    };
  };

  const pairNo = (c) => c.pairNo || '';
  const back = (href, label) => h('a', { class: 'back', href }, icon('back'), label);

  // ------------------------------------------------------------------ Liste --

  function listView() {
    const s = store.state;
    const root = h('div', { class: 'stack' });
    root.append(h('div', null,
      h('h1', { text: t('Vertrauenskreis') }),
      h('p', { class: 'lead', text: t('Menschen, denen du am Telefon trauen willst. Ein gemeinsames Geheimnis beweist, wer wirklich dran ist, auch wenn Stimme und Nummer täuschend echt wirken.') })));

    if (!s.contacts.length) {
      root.append(h('div', { class: 'card stack' },
        h('h2', { text: t('Verbinde die erste Person') }),
        h('p', { text: t('Zum Beispiel deine Mutter, dein Kind oder deinen Partner. Ihr tauscht einmal einen Code aus. Danach erkennt ihr euch am Telefon an Wörtern, die jede Minute wechseln.') }),
        h('a', { class: 'btn block', href: '#/circle/add' }, icon('plus'), t('Person verbinden')),
        h('details', { class: 'more' }, h('summary', { text: t('So funktioniert’s') }),
          h('ol', { class: 'steps' },
            h('li', null, h('span', null, rich('Ihr verbindet euch <b>einmal</b>, am besten persönlich oder über einen verschlüsselten Messenger.'))),
            h('li', null, h('span', null, rich('Bei einem dringenden Anruf nennt die Person ihren <b>aktuellen Wort-Code</b>.'))),
            h('li', null, h('span', null, t('Stimmt er nicht: auflegen und unter der bekannten Nummer zurückrufen. Nie Geld überweisen.')))))));
    } else {
      root.append(h('ul', { class: 'list' }, s.contacts.map((c) => h('li', null,
        h('a', { class: 'item', href: '#/circle/' + c.id },
          h('span', { class: 'avatar', text: Echt.ui.initial(c.name) }),
          h('span', { class: 'grow' }, h('div', { class: 'title', text: c.name }),
            h('div', { class: 'sub', text: c.pub ? t('Siegel dieser Person werden erkannt') : t('Verbindungs-Nr. {pairNo}', { pairNo: pairNo(c) }) })),
          icon('back')))))); // Pfeil wird per CSS gedreht
    }
    if (s.contacts.length) root.append(h('a', { class: 'btn block', href: '#/circle/add' }, icon('plus'), t('Person verbinden')));
    return root;
  }

  // ------------------------------------------------------------ Hinzufügen --

  function codePanel(title, intro, code, extra) {
    return h('div', { class: 'card stack' },
      h('h2', { text: title }), intro,
      h('div', { class: 'codebox', tabindex: 0, 'aria-label': t('Verbindungs-Code'), text: code }),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn', onClick: () => copy(code, t('Code kopiert')) }, icon('copy'), t('Kopieren')),
        navigator.share ? h('button', { type: 'button', class: 'btn secondary', onClick: () => share({ title: 'ECHT', text: code }) }, icon('share'), t('Teilen')) : null),
      extra);
  }

  // Platzhalter-Name für eine neu eingeladene Person; als solcher gilt er in beiden Sprachen (der Tresor kann die Sprache wechseln).
  const isDefaultName = (nm) => /^(Neue Person|New person)( \d+)?$/.test(nm);
  const freeDefaultName = () => {
    const base = t('Neue Person');
    let n = base;
    for (let i = 2; nameError(n); i++) n = base + ' ' + i;
    return n;
  };

  const codeProblem = (e) => (e.message === 'bad-checksum' ? t('Der Code ist beschädigt. Vermutlich fehlt etwas oder es ist ein Tippfehler drin. Kopiere ihn noch einmal vollständig.')
    : e.message === 'bad-binding' ? t('Dieser Code ist gefälscht oder verändert: Der Schlüssel darin gehört nicht zum Absender. Nimm ihn nicht an.')
      : t('Das sieht nicht nach einem ECHT-Code aus.'));

  /** Übernimmt einen Antwort-Code. Gibt einen Fehlertext zurück, oder null bei Erfolg. */
  async function importReply(dec, c) {
    if (!c) return t('Zu dieser Antwort gibt es auf diesem Gerät keine Einladung. Hast du die Person von hier aus eingeladen?');
    if (dec.data.p !== c.id) return t('Dieser Antwort-Code gehört zu einer anderen Verbindung.');
    if (c.pub) return t('Diese Person ist schon vollständig verbunden.');
    if (!(await C.verifyReplyMac(c.secret, dec.data))) return t('Dieser Antwort-Code ist gefälscht oder verändert. Nimm ihn nicht an.');
    if (c.pub) return t('Diese Person ist schon vollständig verbunden.'); // nach den awaits noch einmal
    c.pub = dec.data.k;
    c.pubKeyId = await C.keyIdOf(dec.data.k);
    c.inviteCode = null;
    if (isDefaultName(c.name)) { // hat die Einladung keinen Namen bekommen, übernimmt die Antwort den Namen der Person
      const proposed = cleanName(dec.data.n);
      if (proposed && !nameError(proposed, c.id)) c.name = proposed;
    }
    await store.save();
    return null;
  }

  /** Eingabefeld für einen Antwort-Code (nach dem Einfügen geht es von selbst weiter). */
  function replyBox(c, onDone) {
    const box = h('textarea', { maxLength: 6000, 'aria-label': t('Antwort-Code'), placeholder: t('Antwort-Code hier einfügen'), spellcheck: false, autocapitalize: 'off' });
    const err = h('p', { class: 'hint bad', role: 'alert' });
    const form = h('form', {
      class: 'stack',
      onSubmit: once(async () => {
        err.textContent = '';
        if (!box.value.trim()) return;
        let dec;
        try { dec = await C.decodeCode(box.value); } catch (e) { err.textContent = codeProblem(e); return; }
        if (dec.kind !== 'R') { err.textContent = t('Das ist eine Einladung, keine Antwort. Hier gehört der Code hin, den dir {name} zurückgeschickt hat.', { name: c.name }); return; }
        const problem = await importReply(dec, c);
        if (problem) { err.textContent = problem; return; }
        toast(t('Verbunden. Siegel von {name} werden jetzt erkannt.', { name: c.name }));
        onDone();
      }),
    }, box, err, h('button', { type: 'submit', class: 'btn secondary', text: t('Antwort übernehmen') }));
    box.addEventListener('paste', () => setTimeout(() => { if (box.value.trim()) form.requestSubmit(); }, 0));
    return form;
  }

  function showInviteCode(c) {
    return modal({
      title: t('Einladungs-Code'), dismissValue: true,
      body: h('div', { class: 'stack' }, h('p', { class: 'small', text: t('Enthält das gemeinsame Geheimnis. Nur sicher weitergeben.') }), h('div', { class: 'codebox', text: c.inviteCode })),
      actions: [{ label: t('Kopieren'), value: 'copy', kind: 'secondary', collect: () => { copy(c.inviteCode, t('Code kopiert')); return true; } }, { label: t('Schließen'), value: true, kind: 'primary', primary: true }],
    });
  }

  /** Alles auf einer Seite: Einladung erzeugen oder einen erhaltenen Code (Einladung oder Antwort) einfügen. */
  function addView() {
    const s = store.state;
    const root = h('div', { class: 'stack' }, back('#/circle', t('Kreis')));
    const stage = h('div', { class: 'stack' });
    root.append(stage);
    showStart();
    return root;

    function showStart() {
      const name = h('input', { type: 'text', maxLength: 40, autocomplete: 'off', placeholder: t('z. B. Mama') });
      const nameErr = h('p', { class: 'hint bad', role: 'alert' });
      const inviteCard = h('form', {
        class: 'card stack',
        onSubmit: once(async () => {
          nameErr.textContent = '';
          let nm = cleanName(name.value);
          if (nm) {
            const first = nameError(nm);
            if (first) { nameErr.textContent = first; return; }
          } else {
            nm = freeDefaultName();
          }
          const secret = C.newSecret();
          const id = await C.pairId(secret);
          const code = await C.makeInvite(s.profile.identity, s.profile.name, secret);
          const no = await C.pairNumber(secret);
          if (cleanName(name.value)) {
            const late = nameError(nm); // nach den awaits noch einmal: der Kreis kann sich inzwischen geändert haben
            if (late) { nameErr.textContent = late; return; }
          } else {
            nm = freeDefaultName();
          }
          const c = { id, role: 'a', name: nm, secret, pairNo: no, pub: null, pubKeyId: null, inviteCode: code, createdAt: new Date().toISOString() };
          s.contacts.push(c);
          await store.save();
          showInvite(c);
        }),
      },
        h('h2', { text: t('Ich lade jemanden ein') }),
        h('p', { class: 'small muted', text: t('Du erzeugst einen Code und gibst ihn der Person persönlich oder über einen verschlüsselten Messenger wie Signal weiter.') }),
        h('label', { class: 'field' }, h('span', { text: t('Name der Person (kann leer bleiben)') }), name),
        nameErr, h('button', { type: 'submit', class: 'btn block' }, icon('plus'), t('Einladungs-Code erzeugen')));

      const code = h('textarea', { maxLength: 6000, 'aria-label': t('Code'), placeholder: t('Code hier einfügen'), spellcheck: false, autocapitalize: 'off' });
      const codeErr = h('p', { class: 'hint bad', role: 'alert' });
      const pasteCard = h('form', {
        class: 'card stack',
        onSubmit: once(async () => {
          codeErr.textContent = '';
          if (!code.value.trim()) return;
          let dec;
          try { dec = await C.decodeCode(code.value); } catch (e) { codeErr.textContent = codeProblem(e); return; }
          if (dec.kind === 'R') { // Antwort auf eine Einladung, die von hier aus verschickt wurde
            const c = store.contactById(dec.data.p);
            const problem = await importReply(dec, c);
            if (problem) { codeErr.textContent = problem; return; }
            toast(t('Verbunden. Siegel von {name} werden jetzt erkannt.', { name: c.name }));
            location.hash = '#/circle/' + c.id;
            return;
          }
          if (dec.data.k.x === s.profile.identity.publicKey.x && dec.data.k.y === s.profile.identity.publicKey.y) { codeErr.textContent = t('Das ist dein eigener Code. Gib ihn an die andere Person weiter.'); return; }
          const id = await C.pairId(dec.data.s);
          if (store.contactById(id)) { codeErr.textContent = t('Diese Person ist schon in deinem Kreis.'); return; }
          showJoin(dec.data, id);
        }),
      },
        h('h2', { text: t('Ich habe einen Code bekommen') }),
        h('p', { class: 'small muted', text: t('Das kann eine Einladung sein oder die Antwort auf deine Einladung. ECHT erkennt, was es ist.') }),
        h('label', { class: 'field' }, h('span', { text: t('Code einfügen') }), code),
        codeErr, h('button', { type: 'submit', class: 'btn block', text: t('Weiter') }));
      code.addEventListener('paste', () => setTimeout(() => { if (code.value.trim()) pasteCard.requestSubmit(); }, 0));

      Echt.ui.clear(stage).append(
        h('h1', { text: t('Person verbinden') }),
        h('p', { class: 'lead', text: t('Ihr tauscht einmal einen Code aus. Danach erkennt ihr euch am Telefon.') }),
        inviteCard, pasteCard);
    }

    /** Einladung ist erzeugt: Code zeigen, und gleich Platz für die Antwort. */
    function showInvite(c) {
      Echt.ui.clear(stage).append(
        h('h1', { text: t('Einladung für {name}', { name: c.name }) }),
        codePanel(t('Schritt 1: Code weitergeben'), h('div', { class: 'stack' },
          h('p', null, rich('Kopiere den Code und schicke ihn <b>persönlich</b> oder über einen verschlüsselten Messenger (Signal, WhatsApp). Er enthält euer gemeinsames Geheimnis.')),
          banner('warn', t('Nicht per SMS, E-Mail oder öffentlich'), h('p', { text: t('Wer den Code abfängt, könnte sich als du ausgeben. Lösche die Nachricht, sobald die Person den Code eingefügt hat.') }))),
          c.inviteCode),
        h('div', { class: 'card stack' },
          h('h2', { text: t('Schritt 2: Antwort einfügen') }),
          h('p', { class: 'small', text: t('{name} fügt deinen Code in ECHT ein und schickt dir einen Antwort-Code zurück. Füge ihn hier ein. Das kann auch später sein: Die Wort-Codes funktionieren schon, sobald {name} deinen Code eingefügt hat.', { name: c.name }) }),
          replyBox(c, () => { location.hash = '#/circle/' + c.id; })),
        h('p', { class: 'small muted center', text: t('Zur Kontrolle: Verbindungs-Nr. {pairNo} (muss bei beiden gleich sein).', { pairNo: c.pairNo }) }),
        h('a', { class: 'btn ghost block', href: '#/circle/' + c.id }, t('Später antworten')));
    }

    /** Einladung erhalten: Name bestätigen, verbinden, Antwort-Code zurückgeben. */
    function showJoin(data, id) {
      const name = h('input', { type: 'text', maxLength: 40, value: cleanName(data.n), autocomplete: 'off' });
      const nerr = h('p', { class: 'hint bad', role: 'alert' });
      Echt.ui.clear(stage).append(h('h1', { text: t('Verbinden mit {safeText}', { safeText: (safeText(data.n, 40) || t('dieser Person')) }) }), h('form', {
        class: 'card stack',
        onSubmit: once(async () => {
          const nm = cleanName(name.value);
          if (!nm) { nerr.textContent = t('Bitte gib einen Namen ein.'); return; }
          const first = nameError(nm);
          if (first) { nerr.textContent = first; return; }
          const keyId = await C.keyIdOf(data.k);
          const no = await C.pairNumber(data.s);
          if (store.contactById(id)) { nerr.textContent = t('Diese Person ist schon in deinem Kreis.'); return; }
          const late = nameError(nm);
          if (late) { nerr.textContent = late; return; }
          s.contacts.push({ id, role: 'b', name: nm, secret: data.s, pairNo: no, pub: data.k, pubKeyId: keyId, inviteCode: null, createdAt: new Date().toISOString() });
          await store.save();
          const reply = await C.makeReply(s.profile.identity, s.profile.name, data.s);
          Echt.ui.clear(stage).append(
            banner('ok', t('Verbunden mit {nm}', { nm: nm }), h('p', { text: t('Eure Wort-Codes passen ab sofort zusammen.') })),
            codePanel(t('Letzter Schritt: Antwort zurückschicken'), h('p', { text: t('Schicke diesen Code an {nm} zurück. Dann erkennt auch {nm} deine Siegel als deine. Er enthält kein Geheimnis. Das kannst du auch später tun.', { nm: nm }) }), reply),
            h('p', { class: 'small muted center', text: t('Zur Kontrolle: Verbindungs-Nr. {no} (muss bei beiden gleich sein).', { no: no }) }),
            h('a', { class: 'btn block', href: '#/circle/' + id }, icon('check'), t('Zu {nm}', { nm: nm })));
        }),
      },
        h('p', null, rich('Die Einladung nennt den Namen <b>{name}</b> (unbestätigt). Wie soll die Person bei dir heißen?', { name: safeText(data.n, 40) })),
        h('label', { class: 'field' }, h('span', { text: t('Name') }), name), nerr,
        h('button', { type: 'submit', class: 'btn block', text: t('Verbinden') })));
      name.focus();
    }
  }

  // ----------------------------------------------------------------- Detail --

  function resultBanner(res, c, mode) {
    if (res.result === 'ok') {
      const skew = res.offset && res.offset !== 0
        ? h('p', { class: 'small', text: res.offset < 0
          ? t('Der Code stammt aus dem vorherigen Zeitfenster. Das ist ok, kann aber heißen, dass eine Uhr etwas falsch geht.')
          : t('Der Code stammt aus dem nächsten Zeitfenster. Das ist ok, kann aber heißen, dass eine Uhr etwas falsch geht.') })
        : null;
      return banner('ok', t('Stimmt – das ist {name}.', { name: c.name }), h('div', null,
        h('p', { text: t('Der genannte Code passt zu eurem Geheimnis. Bei ungewöhnlichen Geldwünschen frage trotzdem kurz nach, ob alles in Ordnung ist.') }), skew));
    }
    if (res.result === 'duress') {
      return banner('bad', t('Stilles Notfallsignal erkannt'), h('div', null,
        h('p', null, rich('<b>{name}</b> hat den Notfall-Code genannt. Das bedeutet sehr wahrscheinlich: Die Person wird bedroht oder gezwungen.', { name: c.name })),
        h('p', { text: t('Verhalte dich unauffällig, zeige keinen Verdacht und beende das Gespräch freundlich. Rufe danach sofort die Polizei: 110 oder 112.') }),
        h('a', { class: 'btn danger', href: 'tel:110' }, icon('phone'), t('Polizei 110 anrufen'))));
    }
    if (res.reason === 'format') {
      return banner('warn', t('Bitte genau drei Wörter eingeben'), h('p', { text: t('Zum Beispiel: Apfel Katze Mond. Groß- und Kleinschreibung sowie Umlaute spielen keine Rolle.') }));
    }
    return banner('warn', t('Der Code stimmt nicht'), h('div', null,
      h('p', { text: t('Das kann ein Tippfehler sein, oder die Person ist nicht die, die sie vorgibt.') }),
      h('p', null, rich('<b>Lege auf und rufe {name} unter der bekannten Nummer zurück.</b> Überweise nichts und nenne keine Zugangsdaten.', { name: c.name })),
      mode === 'live' ? h('p', { class: 'small muted', text: t('Tipp: Der Live-Code wechselt jede Minute. Prüfe, ob die Uhren beider Geräte richtig gehen.') }) : null));
  }

  function unknownWordsHint(input, hint) {
    const words = C.parseWords(input.value);
    const unknown = words.filter((w) => !C.isKnownWord(w));
    if (unknown.length) {
      hint.className = 'hint bad';
      hint.textContent = t('„{v}“ steht nicht in der Wortliste. Vertippt?', { v: unknown[0] });
    } else {
      hint.className = 'hint';
      hint.textContent = words.length ? t('{length} von 3 Wörtern', { length: words.length }) : '';
    }
  }

  function codeTab(c) {
    const wrap = h('div', { class: 'stack' });
    const words = h('div', { class: 'words', 'aria-label': t('Dein aktueller Code') });
    const bar = h('i');
    const left = h('p', { class: 'small muted' });
    const duressWords = h('div', { class: 'words duress', hidden: true });
    const duressBox = h('div', { class: 'card', hidden: true },
      h('h3', { text: t('Notfall-Code') }),
      h('p', { class: 'small', text: t('Nenne ihn statt des normalen Codes, wenn du bedroht oder gezwungen wirst. {name} sieht dann eine stille Warnung, während alles ruhig klingt.', { name: c.name }) }),
      duressWords);
    let shown = -1, busy = false, duressOn = false;

    async function tick() {
      if (busy) return;
      busy = true;
      try {
        const now = Date.now();
        const step = C.stepAt(now);
        const into = (now / 1000) % C.STEP_SECONDS;
        bar.style.setProperty('--p', String(1 - into / C.STEP_SECONDS));
        left.textContent = t('Wechselt in {ceil} s', { ceil: Math.ceil(C.STEP_SECONDS - into) });
        if (step !== shown) {
          shown = step;
          Echt.ui.clear(words).append(...(await C.liveWords(c.secret, step, false, c.role)).map((w) => h('span', { text: Echt.ui.prettyWord(w) })));
          if (duressOn) Echt.ui.clear(duressWords).append(...(await C.liveWords(c.secret, step, true, c.role)).map((w) => h('span', { text: Echt.ui.prettyWord(w) })));
        }
      } finally { busy = false; }
    }
    tick();
    every(250, tick);

    const duressBtn = h('button', {
      type: 'button', class: 'btn secondary small',
      onClick: async () => {
        duressOn = !duressOn;
        duressBox.hidden = !duressOn;
        duressWords.hidden = !duressOn;
        duressBtn.textContent = duressOn ? t('Notfall-Code verbergen') : t('Notfall-Code zeigen');
        if (duressOn) {
          Echt.ui.clear(duressWords).append(...(await C.liveWords(c.secret, C.stepAt(Date.now()), true, c.role)).map((w) => h('span', { text: Echt.ui.prettyWord(w) })));
          later(20000, () => { duressOn = false; duressBox.hidden = true; duressBtn.textContent = t('Notfall-Code zeigen'); });
        }
      },
    }, t('Notfall-Code zeigen'));

    wrap.append(
      h('div', { class: 'card codecard' },
        h('p', { class: 'muted', text: t('Dein Code für {name}', { name: c.name }) }), words,
        h('div', { class: 'meter', role: 'presentation' }, bar), left),
      h('div', { class: 'card' },
        h('h3', { text: t('So nutzt du ihn') }),
        h('ol', { class: 'steps' },
          h('li', null, h('span', null, rich('<b>Wer anruft, nennt zuerst den Code.</b> Wirst du angerufen: Lass dir den Code von {name} nennen und gib ihn im Tab „Prüfen“ ein.', { name: c.name }))),
          h('li', null, h('span', null, rich('<b>Dann erst deinen eigenen nennen,</b> wenn der andere Code gestimmt hat. Nenne deinen nie zuerst, auch nicht, wenn jemand dringend drängt.'))),
          h('li', null, h('span', { text: t('Passt etwas nicht, legt ihr auf und ruft euch unter der bekannten Nummer an. Überweise nichts.') })))),
      h('p', { class: 'small muted', text: t('Jeder von euch hat einen eigenen Code, und jeder Code gilt nur einmal. Wer dir deinen Code entlockt, kann sich damit nicht als {name} ausgeben, wohl aber als du gegenüber {name}. Darum immer erst prüfen, dann nennen.', { name: c.name }) }),
      banner('warn', t('Nur bei einer Nummer, die du kennst'), h('p', { text: t('Nenne deinen Code nur, wenn du selbst die gespeicherte Nummer von {name} angerufen hast. Nie bei einer neuen Nummer und nie nach einer Rückrufbitte per Nachricht: Sonst kann jemand gleichzeitig dich und {name} anrufen und den Code weiterreichen.', { name: c.name }) })),
      h('div', null, duressBtn), duressBox);
    return wrap;
  }

  function checkTab(c) {
    const input = h('input', { type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, 'aria-label': t('Die drei genannten Wörter'), placeholder: t('Wort Wort Wort') });
    const hint = h('p', { class: 'hint', 'aria-live': 'polite' });
    const out = h('div', { 'aria-live': 'polite' });
    input.addEventListener('input', () => unknownWordsHint(input, hint));
    const form = h('form', {
      class: 'card',
      onSubmit: async (ev) => {
        ev.preventDefault();
        const now = Date.now();
        const res = await C.checkLive(c.secret, input.value, now, C.otherRole(c.role));
        if (res.result === 'ok') {
          // Jeder Live-Code gilt nur einmal: ein mitgehörter Code lässt sich nicht erneut einsetzen.
          const step = C.stepAt(now) + res.offset;
          if (Number.isInteger(c.lastLiveStep) && step <= c.lastLiveStep) {
            Echt.ui.clear(out).append(banner('warn', t('Dieser Code wurde schon benutzt'), h('div', null,
              h('p', { text: t('Jeder Code gilt nur ein einziges Mal. Das kann Zufall sein, etwa weil ihr gerade schon einmal geprüft habt, oder ein Wiederholungsversuch.') }),
              h('p', { text: t('Warte, bis sich der Code geändert hat (höchstens eine Minute), und lass dir den neuen nennen. Bleibt es dabei, lege auf und rufe unter der bekannten Nummer zurück.') }))));
            return;
          }
          c.lastLiveStep = step;
          try { await store.save(); } catch (e) { return; }
          input.value = '';
        }
        Echt.ui.clear(out).append(resultBanner(res, c, 'live'));
      },
    },
      h('h3', { text: t('{name} nennt dir den Code', { name: c.name }) }),
      h('p', { class: 'small muted', text: t('Gib die drei Wörter so ein, wie du sie gehört hast.') }),
      input, hint, h('button', { type: 'submit', class: 'btn block' }, icon('shield'), t('Prüfen')));
    return h('div', { class: 'stack' }, form, out);
  }

  function challengeTab(c) {
    // Ich prüfe: Rückfrage stellen
    const digits = h('div', { class: 'digits', 'aria-live': 'polite' });
    const askBox = h('div', { class: 'stack', hidden: true });
    const answer = h('input', { type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, 'aria-label': t('Antwort-Wörter'), placeholder: t('Wort Wort Wort') });
    const hint = h('p', { class: 'hint', 'aria-live': 'polite' });
    const out = h('div', { 'aria-live': 'polite' });
    let challenge = null;
    answer.addEventListener('input', () => unknownWordsHint(answer, hint));

    const ask = h('div', { class: 'card stack' },
      h('h3', { text: t('Ich prüfe {name}', { name: c.name }) }),
      h('p', { class: 'small muted', text: t('Stärkster Test: Du nennst eine frische Zahl. Nur wer das Geheimnis hat, kann die passenden Wörter berechnen.') }),
      h('button', {
        type: 'button', class: 'btn block',
        onClick: () => { challenge = C.newChallenge(); digits.textContent = challenge.replace(/(\d{3})(\d{3})/, '$1 $2'); askBox.hidden = false; answer.value = ''; hint.textContent = ''; Echt.ui.clear(out); answer.focus(); },
      }, icon('phone'), t('Rückfrage stellen')),
      askBox);
    askBox.append(
      h('p', { class: 'center muted', text: t('Nenne {name} diese Zahl:', { name: c.name }) }), digits,
      h('form', {
        class: 'stack',
        onSubmit: async (ev) => {
          ev.preventDefault();
          if (!challenge) return;
          const res = await C.checkResponse(c.secret, challenge, answer.value, C.otherRole(c.role));
          Echt.ui.clear(out).append(resultBanner(res, c, 'challenge'));
        },
      }, h('label', { class: 'field' }, h('span', { text: t('Antwort von {name} (drei Wörter)', { name: c.name }) }), answer), hint,
      h('button', { type: 'submit', class: 'btn block', text: t('Antwort prüfen') })), out);

    // Ich antworte
    const num = h('input', { type: 'text', inputMode: 'numeric', autocomplete: 'off', maxLength: 8, 'aria-label': t('Zahl der Rückfrage'), placeholder: '000 000' });
    const reply = h('div', { 'aria-live': 'polite' });
    const respond = h('form', {
      class: 'card stack',
      onSubmit: async (ev) => {
        ev.preventDefault();
        const ch = C.normalizeChallenge(num.value);
        if (!ch) { Echt.ui.clear(reply).append(banner('warn', t('Die Zahl hat sechs Ziffern'), h('p', { text: t('Bitte gib sie genau so ein, wie {name} sie dir genannt hat.', { name: c.name }) }))); return; }
        const ok = await C.responseWords(c.secret, ch, false, c.role);
        const du = await C.responseWords(c.secret, ch, true, c.role);
        const duBox = h('div', { class: 'card', hidden: true }, h('p', { class: 'small', text: t('Nur bei Bedrohung: dieser Notfall-Code löst bei {name} eine stille Warnung aus.', { name: c.name }) }), wordsEl(du, 'duress'));
        Echt.ui.clear(reply).append(
          h('div', { class: 'card codecard' }, h('p', { class: 'muted', text: t('Deine Antwort an {name}', { name: c.name }) }), wordsEl(ok)),
          h('button', { type: 'button', class: 'btn secondary small', onClick: (e) => { duBox.hidden = !duBox.hidden; e.currentTarget.textContent = duBox.hidden ? t('Notfall-Antwort zeigen') : t('Notfall-Antwort verbergen'); } }, t('Notfall-Antwort zeigen')),
          duBox);
      },
    },
      h('h3', { text: t('{name} stellt mir eine Rückfrage', { name: c.name }) }),
      banner('warn', t('Nur bei einer Nummer, die du kennst'), h('p', { text: t('Beantworte Rückfragen nur, wenn du selbst die gespeicherte Nummer von {name} angerufen hast. Bittet dich ein Anrufer, drei Wörter zu einer Zahl vorzulesen, kann er sie gleichzeitig bei {name} einsetzen. Dann lege auf und rufe selbst zurück.', { name: c.name }) })),
      h('p', { class: 'small muted', text: t('Gib die sechsstellige Zahl ein, die du genannt bekommen hast.') }),
      num, h('button', { type: 'submit', class: 'btn block', text: t('Antwort berechnen') }), reply);

    return h('div', { class: 'stack' }, ask, respond);
  }

  function manageBox(c) {
    const kv = h('dl', { class: 'kv' },
      h('dt', { text: t('Verbindungs-Nr.') }), h('dd', { class: 'mono', text: pairNo(c) }),
      h('dt', { text: t('Hinzugefügt') }), h('dd', { text: fmtDate(c.createdAt) }),
      h('dt', { text: t('Siegel-Schlüssel') }), h('dd', { class: 'mono', text: c.pubKeyId ? C.formatKeyId(c.pubKeyId) : t('noch nicht bekannt') }));
    const actions = h('div', { class: 'row' });

    actions.append(h('button', {
      type: 'button', class: 'btn secondary small', text: t('Umbenennen'),
      onClick: async () => {
        const v = await promptDialog({ title: t('Umbenennen'), label: t('Name'), value: c.name, maxLength: 40 });
        const nm = cleanName(v || '');
        if (!nm) return;
        const ne = nameError(nm, c.id);
        if (ne) { toast(ne, 'bad'); return; }
        c.name = nm;
        await store.save();
        Echt.render();
      },
    }));

    actions.append(h('button', {
      type: 'button', class: 'btn danger small',
      onClick: async () => {
        const ok = await confirmDialog({
          title: t('{name} entfernen?', { name: c.name }),
          body: t('Das gemeinsame Geheimnis wird hier gelöscht. Codes mit dieser Person funktionieren dann nicht mehr. Ihr könnt euch jederzeit neu verbinden.'),
          confirmLabel: t('Entfernen'), danger: true,
        });
        if (!ok) return;
        const s = store.state;
        s.contacts = s.contacts.filter((x) => x.id !== c.id);
        await store.save();
        location.hash = '#/circle';
      },
    }, icon('trash'), t('Entfernen')));

    return h('details', { class: 'more' }, h('summary', { text: t('Verwalten') }), kv, h('div', { class: 'row', style: null }, actions));
  }

  /** Solange die Antwort fehlt: gleich beim Kontakt Platz dafür (und der Einladungs-Code noch einmal). */
  function pendingBox(c) {
    return h('div', { class: 'card stack' },
      h('h3', { text: t('Wartet auf die Antwort von {name}', { name: c.name }) }),
      h('p', { class: 'small', text: t('{name} hat dir noch keinen Antwort-Code geschickt. Die Wort-Codes funktionieren schon, sobald {name} deinen Einladungs-Code eingefügt hat. Damit auch die Siegel erkannt werden, füge hier die Antwort ein.', { name: c.name }) }),
      replyBox(c, () => Echt.render()),
      h('button', { type: 'button', class: 'btn ghost small', onClick: () => showInviteCode(c) }, t('Einladungs-Code noch einmal anzeigen')));
  }

  function detailView(id, tab) {
    const c = store.contactById(id);
    if (!c) {
      return h('div', { class: 'stack' }, back('#/circle', t('Kreis')), banner('warn', t('Person nicht gefunden'), h('p', { text: t('Diese Verbindung gibt es nicht (mehr).') })));
    }
    const current = ['code', 'check', 'challenge'].includes(tab) ? tab : 'code';
    const tabs = [['code', t('Mein Code')], ['check', t('Prüfen')], ['challenge', t('Rückfrage')]];
    const body = current === 'code' ? codeTab(c) : current === 'check' ? checkTab(c) : challengeTab(c);
    return h('div', { class: 'stack' },
      back('#/circle', t('Kreis')),
      h('div', { class: 'row' }, h('span', { class: 'avatar', text: Echt.ui.initial(c.name) }), h('div', { class: 'grow' }, h('h1', { text: c.name }))),
      h('nav', { class: 'seg', 'aria-label': t('Bereiche') }, tabs.map(([key, label]) =>
        h('a', { href: '#/circle/' + c.id + '/' + key, 'aria-current': current === key ? 'true' : null, text: label }))),
      body, c.inviteCode && !c.pub ? pendingBox(c) : null, manageBox(c));
  }

  Echt.circle = {
    render(parts) {
      if (parts[1] === 'add') return addView();
      if (parts[1]) return detailView(parts[1], parts[2]);
      return listView();
    },
  };
})();
