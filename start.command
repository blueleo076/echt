#!/bin/sh
# ECHT starten (macOS und Linux): Doppelklick bzw. im Terminal ./start.command
# Beim ersten Mal ggf. ausführbar machen:  chmod +x start.command
cd "$(dirname "$0")" || exit 1

if command -v node >/dev/null 2>&1; then
  exec node serve.mjs --open
fi

if command -v python3 >/dev/null 2>&1; then
  echo "Node.js ist nicht installiert, ECHT startet mit Python."
  echo "ECHT läuft auf http://localhost:8734/ . Dieses Fenster offen lassen, zum Beenden schließen."
  (sleep 1; { command -v open >/dev/null 2>&1 && open "http://localhost:8734/"; } || { command -v xdg-open >/dev/null 2>&1 && xdg-open "http://localhost:8734/"; }) &
  exec python3 -m http.server 8734 --bind 127.0.0.1
fi

echo "Weder Node.js noch Python gefunden. Installiere eines davon (zum Beispiel Node.js von nodejs.org) und starte erneut."
exit 1
