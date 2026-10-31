/*
 * ECHT – Siegel prüfen. Funktioniert auch ohne eigenen Tresor (store.state darf null sein):
 * wer einen Beweis bekommt, braucht dafür kein Konto.
 */
(function () {
  'use strict';
  const Echt = (window.Echt = window.Echt || {});
  const { t } = Echt.i18n;
  const { h, rich, icon, banner, fmtDate, fmtBytes, groupHex, safeText } = Echt.ui;
  const store = Echt.store;
  const C = window.EchtCore;

  const MAX_FILE = 250 * 1024 * 1024;

  function row(label, value, mono) {
    return [h('dt', { text: label }), h('dd', { class: mono ? 'mono' : null, text: value })];
  }

  /** Wer hat signiert? Eigener Schlüssel, Kontakt aus dem Kreis oder unbekannt. */
  function trustOf(key) {
    const s = store.state;
    const same = (k) => !!k && k.x === key.x && k.y === key.y; // ganzer Schlüssel, nicht nur die kurze Kennung
    if (s && same(s.profile.identity.publicKey)) return { kind: 'own', text: t('Das ist dein eigener Schlüssel.') };
    const c = s && s.contacts.find((x) => same(x.pub));
    if (c) return { kind: 'contact', text: t('Der Schlüssel gehört zu {safeText} aus deinem Vertrauenskreis.', { safeText: safeText(c.name, 40) }) };
    return { kind: 'unknown', text: t('Unbekannter Schlüssel. Der Name auf dem Siegel ist nur eine Behauptung. Gleiche die Schlüssel-ID mit der Person ab, zum Beispiel in einem Telefonat, das du mit dem Wort-Code abgesichert hast.') };
  }

  // Texte erst beim Anzeigen übersetzen (die Sprache kann im Betrieb wechseln), darum Funktionen statt Konstanten.
  const timeProblem = (reason, fallback) => {
    const text = {
      'anchor-format': () => t('Die Anker-Zeile ist nicht lesbar. Füge genau die Zeile ein, ohne weiteren Text; sie beginnt mit „ECHT-ANKER/1“.'),
      'extract-format': () => t('Das ist kein Journal-Auszug von ECHT (Dateien enden auf .echt-journal.json).'),
      'proof-invalid': () => t('Das Siegel selbst besteht die Prüfung nicht.'),
      'proof-missing': () => t('Der Auszug beginnt nicht bei diesem Siegel. Er gehört nicht zu diesem Beweis.'),
      'head-missing': () => t('Vom Siegel aus führt der Auszug nicht zu dem Stand, den die Anker-Zeile nennt. Der Auszug gehört nicht zu diesem Anker.'),
      'key-mismatch': () => t('Der Anker gehört zu einem anderen Schlüssel als das Siegel.'),
    }[reason];
    return text ? text() : fallback;
  };
  const chainProblem = (reason, fallback) => {
    const text = {
      seal: () => t('Signatur oder Aufbau fehlerhaft'),
      link: () => t('Verkettung unterbrochen'),
    }[reason];
    return text ? text() : fallback;
  };

  /** Zeitbeleg: Führt eine lückenlose Kette vom Siegel zum Stand der Anker-Zeile? */
  async function timeProof(proof, journalText, anchorText, contentState) {
    const hasJournal = !!(journalText && journalText.trim());
    const hasAnchor = !!(anchorText && anchorText.trim());
    if (!hasJournal || !hasAnchor) {
      return banner('warn', t('Zeitbeleg unvollständig'), h('p', { text: t('Für den Zeitbeleg braucht ECHT beides: den Journal-Auszug und die Anker-Zeile, die du unabhängig von der signierenden Person bekommen hast.') }));
    }
    let extract;
    try { extract = JSON.parse(journalText); } catch (e) {
      return banner('bad', t('Journal-Auszug nicht lesbar'), h('p', { text: timeProblem('extract-format') }));
    }
    const r = await C.verifyJournalAnchor(extract, proof, anchorText);
    if (!r.ok) {
      const why = r.reason === 'chain'
        ? t('Die Kette zwischen Siegel und Anker-Stand ist nicht in Ordnung (Glied {v} im Auszug: {chainProblem}).', { v: (r.index + 1), chainProblem: chainProblem(r.chainReason, t('Fehler')) })
        : timeProblem(r.reason, t('Der Zeitbeleg besteht die Prüfung nicht.'));
      return banner('bad', t('Zeitbeleg nicht bestätigt'), h('p', { text: why }));
    }
    const mismatch = contentState === 'mismatch';
    const notes = [];
    if (r.warnings.includes('number')) notes.push(t('Die Nummer in der Anker-Zeile passt nicht zur Zählung im Auszug. Das kann ein Zählfehler sein; die Verkettung selbst ist in Ordnung.'));
    if (r.warnings.includes('anchor-date')) notes.push(t('Das Datum in der Anker-Zeile liegt vor dem Siegel oder ist unlesbar. Verlasse dich nur auf den Empfangsnachweis.'));
    return banner(mismatch ? 'warn' : 'ok', mismatch ? t('Zeitbeleg gilt nur für das Siegel, nicht für diesen Inhalt') : t('Kette bis zum Anker-Stand in Ordnung'), h('div', { class: 'stack' },
      h('p', { text: t('Das Siegel steht in einer lückenlosen Kette von {count} Siegeln, die bei dem Stand endet, den die Anker-Zeile nennt.', { count: r.count })
        + (mismatch ? ' ' + t('Der Inhalt, den du geprüft hast, gehört aber nicht zu diesem Siegel (siehe oben).') : '') }),
      h('p', null, rich('<b>Vergleiche die Kopf-ID unten Zeichen für Zeichen mit der Anker-Zeile in deinem Empfangsnachweis</b> (zum Beispiel in der E-Mail, mit der du sie bekommen hast). Nur wenn sie übereinstimmt, und der Nachweis zeigt, wann die Zeile bei dir ankam, lag das Siegel spätestens zu diesem Zeitpunkt vor.')),
      h('dl', { class: 'kv' },
        row(t('Anker-Stand (Kopf-ID)'), groupHex(r.headId), true),
        row(t('Nr. laut Zeile (unbestätigt)'), String(r.headNumber)),
        r.sealNumber ? row(t('Siegel Nr. laut Auszug (unbestätigt)'), String(r.sealNumber)) : null,
        row(t('Datum laut Zeile (unbestätigt)'), fmtDate(r.anchorAt))),
      h('p', { class: 'small', text: t('Verbindlich ist nur die Kopf-ID. Nummer und Datum stammen aus Zeile und Auszug, die ein Beteiligter frei wählen kann. Der Beleg sagt nicht, wer das Siegel erstellt hat, und nicht, dass es das einzige oder erste zu diesem Thema war: Auch andere Siegel mit anderer Aussage können in derselben Kette vor dem Anker liegen.') }),
      notes.map((n) => h('p', { class: 'small', text: n }))));
  }

  async function check({ proofText, origFile, origText, journalText, anchorText }) {
    let proof;
    try { proof = JSON.parse(proofText); } catch (e) {
      return banner('bad', t('Das ist keine Beweisdatei'), h('p', { text: t('Die Datei oder der eingefügte Text lässt sich nicht lesen. Beweisdateien enden auf .echt.json.') }));
    }
    const v = await C.verifySeal(proof);
    if (!v.ok) {
      const format = v.errors.includes('format');
      return banner('bad', format ? t('Das ist keine gültige ECHT-Beweisdatei') : t('Nicht echt: das Siegel wurde verändert'),
        h('p', { text: format
          ? t('Der Aufbau stimmt nicht. Möglicherweise ist die Datei beschädigt oder stammt aus einem anderen Programm.')
          : t('Die Signatur passt nicht zum Inhalt des Siegels. Jemand hat Angaben nachträglich geändert, oder das Siegel ist gefälscht. Vertraue ihm nicht.') }));
    }

    const b = proof.body;
    let content = 'unchecked';
    let contentNote = '';
    let shownText = null;
    let localName = null; // frei wählbar, gehört nicht zum Beweis: nie im Urteil, nur gekennzeichnet in der Tabelle
    if (origFile) {
      if (origFile.size > MAX_FILE) return banner('warn', t('Datei zu groß'), h('p', { text: t('Das Original darf höchstens {fmtBytes} groß sein.', { fmtBytes: fmtBytes(MAX_FILE) }) }));
      content = (await C.matchesContent(proof, new Uint8Array(await origFile.arrayBuffer()))) ? 'match' : 'mismatch';
      contentNote = t('Geprüft wurde die ausgewählte Datei.');
      localName = safeText(origFile.name, 60);
    } else if (origText && origText.trim()) {
      content = (await C.matchesContent(proof, origText)) ? 'match' : 'mismatch';
      contentNote = t('Geprüft wurde der eingefügte Text.');
    } else if (b.type === 'text' && typeof proof.content === 'string') {
      // Der mitgelieferte Text zählt nur bei Text-Siegeln und nur, wenn auch die Länge stimmt.
      const same = proof.content.length <= 1000000 && C.textBytes(proof.content).length === b.size && (await C.matchesContent(proof, proof.content));
      content = same ? 'match' : 'mismatch';
      contentNote = t('Geprüft wurde der Text aus der Beweisdatei.');
      shownText = proof.content.slice(0, 3000);
    }

    const trust = trustOf(b.signer.key);
    let verdict;
    const known = trust.kind !== 'unknown';
    const sameWhat = b.type === 'file' ? t('Die Datei ist Bit für Bit dieselbe wie beim Versiegeln.') : t('Der Text ist derselbe wie beim Versiegeln (Zeilenenden werden vereinheitlicht, sonst zählt jedes Zeichen).');
    if (content === 'match' && known) verdict = banner('ok', t('Echt und unverändert'), h('p', { text: t('{sameWhat} Die Signatur ist gültig und stammt von einem Schlüssel, den du kennst. {contentNote}', { sameWhat: sameWhat, contentNote: contentNote }) }));
    else if (content === 'match') verdict = banner('warn', t('Unverändert, aber Absender unbekannt'), h('div', null,
      h('p', { text: t('{sameWhat} Die Signatur ist gültig. {contentNote}', { sameWhat: sameWhat, contentNote: contentNote }) }),
      h('p', { text: t('Wer das Siegel erstellt hat, kann ECHT nicht sagen: Jeder kann ein Siegel mit einem beliebigen Namen erzeugen. Bestätige die Schlüssel-ID bei der Person, bevor du dem Absender traust.') })));
    else if (content === 'mismatch') verdict = banner('bad', t('Der Inhalt stimmt nicht überein'), h('p', { text: t('Das Siegel selbst ist gültig, aber dieser Inhalt gehört nicht dazu. Er wurde verändert, oder es ist eine andere Datei. {contentNote}', { contentNote: contentNote }) }));
    else verdict = banner('warn', t('Siegel in Ordnung, Inhalt noch nicht geprüft'), h('p', { text: b.type === 'file' ? t('Wähle unten das Original, um zu sehen, ob es zum Siegel passt.') : t('Füge unten den Text ein, um zu sehen, ob er zum Siegel passt.') }));

    const wantsTime = !!((journalText && journalText.trim()) || (anchorText && anchorText.trim()));
    const timeCard = wantsTime ? await timeProof(proof, journalText, anchorText, content) : null;

    return h('div', { class: 'stack' }, verdict,
      h('div', { class: 'card stack' },
        h('div', { class: 'row' }, h('h3', { text: t('Signiert von') }),
          h('span', { class: 'chip ' + (trust.kind === 'unknown' ? 'warn' : 'ok') }, icon(trust.kind === 'unknown' ? 'alert' : 'check'), trust.kind === 'own' ? t('Du') : trust.kind === 'contact' ? t('Vertrauenskreis') : t('Unbekannt'))),
        h('p', { class: 'small', text: trust.text }),
        h('dl', { class: 'kv' },
          row(t('Name laut Siegel (unbestätigt)'), safeText(b.signer.name, 60) || t('(leer)')),
          row(t('Schlüssel-ID'), C.formatKeyId(b.signer.keyId), true),
          row(t('Zeitpunkt laut Siegel'), fmtDate(b.createdAt)),
          row(t('Art'), b.type === 'file' ? t('Datei') : t('Text')),
          b.type === 'file' && b.name ? row(t('Dateiname (unbestätigt)'), safeText(b.name, 120)) : null,
          row(t('Größe'), fmtBytes(b.size)),
          b.note ? row(t('Notiz (vom Absender)'), safeText(b.note, 300)) : null,
          localName !== null ? row(t('Geprüfte Datei (lokaler Name, nicht Teil des Beweises)'), localName) : null,
          row(t('Fingerabdruck'), groupHex(b.sha256), true),
          row(t('Siegel-ID'), proof.id.slice(0, 16) + '…', true))),
      shownText !== null ? h('div', { class: 'card stack' }, h('h3', { text: t('Text laut Beweisdatei') }), h('div', { class: 'codebox', text: shownText })) : null,
      timeCard,
      h('p', { class: 'small muted', text: wantsTime ? t('Der Zeitpunkt im Siegel stammt vom Gerät der signierenden Person; unabhängig belegt ist nur der Zeitbeleg oben.') : t('Der Zeitpunkt stammt vom Gerät der signierenden Person. Er ist nur dann unabhängig belegt, wenn sie den Stand zuvor über einen Anker weitergegeben hat. Mit Journal-Auszug und Anker-Zeile (Feld 3) lässt sich das prüfen.') }));
  }

  function view() {
    const proofFile = h('input', { type: 'file', accept: '.json,application/json', 'aria-label': t('Beweisdatei') });
    const proofPaste = h('textarea', { 'aria-label': t('Beweis einfügen'), placeholder: t('{ "format": "echt-seal/1", … }'), spellcheck: false });
    const origFile = h('input', { type: 'file', 'aria-label': t('Original-Datei') });
    const origPaste = h('textarea', { 'aria-label': t('Original-Text einfügen'), placeholder: t('Original-Text einfügen') });
    const journalFile = h('input', { type: 'file', accept: '.json,application/json', 'aria-label': t('Journal-Auszug') });
    const anchorIn = h('input', { type: 'text', 'aria-label': t('Anker-Zeile'), placeholder: 'ECHT-ANKER/1 n=… head=… key=… at=…', spellcheck: false, autocomplete: 'off' });
    let journalText = '';
    const out = h('div', { 'aria-live': 'polite' });
    const err = h('p', { class: 'hint bad', role: 'alert' });
    const go = h('button', { type: 'submit', class: 'btn block' }, icon('search'), t('Prüfen'));

    // Wird der Beweis hineingezogen oder gewählt, steht er sofort im Textfeld.
    proofFile.addEventListener('change', async () => {
      const f = proofFile.files[0];
      if (f && f.size < 5 * 1024 * 1024) proofPaste.value = await f.text();
    });

    journalFile.addEventListener('change', async () => {
      const f = journalFile.files[0];
      journalText = f && f.size < 20 * 1024 * 1024 ? await f.text() : '';
    });

    const form = h('form', {
      class: 'stack',
      onSubmit: async (ev) => {
        ev.preventDefault();
        err.textContent = '';
        Echt.ui.clear(out);
        const proofText = proofPaste.value.trim();
        if (!proofText) { err.textContent = t('Bitte wähle eine Beweisdatei oder füge den Beweis ein.'); return; }
        go.disabled = true;
        try {
          Echt.ui.clear(out).append(await check({ proofText, origFile: origFile.files[0], origText: origPaste.value, journalText: journalFile.files[0] ? journalText : '', anchorText: anchorIn.value }));
        } catch (e) {
          Echt.ui.clear(out).append(banner('bad', t('Prüfung fehlgeschlagen'), h('p', { text: t('Das hat nicht geklappt. Bitte versuche es erneut.') })));
        } finally { go.disabled = false; }
      },
    },
      h('div', { class: 'card' },
        h('h2', { text: t('1. Beweis') }),
        h('label', { class: 'field' }, h('span', { text: t('Beweisdatei (.echt.json)') }), proofFile),
        h('label', { class: 'field' }, h('span', { text: t('oder Beweis einfügen') }), proofPaste)),
      h('div', { class: 'card' },
        h('h2', { text: t('2. Original (empfohlen)') }),
        h('p', { class: 'small muted', text: t('Ohne Original prüft ECHT nur, ob das Siegel selbst unverändert ist.') }),
        h('label', { class: 'field' }, h('span', { text: t('Datei') }), origFile),
        h('label', { class: 'field' }, h('span', { text: t('oder Text') }), origPaste)),
      h('div', { class: 'card' },
        h('h2', { text: t('3. Zeitbeleg (optional)') }),
        h('p', { class: 'small muted', text: t('Wann stand das Siegel spätestens fest? Dafür braucht es den Journal-Auszug der signierenden Person und die Anker-Zeile, die du unabhängig von ihr bekommen hast (etwa aus einer E-Mail, die nicht von ihr stammt).') }),
        h('label', { class: 'field' }, h('span', { text: t('Journal-Auszug (.echt-journal.json)') }), journalFile),
        h('label', { class: 'field' }, h('span', { text: t('Anker-Zeile') }), anchorIn)),
      err, go);

    return h('div', { class: 'stack' },
      h('div', null, h('h1', { text: t('Siegel prüfen') }),
        h('p', { class: 'lead', text: t('Hat dir jemand ein Foto, ein Dokument oder eine Aussage mit ECHT-Beweis geschickt? Hier siehst du, ob es echt und unverändert ist. Alles passiert auf deinem Gerät.') })),
      form, out);
  }

  Echt.verify = { render: view, check };
})();
