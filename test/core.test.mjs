import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const C = require('../js/core.js');
const LISTS = require('../js/words.js');

const NOW = Date.parse('2026-10-31T12:00:30Z');

test('Wortlisten: je 256 eindeutige Wörter aus a–z, Deutsch und Englisch', () => {
  for (const [name, list] of [['de', LISTS.de], ['en', LISTS.en]]) {
    assert.equal(list.length, 256, name);
    assert.equal(new Set(list).size, 256, name);
    for (const w of list) {
      assert.match(w, /^[a-z]{2,10}$/, name + ': ' + w);
      assert.equal(C.normalizeWord(w), w);
    }
  }
  // Ein Wort darf nie an zwei verschiedenen Positionen stehen, sonst wäre die Eingabe mehrdeutig
  const where = new Map();
  LISTS.de.forEach((w, i) => where.set(w, i));
  LISTS.en.forEach((w, i) => {
    if (where.has(w)) assert.equal(where.get(w), i, 'Wort an zwei Positionen: ' + w);
    else where.set(w, i);
  });
});

test('Wörter beider Sprachen: Eingabe wird erkannt, Anzeige folgt der Sprache', () => {
  assert.deepEqual(C.parseWords('Eagle, Anchor – apple'), ['adler', 'anker', 'apfel']);
  assert.deepEqual(C.parseWords('Adler eagle'), ['adler', 'adler']);
  for (let i = 0; i < 256; i++) {
    assert.deepEqual(C.parseWords(LISTS.en[i]), [LISTS.de[i]], 'englisch ' + LISTS.en[i]);
    assert.deepEqual(C.parseWords(LISTS.de[i]), [LISTS.de[i]], 'deutsch ' + LISTS.de[i]);
    assert.equal(C.localizeWord(LISTS.de[i], 'en'), LISTS.en[i]);
    assert.equal(C.localizeWord(LISTS.de[i], 'de'), LISTS.de[i]);
  }
  assert.ok(C.isKnownWord('Eagle') && C.isKnownWord('ADLER') && !C.isKnownWord('xyzzy'));
  assert.equal(C.localizeWord('unbekannt', 'en'), 'unbekannt');
});

test('Code in der anderen Sprache gesprochen gilt als derselbe Code (Deutsch ↔ Englisch am Telefon)', async () => {
  const secret = C.newSecret();
  const step = C.stepAt(NOW);
  const words = await C.liveWords(secret, step, false, 'b');
  const duress = await C.liveWords(secret, step, true, 'b');
  const en = (list) => list.map((w) => C.localizeWord(w, 'en'));
  assert.equal((await C.checkLive(secret, en(words).join(' '), NOW, 'b')).result, 'ok');
  assert.equal((await C.checkLive(secret, en(duress).join(', '), NOW, 'b')).result, 'duress');
  assert.equal((await C.checkLive(secret, [en(words)[0], words[1], en(words)[2]].join(' '), NOW, 'b')).result, 'ok', 'gemischt');
  const resp = await C.responseWords(secret, '123456', false, 'a');
  assert.equal((await C.checkResponse(secret, '123456', en(resp).join(' '), 'a')).result, 'ok');
  // Die Wörter einer anderen Rolle bleiben falsch, egal in welcher Sprache
  const other = await C.liveWords(secret, step, false, 'a');
  assert.equal((await C.checkLive(secret, en(other).join(' '), NOW, 'b')).result, 'invalid');
});

test('Hilfsfunktionen: Base64url, Hex, kanonisches JSON', () => {
  const bytes = Uint8Array.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
  assert.deepEqual(C.b64uDecode(C.b64uEncode(bytes)), bytes);
  assert.deepEqual(C.fromHex(C.toHex(bytes)), bytes);
  assert.throws(() => C.b64uDecode('a+b'));
  assert.equal(C.canonical({ b: 1, a: [true, null, 'x'], c: undefined }), '{"a":[true,null,"x"],"b":1}');
});

test('Referenzwerte: Code-Ableitung darf sich nie unbemerkt ändern (Protokoll-Kompatibilität)', async () => {
  const secret = C.b64uEncode(Uint8Array.from({ length: 32 }, (_, i) => i));
  assert.equal(secret, 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8');
  assert.equal((await C.liveWords(secret, 1000, false, 'a')).join(' '), 'lilie lampe honig');
  assert.equal((await C.liveWords(secret, 1000, true, 'a')).join(' '), 'wabe nest geige');
  assert.equal((await C.liveWords(secret, 1000, false, 'b')).join(' '), 'atlas ring erbse');
  assert.equal((await C.liveWords(secret, 1000, true, 'b')).join(' '), 'kuh marder gabel');
  assert.equal((await C.responseWords(secret, '123456', false, 'a')).join(' '), 'topf radio schwan');
  assert.equal((await C.responseWords(secret, '123456', false, 'b')).join(' '), 'butter papier storch');
  assert.equal(await C.pairId(secret), 'e26cec02645d');
});

test('Wörter parsen: Groß-/Kleinschreibung, Umlaute, Trennzeichen', () => {
  assert.deepEqual(C.parseWords('Apfel,  KATZE – Mond'), ['apfel', 'katze', 'mond']);
  assert.deepEqual(C.parseWords('Bücke-Löwe'), ['buecke', 'loewe']);
  assert.deepEqual(C.parseWords('Brücke Löffel'), ['bruecke', 'loeffel']);
  assert.deepEqual(C.parseWords('Brücke'), ['bruecke']); // zerlegtes ü
});

test('Live-Code: stabil, zeitabhängig, 3 Wörter', async () => {
  const secret = C.newSecret();
  const step = C.stepAt(NOW);
  const a = await C.liveWords(secret, step, false, 'a');
  assert.equal(a.length, 3);
  assert.deepEqual(a, await C.liveWords(secret, step, false, 'a'));
  assert.notDeepEqual(a, await C.liveWords(secret, step + 1, false, 'a'));
  assert.notDeepEqual(a, await C.liveWords(C.newSecret(), step, false, 'a'));
  assert.notDeepEqual(a, await C.liveWords(secret, step, true, 'a'));
  assert.notDeepEqual(a, await C.liveWords(secret, step, false, 'b'), 'beide Richtungen müssen verschiedene Codes haben');
  await assert.rejects(() => C.liveWords(secret, step, false, 'c'), /bad-role/);
  await assert.rejects(() => C.liveWords(secret, step, false), /bad-role/);
});

test('Live-Code: Prüfung mit Toleranz, Notfall-Code, falsche Eingaben', async () => {
  const secret = C.newSecret();
  const step = C.stepAt(NOW);
  const ok = await C.liveWords(secret, step, false, 'b');
  const duress = await C.liveWords(secret, step, true, 'b');

  assert.deepEqual(await C.checkLive(secret, ok.join(' '), NOW, 'b'), { result: 'ok', offset: 0 });
  assert.equal((await C.checkLive(secret, ok.join(', ').toUpperCase(), NOW, 'b')).result, 'ok');
  assert.deepEqual(await C.checkLive(secret, duress.join(' '), NOW, 'b'), { result: 'duress', offset: 0 });

  // vorheriges und nächstes Zeitfenster werden noch akzeptiert, übernächstes nicht
  const prev = await C.liveWords(secret, step - 1, false, 'b');
  const next = await C.liveWords(secret, step + 1, false, 'b');
  const far = await C.liveWords(secret, step + 2, false, 'b');
  assert.equal((await C.checkLive(secret, prev.join(' '), NOW, 'b')).offset, -1);
  assert.equal((await C.checkLive(secret, next.join(' '), NOW, 'b')).offset, 1);
  assert.equal((await C.checkLive(secret, far.join(' '), NOW, 'b')).result, 'invalid');

  assert.equal((await C.checkLive(secret, 'apfel katze', NOW, 'b')).reason, 'format');
  assert.equal((await C.checkLive(secret, '', NOW, 'b')).result, 'invalid');
  assert.equal((await C.checkLive(C.newSecret(), ok.join(' '), NOW, 'b')).result, 'invalid');
});

test('Richtung: der eigene Code taugt nicht als Beweis der anderen Seite (Vorlesen-Trick)', async () => {
  const secret = C.newSecret();
  const step = C.stepAt(NOW);
  // Anna (Rolle a) liest ihren Code vor. Bei Anna selbst, die Ben (Rolle b) prüft, darf er nicht gelten.
  for (const duress of [false, true]) {
    const annas = await C.liveWords(secret, step, duress, 'a');
    assert.equal((await C.checkLive(secret, annas.join(' '), NOW, 'b')).result, 'invalid');
    assert.equal((await C.checkLive(secret, annas.join(' '), NOW, 'a')).result, duress ? 'duress' : 'ok');
  }
  // Ebenso bei Rückfragen
  const ch = '000123';
  const annasResp = await C.responseWords(secret, ch, false, 'a');
  assert.equal((await C.checkResponse(secret, ch, annasResp.join(' '), 'b')).result, 'invalid');
  assert.equal((await C.checkResponse(secret, ch, annasResp.join(' '), 'a')).result, 'ok');
  assert.equal(C.otherRole('a'), 'b');
  assert.equal(C.otherRole('b'), 'a');
});

test('Rückfrage: Zahl, Antwort, Notfall-Antwort', async () => {
  const secret = C.newSecret();
  for (let i = 0; i < 50; i++) assert.match(C.newChallenge(), /^\d{6}$/);
  assert.equal(C.normalizeChallenge('123 456'), '123456');
  assert.equal(C.normalizeChallenge('12345'), null);

  const ch = '042517';
  const ok = await C.responseWords(secret, ch, false, 'a');
  const du = await C.responseWords(secret, ch, true, 'a');
  assert.notDeepEqual(ok, du);
  assert.notDeepEqual(ok, await C.responseWords(secret, '042518', false, 'a'));
  assert.equal((await C.checkResponse(secret, ch, ok.join(' '), 'a')).result, 'ok');
  assert.equal((await C.checkResponse(secret, ch, du.join(' '), 'a')).result, 'duress');
  assert.equal((await C.checkResponse(secret, '999999', ok.join(' '), 'a')).result, 'invalid');
  await assert.rejects(() => C.responseWords(secret, 'abc', false, 'a'));
});

test('Verbindungskennung ist für beide Seiten gleich und verrät das Geheimnis nicht', async () => {
  const s = C.newSecret();
  const id = await C.pairId(s);
  assert.match(id, /^[0-9a-f]{12}$/);
  assert.equal(id, await C.pairId(s));
  assert.ok(!s.includes(id));
});

test('Wörter sind über viele Geheimnisse gleichmäßig verteilt (grober Plausibilitätstest)', async () => {
  const counts = new Map();
  const N = 3000;
  for (let i = 0; i < N; i++) {
    const w = (await C.liveWords(C.newSecret(), 1, false, 'a'))[0];
    counts.set(w, (counts.get(w) || 0) + 1);
  }
  assert.ok(counts.size > 200, 'zu wenige verschiedene Wörter: ' + counts.size);
  assert.ok(Math.max(...counts.values()) < 40);
});

test('Identität: Schlüssel-ID, Signatur', async () => {
  const id = await C.generateIdentity();
  assert.match(id.keyId, /^[0-9a-f]{16}$/);
  assert.equal(await C.keyIdOf(id.publicKey), id.keyId);
  assert.match(C.formatKeyId(id.keyId), /^([0-9A-F]{4}-){3}[0-9A-F]{4}$/);
  const msg = C.utf8('hallo');
  const sig = await C.sign(id.privateJwk, msg);
  assert.ok(await C.verifySignature(id.publicKey, sig, msg));
  assert.ok(!(await C.verifySignature(id.publicKey, sig, C.utf8('hallo!'))));
  const other = await C.generateIdentity();
  assert.ok(!(await C.verifySignature(other.publicKey, sig, msg)));
  assert.ok(!(await C.verifySignature({ kty: 'EC' }, sig, msg)));
});

async function makeSeal(identity, text, prev, when) {
  return C.createSeal(identity, 'Anna', {
    type: 'text', name: '', size: C.textBytes(text).length,
    sha256: await C.sha256Hex(C.textBytes(text)), note: 'Test', prev,
  }, when);
}

test('Siegel: erzeugen, prüfen, Inhalt zuordnen', async () => {
  const id = await C.generateIdentity();
  const seal = await makeSeal(id, 'Ich habe das geschrieben.', null, new Date('2026-10-31T10:00:00Z'));
  assert.deepEqual(await C.verifySeal(seal), { ok: true, errors: [] });
  assert.equal(seal.body.createdAt, '2026-10-31T10:00:00.000Z');
  assert.ok(await C.matchesContent(seal, 'Ich habe das geschrieben.'));
  assert.ok(await C.matchesContent(seal, 'Ich habe das geschrieben.'.replace(/ /g, ' ')));
  assert.ok(!(await C.matchesContent(seal, 'Ich habe das geschrieben!')));
  // Zeilenenden und Unicode-Normalisierung stören nicht
  const multi = await makeSeal(id, 'a\nb', null);
  assert.ok(await C.matchesContent(multi, 'a\r\nb'));
  // Datei-Bytes
  const bytes = Uint8Array.from([1, 2, 3, 4]);
  const fileSeal = await C.createSeal(id, 'Anna', { type: 'file', name: 'x.bin', size: 4, mime: 'application/octet-stream', sha256: await C.sha256Hex(bytes) });
  assert.ok(await C.matchesContent(fileSeal, bytes));
  assert.ok(!(await C.matchesContent(fileSeal, Uint8Array.from([1, 2, 3, 5]))));
});

test('Siegel: jede Manipulation wird erkannt', async () => {
  const id = await C.generateIdentity();
  const seal = await makeSeal(id, 'Original', null);
  const clone = () => JSON.parse(JSON.stringify(seal));

  const changes = {
    note: (s) => { s.body.note = 'anders'; },
    sha: (s) => { s.body.sha256 = '0'.repeat(64); },
    date: (s) => { s.body.createdAt = '2020-01-01T00:00:00.000Z'; },
    prev: (s) => { s.body.prev = 'a'.repeat(64); },
    name: (s) => { s.body.signer.name = 'Bernd'; },
    sig: (s) => { s.sig = s.sig.slice(0, -2) + (s.sig.endsWith('AA') ? 'BB' : 'AA'); },
  };
  for (const [name, fn] of Object.entries(changes)) {
    const s = clone();
    fn(s);
    const r = await C.verifySeal(s);
    assert.ok(!r.ok, 'Änderung "' + name + '" blieb unbemerkt');
  }

  // Kennung neu berechnet, aber Signatur fehlt -> ungültig
  const forged = clone();
  forged.body.note = 'gefälscht';
  forged.id = await C.sha256Hex(C.canonical(forged.body));
  const r = await C.verifySeal(forged);
  assert.ok(!r.ok && r.errors.includes('signature'));

  // Fremder Schlüssel mit eigener, passender Signatur: gültig, aber andere Schlüssel-ID
  const mallory = await C.generateIdentity();
  const own = await makeSeal(mallory, 'Original', null);
  assert.ok((await C.verifySeal(own)).ok);
  assert.notEqual(own.body.signer.keyId, seal.body.signer.keyId);

  // Schlüssel ausgetauscht -> Schlüssel-ID passt nicht
  const swapped = clone();
  swapped.body.signer.key = mallory.publicKey;
  assert.ok((await C.verifySeal(swapped)).errors.includes('keyId'));

  // Kaputte Struktur
  for (const bad of [null, {}, { format: 'x' }, { ...seal, body: { ...seal.body, size: -1 } }]) {
    assert.equal((await C.verifySeal(bad)).ok, false);
  }
});

test('Kette: Lücke, Austausch, Umordnung und Zeitrücksprung', async () => {
  const id = await C.generateIdentity();
  const s1 = await makeSeal(id, 'eins', null, new Date('2026-10-31T10:00:00Z'));
  const s2 = await makeSeal(id, 'zwei', s1.id, new Date('2026-10-31T11:00:00Z'));
  const s3 = await makeSeal(id, 'drei', s2.id, new Date('2026-10-31T12:00:00Z'));
  assert.deepEqual(await C.verifyChain([]), { ok: true, warnings: [] });
  assert.deepEqual(await C.verifyChain([s1, s2, s3]), { ok: true, warnings: [] });

  const gap = await C.verifyChain([s1, s3]);
  assert.deepEqual([gap.ok, gap.index, gap.reason], [false, 1, 'link']);
  const swapped = await C.verifyChain([s1, s3, s2]);
  assert.equal(swapped.ok, false);

  const tampered = JSON.parse(JSON.stringify(s2));
  tampered.body.note = 'x';
  const t = await C.verifyChain([s1, tampered, s3]);
  assert.deepEqual([t.ok, t.index, t.reason], [false, 1, 'seal']);

  const back = await makeSeal(id, 'vier', s3.id, new Date('2026-10-30T00:00:00Z'));
  const w = await C.verifyChain([s1, s2, s3, back]);
  assert.equal(w.ok, true);
  assert.deepEqual(w.warnings, [{ index: 3, kind: 'time-backwards' }]);
});

test('Kette: Anfang fehlt oder fremder Schlüssel angehängt', async () => {
  const id = await C.generateIdentity();
  const other = await C.generateIdentity();
  const s1 = await makeSeal(id, 'eins', null, new Date('2026-10-31T10:00:00Z'));
  const s2 = await makeSeal(id, 'zwei', s1.id, new Date('2026-10-31T11:00:00Z'));
  const s3 = await makeSeal(id, 'drei', s2.id, new Date('2026-10-31T12:00:00Z'));
  // Der Anfang fehlt: das erste vorhandene Siegel hat noch einen Vorgänger
  const noStart = await C.verifyChain([s2, s3]);
  assert.deepEqual([noStart.ok, noStart.index, noStart.reason], [false, 0, 'start']);
  // Siegel eines fremden Schlüssels, korrekt verkettet, aber nicht vom Besitzer des Journals
  const foreign = await makeSeal(other, 'fremd', s3.id, new Date('2026-10-31T13:00:00Z'));
  const withForeign = await C.verifyChain([s1, s2, s3, foreign], { keyId: id.keyId });
  assert.deepEqual([withForeign.ok, withForeign.index, withForeign.reason], [false, 3, 'signer']);
  // Ohne Vorgabe zählt der Schlüssel des ersten Siegels
  assert.equal((await C.verifyChain([s1, s2, s3, foreign])).reason, 'signer');
  assert.equal((await C.verifyChain([s1, s2, s3], { keyId: id.keyId })).ok, true);
  assert.equal((await C.verifyChain([s1, s2, s3], { keyId: other.keyId })).reason, 'signer');
});

test('Text: nur Zeilenenden werden vereinheitlicht, kein Unicode-Umschreiben (Kelvin-Zeichen)', async () => {
  const id = await C.generateIdentity();
  const seal = await makeSeal(id, 'Kontostand K', null);
  assert.ok(await C.matchesContent(seal, 'Kontostand K'));
  assert.ok(!(await C.matchesContent(seal, 'Kontostand K')), 'Kelvin-Zeichen darf nicht als K durchgehen');
  assert.ok(!(await C.matchesContent(seal, 'Kontostand Ḱ')));
  const composed = await makeSeal(id, 'Brücke', null);
  assert.ok(!(await C.matchesContent(composed, 'Brücke')), 'zusammengesetztes und zerlegtes ü sind verschiedene Bytes');
  assert.equal(C.normalizeText('a\r\nb\rc'), 'a\nb\nc');
});

test('Namen: Doppelgänger über unsichtbare Zeichen, Akzente und Lookalikes werden gleichgesetzt', () => {
  const mama = C.nameKey('Mama');
  const lookalikes = {
    'Combining Grapheme Joiner (U+034F)': 'Mama͏',
    'Soft Hyphen': 'Ma­ma',
    'Zero-Width Space': 'Ma​ma',
    'Bidi-Steuerzeichen': '‮Mama‬',
    'Variantenwähler': 'Mama️',
    'Großbuchstaben': 'MAMA',
    'Leerzeichen': ' Ma ma ',
    'kyrillisches а': 'Mаmа',
    'griechisches α': 'Mαmα',
    'zerlegter Akzent': 'Màma',
  };
  for (const [what, name] of Object.entries(lookalikes)) assert.equal(C.nameKey(name), mama, what + ' darf kein eigener Name sein');
  assert.notEqual(C.nameKey('Papa'), mama);
  assert.notEqual(C.nameKey('Mama Handy'), C.nameKey('Mama Festnetz'));
  // Ähnliche Zeichen wie I, l und 1
  assert.equal(C.nameKey('Ilse'), C.nameKey('llse'));
  assert.equal(C.nameKey('Olli'), C.nameKey('0lli'));
});

test('Namen: gemischte Schriften werden erkannt, Säuberung entfernt Unsichtbares', () => {
  assert.equal(C.mixesScripts('Mаma'), true);
  assert.equal(C.mixesScripts('Mαma'), true);
  assert.equal(C.mixesScripts('Mama'), false);
  assert.equal(C.mixesScripts('Мама'), false); // rein kyrillisch ist erlaubt (echte Namen)
  assert.equal(C.mixesScripts('Zoë 😀'), false);
  assert.equal(C.cleanName('  Ben‮​  Meier '), 'Ben Meier');
  assert.equal(C.stripUnsafe('Rechnung_‮fdp.exe'), 'Rechnung_fdp.exe');
  assert.equal(C.stripUnsafe('á̂̃̄̅̆'), 'á̂̃');
  assert.equal(C.cleanName('x'.repeat(100)).length, 40);
});

test('Namen: Kapitälchen, Lautschrift und weitere Schriften (Cherokee, Armenisch) werden erkannt', () => {
  const cp = (...codes) => String.fromCodePoint(...codes);
  const smallCaps = cp(0x1d0d, 0x1d00, 0x1d0d, 0x1d00); // Kapitälchen-Schreibweise von MAMA
  assert.equal(C.nameKey(smallCaps), C.nameKey('Mama'));
  assert.equal(C.hasExoticLetters(smallCaps), true);
  assert.equal(C.hasExoticLetters(cp(0x251, 0x6d, 0x61)), true); // lateinisches Alpha (IPA)
  assert.equal(C.mixesScripts(cp(0x13aa) + 'ama'), true); // Cherokee
  assert.equal(C.mixesScripts(cp(0x544) + 'ama'), true); // Armenisch
  assert.equal(C.mixesScripts('Mama ' + cp(0x416)), true); // Kyrillisch neben Lateinisch
  // Echte Namen bleiben erlaubt
  for (const ok of ['Mama', 'Zo' + cp(0xeb), 'M' + cp(0xfc) + 'ller', cp(0x218) + 'tefan', 'Jos' + cp(0xe9) + ' Mar' + cp(0xed) + 'a', 'Papa (Handy)']) {
    assert.equal(C.mixesScripts(ok), false, ok);
    assert.equal(C.hasExoticLetters(ok), false, ok);
  }
  assert.equal(C.mixesScripts(cp(0x41c, 0x430, 0x43c, 0x430)), false); // rein kyrillische Namen sind erlaubt
});

test('Verbindungs-Codes: übergroße Eingaben werden sofort abgelehnt', async () => {
  await assert.rejects(() => C.decodeCode('ECHT1-I-' + 'A'.repeat(7000) + '-AAAA'), /bad-code/);
});

async function makeJournal(identity, n, texts) {
  const seals = [];
  let prev = null;
  for (let i = 0; i < n; i++) {
    const seal = await makeSeal(identity, (texts && texts[i]) || 'Eintrag ' + (i + 1), prev, new Date(Date.UTC(2026, 9, 1 + i, 10, 0, 0)));
    seals.push(seal);
    prev = seal.id;
  }
  return seals;
}
const clone = (o) => JSON.parse(JSON.stringify(o));
const hex = (c) => c.repeat(64);

/** Ein Siegel im alten Format 1 (Kennung = SHA-256 des signierten Teils, ohne nonce), wie es frühere Versionen erzeugten. */
async function makeLegacySeal(identity, text, prev, when) {
  const bytes = C.textBytes(text);
  const body = {
    type: 'text', name: '', size: bytes.length, mime: '', sha256: await C.sha256Hex(bytes), note: '',
    createdAt: when.toISOString(), prev: prev || null,
    signer: { name: 'Alt', keyId: identity.keyId, key: identity.publicKey },
  };
  const signed = C.utf8(C.canonical(body));
  return { format: 'echt-seal/1', id: await C.sha256Hex(signed), body, sig: C.b64uEncode(await C.sign(identity.privateJwk, signed)) };
}

test('Siegel Format 2: nonce, Kennung bindet Vorgänger, Format 1 bleibt lesbar', async () => {
  const id = await C.generateIdentity();
  const [a, b] = await makeJournal(id, 2);
  assert.equal(a.format, 'echt-seal/2');
  assert.match(a.body.nonce, /^[A-Za-z0-9_-]{22}$/);
  assert.notEqual(a.body.nonce, b.body.nonce);
  assert.equal(a.id, await C.linkId(null, await C.bodyCommit(a.body)));
  assert.equal(b.id, await C.linkId(a.id, await C.bodyCommit(b.body)));
  assert.deepEqual(await C.verifySeal(b), { ok: true, errors: [] });
  // fehlende oder kaputte nonce macht ein Format-2-Siegel ungültig
  const noNonce = clone(b);
  delete noNonce.body.nonce;
  assert.equal((await C.verifySeal(noNonce)).ok, false);
  // älteres Format bleibt prüfbar und kann in einer Kette mit neuen Siegeln stehen
  const legacy = await makeLegacySeal(id, 'alt', null, new Date('2026-09-01T10:00:00Z'));
  assert.deepEqual(await C.verifySeal(legacy), { ok: true, errors: [] });
  const next = await makeSeal(id, 'neu', legacy.id, new Date('2026-09-02T10:00:00Z'));
  assert.deepEqual(await C.verifyChain([legacy, next]), { ok: true, warnings: [] });
  const tampered = clone(legacy);
  tampered.body.note = 'x';
  assert.equal((await C.verifySeal(tampered)).ok, false);
});

test('Anker: erzeugen und strenges Lesen', async () => {
  const id = await C.generateIdentity();
  const s = await makeSeal(id, 'x', null);
  const line = C.makeAnchor(s, 7, new Date('2026-10-31T12:00:00Z'));
  assert.deepEqual(C.parseAnchor(line), { n: 7, head: s.id, keyId: id.keyId, at: '2026-10-31T12:00:00.000Z' });
  assert.deepEqual(C.parseAnchor('  ' + line + '\r\n'), C.parseAnchor(line), 'Leerraum außen ist erlaubt');
  // Streng: kein Text davor oder danach, keine zweite Zeile, keine unsichtbaren Zeichen im Datum
  assert.equal(C.parseAnchor('Hier mein Anker:\n' + line + '\nBis bald'), null);
  assert.equal(C.parseAnchor('UNGUELTIG-' + line), null);
  assert.equal(C.parseAnchor('Achtung, kein gültiger Anker: ' + line), null);
  assert.equal(C.parseAnchor(line + '\n' + line), null);
  assert.equal(C.parseAnchor(line + ' Zusatz'), null);
  assert.equal(C.parseAnchor(line.replace(/at=\S+/, 'at=' + String.fromCodePoint(0x202e) + '2026-10-31T12:00:00Z')), null);
  assert.equal(C.parseAnchor(line.replace(/n=\d+/, 'n=' + '9'.repeat(400))), null);
  assert.equal(C.parseAnchor('nichts'), null);
  assert.equal(C.parseAnchor(null), null);
});

test('Zeitbeleg: Auszug enthält nur Kennungen und Prüfsummen und wird bestätigt', async () => {
  const id = await C.generateIdentity();
  const journal = await makeJournal(id, 6, ['Ja', 'Beweis-Siegel', 'Ich kündige zum 30.06.', 'Arzttermin Dr. Meier', 'Stand', 'später']);
  const anchor = C.makeAnchor(journal[4], 5, new Date('2026-10-06T08:00:00Z')); // Stand Nr. 5 wurde weitergegeben
  const proof = journal[1]; // Siegel Nr. 2 soll belegt werden
  const extract = await C.makeJournalExtract(journal, 1, 4);
  assert.equal(extract.format, 'echt-journal/2');
  assert.equal(extract.fromNumber, 2);
  assert.equal(extract.links.length, 3);
  assert.ok(extract.links.every((l) => Object.keys(l).sort().join() === 'commit,prev'), 'je Glied nur prev und commit');

  // Datenschutz: nichts vom Inhalt der Zwischen-Siegel steht im Auszug
  const text = JSON.stringify(extract);
  for (const secret of ['kündige', 'Arzttermin', 'Meier', 'Ja', 'Stand', 'Eintrag', 'signer', 'name', 'note', 'createdAt', 'sha256', 'sig', 'nonce', 'Beweis-Siegel']) {
    assert.ok(!text.includes(secret), 'Auszug darf "' + secret + '" nicht enthalten');
  }
  // … und kurze Texte lassen sich über den Auszug nicht erraten: ohne nonce ergibt sich eine andere Prüfsumme
  const guess = clone(journal[2].body);
  delete guess.nonce;
  assert.notEqual(await C.bodyCommit(guess), extract.links[0].commit);
  assert.equal(await C.bodyCommit(journal[2].body), extract.links[0].commit);
  // Der Auszug selbst ist winzig
  assert.ok(text.length < 600, 'Auszug zu groß: ' + text.length);

  const r = await C.verifyJournalAnchor(extract, proof, anchor);
  assert.equal(r.ok, true);
  assert.equal(r.count, 4);
  assert.equal(r.sealNumber, 2);
  assert.equal(r.headNumber, 5);
  assert.equal(r.headId, journal[4].id);
  assert.deepEqual(r.warnings, []);

  // Anker direkt auf dem Siegel selbst: leerer Auszug genügt
  const self = await C.makeJournalExtract(journal, 3, 3);
  assert.equal(self.links.length, 0);
  assert.equal((await C.verifyJournalAnchor(self, journal[3], C.makeAnchor(journal[3], 4, new Date()))).count, 1);
  // Auszug ab dem ersten Siegel; Auszug darf über den Anker hinausreichen (es zählt der Stand der Zeile)
  const full = await C.makeJournalExtract(journal, 0, 5);
  assert.equal((await C.verifyJournalAnchor(full, journal[0], C.makeAnchor(journal[5], 6, new Date()))).count, 6);
  const longer = await C.makeJournalExtract(journal, 1, 5);
  assert.equal((await C.verifyJournalAnchor(longer, proof, anchor)).count, 4);
});

test('Zeitbeleg: Fälschungsversuche scheitern (auch Einhängen in eine verankerte Kette)', async () => {
  const id = await C.generateIdentity();
  const mallory = await C.generateIdentity();
  const journal = await makeJournal(id, 5);
  const proof = journal[1];
  const anchor = C.makeAnchor(journal[3], 4, new Date('2026-10-06T08:00:00Z'));
  const good = await C.makeJournalExtract(journal, 1, 3);
  const reason = async (extract, p, a) => (await C.verifyJournalAnchor(extract, p || proof, a || anchor)).reason;

  // Eingaben sind keine ECHT-Dateien
  assert.equal(await reason(good, proof, 'irgendwas'), 'anchor-format');
  assert.equal(await reason({ format: 'x', links: [] }), 'extract-format');
  assert.equal(await reason(null), 'extract-format');
  assert.equal(await reason({ ...good, links: 'nein' }), 'extract-format');
  assert.equal(await reason({ ...good, links: [null] }), 'extract-format');
  assert.equal(await reason({ ...good, links: [{ prev: 'x', commit: 'y' }] }), 'extract-format');

  // Auszug gehört zu einem anderen Siegel oder reicht nicht bis zum Anker
  assert.equal(await reason(await C.makeJournalExtract(journal, 2, 3)), 'proof-missing');
  assert.equal(await reason(await C.makeJournalExtract(journal, 1, 2)), 'head-missing');
  // Anker liegt VOR dem Siegel: vom späteren Siegel führt kein Weg zu einem früheren Stand
  assert.equal(await reason(await C.makeJournalExtract(journal, 3, 4), journal[3], C.makeAnchor(journal[1], 2, new Date())), 'head-missing');
  // Auszug beginnt nicht bei diesem Siegel
  assert.equal(await reason(good, journal[3], C.makeAnchor(journal[4], 5, new Date())), 'proof-missing');
  // Liegt der Anker genau auf dem Siegel, braucht es keinen Auszug (das Siegel ist selbst der Stand)
  assert.equal((await C.verifyJournalAnchor(good, journal[3], C.makeAnchor(journal[3], 4, new Date()))).ok, true);
  // Anker eines anderen Schlüssels
  assert.equal(await reason(good, proof, C.makeAnchor(journal[3], 4, new Date()).replace(/key=[0-9a-f]{16}/, 'key=' + mallory.keyId)), 'key-mismatch');

  // Ein Glied wird verändert oder entfernt
  const changed = clone(good);
  changed.links[0].commit = hex('a');
  assert.equal((await C.verifyJournalAnchor(changed, proof, anchor)).ok, false);
  const gap = clone(good);
  gap.links.splice(0, 1);
  assert.equal((await C.verifyJournalAnchor(gap, proof, anchor)).ok, false);
  const swapped = clone(good);
  [swapped.links[0], swapped.links[1]] = [swapped.links[1], swapped.links[0]];
  assert.equal((await C.verifyJournalAnchor(swapped, proof, anchor)).ok, false);

  // RÜCKDATIERUNG: Der Angreifer hat ein neues Siegel F und will es als Vorfahren des früher verankerten Standes ausgeben.
  const forgedProof = await makeSeal(mallory, 'später entstanden', null, new Date('2026-09-01T10:00:00Z')); // frei rückdatiert
  const forgedAnchor = C.makeAnchor(journal[3], 4, new Date('2026-10-06T08:00:00Z')).replace(/key=[0-9a-f]{16}/, 'key=' + mallory.keyId);
  // (a) Er behauptet, der echte Kopf habe F als Vorgänger: die Kennung bindet prev, also ergibt sich eine andere Kennung
  const realHeadCommit = await C.bodyCommit(journal[3].body);
  const splice = { format: 'echt-journal/2', fromNumber: 1, links: [{ prev: forgedProof.id, commit: realHeadCommit }] };
  assert.equal(await reason(splice, forgedProof, forgedAnchor), 'head-missing');
  // (b) Er hängt F hinter den echten Vorgänger des Kopfes und behauptet, das sei der Kopf
  const prevOfHead = journal[2];
  const alt = await makeSeal(mallory, 'Einschub', prevOfHead.id, new Date('2026-10-04T10:00:00Z'));
  const insert = { format: 'echt-journal/2', fromNumber: 1, links: [{ prev: alt.id, commit: realHeadCommit }] };
  assert.equal(await reason(insert, alt, forgedAnchor), 'head-missing');
  // (c) Gabelung: Alternativkette ab dem Beweis-Siegel, ihr Stand passt nicht zum Anker
  const alt1 = await makeSeal(id, 'andere Geschichte', proof.id, new Date('2026-10-03T10:00:00Z'));
  const alt2 = await makeSeal(id, 'noch eine', alt1.id, new Date('2026-10-04T10:00:00Z'));
  assert.equal(await reason(await C.makeJournalExtract([proof, alt1, alt2], 0, 2)), 'head-missing');
  // (d) Erfundene Glieder ohne Vorbild
  const invented = { format: 'echt-journal/2', fromNumber: 2, links: [{ prev: proof.id, commit: hex('b') }, { prev: hex('c'), commit: hex('d') }] };
  assert.equal(await reason(invented), 'chain');

  // Vorgelegtes Siegel ist verändert
  const forged = clone(proof);
  forged.body.note = 'gefälscht';
  assert.equal(await reason(good, forged), 'proof-invalid');
});

test('Zeitbeleg: Siegel im älteren Format brauchen ihr volles Glied, auch gemischte Ketten', async () => {
  const id = await C.generateIdentity();
  const legacy = await makeLegacySeal(id, 'alt', null, new Date('2026-09-01T10:00:00Z'));
  const mid = await makeSeal(id, 'neu', legacy.id, new Date('2026-09-02T10:00:00Z'));
  const head = await makeSeal(id, 'neuer', mid.id, new Date('2026-09-03T10:00:00Z'));
  const anchor = C.makeAnchor(head, 3, new Date('2026-09-04T00:00:00Z'));

  // Beweis im alten Format, danach neue Siegel: reine Verbindungsglieder genügen
  const fromLegacy = await C.makeJournalExtract([legacy, mid, head], 0, 2);
  assert.ok(fromLegacy.links.every((l) => !l.seal));
  assert.equal((await C.verifyJournalAnchor(fromLegacy, legacy, anchor)).ok, true);

  // Ein altes Siegel in der Mitte muss vollständig mit, sonst ließe sich sein Vorgänger nicht binden
  const mid2 = await makeLegacySeal(id, 'alt in der Mitte', mid.id, new Date('2026-09-02T12:00:00Z'));
  const head2 = await makeSeal(id, 'danach', mid2.id, new Date('2026-09-03T10:00:00Z'));
  const anchor2 = C.makeAnchor(head2, 4, new Date('2026-09-04T00:00:00Z'));
  const mixed = await C.makeJournalExtract([legacy, mid, mid2, head2], 1, 3);
  assert.equal(mixed.links.filter((l) => l.seal).length, 1);
  assert.equal((await C.verifyJournalAnchor(mixed, mid, anchor2)).ok, true);

  // Genau hier wäre ein Einhängen möglich, wenn für alte Siegel nur (prev, commit) genügte: es wird abgelehnt
  const evil = clone(mixed);
  evil.links[0] = { prev: mid.id, commit: await C.bodyCommit(mid2.body) }; // gibt vor, ein Format-2-Glied zu sein
  assert.equal((await C.verifyJournalAnchor(evil, mid, anchor2)).ok, false);
  // Veränderter Inhalt des alten Siegels im Auszug fällt auf
  const bad = clone(mixed);
  bad.links[0].seal.body.note = 'verändert';
  const r = await C.verifyJournalAnchor(bad, mid, anchor2);
  assert.deepEqual([r.ok, r.reason, r.chainReason], [false, 'chain', 'seal']);
});

test('Zeitbeleg: Hinweise bei falscher Nummer oder unmöglichem Datum, Grenzen', async () => {
  const id = await C.generateIdentity();
  const journal = await makeJournal(id, 4);
  const extract = await C.makeJournalExtract(journal, 1, 3);
  const a = await C.verifyJournalAnchor(extract, journal[1], C.makeAnchor(journal[3], 99, new Date('2026-12-01T00:00:00Z')));
  assert.equal(a.ok, true);
  assert.deepEqual(a.warnings, ['number']);
  const b = await C.verifyJournalAnchor(extract, journal[1], C.makeAnchor(journal[3], 4, new Date('2019-01-01T00:00:00Z')));
  assert.equal(b.ok, true);
  assert.deepEqual(b.warnings, ['anchor-date']);
  await assert.rejects(() => C.makeJournalExtract(journal, 2, 1), /bad-range/);
  await assert.rejects(() => C.makeJournalExtract(journal, 0, 9), /bad-range/);
  const huge = { format: 'echt-journal/2', fromNumber: 1, links: new Array(5001).fill({ prev: hex('a'), commit: hex('b') }) };
  assert.equal((await C.verifyJournalAnchor(huge, journal[0], C.makeAnchor(journal[0], 1, new Date()))).reason, 'extract-format');
  // sinnlose fromNumber erzeugt keinen Fehler, nur keine Nummernprüfung
  const odd = { ...extract, fromNumber: 1e308 };
  const c = await C.verifyJournalAnchor(odd, journal[1], C.makeAnchor(journal[3], 4, new Date('2026-12-01T00:00:00Z')));
  assert.equal(c.ok, true);
  assert.equal(c.sealNumber, null);
});

test('Verbindungs-Codes: Einladung und Antwort, Prüfsumme, Fehlerfälle', async () => {
  const anna = await C.generateIdentity();
  const ben = await C.generateIdentity();
  const secret = C.newSecret();
  const invite = await C.makeInvite(anna, 'Anna', secret);
  assert.match(invite, /^ECHT1-I-[A-Za-z0-9_-]+-[A-Za-z0-9_-]{4}$/);
  const dec = await C.decodeCode('  ' + invite.replace(/(.{40})/g, '$1\n ') + '  ');
  assert.equal(dec.kind, 'I');
  assert.equal(dec.data.s, secret);
  assert.equal(dec.data.n, 'Anna');
  assert.equal(dec.data.k.x, anna.publicKey.x);

  const reply = await C.makeReply(ben, 'Ben', secret);
  const decR = await C.decodeCode(reply);
  assert.equal(decR.kind, 'R');
  assert.ok(await C.verifyReplyMac(secret, decR.data));
  assert.equal(decR.data.p, await C.pairId(secret));

  // Tippfehler
  const typo = invite.slice(0, 30) + (invite[30] === 'A' ? 'B' : 'A') + invite.slice(31);
  await assert.rejects(() => C.decodeCode(typo), /bad-checksum/);
  await assert.rejects(() => C.decodeCode('hallo'), /bad-code/);
  // Antwort als Einladung ausgegeben
  await assert.rejects(() => C.decodeCode(reply.replace('ECHT1-R-', 'ECHT1-I-')));
  // Alte Codes ohne Besitznachweis werden nicht mehr angenommen
  await assert.rejects(async () => C.decodeCode(await C.encodeCode('I', { n: 'Anna', k: anna.publicKey, s: secret })), /bad-code/);
});

test('Besitznachweis: ein geborgter öffentlicher Schlüssel wird abgelehnt', async () => {
  const ben = await C.generateIdentity();
  const mallory = await C.generateIdentity();
  const secret = C.newSecret();
  // Mallory gibt Bens (öffentlich bekannten) Schlüssel als ihren aus, signiert aber mit ihrem eigenen.
  const forged = await C.makeInvite({ privateJwk: mallory.privateJwk, publicKey: ben.publicKey, keyId: ben.keyId }, 'Ben', secret);
  await assert.rejects(() => C.decodeCode(forged), /bad-binding/);
  // Dasselbe bei einer Antwort
  const forgedReply = await C.makeReply({ privateJwk: mallory.privateJwk, publicKey: ben.publicKey, keyId: ben.keyId }, 'Ben', secret);
  await assert.rejects(() => C.decodeCode(forgedReply), /bad-binding/);
  // Signatur gehört zu einer anderen Verbindung: ebenfalls abgelehnt
  const other = await C.makeInvite(ben, 'Ben', C.newSecret());
  const mixed = (await C.decodeCode(other)).data;
  mixed.s = secret;
  await assert.rejects(async () => C.decodeCode(await C.encodeCode('I', mixed)), /bad-binding/);
});

test('Antwort-Code: Schlüsseltausch durch Dritte fällt über den MAC auf', async () => {
  const ben = await C.generateIdentity();
  const mallory = await C.generateIdentity();
  const secret = C.newSecret();
  const pair = await C.pairId(secret);
  // Mallory kennt nur die (öffentliche) Verbindungskennung p und baut einen in sich stimmigen Code mit eigenem Schlüssel.
  const bind = C.utf8('echt/bind/1|' + pair + '|b');
  const g = C.b64uEncode(await C.sign(mallory.privateJwk, bind));
  const evil = await C.encodeCode('R', { n: 'Ben', k: mallory.publicKey, p: pair, g, m: C.b64uEncode(C.randomBytes(32)) });
  const decoded = await C.decodeCode(evil); // Besitznachweis und Prüfsumme sind in sich stimmig …
  assert.equal(await C.verifyReplyMac(secret, decoded.data), false); // … aber nur wer das Geheimnis kennt, kann den MAC bilden

  // Echter Code: jede Änderung an Name, Schlüssel oder Signatur bricht den MAC
  const real = (await C.decodeCode(await C.makeReply(ben, 'Ben', secret))).data;
  assert.ok(await C.verifyReplyMac(secret, real));
  assert.equal(await C.verifyReplyMac(secret, { ...real, n: 'Papa' }), false);
  assert.equal(await C.verifyReplyMac(secret, { ...real, k: mallory.publicKey }), false);
  assert.equal(await C.verifyReplyMac(C.newSecret(), real), false);
});

test('Verbindungsnummer: 64 Bit, stabil, verrät das Geheimnis nicht', async () => {
  const secret = C.newSecret();
  const no = await C.pairNumber(secret);
  assert.match(no, /^([0-9A-F]{4}-){3}[0-9A-F]{4}$/);
  assert.equal(no, await C.pairNumber(secret));
  assert.notEqual(no, await C.pairNumber(C.newSecret()));
});

test('Verschlüsselung: Rundreise, falsches Passwort, Manipulation, Kontextbindung', async () => {
  const data = { hallo: 'Welt', n: [1, 2, 3], umlaut: 'äöüß' };
  const env = await C.encryptWithPassphrase(data, 'korrekt pferd batterie', { iterations: 2000, kind: 'backup' });
  assert.equal(env.kind, 'backup');
  assert.deepEqual(await C.decryptWithPassphrase(env, 'korrekt pferd batterie'), data);
  await assert.rejects(() => C.decryptWithPassphrase(env, 'falsch'), /decrypt-failed/);

  const flipped = { ...env, ct: env.ct.slice(0, 10) + (env.ct[10] === 'A' ? 'B' : 'A') + env.ct.slice(11) };
  await assert.rejects(() => C.decryptWithPassphrase(flipped, 'korrekt pferd batterie'), /decrypt-failed/);

  // Art des Containers ist authentifiziert: Backup lässt sich nicht als Tresor ausgeben
  await assert.rejects(() => C.decryptWithPassphrase({ ...env, kind: 'vault' }, 'korrekt pferd batterie'), /decrypt-failed/);
  await assert.rejects(() => C.decryptWithPassphrase({ ...env, iter: 5 }, 'x'), /bad-envelope/);

  // zwei Verschlüsselungen derselben Daten unterscheiden sich
  const env2 = await C.encryptWithPassphrase(data, 'korrekt pferd batterie', { iterations: 2000 });
  assert.notEqual(env.ct, env2.ct);
  assert.notEqual(env.salt, env2.salt);
});
