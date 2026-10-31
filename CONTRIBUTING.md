# Contributing to ECHT

Thank you for helping. ECHT is a small app for private people with a big job: it should be understandable for someone who has never heard of cryptography, and still hold up against a determined attacker. Bug reports, ideas, translations and code are all welcome.

Please be kind and patient with each other. Assume good intent, criticise code and not people.

## Ground rules

1. **No dependencies, no build step.** Plain JavaScript that runs as it is in the browser and in Node.js. Please do not add frameworks, bundlers or npm packages.
2. **Never put text into the page as HTML.** No `innerHTML`, no `insertAdjacentHTML`, no string-built markup. Build the page with `h()` from `js/ui.js`. The Content-Security-Policy and Trusted Types enforce this; do not loosen them.
3. **Every text the user sees goes through `t()`.** The German text is the key: `t('Verbunden mit {name}', { name })`. Bold passages use `rich('Text <b>bold</b>')`. Do not build sentences by joining pieces; translators need whole sentences.
4. **The protocol is frozen.** Word lists, code derivation, seal and journal formats are compatible across installations. Changing them breaks codes between app versions. The reference values in `test/core.test.mjs` exist to catch accidents. If a change is truly needed, discuss it in an issue first; it needs a new protocol version.
5. **Security-relevant changes come with a test** and, where it makes sense, a note in [SECURITY.md](SECURITY.md).
6. **Keep it simple for users.** Every extra option, screen or sentence costs a non-technical person attention. Prefer removing steps over adding explanations.

## Setup

You need Node.js 22 or newer for the tests (the app itself runs with Node.js 18+ or even without Node.js, see `start.ps1`).

```bash
git clone https://github.com/blueleo076/echt.git
cd echt
node serve.mjs --open      # http://localhost:8734
node --test "test/*.test.mjs"
```

While developing, open `http://localhost:8734/?nosw`. That switches the service worker off, so the browser never shows you an old cached file. Each address has its own vault, so use a throw-away password.

## Code map

| File | What it does |
| --- | --- |
| `js/core.js` | crypto core (codes, seals, chain, vault encryption); runs in the browser and in Node, fully unit-tested |
| `js/words.js` | word lists German/English, part of the protocol |
| `js/i18n.js`, `js/lang-*.js` | languages and translations |
| `js/ui.js` | DOM helpers, dialogs, formatting |
| `js/store.js` | encrypted vault in `localStorage` |
| `js/gate.js` | set-up, unlock, restore, language choice |
| `js/circle.js`, `js/seals.js`, `js/verify.js`, `js/settings.js` | the screens |
| `js/app.js` | routing, automatic lock, multi-window handling |
| `sw.js`, `serve.mjs`, `start.*` | offline mode and the tiny local server |

## Adding or improving a translation

German is the source language and its text is the key, so a translation is one file.

1. Copy `js/lang-en.js` to `js/lang-xx.js` (`xx` is the two-letter language code) and translate the **values**. Leave the keys (the German texts) as they are. Placeholders such as `{name}` and the tags `<b>…</b>` must stay exactly as in the key.
2. Register the language in `js/i18n.js` under `LANGS`:
   ```js
   fr: { name: 'Français', locale: 'fr-FR' },
   ```
3. Add `<script src="js/lang-xx.js"></script>` to `index.html` (after `lang-en.js`), add the file to `FILES` in `sw.js` and raise `CACHE` there by one.
4. Run `node --test "test/*.test.mjs"`. The tests check **every** `js/lang-*.js` automatically: missing texts, leftover entries, placeholder mismatches.
5. Start the app, pick your language and click through all four tabs, the first-start screen and the dialogs. Look for text that is too long for a button.

Things worth knowing:

- Write short, plain sentences. Many readers are not technical. Use the same word for the same thing everywhere (seal, anchor, circle, vault, word code).
- The spoken **word codes** are calculated from the German word list. A new language shows the German words until a matching list exists. A list needs exactly 256 easy-to-say words in the same positions as the German ones (see the header of `js/words.js`). Open an issue before you start, the file format needs a small extension for a third list.
- If you change a German sentence in the code, its key changes. Update the entry in every `js/lang-*.js`; the tests tell you which ones.
- The emergency number behind the "police" button is German (110). Making it depend on the country is an open improvement.

## Pull requests

- Keep them small and focused: one change, one pull request.
- Say what you changed and why. For anything visible, add a screenshot in both languages.
- Run the tests before you push. New logic in `core.js` needs a unit test.
- Commit messages: short imperative first line ("Add …", "Fix …"), details below if needed.

## Reporting bugs and security problems

- Bugs and ideas: open an issue, the templates guide you.
- **Security problems: please do not open a public issue.** Follow [SECURITY.md](SECURITY.md).

## License

ECHT is licensed under the [GNU Affero General Public License v3](LICENSE). By contributing you agree that your contribution is licensed under the same terms.
