/*
 * ECHT – Sprachen (Deutsch, Englisch).
 *
 * Der deutsche Text IST der Schlüssel: t('Wartet auf die Antwort von {name}', { name }) liefert im Deutschen den
 * Text selbst und im Englischen den Eintrag aus js/lang-en.js. Fehlt ein Eintrag, bleibt der deutsche Text stehen
 * (nichts bricht), und die Tests melden die Lücke. Platzhalter heißen {name}; die Werte werden nie als HTML
 * gedeutet. Für fett gesetzte Stellen gibt es <b>…</b> (siehe richParts).
 *
 * Neue Sprache hinzufügen: js/lang-xx.js nach dem Muster von lang-en.js anlegen, in LANGS eintragen,
 * in index.html und sw.js aufnehmen. Wörter der Wort-Codes brauchen eine eigene Liste (js/words.js).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EchtI18n = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const LANGS = {
    de: { name: 'Deutsch', locale: 'de-DE' },
    en: { name: 'English', locale: 'en-GB' },
  };
  const STORE_KEY = 'echt.lang';
  const dicts = {};
  let current = 'de';

  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  function storedLang() {
    try {
      const v = localStorage.getItem(STORE_KEY);
      return v && has(LANGS, v) ? v : null;
    } catch (e) {
      return null;
    }
  }

  /** Sprache des Browsers als Vorschlag (nur Deutsch oder Englisch). */
  function detectLang() {
    const nav = typeof navigator !== 'undefined' ? ((navigator.languages && navigator.languages[0]) || navigator.language || 'de') : 'de';
    return /^en/i.test(nav) ? 'en' : 'de';
  }

  function apply() {
    if (typeof document !== 'undefined' && document.documentElement) document.documentElement.lang = current;
  }

  /** Beim Start: gespeicherte Wahl, sonst der Vorschlag aus der Browser-Sprache. */
  function init() {
    current = storedLang() || detectLang();
    apply();
    return current;
  }

  /** Wurde die Sprache schon einmal ausdrücklich gewählt? (sonst zeigt die App beim ersten Start die Auswahl) */
  function hasChoice() { return storedLang() !== null; }

  function setLang(lang, remember) {
    if (!has(LANGS, lang)) return;
    current = lang;
    if (remember !== false) {
      try { localStorage.setItem(STORE_KEY, lang); } catch (e) { /* ohne Speicher: gilt nur für diese Sitzung */ }
    }
    apply();
  }

  function add(lang, dict) { dicts[lang] = Object.assign(dicts[lang] || {}, dict); }

  function fill(text, vars) {
    return String(text).replace(/\{(\w+)\}/g, (m, k) => (vars && has(vars, k) ? String(vars[k]) : m));
  }

  function lookup(key) {
    if (current === 'de') return key;
    const d = dicts[current];
    return d && has(d, key) ? d[key] : key;
  }

  /** Übersetzt einen Text. Platzhalter {name} werden aus `vars` gefüllt. */
  function t(key, vars) { return fill(lookup(key), vars); }

  /**
   * Text mit <b>fett</b> in Teile zerlegen: [{text, bold}]. Erst zerlegen, dann füllen: Werte aus `vars`
   * können deshalb keine Auszeichnung einschleusen.
   */
  function richParts(key, vars) {
    const out = [];
    let bold = false;
    lookup(key).split(/(<b>|<\/b>)/).forEach((piece) => {
      if (piece === '<b>') bold = true;
      else if (piece === '</b>') bold = false;
      else if (piece) out.push({ text: fill(piece, vars), bold });
    });
    return out;
  }

  // Im Browser gleich beim Laden die Sprache bestimmen, damit alle späteren Module sie schon vorfinden.
  if (typeof window !== 'undefined') init();

  return {
    LANGS, init, hasChoice, setLang, add, t, richParts, fill,
    lang: () => current,
    locale: () => LANGS[current].locale,
    detectLang,
  };
});
