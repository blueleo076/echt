/*
 * ECHT – Kryptokern.
 *
 * Reine Funktionen auf Basis von WebCrypto. Keine DOM-Zugriffe, keine Speicherung.
 * Läuft unverändert im Browser (globales `EchtCore`) und in Node (require).
 *
 * Bausteine
 *  - Vertrauenskreis: geteiltes Geheimnis -> HMAC-SHA-256 -> 3 gesprochene Wörter
 *    (Live-Code, Rückfrage-Antwort, jeweils mit stillem Notfall-Gegenstück)
 *  - Siegel: SHA-256 des Inhalts + ECDSA-P-256-Signatur, verkettet über `prev`
 *  - Tresor: PBKDF2-SHA-256 -> AES-256-GCM
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EchtCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const isNode = typeof module === 'object' && module.exports;
  const cryptoObj = (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle)
    ? globalThis.crypto
    : (isNode ? require('node:crypto').webcrypto : null);
  const WORD_LISTS = isNode ? require('./words.js') : globalThis.EchtWords; // { de: [...], en: [...] }, Position für Position einander zugeordnet
  const WORDS = WORD_LISTS.de; // kanonische Form: alle Vergleiche und Ableitungen laufen über die deutschen Wörter
  // Jedes Wort jeder Sprache führt zur selben Position (0–255). Deutsch kommt zuerst; ein Wort, das in zwei Sprachen vorkommt,
  // muss an derselben Position stehen (prüft test/core.test.mjs).
  const WORD_INDEX = new Map();
  Object.keys(WORD_LISTS).sort((a, b) => (a === 'de' ? -1 : b === 'de' ? 1 : 0)).forEach((lang) => {
    WORD_LISTS[lang].forEach((w, i) => { if (!WORD_INDEX.has(w)) WORD_INDEX.set(w, i); });
  });

  function hasCrypto() { return !!(cryptoObj && cryptoObj.subtle); }
  function subtle() {
    if (!hasCrypto()) throw new Error('no-webcrypto');
    return cryptoObj.subtle;
  }

  // ---------------------------------------------------------------- Bytes ----

  const encoder = new TextEncoder();
  const decoder = new TextDecoder('utf-8', { fatal: true });

  const utf8 = (s) => encoder.encode(s);
  const fromUtf8 = (u8) => decoder.decode(u8);

  function toHex(u8) {
    let s = '';
    for (let i = 0; i < u8.length; i++) s += u8[i].toString(16).padStart(2, '0');
    return s;
  }

  function fromHex(h) {
    if (typeof h !== 'string' || h.length % 2 || /[^0-9a-f]/i.test(h)) throw new Error('bad-hex');
    const out = new Uint8Array(h.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
    return out;
  }

  function b64uEncode(u8) {
    let s = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < u8.length; i += CHUNK) {
      s += String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK));
    }
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function b64uDecode(str) {
    if (typeof str !== 'string' || /[^A-Za-z0-9_-]/.test(str)) throw new Error('bad-base64');
    const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function randomBytes(n) {
    const out = new Uint8Array(n);
    cryptoObj.getRandomValues(out);
    return out;
  }

  function equalBytes(a, b) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
  }

  /** Kanonisches JSON (Schlüssel sortiert, keine Leerzeichen): Grundlage aller Signaturen. */
  function canonical(v) {
    if (v === null || typeof v === 'boolean' || typeof v === 'string') return JSON.stringify(v);
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) throw new Error('bad-number');
      return JSON.stringify(v);
    }
    if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
    if (typeof v === 'object') {
      return '{' + Object.keys(v).filter((k) => v[k] !== undefined).sort()
        .map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
    }
    throw new Error('bad-value');
  }

  // --------------------------------------------------------------- Hashes ----

  async function sha256(data) {
    const bytes = typeof data === 'string' ? utf8(data) : data;
    return new Uint8Array(await subtle().digest('SHA-256', bytes));
  }

  async function sha256Hex(data) { return toHex(await sha256(data)); }

  async function hmac(keyBytes, message) {
    const key = await subtle().importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const msg = typeof message === 'string' ? utf8(message) : message;
    return new Uint8Array(await subtle().sign('HMAC', key, msg));
  }

  // ---------------------------------------------------------------- Wörter ---

  const WORDS_PER_CODE = 3;
  const STEP_SECONDS = 60;

  function bytesToWords(bytes, n) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(WORDS[bytes[i]]);
    return out;
  }

  function normalizeWord(w) {
    return String(w).normalize('NFC').toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/[^a-z]/g, '');
  }

  /**
   * Zerlegt Eingaben wie "Apfel, Katze – Mond" in normalisierte Wörter. Englische Wörter ("apple, cat, moon")
   * werden auf das deutsche Wort derselben Position abgebildet; unbekannte Wörter bleiben, wie sie sind.
   */
  function parseWords(input) {
    return String(input || '').normalize('NFC').split(/[\s,.;:\-–—_/|]+/).map(normalizeWord).filter(Boolean)
      .map((w) => (WORD_INDEX.has(w) ? WORDS[WORD_INDEX.get(w)] : w));
  }

  /** Steht dieses Wort in einer der Listen? (für den Tippfehler-Hinweis) */
  function isKnownWord(w) { return WORD_INDEX.has(normalizeWord(w)); }

  /** Wort in der Sprache der Oberfläche; `word` ist das kanonische deutsche Wort. Ohne eigene Liste gilt Deutsch. */
  function localizeWord(word, lang) {
    const i = WORD_INDEX.get(word);
    if (i === undefined) return word;
    return (WORD_LISTS[lang] || WORDS)[i];
  }

  const sameWords = (a, b) => a.length === b.length && a.every((w, i) => w === b[i]);

  // ------------------------------------------------------ Vertrauenskreis ----

  function newSecret() { return b64uEncode(randomBytes(32)); }

  function secretBytes(secret) {
    const b = b64uDecode(secret);
    if (b.length !== 32) throw new Error('bad-secret');
    return b;
  }

  /** Kurze, für beide Seiten gleiche Kennung einer Verbindung (verrät das Geheimnis nicht). */
  async function pairId(secret) {
    return (await sha256Hex('echt/pair/1|' + secret)).slice(0, 12);
  }

  /** Längere Kurzkennung (64 Bit) zum Abgleichen beider Geräte, in Vierergruppen. */
  async function pairNumber(secret) {
    return (await sha256Hex('echt/pairno/1|' + secret)).slice(0, 16).toUpperCase().replace(/(.{4})(?=.)/g, '$1-');
  }

  function stepAt(ms) { return Math.floor(ms / 1000 / STEP_SECONDS); }

  /**
   * Jede Seite hat ihre eigene Rolle: 'a' = wer eingeladen hat, 'b' = wer angenommen hat.
   * Der Code hängt von der Rolle des Sprechers ab. Wer dich bittet, "unseren Code" vorzulesen,
   * bekommt damit nichts, was er gegen dich verwenden kann.
   */
  function roleOf(r) {
    if (r !== 'a' && r !== 'b') throw new Error('bad-role');
    return r;
  }
  const otherRole = (r) => (roleOf(r) === 'a' ? 'b' : 'a');

  async function liveWords(secret, step, duress, role) {
    const h = await hmac(secretBytes(secret), 'echt/live/2|' + roleOf(role) + '|' + (duress ? 'duress' : 'ok') + '|' + step);
    return bytesToWords(h, WORDS_PER_CODE);
  }

  /**
   * Prüft einen genannten Live-Code. `role` ist die Rolle des SPRECHERS (also der anderen Person).
   * Toleranz ±1 Zeitfenster (Uhrabweichung, Sprechdauer). Der Notfall-Code hat Vorrang.
   */
  async function checkLive(secret, input, nowMs, role, tolerance) {
    const tol = tolerance === undefined ? 1 : tolerance;
    const words = parseWords(input);
    if (words.length !== WORDS_PER_CODE) return { result: 'invalid', reason: 'format' };
    const base = stepAt(nowMs);
    let ok = null;
    for (let o = -tol; o <= tol; o++) {
      if (sameWords(words, await liveWords(secret, base + o, true, role))) return { result: 'duress', offset: o };
      if (ok === null && sameWords(words, await liveWords(secret, base + o, false, role))) ok = o;
    }
    return ok === null ? { result: 'invalid', reason: 'mismatch' } : { result: 'ok', offset: ok };
  }

  /** 6-stellige Rückfrage-Zahl, gleichverteilt (Rejection Sampling). */
  function newChallenge() {
    const limit = 4294000000; // größtes Vielfaches von 1e6 unter 2^32
    const buf = new Uint32Array(1);
    let n;
    do { cryptoObj.getRandomValues(buf); n = buf[0]; } while (n >= limit);
    return String(n % 1000000).padStart(6, '0');
  }

  function normalizeChallenge(input) {
    const d = String(input || '').replace(/\D/g, '');
    return d.length === 6 ? d : null;
  }

  async function responseWords(secret, challenge, duress, role) {
    const c = normalizeChallenge(challenge);
    if (!c) throw new Error('bad-challenge');
    const h = await hmac(secretBytes(secret), 'echt/resp/2|' + roleOf(role) + '|' + (duress ? 'duress' : 'ok') + '|' + c);
    return bytesToWords(h, WORDS_PER_CODE);
  }

  /** `role` ist wieder die Rolle des Antwortenden. */
  async function checkResponse(secret, challenge, input, role) {
    const words = parseWords(input);
    if (words.length !== WORDS_PER_CODE) return { result: 'invalid', reason: 'format' };
    if (sameWords(words, await responseWords(secret, challenge, true, role))) return { result: 'duress' };
    if (sameWords(words, await responseWords(secret, challenge, false, role))) return { result: 'ok' };
    return { result: 'invalid', reason: 'mismatch' };
  }

  // ---------------------------------------------------- Schlüssel, Signatur --

  const EC = { name: 'ECDSA', namedCurve: 'P-256' };
  const SIG = { name: 'ECDSA', hash: 'SHA-256' };

  function publicOnly(jwk) { return { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y }; }

  function validPublicKey(k) {
    return !!k && k.kty === 'EC' && k.crv === 'P-256' && typeof k.x === 'string' && typeof k.y === 'string'
      && /^[A-Za-z0-9_-]{43}$/.test(k.x) && /^[A-Za-z0-9_-]{43}$/.test(k.y);
  }

  async function keyIdOf(pub) {
    return (await sha256Hex(canonical(publicOnly(pub)))).slice(0, 16);
  }

  function formatKeyId(id) {
    return String(id).toUpperCase().replace(/(.{4})(?=.)/g, '$1-');
  }

  async function generateIdentity() {
    const kp = await subtle().generateKey(EC, true, ['sign', 'verify']);
    const privateJwk = await subtle().exportKey('jwk', kp.privateKey);
    const publicKey = publicOnly(await subtle().exportKey('jwk', kp.publicKey));
    return { privateJwk, publicKey, keyId: await keyIdOf(publicKey) };
  }

  async function sign(privateJwk, bytes) {
    const key = await subtle().importKey('jwk', privateJwk, EC, false, ['sign']);
    return new Uint8Array(await subtle().sign(SIG, key, bytes));
  }

  async function verifySignature(pub, sig, bytes) {
    try {
      if (!validPublicKey(pub)) return false;
      const key = await subtle().importKey('jwk', { ...publicOnly(pub), ext: true }, EC, false, ['verify']);
      return await subtle().verify(SIG, key, sig, bytes);
    } catch (e) {
      return false;
    }
  }

  // ---------------------------------------------------------------- Siegel ---

  // Format 2 (aktuell): Das Siegel trägt eine Zufallszahl (nonce) im signierten Teil, und die Kennung bindet den
  // Vorgänger an eine Prüfsumme des Inhalts. Dadurch genügt für die Kette ein Paar (prev, commit) – ein
  // Journal-Auszug muss keine Inhalte, Namen, Notizen oder Zeitpunkte der Zwischen-Siegel preisgeben.
  // Format 1 (älter) bleibt lesbar: Kennung = SHA-256 des signierten Teils.
  const SEAL_FORMAT = 'echt-seal/2';
  const LEGACY_SEAL_FORMAT = 'echt-seal/1';
  const isSealFormat = (f) => f === SEAL_FORMAT || f === LEGACY_SEAL_FORMAT;
  const isHex64 = (s) => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);

  /**
   * Text wird vor dem Hashen nur bei den Zeilenenden vereinheitlicht (CRLF/CR -> LF), damit Kopieren zwischen
   * Geräten nichts ändert. Unicode wird bewusst NICHT normalisiert: Sonst ergäben etwa das Kelvin-Zeichen
   * und ein normales K denselben Hash, und ein ausgetauschter Text würde als „unverändert“ gelten.
   */
  function normalizeText(text) { return String(text).replace(/\r\n?/g, '\n'); }
  function textBytes(text) { return utf8(normalizeText(text)); }

  /** Prüfsumme des signierten Teils (hex). Daraus und aus `prev` entsteht die Kennung eines Siegels im Format 2. */
  async function bodyCommit(body) { return sha256Hex(canonical(body)); }

  /** Kennung im Format 2: bindet den Vorgänger (prev) fest an die Prüfsumme des Inhalts. */
  async function linkId(prev, commit) { return sha256Hex('echt/seal/2|' + (prev || '') + '|' + commit); }

  async function sealIdOf(format, body) {
    const commit = await bodyCommit(body);
    return format === LEGACY_SEAL_FORMAT ? commit : linkId(body.prev, commit);
  }

  /**
   * @param identity   {privateJwk, publicKey, keyId}
   * @param signerName frei wählbarer Anzeigename (nicht überprüfbar, nur der Schlüssel zählt)
   * @param input      {type:'file'|'text', name, size, mime, sha256, note, prev}
   */
  async function createSeal(identity, signerName, input, now) {
    const when = now || new Date();
    const body = {
      type: input.type,
      name: input.name || '',
      size: input.size,
      mime: input.mime || '',
      sha256: input.sha256,
      note: input.note || '',
      createdAt: when.toISOString(),
      prev: input.prev || null,
      nonce: b64uEncode(randomBytes(16)), // macht die Prüfsumme des Inhalts unratbar
      signer: { name: signerName || '', keyId: identity.keyId, key: publicOnly(identity.publicKey) },
    };
    const bytes = utf8(canonical(body));
    const id = await sealIdOf(SEAL_FORMAT, body);
    const sig = b64uEncode(await sign(identity.privateJwk, bytes));
    return { format: SEAL_FORMAT, id, body, sig };
  }

  /** Prüft Aufbau, Kennung, Schlüssel-ID und Signatur eines Siegels (Format 1 oder 2). Der Inhalt wird hier nicht geprüft. */
  async function verifySeal(seal) {
    const errors = [];
    try {
      if (!seal || !isSealFormat(seal.format) || !seal.body || typeof seal.sig !== 'string' || !isHex64(seal.id)) {
        return { ok: false, errors: ['format'] };
      }
      const b = seal.body;
      if ((b.type !== 'file' && b.type !== 'text') || !isHex64(b.sha256) || typeof b.name !== 'string'
        || !Number.isInteger(b.size) || b.size < 0 || typeof b.note !== 'string'
        || !(b.prev === null || isHex64(b.prev)) || Number.isNaN(Date.parse(b.createdAt))
        || !b.signer || !validPublicKey(b.signer.key) || typeof b.signer.keyId !== 'string'
        || (seal.format === SEAL_FORMAT && !(typeof b.nonce === 'string' && /^[A-Za-z0-9_-]{22}$/.test(b.nonce)))) {
        return { ok: false, errors: ['format'] };
      }
      const bytes = utf8(canonical(b));
      if ((await sealIdOf(seal.format, b)) !== seal.id) errors.push('id');
      if ((await keyIdOf(b.signer.key)) !== b.signer.keyId) errors.push('keyId');
      if (!(await verifySignature(b.signer.key, b64uDecode(seal.sig), bytes))) errors.push('signature');
    } catch (e) {
      return { ok: false, errors: ['format'] };
    }
    return { ok: errors.length === 0, errors };
  }

  /** Gehört dieser Inhalt (Datei-Bytes oder Text) zum Siegel? */
  async function matchesContent(seal, content) {
    const bytes = typeof content === 'string' ? textBytes(content) : content;
    return (await sha256Hex(bytes)) === seal.body.sha256;
  }

  /**
   * Prüft ein Journal (älteste zuerst): jedes Siegel gültig, vom selben Schlüssel, lückenlos verkettet und
   * mit einem ersten Siegel ohne Vorgänger. `opts.keyId` legt den erwarteten Schlüssel fest (sonst zählt der des ersten).
   * Zeitsprünge nach hinten sind kein Fehler, werden aber als Warnung gemeldet.
   */
  async function verifyChain(seals, opts) {
    const warnings = [];
    const first = seals[0] && seals[0].body && seals[0].body.signer;
    const wantKey = (opts && opts.keyId) || (first && first.keyId);
    for (let i = 0; i < seals.length; i++) {
      const v = await verifySeal(seals[i]);
      if (!v.ok) return { ok: false, index: i, reason: 'seal', errors: v.errors, warnings };
      if (seals[i].body.signer.keyId !== wantKey) return { ok: false, index: i, reason: 'signer', errors: [], warnings };
      if (i === 0) {
        if (seals[0].body.prev !== null) return { ok: false, index: 0, reason: 'start', errors: [], warnings };
      } else {
        if (seals[i].body.prev !== seals[i - 1].id) return { ok: false, index: i, reason: 'link', errors: [], warnings };
        if (Date.parse(seals[i].body.createdAt) < Date.parse(seals[i - 1].body.createdAt)) warnings.push({ index: i, kind: 'time-backwards' });
      }
    }
    return { ok: true, warnings };
  }

  // ---------------------------------------------------------------- Anker ----

  /** Maschinenlesbare Zeile, die man sich selbst oder anderen schickt, um den Stand zu "verankern". */
  function makeAnchor(seal, number, now) {
    return 'ECHT-ANKER/1 n=' + number + ' head=' + seal.id + ' key=' + seal.body.signer.keyId + ' at=' + (now || new Date()).toISOString();
  }

  /**
   * Liest eine Anker-Zeile. Streng: nach dem Trimmen muss GENAU die Zeile dastehen, kein Text davor oder danach
   * (sonst ließe sich ein echt aussehender Anker mitten in einen anderen Text setzen). `at` darf nur Zeichen
   * eines ISO-Datums enthalten.
   */
  function parseAnchor(text) {
    const m = /^ECHT-ANKER\/1 n=(\d{1,9}) head=([0-9a-f]{64}) key=([0-9a-f]{16}) at=([0-9T:.+\-Z]{10,40})$/.exec(String(text || '').trim());
    return m ? { n: parseInt(m[1], 10), head: m[2], keyId: m[3], at: m[4] } : null;
  }

  // ---------------------------------------- Zeitbeleg für Außenstehende ------

  const JOURNAL_FORMAT = 'echt-journal/2';
  const MAX_EXTRACT = 5000;

  /**
   * Journal-Auszug ab dem Siegel `fromIndex` (das Siegel selbst gibt man separat als Beweis weiter) bis `toIndex`.
   * Für jedes folgende Siegel im Format 2 enthält er nur {prev, commit}: Vorgänger-Kennung und Prüfsumme (mit
   * Zufallszahl, nicht ratbar), aber keinen Inhalt, keinen Namen, keine Notiz, keinen Zeitpunkt. Siegel im älteren
   * Format 1 lassen sich so nicht belegen und müssen vollständig mit (`seal`). `fromNumber` dient nur der Anzeige.
   */
  async function makeJournalExtract(seals, fromIndex, toIndex) {
    if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex) || fromIndex < 0 || toIndex < fromIndex || toIndex >= seals.length) throw new Error('bad-range');
    const links = [];
    for (let i = fromIndex + 1; i <= toIndex; i++) {
      const s = seals[i];
      if (s.format === SEAL_FORMAT) links.push({ prev: s.body.prev, commit: await bodyCommit(s.body) });
      else links.push({ seal: { format: s.format, id: s.id, body: s.body, sig: s.sig } });
    }
    return { format: JOURNAL_FORMAT, fromNumber: fromIndex + 1, links };
  }

  /**
   * Prüft, ob das Siegel `proof` in der Kette liegt, die bei dem Stand der Anker-Zeile (head) endet: Vom Siegel aus
   * führen die Glieder des Auszugs Schritt für Schritt (Kennung = SHA-256 über Vorgänger und Prüfsumme) zu `head`.
   * Das ist nur mit der echten Kette möglich. ok heißt: Das Siegel stand spätestens in der Kette bis zu diesem Stand.
   * Wann die Zeile tatsächlich weitergegeben wurde, belegt ECHT nicht; das belegt nur der unabhängige
   * Empfangsnachweis (z. B. die E-Mail). Der Beleg sagt auch nichts darüber, ob es weitere Siegel (etwa mit
   * gegenteiliger Aussage) in derselben Kette gibt.
   */
  async function verifyJournalAnchor(extract, proof, anchorText) {
    const anchor = parseAnchor(anchorText);
    if (!anchor) return { ok: false, reason: 'anchor-format' };
    if (!extract || extract.format !== JOURNAL_FORMAT || !Array.isArray(extract.links) || extract.links.length > MAX_EXTRACT) {
      return { ok: false, reason: 'extract-format' };
    }
    if (!(await verifySeal(proof)).ok) return { ok: false, reason: 'proof-invalid' };
    if (anchor.keyId !== proof.body.signer.keyId) return { ok: false, reason: 'key-mismatch' };

    let id = proof.id;
    let steps = 0;
    if (id !== anchor.head) {
      let found = false;
      for (let i = 0; i < extract.links.length; i++) {
        const e = extract.links[i];
        let prev;
        let next;
        if (e && typeof e === 'object' && e.seal) {
          if (!(await verifySeal(e.seal)).ok) return { ok: false, reason: 'chain', index: i, chainReason: 'seal' };
          prev = e.seal.body.prev;
          next = e.seal.id;
        } else if (e && typeof e === 'object' && isHex64(e.prev) && isHex64(e.commit)) {
          prev = e.prev;
          next = await linkId(e.prev, e.commit);
        } else {
          return { ok: false, reason: 'extract-format' };
        }
        if (prev !== id) return i === 0 ? { ok: false, reason: 'proof-missing' } : { ok: false, reason: 'chain', index: i, chainReason: 'link' };
        id = next;
        steps = i + 1;
        if (id === anchor.head) { found = true; break; }
      }
      if (!found) return { ok: false, reason: 'head-missing' };
    }

    const warnings = [];
    const hasNumber = Number.isInteger(extract.fromNumber) && extract.fromNumber >= 1 && extract.fromNumber < 1e9;
    if (hasNumber && anchor.n !== extract.fromNumber + steps) warnings.push('number');
    if (Number.isNaN(Date.parse(anchor.at)) || Date.parse(anchor.at) < Date.parse(proof.body.createdAt)) warnings.push('anchor-date');
    return {
      ok: true,
      count: steps + 1,
      sealNumber: hasNumber ? extract.fromNumber : null,
      headNumber: anchor.n,
      headId: anchor.head,
      anchorAt: anchor.at,
      sealedAt: proof.body.createdAt,
      warnings,
    };
  }

  // ------------------------------------------------- Verbindungs-Codes -------

  const CODE_PREFIX = 'ECHT1';

  async function checkChars(payload) {
    return b64uEncode((await sha256(payload)).slice(0, 3)); // 4 Zeichen gegen Tippfehler
  }

  /** kind: 'I' = Einladung (enthält Geheimnis), 'R' = Antwort (nur Name + öffentlicher Schlüssel). */
  async function encodeCode(kind, obj) {
    const payload = b64uEncode(utf8(canonical(obj)));
    return CODE_PREFIX + '-' + kind + '-' + payload + '-' + (await checkChars(payload));
  }

  async function decodeCode(text) {
    if (String(text || '').length > 6000) throw new Error('bad-code'); // echte Codes haben rund 400 Zeichen
    const clean = String(text || '').replace(/\s+/g, '');
    const m = /^ECHT1-([IR])-([A-Za-z0-9_-]+)-([A-Za-z0-9_-]{4})$/.exec(clean);
    if (!m) throw new Error('bad-code');
    if ((await checkChars(m[2])) !== m[3]) throw new Error('bad-checksum');
    let data;
    try { data = JSON.parse(fromUtf8(b64uDecode(m[2]))); } catch (e) { throw new Error('bad-code'); }
    if (!data || typeof data !== 'object') throw new Error('bad-code');
    if (typeof data.n !== 'string' || data.n.length > 80 || !validPublicKey(data.k)) throw new Error('bad-code');
    if (m[1] === 'I') {
      try { secretBytes(data.s); } catch (e) { throw new Error('bad-code'); }
    } else if (typeof data.p !== 'string' || !/^[0-9a-f]{12}$/.test(data.p) || typeof data.m !== 'string') {
      throw new Error('bad-code');
    }
    // Besitznachweis: Wer einen öffentlichen Schlüssel angibt, muss die Verbindung damit signieren können.
    // Verhindert, dass jemand einen fremden (z. B. aus Siegeln bekannten) Schlüssel als seinen ausgibt.
    try {
      const pair = m[1] === 'I' ? await pairId(data.s) : data.p;
      if (!(await verifySignature(data.k, b64uDecode(data.g), bindBytes(pair, m[1] === 'I' ? 'a' : 'b')))) throw new Error('bad-binding');
    } catch (e) {
      throw new Error(e && e.message === 'bad-binding' ? 'bad-binding' : 'bad-code');
    }
    return { kind: m[1], data };
  }

  const bindBytes = (pair, role) => utf8('echt/bind/1|' + pair + '|' + role);

  /** Einladung: Name, öffentlicher Schlüssel, Geheimnis und Besitznachweis (Signatur über die Verbindung). */
  async function makeInvite(identity, name, secret) {
    const g = b64uEncode(await sign(identity.privateJwk, bindBytes(await pairId(secret), 'a')));
    return encodeCode('I', { n: name, k: publicOnly(identity.publicKey), s: secret, g });
  }

  async function replyMac(secret, d) {
    return b64uEncode(await hmac(secretBytes(secret), 'echt/reply/1|' + d.p + '|' + d.n + '|' + canonical(publicOnly(d.k)) + '|' + d.g));
  }

  /** Antwort: wie die Einladung, zusätzlich mit MAC über das gemeinsame Geheimnis (Echtheit gegenüber dem Einladenden). */
  async function makeReply(identity, name, secret) {
    const p = await pairId(secret);
    const d = { n: name, k: publicOnly(identity.publicKey), p, g: b64uEncode(await sign(identity.privateJwk, bindBytes(p, 'b'))) };
    d.m = await replyMac(secret, d);
    return encodeCode('R', d);
  }

  /** Stammt dieser Antwort-Code von jemandem, der das Geheimnis kennt, und wurde er nicht verändert? */
  async function verifyReplyMac(secret, d) {
    try { return typeof d.m === 'string' && equalBytes(b64uDecode(d.m), b64uDecode(await replyMac(secret, d))); } catch (e) { return false; }
  }

  // ------------------------------------------------------ Anzeigenamen ------

  /**
   * Entfernt Steuer-, Format-, Bidi- und alle unsichtbaren Zeichen (z. B. U+034F, Soft Hyphen, Variantenwähler)
   * sowie Türme aus Kombinationszeichen. Verhindert getarnte Namen, umgedrehte Dateiendungen und Zeilenüberlauf.
   */
  function stripUnsafe(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/[\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}\u2028\u2029]/gu, '')
      .replace(/(\p{M}{3})\p{M}+/gu, '$1');
  }

  /** Name einer Person: einzeilig, gesäubert, höchstens 40 Zeichen. */
  function cleanName(s) { return stripUnsafe(s).replace(/\s+/g, ' ').trim().slice(0, 40); }

  // Häufige Lookalikes aus dem kyrillischen und griechischen Alphabet, abgebildet auf lateinische Buchstaben.
  const LOOKALIKES = {
    'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x', 'і': 'i', 'ј': 'j', 'ѕ': 's', 'һ': 'h',
    'к': 'k', 'м': 'm', 'н': 'h', 'т': 't', 'в': 'b', 'ԁ': 'd', 'ӏ': 'l',
    'ο': 'o', 'α': 'a', 'ν': 'v', 'ρ': 'p', 'ι': 'i', 'κ': 'k', 'τ': 't', 'υ': 'u', 'χ': 'x', 'ε': 'e', 'β': 'b', 'η': 'n', 'μ': 'm',
    // Kapitälchen und ähnliche Lautschrift-Buchstaben (sehen aus wie Großbuchstaben bzw. normale Kleinbuchstaben)
    'ᴀ': 'a', 'ʙ': 'b', 'ᴄ': 'c', 'ᴅ': 'd', 'ᴇ': 'e', 'ꜰ': 'f', 'ɢ': 'g', 'ʜ': 'h', 'ɪ': 'i', 'ᴊ': 'j', 'ᴋ': 'k', 'ʟ': 'l',
    'ᴍ': 'm', 'ɴ': 'n', 'ᴏ': 'o', 'ᴘ': 'p', 'ʀ': 'r', 'ꜱ': 's', 'ᴛ': 't', 'ᴜ': 'u', 'ᴠ': 'v', 'ᴡ': 'w', 'ʏ': 'y', 'ᴢ': 'z',
    'ı': 'i', 'ɑ': 'a', 'ɡ': 'g',
  };

  /**
   * „Skelett“ eines Namens zum Vergleichen: ohne Akzente, Leerzeichen und unsichtbare Zeichen, Groß-/Kleinschreibung
   * und ähnliche Zeichen (I/l/1, O/0, kyrillisches а …) werden gleichgesetzt. Zwei Namen mit gleichem Skelett sehen
   * für einen Menschen gleich aus und dürfen nicht nebeneinander im Kreis stehen.
   */
  function nameKey(s) {
    let t = stripUnsafe(s).normalize('NFKD').replace(/\p{M}/gu, '').replace(/\s+/g, '');
    t = t.replace(/[Il1|]/g, 'l').replace(/[O0]/g, 'o').toLowerCase();
    return Array.from(t, (ch) => LOOKALIKES[ch] || ch).join('');
  }

  /** Mischt der Name lateinische Buchstaben mit Buchstaben einer anderen Schrift (kyrillisch, griechisch, armenisch, cherokee …)? */
  function mixesScripts(s) {
    const t = String(s);
    return /\p{Script=Latin}/u.test(t) && /(?!\p{Script=Latin})\p{L}/u.test(t);
  }

  // Lautschrift, Modifikator- und Kapitälchen-Buchstaben: gelten als Lateinisch, sehen aber wie gewöhnliche Buchstaben aus.
  const EXOTIC_RANGES = [[0x250, 0x2ff], [0x1d00, 0x1dbf], [0xa720, 0xa7ff], [0xab30, 0xab6f]];

  /** Enthält der Name Zeichen aus Lautschrift-/Kapitälchen-Blöcken, die sich kaum von normalen Buchstaben unterscheiden? */
  function hasExoticLetters(s) {
    for (const ch of String(s)) {
      const c = ch.codePointAt(0);
      if (EXOTIC_RANGES.some(([a, b]) => c >= a && c <= b)) return true;
    }
    return false;
  }

  // ----------------------------------------------------------- Verschlüsselung

  const PBKDF2_ITERATIONS = 600000;

  async function deriveKey(passphrase, salt, iterations) {
    const base = await subtle().importKey('raw', utf8(String(passphrase).normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
    return subtle().deriveKey(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  async function boxEncrypt(key, obj, aad) {
    const iv = randomBytes(12);
    const ct = await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: utf8(aad) }, key, utf8(JSON.stringify(obj)));
    return { iv: b64uEncode(iv), ct: b64uEncode(new Uint8Array(ct)) };
  }

  async function boxDecrypt(key, box, aad) {
    try {
      const pt = await subtle().decrypt({ name: 'AES-GCM', iv: b64uDecode(box.iv), additionalData: utf8(aad) }, key, b64uDecode(box.ct));
      return JSON.parse(fromUtf8(new Uint8Array(pt)));
    } catch (e) {
      throw new Error('decrypt-failed');
    }
  }

  /** Verschlüsselt ein Objekt mit Passwort (für Backups). `kind` wird mitauthentifiziert. */
  async function encryptWithPassphrase(obj, passphrase, opts) {
    const o = opts || {};
    const iter = o.iterations || PBKDF2_ITERATIONS;
    const kind = o.kind || 'backup';
    const salt = randomBytes(16);
    const key = await deriveKey(passphrase, salt, iter);
    const box = await boxEncrypt(key, obj, 'echt/' + kind + '/1');
    return { format: 'echt-box/1', kind, kdf: 'PBKDF2-SHA256', iter, salt: b64uEncode(salt), iv: box.iv, ct: box.ct };
  }

  async function decryptWithPassphrase(envelope, passphrase) {
    if (!envelope || envelope.format !== 'echt-box/1' || envelope.kdf !== 'PBKDF2-SHA256'
      || !Number.isInteger(envelope.iter) || envelope.iter < 1000 || envelope.iter > 10000000) throw new Error('bad-envelope');
    const key = await deriveKey(passphrase, b64uDecode(envelope.salt), envelope.iter);
    return boxDecrypt(key, envelope, 'echt/' + envelope.kind + '/1');
  }

  return {
    WORDS, WORD_LISTS, isKnownWord, localizeWord, WORDS_PER_CODE, STEP_SECONDS, SEAL_FORMAT, LEGACY_SEAL_FORMAT, PBKDF2_ITERATIONS,
    hasCrypto, utf8, fromUtf8, toHex, fromHex, b64uEncode, b64uDecode, randomBytes, equalBytes, canonical,
    sha256, sha256Hex, hmac,
    normalizeWord, parseWords,
    newSecret, pairId, pairNumber, otherRole, stepAt, liveWords, checkLive, newChallenge, normalizeChallenge, responseWords, checkResponse,
    validPublicKey, keyIdOf, formatKeyId, generateIdentity, sign, verifySignature,
    isSealFormat, bodyCommit, linkId, JOURNAL_FORMAT, makeJournalExtract, verifyJournalAnchor, normalizeText, textBytes, createSeal, verifySeal, matchesContent, verifyChain, makeAnchor, parseAnchor,
    encodeCode, decodeCode, makeInvite, makeReply, verifyReplyMac,
    stripUnsafe, cleanName, nameKey, mixesScripts, hasExoticLetters,
    deriveKey, boxEncrypt, boxDecrypt, encryptWithPassphrase, decryptWithPassphrase,
  };
});
