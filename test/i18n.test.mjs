import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const I18n = require('../js/i18n.js');
const EN = require('../js/lang-en.js');
const LISTS = require('../js/words.js');

// Jede js/lang-xx.js wird automatisch mitgeprüft (neue Sprache: Datei anlegen, mehr braucht der Test nicht).
const LANG_FILES = fs.readdirSync(new URL('../js/', import.meta.url)).filter((f) => /^lang-[a-z]{2}\.js$/.test(f));
const DICTS = Object.fromEntries(LANG_FILES.map((f) => [f.slice(5, 7), require(`../js/${f}`)]));

const UI_FILES = ['app', 'circle', 'gate', 'seals', 'settings', 'store', 'ui', 'verify'];

/** Alle Texte, die im Code an t(…) oder rich(…) übergeben werden (erstes Argument als Textliteral). */
function usedKeys() {
  const keys = new Set();
  const re = /(?<![\w$.])(?:t|rich)\('((?:[^'\\\n]|\\.)*)'/g;
  const reEchtI18n = /EchtI18n\.t\('((?:[^'\\\n]|\\.)*)'/g;
  for (const f of UI_FILES) {
    const src = fs.readFileSync(new URL(`../js/${f}.js`, import.meta.url), 'utf8');
    for (const re2 of [re, reEchtI18n]) {
      re2.lastIndex = 0;
      for (const m of src.matchAll(re2)) keys.add(m[1].replace(/\\(.)/g, '$1'));
    }
  }
  return keys;
}

const placeholders = (s) => (s.match(/\{\w+\}/g) || []).sort().join(',');
const boldTags = (s) => `${s.split('<b>').length - 1}/${s.split('</b>').length - 1}`;

for (const [lang, dict] of Object.entries(DICTS)) {
  test(`Sprache ${lang}: jeder Text im Code hat eine Übersetzung`, () => {
    const missing = [...usedKeys()].filter((k) => !Object.prototype.hasOwnProperty.call(dict, k));
    assert.deepEqual(missing, [], `Es fehlen Texte in js/lang-${lang}.js`);
  });

  test(`Sprache ${lang}: keine verwaisten Einträge`, () => {
    const used = usedKeys();
    const stale = Object.keys(dict).filter((k) => !used.has(k));
    assert.deepEqual(stale, [], `Einträge in js/lang-${lang}.js, die der Code nicht mehr benutzt`);
  });

  test(`Sprache ${lang}: Platzhalter und Fettdruck stimmen mit dem Original überein, nichts ist leer`, () => {
    for (const [k, v] of Object.entries(dict)) {
      assert.ok(typeof v === 'string' && v.trim().length > 0, 'leer: ' + k);
      assert.equal(placeholders(v), placeholders(k), 'Platzhalter: ' + k);
      assert.equal(boldTags(v), boldTags(k), 'Fettdruck: ' + k);
      assert.equal(v, v.trim(), 'Leerzeichen am Rand: ' + k);
    }
  });
}

test('Englisch: kein deutscher Rest in den Übersetzungen', () => {
  // Umlaute und ß kommen in englischen Texten nicht vor
  const bad = Object.entries(EN).filter(([, v]) => /[äöüÄÖÜß]/.test(v)).map(([k]) => k);
  assert.deepEqual(bad, []);
});

test('t(): Deutsch gibt den Text selbst zurück, Englisch den Eintrag, Fehlendes bleibt Deutsch', () => {
  I18n.add('en', EN);
  I18n.setLang('de', false);
  assert.equal(I18n.t('Kopieren'), 'Kopieren');
  assert.equal(I18n.t('Verbunden mit {nm}', { nm: 'Anna' }), 'Verbunden mit Anna');
  I18n.setLang('en', false);
  assert.equal(I18n.t('Kopieren'), 'Copy');
  assert.equal(I18n.t('Verbunden mit {nm}', { nm: 'Anna' }), 'Connected with Anna');
  assert.equal(I18n.t('Ein Satz, den es nicht gibt'), 'Ein Satz, den es nicht gibt');
  I18n.setLang('de', false);
});

test('t(): Werte werden nie als Vorlage gedeutet', () => {
  I18n.setLang('en', false);
  assert.equal(I18n.t('Verbunden mit {nm}', { nm: '{nm} {x}' }), 'Connected with {nm} {x}');
  assert.equal(I18n.t('Verbunden mit {nm}', {}), 'Connected with {nm}');
  I18n.setLang('de', false);
});

test('richParts(): Fettdruck nur aus dem Text, nie aus eingesetzten Werten', () => {
  I18n.add('en', EN);
  I18n.setLang('en', false);
  const parts = I18n.richParts('<b>{name}</b> hat den Notfall-Code genannt. Das bedeutet sehr wahrscheinlich: Die Person wird bedroht oder gezwungen.', { name: '<b>Eve</b>' });
  assert.equal(parts[0].bold, true);
  assert.equal(parts[0].text, '<b>Eve</b>');
  assert.equal(parts.filter((p) => p.bold).length, 1);
  assert.match(parts[1].text, /^ gave the emergency code/);
  I18n.setLang('de', false);
});

test('Sprachen: jede Sprachdatei ist in LANGS eingetragen; Name, Ortsangabe und Sprachwahl', () => {
  assert.deepEqual(['de', ...Object.keys(DICTS)].sort(), Object.keys(I18n.LANGS).sort(), 'js/i18n.js (LANGS) und js/lang-*.js passen nicht zusammen');
  I18n.setLang('xx', false);
  assert.equal(I18n.lang(), 'de', 'unbekannte Sprache wird ignoriert');
  I18n.setLang('en', false);
  assert.equal(I18n.locale(), 'en-GB');
  I18n.setLang('de', false);
  assert.equal(I18n.locale(), 'de-DE');
});

test('Beispielwörter in den Texten stehen in der Wortliste (Deutsch und Englisch)', () => {
  const de = ['apfel', 'katze', 'mond'];
  const idx = de.map((w) => LISTS.de.indexOf(w));
  assert.ok(idx.every((i) => i >= 0), 'deutsche Beispielwörter fehlen');
  const en = idx.map((i) => LISTS.en[i]);
  const example = EN['Zum Beispiel: Apfel Katze Mond. Groß- und Kleinschreibung sowie Umlaute spielen keine Rolle.'];
  const expected = en.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
  assert.ok(example.includes(expected), `Beispiel im englischen Text sollte "${expected}" heißen: ${example}`);
});
