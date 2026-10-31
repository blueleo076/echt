// Minimaler statischer Server für ECHT (nur Node, keine Abhängigkeiten).
//
//   node serve.mjs            startet auf http://localhost:8734
//   node serve.mjs --open     öffnet zusätzlich den Browser (das macht start.bat / start.command)
//   node serve.mjs 9000       anderer Port (Achtung: jede Adresse hat ihren eigenen, getrennten Tresor)
//
// Der Port ist absichtlich fest: Der Tresor liegt im Speicher des Browsers und gehört zu genau einer Adresse.
// Hinweis: Die Kryptofunktionen des Browsers laufen nur über https:// oder http://localhost.
//
// Wer ECHT selbst hostet, sollte dieselben Antwort-Header setzen (vor allem frame-ancestors),
// denn per <meta> lässt sich das Einbetten in fremde Seiten nicht verbieten.
import { createServer, get as httpGet } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_PORT = 8734;
const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const args = process.argv.slice(2);
const wantOpen = args.includes('--open');
const port = Number(args.find((a) => /^\d+$/.test(a)) || process.env.PORT || DEFAULT_PORT);
const url = `http://localhost:${port}/`;

const PUBLIC = new Set(['index.html', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'sw.js']);
const PUBLIC_DIRS = ['css', 'js'];
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json',
};
const SECURITY_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "frame-ancestors 'none'",
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
};

function reply(res, code, text) {
  if (res.headersSent) { res.destroy(); return; }
  res.writeHead(code, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' }).end(text);
}

function openBrowser(target) {
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', target]]
    : process.platform === 'darwin' ? ['open', [target]] : ['xdg-open', [target]];
  try {
    const child = spawn(cmd[0], cmd[1], { detached: true, stdio: 'ignore' });
    child.on('error', () => console.log('Öffne bitte selbst im Browser: ' + target));
    child.unref();
  } catch (e) {
    console.log('Öffne bitte selbst im Browser: ' + target);
  }
}

const server = createServer(async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') { reply(res, 405, 'Methode nicht erlaubt'); return; }
    const reqUrl = new URL(req.url, 'http://localhost');
    let rel = decodeURIComponent(reqUrl.pathname).replace(/^\/+/, '') || 'index.html';
    rel = normalize(rel).split(sep).join('/');
    if (/[:*?"<>|]/.test(rel) || /[. ]$/.test(rel)) { reply(res, 404, 'Nicht gefunden'); return; } // Windows-Sonderformen (Datenströme, Endpunkte)
    const allowed = PUBLIC.has(rel) || PUBLIC_DIRS.some((d) => rel.startsWith(d + '/') && !rel.includes('..'));
    if (!allowed) { reply(res, 404, 'Nicht gefunden'); return; }
    const file = join(root, rel);
    if (!file.startsWith(root)) { reply(res, 403, 'Verboten'); return; }
    if (!(await stat(file)).isFile()) { reply(res, 404, 'Nicht gefunden'); return; }
    const body = await readFile(file); // erst lesen, dann Header senden: ein Lesefehler darf den Server nicht beenden
    res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (e) {
    reply(res, 404, 'Nicht gefunden');
  }
});

/** Antwortet auf dieser Adresse schon eine ECHT-Seite? (ohne Verbindungs-Wiederverwendung, damit der Prozess sofort endet) */
function isEchtRunning() {
  return new Promise((done) => {
    const req = httpGet(url, { agent: false, headers: { Connection: 'close' }, timeout: 2000 }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { if (text.length < 4096) text += c; });
      res.on('end', () => done(text.includes('<title>ECHT')));
      res.on('error', () => done(false));
    });
    req.on('timeout', () => { req.destroy(); done(false); });
    req.on('error', () => done(false));
  });
}

server.on('error', async (err) => {
  if (err.code !== 'EADDRINUSE') throw err;
  // Port belegt: Läuft dort schon ECHT (zweiter Doppelklick)? Dann einfach den Browser öffnen.
  // Kein process.exit(): unter Windows kann das beim Beenden einen libuv-Fehler auslösen. Der Prozess läuft von selbst aus.
  if (await isEchtRunning()) {
    console.log('ECHT läuft schon auf ' + url);
    if (wantOpen) openBrowser(url);
    process.exitCode = 0;
    return;
  }
  console.error(`Port ${port} wird von einem anderen Programm benutzt. Starte mit einem anderen Port: node serve.mjs 9000`);
  process.exitCode = 1;
});

server.listen(port, '127.0.0.1', () => {
  console.log(`ECHT läuft auf ${url}`);
  console.log('Dieses Fenster offen lassen, solange du ECHT benutzt. Zum Beenden schließen oder Strg+C.');
  if (wantOpen) openBrowser(url);
});
