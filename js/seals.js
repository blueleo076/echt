/* ECHT – Siegel: Dateien und Texte signieren, verketten, als Beweisdatei weitergeben. */
(function () {
  'use strict';
  const Echt = (window.Echt = window.Echt || {});
  const { t } = Echt.i18n;
  const { h, icon, copy, download, share, banner, fmtDate, fmtBytes, groupHex, slug, toast, safeText } = Echt.ui;
  const store = Echt.store;
  const C = window.EchtCore;

  const MAX_FILE = 250 * 1024 * 1024;
  const MAX_TEXT = 20000;

  /** Das, was weitergegeben wird: nur der signierte Teil (plus optional der Text selbst). */
  function proofOf(seal, withContent) {
    const p = { format: seal.format, id: seal.id, body: seal.body, sig: seal.sig };
    if (withContent && seal.local && typeof seal.local.text === 'string') p.content = seal.local.text;
    return p;
  }
  const proofName = (seal) => slug(seal.body.name || 'text') + '-' + seal.id.slice(0, 8) + '.echt.json';
  const sealTitle = (seal) => safeText(seal.body.name || (seal.local && typeof seal.local.text === 'string' ? seal.local.text.replace(/\s+/g, ' ').slice(0, 48) : t('Text')), 60);

  // ------------------------------------------------------------------ Neu ----

  function createCard() {
    const s = store.state;
    let mode = 'file';
    const file = h('input', { type: 'file', 'aria-label': t('Datei wählen') });
    const fileInfo = h('p', { class: 'hint' });
    const text = h('textarea', { 'aria-label': t('Text'), placeholder: t('Eine Aussage, ein Vertrag, ein Versprechen …'), maxLength: MAX_TEXT });
    const note = h('input', { type: 'text', maxLength: 500, autocomplete: 'off', placeholder: t('z. B. Zustand der Wohnung bei Übergabe') });
    const err = h('p', { class: 'hint bad', role: 'alert' });
    const submit = h('button', { type: 'submit', class: 'btn block' }, icon('seal'), t('Versiegeln'));
    const filePane = h('label', { class: 'field' }, h('span', { text: t('Datei') }), file, fileInfo);
    const textPane = h('label', { class: 'field', hidden: true }, h('span', { text: t('Text') }), text,
      h('small', { text: t('Achtung: Wer deinen Text errät, kann ihn mit dem Beweis bestätigen. Versiegle keine kurzen, leicht erratbaren Geheimnisse. Der Beweis verrät den Text sonst indirekt.') }));
    const bFile = h('button', { type: 'button', 'aria-pressed': 'true', text: t('Datei / Foto') });
    const bText = h('button', { type: 'button', 'aria-pressed': 'false', text: t('Text') });

    function setMode(m) {
      mode = m;
      bFile.setAttribute('aria-pressed', String(m === 'file'));
      bText.setAttribute('aria-pressed', String(m === 'text'));
      filePane.hidden = m !== 'file';
      textPane.hidden = m !== 'text';
      err.textContent = '';
    }
    bFile.addEventListener('click', () => setMode('file'));
    bText.addEventListener('click', () => setMode('text'));
    file.addEventListener('change', () => {
      const f = file.files[0];
      fileInfo.className = 'hint';
      fileInfo.textContent = f ? f.name + ' · ' + fmtBytes(f.size) : '';
    });

    return h('form', {
      class: 'card',
      onSubmit: async (ev) => {
        ev.preventDefault();
        err.textContent = '';
        let input;
        let local = null;
        try {
          submit.disabled = true;
          if (mode === 'file') {
            const f = file.files[0];
            if (!f) { err.textContent = t('Bitte wähle zuerst eine Datei.'); return; }
            if (f.size > MAX_FILE) { err.textContent = t('Die Datei ist größer als {fmtBytes}. Bitte wähle eine kleinere.', { fmtBytes: fmtBytes(MAX_FILE) }); return; }
            const bytes = new Uint8Array(await f.arrayBuffer());
            input = { type: 'file', name: f.name, size: f.size, mime: f.type || '', sha256: await C.sha256Hex(bytes) };
          } else {
            if (!text.value.trim()) { err.textContent = t('Bitte schreibe zuerst einen Text.'); return; }
            const bytes = C.textBytes(text.value);
            input = { type: 'text', name: '', size: bytes.length, mime: 'text/plain', sha256: await C.sha256Hex(bytes) };
            local = { text: C.normalizeText(text.value) };
          }
          input.note = note.value.trim();
          input.prev = store.lastSealId(); // erst jetzt, damit parallele Siegel sauber verkettet bleiben
          const seal = await C.createSeal(s.profile.identity, s.profile.name, input);
          if (local) seal.local = local;
          s.seals.push(seal);
          try { await store.save(); } catch (e) { s.seals.pop(); throw e; }
          Echt.flash = { sealId: seal.id };
          location.hash = '#/seals/' + seal.id;
        } catch (e) {
          err.textContent = t('Das Siegel konnte nicht erstellt werden.');
        } finally {
          submit.disabled = false;
        }
      },
    },
      h('h2', { text: t('Neues Siegel') }),
      h('div', { class: 'seg', role: 'group', 'aria-label': t('Art') }, bFile, bText),
      filePane, textPane,
      h('label', { class: 'field' }, h('span', { text: t('Notiz (optional)') }), note,
        h('small', { text: t('Die Notiz wird mitsigniert und ist für alle sichtbar, die den Beweis bekommen.') })),
      err, submit);
  }

  // ---------------------------------------------------------------- Liste ----

  function listView() {
    const s = store.state;
    const root = h('div', { class: 'stack' });
    root.append(h('div', null,
      h('h1', { text: t('Siegel') }),
      h('p', { class: 'lead', text: t('Versiegle Fotos, Dokumente und Aussagen. Das Siegel beweist später, dass sie von dir stammen und seitdem unverändert sind.') })));
    root.append(createCard());

    if (!s.seals.length) {
      root.append(h('div', { class: 'empty' }, icon('seal'), h('p', { text: t('Noch kein Siegel. Das erste ist in wenigen Sekunden gemacht.') })));
      return root;
    }
    const items = s.seals.map((seal, i) => ({ seal, n: i + 1 })).reverse();
    root.append(h('h2', { text: t('Dein Journal ({length})', { length: s.seals.length }) }),
      h('ul', { class: 'list' }, items.map(({ seal, n }) => h('li', null,
        h('a', { class: 'item', href: '#/seals/' + seal.id },
          icon(seal.body.type === 'file' ? 'file' : 'text'),
          h('span', { class: 'grow' },
            h('div', { class: 'title', text: sealTitle(seal) }),
            h('div', { class: 'sub', text: t('Nr. {n} · {fmtDate}', { n: n, fmtDate: fmtDate(seal.body.createdAt) }) })),
          icon('back'))))));
    return root;
  }

  // --------------------------------------------------------------- Detail ----

  function recheck(seal) {
    const out = h('div', { 'aria-live': 'polite' });
    const show = (ok) => Echt.ui.clear(out).append(ok
      ? banner('ok', t('Inhalt stimmt überein'), h('p', { text: t('Dieser Inhalt ist Bit für Bit derselbe wie beim Versiegeln.') }))
      : banner('bad', t('Inhalt weicht ab'), h('p', { text: t('Dieser Inhalt ist nicht derselbe wie beim Versiegeln. Er wurde verändert oder es ist eine andere Datei.') })));
    if (seal.body.type === 'file') {
      const f = h('input', { type: 'file', 'aria-label': t('Datei zum Vergleichen'), onChange: async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > MAX_FILE) { toast(t('Die Datei ist zu groß.'), 'bad'); return; }
        show(await C.matchesContent(seal, new Uint8Array(await file.arrayBuffer())));
      } });
      return h('div', { class: 'stack' }, h('label', { class: 'field' }, h('span', { text: t('Datei zum Vergleichen wählen') }), f), out);
    }
    const box = h('textarea', { 'aria-label': t('Text zum Vergleichen') });
    return h('div', { class: 'stack' },
      h('label', { class: 'field' }, h('span', { text: t('Text zum Vergleichen einfügen') }), box),
      h('button', { type: 'button', class: 'btn secondary', onClick: async () => show(await C.matchesContent(seal, box.value)) }, t('Vergleichen')), out);
  }

  /** Zeitbeleg für Außenstehende: Journal-Auszug ab diesem Siegel bis zu einem Stand, für den du einen Anker weitergegeben hast. */
  function timeProofCard(seal, idx) {
    const s = store.state;
    const input = h('input', { type: 'text', 'aria-label': t('Anker-Zeile'), placeholder: 'ECHT-ANKER/1 n=… head=… key=… at=…', spellcheck: false, autocomplete: 'off' });
    const info = h('p', { class: 'hint', 'aria-live': 'polite' });
    const err = h('p', { class: 'hint bad', role: 'alert' });

    const range = () => {
      const a = C.parseAnchor(input.value);
      if (!a) return { error: t('Das ist keine Anker-Zeile. Füge genau die Zeile ein, ohne weiteren Text; sie beginnt mit „ECHT-ANKER/1“.') };
      const headIdx = s.seals.findIndex((x) => x.id === a.head);
      if (headIdx < 0 || a.keyId !== s.profile.identity.keyId) return { error: t('Dieser Anker gehört nicht zu deinem Journal.') };
      if (headIdx < idx) return { error: t('Dieser Anker ist älter als dieses Siegel und kann es nicht belegen. Erzeuge einen neuen Anker (Tresor → Journal & Anker) und gib ihn weiter.') };
      return { headIdx };
    };

    input.addEventListener('input', () => {
      err.textContent = '';
      info.textContent = '';
      if (!input.value.trim()) return;
      const r = range();
      if (r.error) { err.textContent = r.error; return; }
      const following = s.seals.slice(idx + 1, r.headIdx + 1);
      const legacy = following.filter((x) => x.format !== C.SEAL_FORMAT).length;
      if (following.length === 0) {
        info.textContent = t('Der Anker liegt genau auf diesem Siegel. Der Auszug enthält keine weiteren Glieder.');
        return;
      }
      const nums = { count: following.length, from: idx + 2, to: r.headIdx + 1, legacy };
      const summary = following.length === 1
        ? t('Der Auszug enthält ein weiteres Glied (Siegel Nr. {from} bis {to}): nur Kennungen und Prüfsummen, keine Inhalte, Namen, Notizen oder Zeitpunkte.', nums)
        : t('Der Auszug enthält {count} weitere Glieder (Siegel Nr. {from} bis {to}): nur Kennungen und Prüfsummen, keine Inhalte, Namen, Notizen oder Zeitpunkte.', nums);
      info.textContent = legacy
        ? summary + ' ' + t('Achtung: {legacy} davon stammen aus einem älteren Format. Bei ihnen enthält der Auszug alles, auch Name, Notiz, Zeitpunkt und Fingerabdruck.', nums)
        : summary;
    });

    const save = h('button', {
      type: 'button', class: 'btn secondary',
      onClick: async () => {
        err.textContent = '';
        const r = range();
        if (r.error) { err.textContent = r.error; return; }
        const extract = await C.makeJournalExtract(s.seals, idx, r.headIdx);
        // Gegenprobe wie bei der Person, die den Auszug später prüft
        const check = await C.verifyJournalAnchor(extract, proofOf(seal, false), input.value);
        if (!check.ok) { err.textContent = t('Der Auszug besteht die eigene Gegenprobe nicht. Prüfe dein Journal in den Einstellungen.'); return; }
        download(slug(seal.body.name || 'text') + '-' + seal.id.slice(0, 8) + '.echt-journal.json', JSON.stringify(extract, null, 2), 'application/json');
        toast(t('Journal-Auszug gespeichert'));
      },
    }, icon('download'), t('Journal-Auszug speichern'));

    return h('div', { class: 'card stack' },
      h('h2', { text: t('Zeitbeleg für Außenstehende') }),
      h('p', { class: 'small', text: t('Hast du einen Anker an jemanden gegeben, kann eine dritte Person prüfen, dass dieses Siegel spätestens zu diesem Zeitpunkt in deiner Kette stand. Dafür braucht sie drei Dinge: die Beweisdatei, diesen Journal-Auszug und die Anker-Zeile, die sie unabhängig von dir bekommen hat. Der Auszug enthält von den folgenden Siegeln nur Kennungen und Prüfsummen, aber keine Inhalte.') }),
      h('label', { class: 'field' }, h('span', { text: t('Anker-Zeile, die du weitergegeben hast') }), input),
      info, err, save,
      h('p', { class: 'small muted', text: t('Noch keinen Anker? Erzeuge einen unter Tresor → Journal & Anker und gib die Zeile weiter (E-Mail, Messenger, öffentlich). Wichtig ist der Empfangsnachweis, etwa der Zeitstempel der E-Mail.') }));
  }

  async function detailView(id) {
    const s = store.state;
    const idx = s.seals.findIndex((x) => x.id === id);
    if (idx < 0) {
      return h('div', { class: 'stack' }, h('a', { class: 'back', href: '#/seals' }, icon('back'), t('Siegel')),
        banner('warn', t('Siegel nicht gefunden'), h('p', { text: t('Dieses Siegel gibt es hier nicht.') })));
    }
    const seal = s.seals[idx];
    const v = await C.verifySeal(seal);
    const linkOk = idx === 0 ? seal.body.prev === null : seal.body.prev === s.seals[idx - 1].id;
    const flash = Echt.flash && Echt.flash.sealId === id ? Echt.flash : null;
    Echt.flash = null;
    const b = seal.body;
    const embed = h('input', { type: 'checkbox', checked: true, id: 'embed' });
    const hasText = !!(seal.local && seal.local.text);

    const proofJson = (withContent) => JSON.stringify(proofOf(seal, withContent), null, 2);
    const withContent = () => hasText && embed.checked;

    const actions = h('div', { class: 'stack' },
      h('button', {
        type: 'button', class: 'btn block',
        onClick: () => { download(proofName(seal), proofJson(withContent()), 'application/json'); toast(t('Beweisdatei gespeichert')); },
      }, icon('download'), t('Beweisdatei speichern')),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn secondary', onClick: () => copy(proofJson(withContent()), t('Beweis kopiert')) }, icon('copy'), t('Beweis kopieren')),
        navigator.share ? h('button', {
          type: 'button', class: 'btn secondary',
          onClick: async () => {
            const f = new File([proofJson(withContent())], proofName(seal), { type: 'application/json' });
            const ok = await share({ file: f, title: t('ECHT-Beweis') });
            if (!ok) toast(t('Teilen wird hier nicht unterstützt. Bitte speichere die Datei.'), 'bad');
          },
        }, icon('share'), t('Teilen')) : null),
      hasText ? h('label', { class: 'row small' }, embed, t('Text in der Beweisdatei mitgeben (sonst muss er separat geschickt werden)')) : null);

    const kv = h('dl', { class: 'kv' },
      h('dt', { text: t('Art') }), h('dd', { text: b.type === 'file' ? t('Datei') : t('Text') }),
      b.name ? [h('dt', { text: t('Dateiname') }), h('dd', { text: safeText(b.name, 120) })] : null,
      h('dt', { text: t('Größe') }), h('dd', { text: fmtBytes(b.size) }),
      h('dt', { text: t('Zeitpunkt') }), h('dd', { text: fmtDate(b.createdAt) }),
      b.note ? [h('dt', { text: t('Notiz') }), h('dd', { text: safeText(b.note, 300) })] : null,
      h('dt', { text: t('Fingerabdruck (SHA-256)') }), h('dd', { class: 'mono', text: groupHex(b.sha256) }),
      h('dt', { text: t('Dein Schlüssel') }), h('dd', { class: 'mono', text: C.formatKeyId(b.signer.keyId) }),
      h('dt', { text: t('Vorgänger') }), h('dd', { class: 'mono', text: b.prev ? b.prev.slice(0, 16) + '…' : t('keiner (erstes Siegel)') }));

    return h('div', { class: 'stack' },
      h('a', { class: 'back', href: '#/seals' }, icon('back'), t('Siegel')),
      h('div', null, h('h1', { text: t('Siegel Nr. {v}', { v: (idx + 1) }) }), h('p', { class: 'muted', text: sealTitle(seal) })),
      flash ? banner('ok', t('Versiegelt'), h('p', { text: t('Speichere jetzt die Beweisdatei und bewahre sie zusammen mit dem Original auf. Wer beides in ECHT prüft, sieht, ob es echt ist.') })) : null,
      v.ok && linkOk
        ? banner('ok', t('Siegel gültig'), h('p', { text: t('Signatur, Fingerabdruck und Verkettung sind in Ordnung.') }))
        : banner('bad', t('Siegel beschädigt'), h('p', { text: t('Dieses Siegel besteht die Prüfung nicht ({reasons}). Prüfe dein Journal in den Einstellungen.', { reasons: [...(v.errors || []), ...(linkOk ? [] : [t('Verkettung')])].join(', ') }) })),
      h('div', { class: 'card' }, kv),
      hasText ? h('div', { class: 'card stack' }, h('h3', { text: t('Versiegelter Text') }), h('div', { class: 'codebox', style: null, text: seal.local.text }),
        h('button', { type: 'button', class: 'btn secondary small', onClick: () => copy(seal.local.text, t('Text kopiert')) }, icon('copy'), t('Text kopieren'))) : null,
      h('div', { class: 'card stack' }, h('h2', { text: t('Weitergeben') }), actions),
      timeProofCard(seal, idx),
      h('details', { class: 'more' }, h('summary', { text: t('Inhalt erneut prüfen') }), recheck(seal)),
      h('p', { class: 'small muted', text: t('Hinweis: Der Zeitpunkt wurde von deinem Gerät eingetragen. Unabhängig bestätigt wird er erst, wenn du in den Einstellungen einen Anker erzeugst und extern aufbewahrst.') }));
  }

  Echt.seals = {
    render(parts) { return parts[1] ? detailView(parts[1]) : listView(); },
    proofOf,
  };
})();
