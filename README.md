# ECHT

**Prove that it is really you. And that it is really genuine.**

🇩🇪 [Deutsche Version](README.de.md) · License: [AGPL-3.0](LICENSE) · [Contributing](CONTRIBUTING.md)

ECHT is an app for private people. It runs entirely on your own device, needs no account, no server and no dependencies. It can be installed like an app and works offline afterwards. The interface is available in **English and German**.

## Why

AI can now fake voices, faces, photos and documents so well that looking and listening are no longer enough. Two situations are becoming everyday:

1. **The call.** A familiar voice calls with an urgent request. It may be a cloned voice.
2. **The piece of evidence.** A photo, a contract or a promise is disputed. "I never said that" can no longer be settled by eyesight.

Private people have had no simple answer to either. ECHT offers both in one app.

## Features

### Circle of trust
You connect once with someone close to you. After that:

- **Live code:** three words that change every minute, for example "Radio · Tower · Lichen". Both sides can say and check them on the phone. Every code is accepted only once, so an overheard code cannot be replayed.
- **Directional:** each side has its own code. Anyone who asks you to read out "our code" gets nothing they could use to pose as the other person towards you.
- **Rule on the phone:** whoever calls says the code first. The person called checks it and only then says their own. This makes it harder for a fraudster to relay, but it does not prevent it entirely: if someone asks you by message to call back on a new number, they can call the other person at the same time and pass your code on. **So only say your code if you yourself called the saved, known number.**
- **Challenge:** the checking person says a fresh six-digit number. Only someone who has the secret can calculate the matching three words.
- **Emergency code:** someone under threat says the emergency code instead of the normal one. The other side sees a silent warning while the call sounds calm.

### Seals
Photos, files and texts are sealed with a fingerprint (SHA-256) and your signature (ECDSA P-256). All seals form a chain: each contains the identifier of the previous one. You pass on a small **proof file** (`.echt.json`), not the original.

### Check
Whoever has the proof and the original sees at once whether the content is genuine and unchanged. That person needs neither an account nor a vault: the "Check" page also works without any setup.

### Time proof for third parties
The time of a seal is at first only a claim by your device. An **anchor** makes it provable:

1. In the vault you create an anchor (one line of text with the state of your chain) and give it to someone, ideally via a channel with a timestamp such as email.
2. In the seal you save the **journal extract**: the seals from this one up to the anchored state, only the signed part, without originals.
3. A third person loads proof, journal extract and the anchor line they received independently of you on the check page. ECHT verifies that the seal lies in an unbroken chain up to that state.

This proves that the seal existed **at the latest** at the time the anchor line demonstrably arrived. It does not prove when exactly it was created, and the time of hand-over comes from the proof of receipt (such as the email), not from ECHT. For the following seals the extract contains only identifiers and checksums (with a random number, not guessable), so no contents, names, notes or times. The checking person compares the displayed **head ID** character by character with the anchor line in their proof of receipt; only that is binding, not the number and date from the line. The proof also does not show that the seal was the only or first one on a subject: other seals can lie in the same chain before the anchor. Seals in the older format 1 must be included in full in the extract.

### Vault
Password protection, automatic lock, encrypted backup, journal check, anchor, journal extract and a self-test.

### Languages
ECHT comes in **English** and **German**. On first start the app asks for the language (the browser's language is suggested); you can change it later in the vault or on the lock screen. The word codes are **compatible** across languages: the two word lists are mapped to each other position by position (Apple = Apfel), and either word is accepted as input. Someone using ECHT in German can therefore check with someone using it in English. How to add another language is described in [CONTRIBUTING.md](CONTRIBUTING.md).

## Getting started

**Windows:** double-click `start.bat`. The browser opens by itself at `http://localhost:8734`.
**macOS/Linux:** double-click `start.command` or run `./start.command` in a terminal (the first time you may need `chmod +x start.command`).

The small window that opens must stay open while you use ECHT. That is all it takes:

- If **Node.js** is installed, `start.bat` uses it. Otherwise it starts the PowerShell server built into Windows (`start.ps1`), so nothing has to be installed.
- A second double-click only opens the browser if ECHT is already running.
- The port is fixed on purpose (8734): the vault lives in the browser's storage and belongs to exactly one address. It is not visible under a different address (another port, `127.0.0.1` instead of `localhost`).

**Then install it as an app:** in ECHT under "Vault" → "Install as app" (or "Install app" in the browser menu). ECHT then opens like a normal program with its own icon, without needing `start.bat`, and works without internet.

By hand, if you like (Node.js 18 or newer):

```bash
node serve.mjs
```

Other ports: `node serve.mjs 9000` (each address has its own, separate vault). With `--open` the browser opens.

### First steps

1. **Set up:** type a name, type a password or choose "Suggest a password" (six words, please write them down). Done, in one step.
2. **Connect a person:** "Connect a person" → "Create invitation code" and send the code to the person. They paste it on their side and send you a reply code, which you simply paste (it is recognised automatically when pasted). The word codes already work as soon as the person has pasted the invitation code.
3. **On the phone:** the "My code" and "Check" tabs of the contact.

The files can also be served from any static web space, **but only over https**, because the browser's cryptography only runs in a secure context. In the browser you can then set ECHT up like an app via "Add to home screen" or "Install".

Tests (Node.js 22 or newer):

```bash
node --test "test/*.test.mjs"
```

## How it is built

| Building block | Method |
| --- | --- |
| Codes | HMAC-SHA-256 over secret, role, kind and time window (60 s); the first three bytes choose words from a fixed list of 256 entries |
| Checking | tolerance of ±1 time window, the emergency code takes precedence, word comparison ignores capitalisation and umlauts |
| Reuse | per contact the app remembers the last accepted time step; the same or an older code is rejected (not so the emergency code) |
| Secret | 32 random bytes, handed over once via the invitation code |
| Keys in codes | invitation and reply carry a proof of possession (signature over the connection); the reply also carries a MAC with the shared secret. A substituted or borrowed key is noticed |
| Connection no. | 64 bits derived from the secret, both devices must show the same |
| Seals | canonical JSON, ECDSA P-256. Format 2: random number in the signed part, identifier = SHA-256 over predecessor and checksum of the signed part (so a journal extract needs only predecessor and checksum per link). Format 1 stays readable. For texts only the line endings are normalised, Unicode is left untouched |
| Chain | every seal names the identifier of its predecessor; anchor lines are read strictly (exactly the line, no text before or after); a missing start, gaps, replacement, reordering and foreign keys are noticed |
| Check page | "Genuine" in green only with a known key (your own or from the circle); otherwise "Unchanged, but sender unknown" |
| Vault | PBKDF2-SHA-256 (600,000 rounds), AES-256-GCM, the whole state is encrypted, password at least 10 characters |
| Several windows | locking, changing and deleting apply to all windows; a stale window must not overwrite the vault |
| Backup | same method with its own password; the kind of container is authenticated |
| Connection codes | Base64url with a checksum against typos |

Only WebCrypto from the browser is used. The interface never inserts text as HTML, and a strict Content-Security-Policy allows only its own scripts and styles. Trusted Types additionally blocks any HTML injection; only a single named policy may supply the address of the app's own service worker.

**Self-hosting:** ECHT needs its **own origin** (own domain or subdomain, not a subfolder on a shared host such as `user.github.io/…` or `/~user/`). Any other page on the same origin could otherwise read the stored vault (encrypted only) and overwrite it or reset it to an older state. Embedding in foreign pages also cannot be forbidden via `<meta>`. So set the same headers at your host as `serve.mjs` does, above all `Content-Security-Policy: frame-ancestors 'none'` and `X-Frame-Options: DENY`. The app also quits by itself when it finds itself in a frame.

The results of the security review with several independent red-team agents are in [SECURITY.md](SECURITY.md) (German).

Important for compatibility: **the word lists and the derivation are part of the protocol.** Changes make codes invalid against older installations. Fixed reference values in `test/core.test.mjs` and in the app's self-test catch this. Internally ECHT always calculates with the German words; the English list is only a second display and input form of the same 256 positions (see `js/words.js`). Translations of the interface live in `js/lang-*.js` and do not touch the protocol.

## Limits

- **Three words out of 256** are about 16.7 million possibilities. The code is valid for only a few minutes, a fraudster effectively has one attempt. That does not protect you if someone has your unlocked device or the invitation code in hand.
- **The invitation code contains the secret.** It must be handed over in person or via an end-to-end encrypted messenger, not by SMS or email.
- **The time of a seal comes from the device clock.** It is independently proven only once you have given an anchor (one line of text with the current state of the chain) to someone or published it.
- **A seal proves origin and being unchanged, not truth.** Anyone can sign for themselves and enter any name. The key is what matters; ECHT shows only keys from your circle of trust as known.
- **The proof gives away guessed content.** Anyone who guesses the text of a seal can confirm it with the proof. Do not seal short, easily guessed secrets.
- **Challenges and real-time relay:** anyone who conducts two calls at the same time can pass on a challenge. Follow the rule "whoever calls says it first" and do not answer challenges for callers who have not identified themselves.
- **Journal without third parties:** a journal cannot protect itself against forking or backdating after the fact. That is what anchors are for: they only work once someone else has received them. With the journal extract (see "Time proof for third parties") that person can also verify it.
- **Clipboard and memory:** copied codes stay on the clipboard until you copy something else. After locking, key remnants stay in memory until the browser cleans them up.
- **No access without password and backup.** There is no back door and no server that could restore anything.
- **Not audited by third parties.** Before use in security-critical environments the code should get an independent audit.
- **Emergency number:** the button next to the emergency code dials 110 (Germany). In other countries the number has to be adapted in `js/circle.js`; a configurable country number is an open improvement.

## Files

```
index.html          entry point, Content-Security-Policy
css/app.css         interface (light and dark)
js/words.js         word lists German/English (part of the protocol)
js/core.js          crypto core, runs in the browser and in Node
js/i18n.js          languages: t(), language choice
js/lang-en.js       English texts (the German text is the key)
js/ui.js            DOM helpers, dialogs, formatting
js/store.js         encrypted vault storage
js/gate.js          set-up, unlock, restore backup, language choice
js/circle.js        circle of trust
js/seals.js         seals
js/verify.js        check
js/settings.js      settings, journal, anchor, self-test
js/app.js           routing and automatic lock
sw.js               service worker for offline use
start.bat           double-click start on Windows (Node.js or built-in PowerShell server)
start.ps1           server without Node.js for start.bat
start.command       start on macOS and Linux
serve.mjs           small server with security headers (Node.js)
icon*.png/.svg      app icons
test/               unit tests (core and translations)
SECURITY.md         reporting vulnerabilities, review results, open points
CONTRIBUTING.md     contributing, adding a language
LICENSE             GNU Affero General Public License v3
```

## Ideas for later

- QR codes when connecting and when scanning proofs
- anchors via public timestamping services (for example OpenTimestamps)
- more languages (see [CONTRIBUTING.md](CONTRIBUTING.md))
- emergency number configurable per country
- key rotation with a certified hand-over
- packaging as an Android and iOS app

## Contributing

Bugs, ideas and translations are welcome: [CONTRIBUTING.md](CONTRIBUTING.md). Please do not report security vulnerabilities in public, but as described in [SECURITY.md](SECURITY.md).

## License

ECHT is licensed under the **GNU Affero General Public License, version 3** ([LICENSE](LICENSE)). Anyone who modifies ECHT and offers it as a service over a network must make the modified source code available to all its users. The app therefore links to the source code in the vault.
