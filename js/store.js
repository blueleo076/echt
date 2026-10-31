/*
 * ECHT – Tresor-Speicher.
 *
 * Alles liegt lokal in localStorage unter einem einzigen Schlüssel. Mit Passwort wird der
 * gesamte Zustand (Schlüssel, Geheimnisse, Siegel) per AES-256-GCM verschlüsselt; der
 * Schlüssel entsteht per PBKDF2 und lebt nur im Arbeitsspeicher, solange entsperrt ist.
 *
 * Mehrere Fenster: Jedes Fenster merkt sich den Stand, den es zuletzt gelesen oder geschrieben hat.
 * Weicht der gespeicherte Stand ab, wurde der Tresor anderswo geändert, gesperrt oder gelöscht.
 * Dann wird nicht überschrieben (kein Wiederbeleben gelöschter Tresore, keine verlorenen Siegel).
 */
(function () {
  'use strict';
  const Echt = (window.Echt = window.Echt || {});
  const { t } = Echt.i18n;
  const C = window.EchtCore;

  const KEY = 'echt.vault.v1';
  const LOCK_SIGNAL = 'echt.lockSignal';
  const AAD = 'echt/vault/1';
  const AUTO_LOCK_CHOICES = [0, 1, 5, 15];
  const MAX_CONTACTS = 2000;
  const MAX_SEALS = 50000;
  const MAX_LOCAL_TEXT = 100000;
  const MIN_PASSPHRASE = 10;

  let state = null;
  let vaultKey = null; // CryptoKey oder null (Tresor ohne Passwort)
  let vaultMeta = null; // {iter, salt}
  let lastRaw = null; // Zeichenfolge im Speicher, die dieses Fenster zuletzt gesehen hat
  let queue = Promise.resolve();

  function readText() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }

  function readRaw() {
    const t = readText();
    if (!t) return null;
    try { return JSON.parse(t); } catch (e) { return null; }
  }

  function storageAvailable() {
    try {
      localStorage.setItem('echt.probe', '1');
      localStorage.removeItem('echt.probe');
      return true;
    } catch (e) {
      return false;
    }
  }

  function freshState(name, identity) {
    return {
      v: 1,
      profile: { name, identity, createdAt: new Date().toISOString() },
      contacts: [],
      seals: [],
      settings: { autoLockMin: 5 },
    };
  }

  const isHex = (s, n) => typeof s === 'string' && new RegExp('^[0-9a-f]{' + n + '}$').test(s);

  /** Reicht der Aufbau eines Siegels, damit die Oberfläche es gefahrlos anzeigen kann? (Die Signatur prüft verifySeal.) */
  function sealShapeOk(seal) {
    const b = seal && seal.body;
    return !!(seal && C.isSealFormat(seal.format) && isHex(seal.id, 64) && typeof seal.sig === 'string' && b
      && (b.type === 'file' || b.type === 'text') && typeof b.name === 'string' && Number.isInteger(b.size) && b.size >= 0
      && typeof b.note === 'string' && typeof b.mime === 'string' && isHex(b.sha256, 64) && (b.prev === null || isHex(b.prev, 64))
      && !Number.isNaN(Date.parse(b.createdAt)) && b.signer && typeof b.signer.name === 'string'
      && typeof b.signer.keyId === 'string' && C.validPublicKey(b.signer.key));
  }

  /**
   * Prüft und bereinigt einen Zustand (aus Tresor oder Backup). Wirft 'bad-state' bei Unbrauchbarem.
   * Backups sind fremde Eingaben: Schlüsselpaar, Kennungen, Namen und Einstellungen werden nicht blind übernommen.
   */
  async function validateState(s) {
    const fail = () => { throw new Error('bad-state'); };
    if (!s || typeof s !== 'object' || s.v !== 1 || !s.profile || typeof s.profile.name !== 'string') fail();
    s.profile.name = Echt.ui.cleanName(s.profile.name) || 'Ich';

    const id = s.profile.identity;
    if (!id || !id.privateJwk || id.privateJwk.kty !== 'EC' || id.privateJwk.crv !== 'P-256' || typeof id.privateJwk.d !== 'string'
      || !C.validPublicKey(id.publicKey) || id.privateJwk.x !== id.publicKey.x || id.privateJwk.y !== id.publicKey.y
      || (await C.keyIdOf(id.publicKey)) !== id.keyId) fail();
    const probe = C.randomBytes(16); // Privater und öffentlicher Schlüssel müssen wirklich zusammenpassen
    if (!(await C.verifySignature(id.publicKey, await C.sign(id.privateJwk, probe), probe))) fail();

    if (!Array.isArray(s.contacts) || !Array.isArray(s.seals) || s.contacts.length > MAX_CONTACTS || s.seals.length > MAX_SEALS) fail();
    const seen = new Set();
    const duplicates = new Set();
    for (const c of s.contacts) {
      if (!c || typeof c.name !== 'string' || typeof c.secret !== 'string' || typeof c.id !== 'string' || (c.role !== 'a' && c.role !== 'b')) fail();
      try { if (C.b64uDecode(c.secret).length !== 32) fail(); } catch (e) { fail(); }
      if (c.id !== (await C.pairId(c.secret))) fail();
      if (seen.has(c.id)) { duplicates.add(c); continue; } // doppelte Einträge (z. B. durch Doppelklick) werden verworfen statt den Tresor unlesbar zu machen
      seen.add(c.id);
      c.name = Echt.ui.cleanName(c.name);
      if (!c.name) fail();
      c.pairNo = await C.pairNumber(c.secret); // abgeleiteter Wert, wird nie aus Fremddaten übernommen
      if (!Number.isInteger(c.lastLiveStep) || c.lastLiveStep < 0) delete c.lastLiveStep;
      if (c.pub) {
        if (!C.validPublicKey(c.pub)) fail();
        c.pubKeyId = await C.keyIdOf(c.pub);
      } else {
        c.pub = null;
        c.pubKeyId = null;
      }
      if (typeof c.inviteCode !== 'string' || c.inviteCode.length > 2000) c.inviteCode = null;
      if (typeof c.createdAt !== 'string' || Number.isNaN(Date.parse(c.createdAt))) c.createdAt = new Date().toISOString();
    }
    if (duplicates.size) s.contacts = s.contacts.filter((c) => !duplicates.has(c));
    for (const seal of s.seals) {
      if (!sealShapeOk(seal)) fail();
      if (seal.local && !(typeof seal.local.text === 'string' && seal.local.text.length <= MAX_LOCAL_TEXT)) delete seal.local;
    }
    const min = s.settings && s.settings.autoLockMin;
    s.settings = { autoLockMin: AUTO_LOCK_CHOICES.includes(min) ? min : 5 }; // nur bekannte Werte übernehmen
    return s;
  }

  /**
   * mode: 'save' (Standard, nur wenn der Speicher unverändert ist), 'create' (nur wenn noch kein Tresor existiert),
   * 'force' (bewusstes Ersetzen nach Rückfrage, etwa beim Einspielen eines Backups).
   */
  async function persistNow(mode) {
    if (!state) return;
    if (!vaultKey) throw new Error('no-key'); // Tresore gibt es nur mit Passwort: ein Klartext-Tresor ließe sich unterschieben
    const box = await C.boxEncrypt(vaultKey, state, AAD);
    const record = { format: 'echt-box/1', kind: 'vault', kdf: 'PBKDF2-SHA256', iter: vaultMeta.iter, salt: vaultMeta.salt, iv: box.iv, ct: box.ct };
    const text = JSON.stringify(record);
    // Prüfen und Schreiben stehen direkt hintereinander (kein await dazwischen).
    if (mode === 'create') {
      if (readText()) throw new Error('vault-exists');
    } else if (mode !== 'force' && readText() !== lastRaw) {
      throw new Error('stale');
    }
    localStorage.setItem(KEY, text);
    lastRaw = text;
  }

  async function setPassphrase(passphrase) {
    if (!passphrase) {
      vaultKey = null;
      vaultMeta = null;
      return;
    }
    const salt = C.randomBytes(16);
    vaultMeta = { iter: C.PBKDF2_ITERATIONS, salt: C.b64uEncode(salt) };
    vaultKey = await C.deriveKey(passphrase, salt, vaultMeta.iter);
  }

  const store = {
    KEY,
    LOCK_SIGNAL,
    MIN_PASSPHRASE,
    storageAvailable,
    has() { return !!readText(); },
    isEncrypted() { const r = readRaw(); return !!r && r.format === 'echt-box/1'; },
    isReadable() { const r = readRaw(); return !!r && r.format === 'echt-box/1' && r.kind === 'vault'; },
    isUnlocked() { return state !== null; },
    hasPassphrase() { return vaultKey !== null; },
    get state() { return state; },
    /** Wird aufgerufen, wenn der Tresor in einem anderen Fenster geändert wurde (Standard: nichts). */
    onStale: null,

    async create(name, passphrase) {
      if (!passphrase || passphrase.length < MIN_PASSPHRASE) throw new Error('weak-passphrase');
      if (readText()) throw new Error('vault-exists');
      const identity = await C.generateIdentity();
      state = freshState(Echt.ui.cleanName(name) || 'Ich', identity);
      await setPassphrase(passphrase);
      await persistNow('create'); // schreibt nur, wenn in der Zwischenzeit kein anderes Fenster einen Tresor angelegt hat
      try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* optional */ }
    },

    async unlock(passphrase) {
      const text = readText();
      const rec = readRaw();
      if (!rec) throw new Error('no-vault');
      if (rec.format !== 'echt-box/1' || rec.kind !== 'vault' || !Number.isInteger(rec.iter) || rec.iter < 100000 || rec.iter > 10000000) throw new Error('bad-vault');
      const key = await C.deriveKey(passphrase, C.b64uDecode(rec.salt), rec.iter);
      const data = await C.boxDecrypt(key, rec, AAD); // wirft 'decrypt-failed' bei falschem Passwort
      state = await validateState(data);
      vaultKey = key;
      vaultMeta = { iter: rec.iter, salt: rec.salt };
      lastRaw = text;
    },

    lock() {
      state = null;
      vaultKey = null;
      vaultMeta = null;
      lastRaw = null;
    },

    /** Gibt anderen offenen Fenstern Bescheid, damit auch sie sperren. */
    signalLock() {
      try { localStorage.setItem(LOCK_SIGNAL, String(Date.now()) + Math.random()); } catch (e) { /* ignorieren */ }
    },

    /** Speichert nacheinander (keine überlappenden Schreibvorgänge). Ein Fehler blockiert spätere Speicherungen nicht. */
    save() {
      const run = queue.then(() => persistNow(false));
      queue = run.catch(() => {});
      return run.catch((e) => {
        if (e && e.message === 'stale') {
          if (store.onStale) store.onStale();
        } else {
          Echt.ui.toast(t('Speichern fehlgeschlagen. Ist der Browser-Speicher voll oder gesperrt?'), 'bad');
        }
        throw e;
      });
    },

    async changePassphrase(newPassphrase) {
      if (!newPassphrase || newPassphrase.length < MIN_PASSPHRASE) throw new Error('weak-passphrase');
      const prev = { key: vaultKey, meta: vaultMeta };
      await setPassphrase(newPassphrase);
      try { await store.save(); } catch (e) { vaultKey = prev.key; vaultMeta = prev.meta; throw e; }
    },

    async checkPassphrase(passphrase) {
      if (!vaultKey) return true;
      const rec = readRaw();
      try {
        const key = await C.deriveKey(passphrase, C.b64uDecode(rec.salt), rec.iter);
        await C.boxDecrypt(key, rec, AAD);
        return true;
      } catch (e) {
        return false;
      }
    },

    async exportBackup(passphrase) {
      return C.encryptWithPassphrase({ app: 'echt', version: 1, exportedAt: new Date().toISOString(), state }, passphrase, { kind: 'backup' });
    },

    /** Entschlüsselt und prüft ein Backup. Gibt {state, exportedAt} zurück, übernimmt aber noch nichts. */
    async readBackup(envelope, passphrase) {
      const payload = await C.decryptWithPassphrase(envelope, passphrase);
      if (!payload || payload.app !== 'echt') throw new Error('bad-state');
      const state = await validateState(payload.state);
      return { state, exportedAt: typeof payload.exportedAt === 'string' ? payload.exportedAt : '' };
    },

    /** Kurzbeschreibung eines Backups für die Rückfrage vor dem Ersetzen (damit ein altes oder fremdes Backup auffällt). */
    describeBackup(info) {
      const st = info.state;
      const when = info.exportedAt && !Number.isNaN(Date.parse(info.exportedAt)) ? new Date(info.exportedAt).toLocaleString(Echt.i18n.locale()) : t('unbekanntem Datum');
      return t('Backup von „{name}“ (Schlüssel {formatKeyId}, {v}, {length} Siegel), erstellt am {when}.', { name: st.profile.name, formatKeyId: C.formatKeyId(st.profile.identity.keyId), v: (st.contacts.length === 1 ? t('1 Kontakt') : t('{length} Kontakte', { length: st.contacts.length })), length: st.seals.length, when: when });
    },

    /** Übernimmt einen eingespielten Zustand. Erst wenn das Schreiben klappt, gilt er; sonst bleibt alles wie vorher. */
    async adopt(newState, passphrase) {
      if (!passphrase || passphrase.length < MIN_PASSPHRASE) throw new Error('weak-passphrase');
      const prev = { state, key: vaultKey, meta: vaultMeta };
      if (!newState.settings.autoLockMin) newState.settings.autoLockMin = 15; // „nie sperren“ wird nicht aus Backups übernommen
      state = newState;
      try {
        await setPassphrase(passphrase);
        await persistNow('force');
      } catch (e) {
        state = prev.state;
        vaultKey = prev.key;
        vaultMeta = prev.meta;
        throw e;
      }
    },

    wipe() {
      try { localStorage.removeItem(KEY); } catch (e) { /* ignorieren */ }
      store.lock();
    },

    /** Vorhandenen Kontakt anhand der Verbindungskennung finden. */
    contactById(id) { return state ? state.contacts.find((c) => c.id === id) : undefined; },
    contactByKeyId(keyId) { return state ? state.contacts.find((c) => c.pub && c.pubKeyId === keyId) : undefined; },
    lastSealId() { return state && state.seals.length ? state.seals[state.seals.length - 1].id : null; },
  };

  Echt.store = store;
})();
