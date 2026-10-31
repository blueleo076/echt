/* ECHT – kleine UI-Helfer: DOM-Aufbau ohne innerHTML, Dialoge, Toasts, Formatierung. */
(function () {
  'use strict';
  const Echt = (window.Echt = window.Echt || {});
  Echt.i18n = window.EchtI18n;
  const { t } = Echt.i18n;
  const SVGNS = 'http://www.w3.org/2000/svg';

  const ICONS = {
    shield: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'],
    check: ['M20 6 9 17l-5-5'],
    users: ['M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M23 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
    seal: ['M12 15a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', 'M8.21 13.89 7 23l5-3 5 3-1.21-9.12'],
    search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'm21 21-4.35-4.35'],
    sliders: ['M4 21v-7', 'M4 10V3', 'M12 21v-9', 'M12 8V3', 'M20 21v-5', 'M20 12V3', 'M1 14h6', 'M9 8h6', 'M17 16h6'],
    lock: ['M5 11h14v10H5z', 'M8 11V7a4 4 0 0 1 8 0v4'],
    copy: ['M9 9h11v11H9z', 'M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1'],
    download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'],
    plus: ['M12 5v14', 'M5 12h14'],
    trash: ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6'],
    back: ['M15 18l-6-6 6-6'],
    alert: ['M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z', 'M12 9v4', 'M12 17h.01'],
    x: ['M18 6 6 18', 'M6 6l12 12'],
    file: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6'],
    text: ['M4 7V4h16v3', 'M9 20h6', 'M12 4v16'],
    key: ['M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4'],
    share: ['M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8', 'M16 6l-4-4-4 4', 'M12 2v13'],
    phone: ['M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z'],
    anchor: ['M12 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M12 22V8', 'M5 12H2a10 10 0 0 0 20 0h-3'],
    info: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M12 16v-4', 'M12 8h.01'],
  };

  function icon(name) {
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'icon');
    (ICONS[name] || []).forEach((d) => {
      const p = document.createElementNS(SVGNS, 'path');
      p.setAttribute('d', d);
      svg.appendChild(p);
    });
    return svg;
  }

  const ATTR_ONLY = new Set(['for', 'role', 'list', 'form', 'viewBox']);

  /** h('div', {class:'x', onClick: fn}, 'text', childNode, [..]) – Text wird nie als HTML gedeutet. */
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k.length > 2 && k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k.startsWith('aria-') || k.startsWith('data-') || ATTR_ONLY.has(k)) el.setAttribute(k, v === true ? '' : v);
        else if (k in el) el[k] = v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    append(el, kids);
    return el;
  }

  function append(el, kids) {
    for (const k of kids) {
      if (k === null || k === undefined || k === false) continue;
      if (Array.isArray(k)) append(el, k);
      else if (k instanceof Node) el.appendChild(k);
      else el.appendChild(document.createTextNode(String(k)));
    }
    return el;
  }

  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

  /**
   * Übersetzter Text mit <b>fett</b>: liefert Knoten für h(). Die Fettstellen stehen im Text selbst (siehe i18n.js),
   * Werte aus `vars` werden nie als Auszeichnung oder HTML gedeutet.
   */
  function rich(key, vars) {
    return Echt.i18n.richParts(key, vars).map((p) => (p.bold ? h('strong', { text: p.text }) : p.text));
  }

  // ---- Aufräumen beim Seitenwechsel (Timer etc.)
  let cleanups = [];
  function onCleanup(fn) { cleanups.push(fn); }
  function runCleanups() {
    const list = cleanups;
    cleanups = [];
    list.forEach((fn) => { try { fn(); } catch (e) { /* ignorieren */ } });
  }
  function every(ms, fn) {
    const id = setInterval(fn, ms);
    onCleanup(() => clearInterval(id));
    return id;
  }
  function later(ms, fn) {
    const id = setTimeout(fn, ms);
    onCleanup(() => clearTimeout(id));
    return id;
  }

  // ---- Toasts
  function toast(message, kind) {
    const host = document.getElementById('toasts');
    if (!host) return;
    const el = h('div', { class: 'toast' + (kind === 'bad' ? ' bad' : ''), role: kind === 'bad' ? 'alert' : 'status', text: message });
    host.appendChild(el);
    setTimeout(() => el.remove(), kind === 'bad' ? 6000 : 2800);
  }

  // ---- Dialoge
  /**
   * modal({title, body, actions:[{label, value, kind}], dismissValue}) -> Promise<value>
   * body ist ein Node; `collect` (optional) liefert beim Bestätigen den Rückgabewert.
   */
  const openModals = new Set();
  /** Schließt alle offenen Dialoge wie „Abbrechen“ (beim Sperren, damit nichts über dem Sperrbildschirm stehen bleibt). */
  function closeAllModals() { [...openModals].forEach((dismiss) => dismiss()); }

  function modal(opts) {
    return new Promise((resolve) => {
      const dlg = document.createElement('dialog');
      dlg.setAttribute('aria-label', opts.title);
      let done = false;
      const dismiss = () => finish(opts.dismissValue === undefined ? null : opts.dismissValue);
      const finish = async (value, action) => {
        if (done) return;
        if (action && action.validate) {
          const ok = await action.validate();
          if (!ok) return;
        }
        done = true;
        openModals.delete(dismiss);
        const result = action && action.collect ? action.collect() : value;
        dlg.close();
        dlg.remove();
        resolve(result);
      };
      const actions = (opts.actions || []).map((a) => h('button', {
        type: 'button', class: 'btn ' + (a.kind || 'secondary'), text: a.label,
        onClick: () => finish(a.value, a),
      }));
      dlg.appendChild(h('form', {
        method: 'dialog',
        onSubmit: (e) => {
          e.preventDefault();
          const primary = (opts.actions || []).find((a) => a.primary);
          if (primary) finish(primary.value, primary);
        },
      }, h('h2', { text: opts.title }), opts.body, h('div', { class: 'actions' }, actions)));
      dlg.addEventListener('cancel', (e) => { e.preventDefault(); dismiss(); });
      openModals.add(dismiss);
      document.body.appendChild(dlg);
      dlg.showModal();
      const first = dlg.querySelector('input, textarea, select');
      if (first) first.focus();
    });
  }

  /** Ja/Nein. Mit typeToConfirm muss ein Wort getippt werden (für Unumkehrbares). */
  async function confirmDialog(opts) {
    let input = null;
    const body = h('div', null, h('p', { text: opts.body }));
    if (opts.typeToConfirm) {
      input = h('input', { type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, 'aria-label': t('Zur Bestätigung "{typeToConfirm}" eintippen', { typeToConfirm: opts.typeToConfirm }) });
      body.append(h('p', { class: 'small muted', text: t('Tippe zur Bestätigung: {typeToConfirm}', { typeToConfirm: opts.typeToConfirm }) }), input);
    }
    const res = await modal({
      title: opts.title,
      body,
      actions: [
        { label: t('Abbrechen'), value: false },
        {
          label: opts.confirmLabel || t('Bestätigen'), kind: opts.danger ? 'danger' : 'primary', value: true, primary: true,
          validate: () => !input || input.value.trim().toUpperCase() === opts.typeToConfirm.toUpperCase(),
        },
      ],
      dismissValue: false,
    });
    return res === true;
  }

  /** Eingabedialog, gibt den Text zurück oder null. */
  async function promptDialog(opts) {
    const input = h(opts.multiline ? 'textarea' : 'input', {
      type: opts.multiline ? null : (opts.type || 'text'), value: opts.value || '', autocomplete: opts.autocomplete || 'off',
      autocapitalize: 'off', spellcheck: false, 'aria-label': opts.label, maxLength: opts.maxLength || 200,
    });
    const body = h('div', null, opts.text ? h('p', { text: opts.text }) : null, h('label', { class: 'field' }, h('span', { text: opts.label }), input));
    const res = await modal({
      title: opts.title,
      body,
      actions: [
        { label: t('Abbrechen'), value: null },
        { label: opts.confirmLabel || 'OK', kind: 'primary', primary: true, collect: () => input.value },
      ],
      dismissValue: null,
    });
    return res;
  }

  // ---- Zwischenablage, Download, Teilen
  async function copy(text, okMessage) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const ta = h('textarea', { value: text, readOnly: true });
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e2) { /* ignorieren */ }
      ta.remove();
      if (!ok) { toast(t('Kopieren nicht möglich – bitte Text markieren und manuell kopieren.'), 'bad'); return false; }
    }
    toast(okMessage || t('Kopiert'));
    return true;
  }

  function download(filename, data, type) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: type || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  async function share(opts) {
    if (!navigator.share) return false;
    try {
      if (opts.file) {
        if (!(navigator.canShare && navigator.canShare({ files: [opts.file] }))) return false;
        await navigator.share({ files: [opts.file], title: opts.title, text: opts.text });
      } else {
        await navigator.share({ title: opts.title, text: opts.text });
      }
      return true;
    } catch (e) {
      return e && e.name === 'AbortError';
    }
  }

  // ---- Formatierung
  const DISPLAY = { kaefer: 'Käfer', muehle: 'Mühle', loewe: 'Löwe', bruecke: 'Brücke', buerste: 'Bürste', floete: 'Flöte', kuerbis: 'Kürbis', loeffel: 'Löffel' };
  /** Wort-Code in der gewählten Sprache anzeigen (intern gelten immer die deutschen Wörter, siehe core.js). */
  function prettyWord(w) {
    const lang = Echt.i18n.lang();
    const loc = window.EchtCore.localizeWord(w, lang);
    const s = lang === 'de' ? (DISPLAY[loc] || loc) : loc;
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function wordsEl(words, cls) {
    return h('div', { class: 'words' + (cls ? ' ' + cls : '') }, words.map((w) => h('span', { text: prettyWord(w) })));
  }

  function fmtDate(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(Echt.i18n.locale(), { dateStyle: 'medium', timeStyle: 'medium' });
  }
  function fmtBytes(n) {
    if (n < 1024) return t('{n} Byte', { n: n });
    const u = ['KB', 'MB', 'GB'];
    let v = n / 1024, i = 0;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return v.toLocaleString(Echt.i18n.locale(), { maximumFractionDigits: 1 }) + ' ' + u[i];
  }
  function groupHex(hex) { return hex.replace(/(.{8})(?=.)/g, '$1 '); }
  function initial(name) { return (String(name).trim().charAt(0) || '?').toUpperCase(); }
  function slug(s) { return String(s).normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || t('datei'); }
  function today() { return new Date().toISOString().slice(0, 10); }

  // Fremde Texte (Namen, Notizen, Dateinamen aus Beweisen, Codes, Backups) werden nur gesäubert angezeigt:
  // keine Steuer-/Format-/Bidi-Zeichen (Umdrehen von Dateiendungen, unsichtbare Namensdopplungen)
  // und keine Türme aus Kombinationszeichen, die in Nachbarzeilen hineinragen.
  // Die eigentliche Säuberung liegt in core.js (dort auch per Unit-Test abgedeckt).
  function safeText(s, max) {
    const clean = window.EchtCore.stripUnsafe(s);
    const limit = max || 300;
    return clean.length > limit ? clean.slice(0, limit) + '…' : clean;
  }
  /** Namen von Personen: einzeilig, gesäubert, höchstens 40 Zeichen. */
  function cleanName(s) { return window.EchtCore.cleanName(s); }

  /** Zwei Passwortfelder mit Mindestlänge. Gibt das Passwort zurück oder null. */
  async function newPasswordDialog(opts) {
    const min = opts.min || 10;
    const p1 = h('input', { type: 'password', autocomplete: 'new-password' });
    const p2 = h('input', { type: 'password', autocomplete: 'new-password' });
    const err = h('p', { class: 'hint bad', role: 'alert' });
    const res = await modal({
      title: opts.title,
      body: h('div', null, opts.text ? h('p', { class: 'small', text: opts.text }) : null,
        h('label', { class: 'field' }, h('span', { text: t('Neues Passwort (mind. {min} Zeichen)', { min: min }) }), p1),
        h('label', { class: 'field' }, h('span', { text: t('Wiederholen') }), p2), err),
      actions: [
        { label: t('Abbrechen'), value: null },
        {
          label: opts.confirmLabel || t('Speichern'), kind: 'primary', primary: true, value: true,
          validate: async () => {
            if (p1.value.length < min) { err.textContent = t('Das Passwort ist zu kurz.'); return false; }
            if (p1.value !== p2.value) { err.textContent = t('Die beiden Passwörter sind nicht gleich.'); return false; }
            return true;
          },
        },
      ],
      dismissValue: null,
    });
    return res === true ? p1.value : null;
  }

  /** Fehlermeldung in Alltagssprache. */
  function banner(kind, title, body, iconName) {
    return h('div', { class: 'banner ' + kind, role: kind === 'bad' ? 'alert' : 'status' },
      icon(iconName || (kind === 'ok' ? 'check' : kind === 'info' ? 'info' : 'alert')),
      h('div', null, title ? h('h3', { text: title }) : null, body));
  }

  Echt.ui = {
    h, rich, icon, clear, modal, closeAllModals, confirmDialog, promptDialog, newPasswordDialog, toast, copy, download, share,
    safeText, cleanName,
    onCleanup, runCleanups, every, later,
    prettyWord, wordsEl, fmtDate, fmtBytes, groupHex, initial, slug, today, banner,
  };
})();
