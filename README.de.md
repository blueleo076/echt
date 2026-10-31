# ECHT

**Beweise, dass du es wirklich bist. Und dass es wirklich echt ist.**

🇬🇧 [English version](README.md) · Lizenz: [AGPL-3.0](LICENSE) · [Mitmachen](CONTRIBUTING.md)

ECHT ist eine App für Privatpersonen. Sie läuft komplett auf dem eigenen Gerät, braucht kein Konto, keinen Server und keine Abhängigkeiten. Sie lässt sich wie eine App installieren und funktioniert danach offline.

## Wofür

KI kann heute Stimmen, Gesichter, Fotos und Dokumente so gut fälschen, dass Hinsehen und Hinhören nicht mehr reichen. Zwei Situationen werden dadurch alltäglich:

1. **Der Anruf.** Eine vertraute Stimme meldet sich mit einer dringenden Bitte. Es kann ein Stimmklon sein.
2. **Das Beweisstück.** Ein Foto, ein Vertrag oder eine Zusage wird angezweifelt. „Das habe ich nie gesagt“ lässt sich nicht mehr durch Augenschein klären.

Für beides gibt es für Privatleute bisher keine einfache Lösung. ECHT bietet sie in einer App.

## Funktionen

### Vertrauenskreis
Du verbindest dich einmal mit einer nahestehenden Person. Danach gilt:

- **Live-Code:** drei Wörter, die sich jede Minute ändern, zum Beispiel „Radio · Turm · Moos“. Beide Seiten können sie am Telefon nennen und prüfen. Jeder Code wird nur einmal akzeptiert, ein mitgehörter lässt sich nicht erneut einsetzen.
- **Richtungsabhängig:** Jede Seite hat einen eigenen Code. Wer dich bittet, „unseren Code“ vorzulesen, bekommt damit nichts, womit er sich bei dir als die andere Person ausgeben kann.
- **Regel am Telefon:** Wer anruft, nennt zuerst den Code. Die angerufene Person prüft ihn und nennt ihren eigenen erst danach. Das erschwert es einem Betrüger, sich zwischenzuschalten, verhindert es aber nicht ganz: Bittet dich jemand per Nachricht um einen Rückruf auf einer neuen Nummer, kann er gleichzeitig die andere Person anrufen und deinen Code weiterreichen. **Nenne deinen Code darum nur, wenn du selbst die gespeicherte, bekannte Nummer angerufen hast.**
- **Rückfrage:** Die prüfende Person nennt eine frische sechsstellige Zahl. Nur wer das Geheimnis hat, kann die passenden drei Wörter berechnen.
- **Notfall-Code:** Wer bedroht wird, nennt statt des normalen Codes den Notfall-Code. Die andere Seite sieht eine stille Warnung, während das Gespräch ruhig klingt.

### Siegel
Fotos, Dateien und Texte werden mit einem Fingerabdruck (SHA-256) und deiner Signatur (ECDSA P-256) versiegelt. Alle Siegel bilden eine Kette: Jedes enthält die Kennung des vorherigen. Du gibst eine kleine **Beweisdatei** (`.echt.json`) weiter, nicht das Original.

### Prüfen
Wer Beweis und Original hat, sieht sofort, ob der Inhalt echt und unverändert ist. Dafür braucht die Person weder Konto noch Tresor: Die Seite „Prüfen“ funktioniert auch ohne Einrichtung.

### Zeitbeleg für Außenstehende
Der Zeitpunkt eines Siegels ist zunächst nur eine Angabe deines Geräts. Mit einem **Anker** wird er belegbar:

1. Du erzeugst im Tresor einen Anker (eine Textzeile mit dem Stand deiner Kette) und gibst sie jemandem, am besten auf einem Weg mit Zeitstempel, etwa per E-Mail.
2. Im Siegel speicherst du den **Journal-Auszug**: die Siegel von diesem bis zum verankerten Stand, nur der signierte Teil, ohne Originale.
3. Eine dritte Person lädt auf der Prüfseite Beweis, Journal-Auszug und die Anker-Zeile, die sie unabhängig von dir bekommen hat. ECHT prüft, ob das Siegel in einer lückenlosen Kette bis zu diesem Stand liegt.

Das beweist, dass das Siegel **spätestens** zu dem Zeitpunkt vorlag, zu dem die Anker-Zeile nachweislich ankam. Wann genau es entstand, belegt es nicht, und der Zeitpunkt der Weitergabe ergibt sich aus dem Empfangsnachweis (etwa der E-Mail), nicht aus ECHT. Der Auszug enthält von den folgenden Siegeln nur Kennungen und Prüfsummen (mit Zufallszahl, nicht ratbar), also keine Inhalte, Namen, Notizen oder Zeitpunkte. Die prüfende Person vergleicht die angezeigte **Kopf-ID** Zeichen für Zeichen mit der Anker-Zeile in ihrem Empfangsnachweis; nur sie ist verbindlich, Nummer und Datum aus der Zeile nicht. Der Beleg zeigt außerdem nicht, dass das Siegel das einzige oder erste zu einem Thema war: Auch andere Siegel können in derselben Kette vor dem Anker liegen. Siegel aus dem älteren Format 1 müssen vollständig mit in den Auszug.

### Tresor
Passwortschutz, automatische Sperre, verschlüsseltes Backup, Journal-Prüfung, Anker, Journal-Auszug und ein Selbsttest.

### Sprachen
ECHT gibt es auf **Deutsch** und **Englisch**. Beim ersten Start fragt die App nach der Sprache (vorgeschlagen wird die des Browsers); später lässt sie sich im Tresor oder auf dem Sperrbildschirm wechseln. Die Wort-Codes sind in beiden Sprachen **kompatibel**: Beide Wortlisten sind Position für Position einander zugeordnet (Apfel = Apple), und eingegeben werden darf jedes der beiden Wörter. Wer ECHT auf Deutsch nutzt, kann sich also mit jemandem prüfen, der es auf Englisch nutzt. Eine weitere Sprache hinzuzufügen ist in [CONTRIBUTING.md](CONTRIBUTING.md) beschrieben.

## Starten

**Windows:** Doppelklick auf `start.bat`. Der Browser öffnet sich von selbst auf `http://localhost:8734`.
**macOS/Linux:** `start.command` doppelklicken oder im Terminal `./start.command` (beim ersten Mal ggf. `chmod +x start.command`).

Das kleine Fenster, das dabei aufgeht, muss offen bleiben, solange du ECHT benutzt. Mehr braucht es nicht:

- Ist **Node.js** installiert, nutzt `start.bat` es. Sonst startet es den in Windows eingebauten PowerShell-Server (`start.ps1`), es muss also nichts installiert werden.
- Ein zweiter Doppelklick öffnet nur den Browser, wenn ECHT schon läuft.
- Der Port ist absichtlich fest (8734): Der Tresor liegt im Speicher des Browsers und gehört zu genau einer Adresse. Unter einer anderen Adresse (anderer Port, `127.0.0.1` statt `localhost`) ist er nicht zu sehen.

**Danach als App installieren:** In ECHT unter „Tresor“ → „Als App installieren“ (oder im Browser-Menü „App installieren“). Dann öffnet sich ECHT wie ein normales Programm mit eigenem Symbol, ohne dass du `start.bat` noch brauchst, und es funktioniert ohne Internet.

Von Hand, falls gewünscht (Node.js 18 oder neuer):

```bash
node serve.mjs
```

Andere Ports: `node serve.mjs 9000` (jede Adresse hat einen eigenen, getrennten Tresor). Mit `--open` öffnet sich der Browser.

### Erste Schritte

1. **Einrichten:** Name eintippen, Passwort eintippen oder „Passwort vorschlagen“ wählen (sechs Wörter, bitte aufschreiben). Fertig, ein Schritt.
2. **Person verbinden:** „Person verbinden“ → „Einladungs-Code erzeugen“ und den Code der Person schicken. Die Person fügt ihn bei sich ein und schickt dir einen Antwort-Code zurück, den du einfach einfügst (er wird beim Einfügen von selbst erkannt). Die Wort-Codes funktionieren schon, sobald die Person den Einladungs-Code eingefügt hat.
3. **Am Telefon:** Tab „Mein Code“ und „Prüfen“ beim Kontakt.

Die Dateien lassen sich auch auf jedem statischen Webspace betreiben, **aber nur über https**, denn die Kryptofunktionen des Browsers laufen nur in einem sicheren Kontext. Im Browser lässt sich ECHT dann über „Zum Startbildschirm hinzufügen“ oder „Installieren“ wie eine App einrichten.

Tests:

```bash
node --test "test/*.test.mjs"
```

## So ist es gebaut

| Baustein | Verfahren |
| --- | --- |
| Codes | HMAC-SHA-256 über Geheimnis, Rolle, Art und Zeitfenster (60 s); die ersten drei Bytes wählen Wörter aus einer festen Liste mit 256 Einträgen |
| Prüfung | Toleranz von ±1 Zeitfenster, Notfall-Code hat Vorrang, Wortvergleich ohne Groß-/Kleinschreibung und Umlaute |
| Wiederverwendung | Pro Kontakt merkt sich die App den zuletzt akzeptierten Zeitschritt; derselbe oder ein älterer Code wird abgelehnt (der Notfall-Code nicht) |
| Geheimnis | 32 Zufallsbytes, einmal per Einladungs-Code übergeben |
| Schlüssel in Codes | Einladung und Antwort tragen einen Besitznachweis (Signatur über die Verbindung); die Antwort zusätzlich einen MAC mit dem gemeinsamen Geheimnis. Ein untergeschobener oder geborgter Schlüssel fällt auf |
| Verbindungs-Nr. | 64 Bit aus dem Geheimnis, beide Geräte müssen dieselbe zeigen |
| Siegel | kanonisches JSON, ECDSA P-256. Format 2: Zufallszahl im signierten Teil, Kennung = SHA-256 über Vorgänger und Prüfsumme des signierten Teils (so braucht ein Journal-Auszug je Glied nur Vorgänger und Prüfsumme). Format 1 bleibt lesbar. Bei Texten werden nur die Zeilenenden vereinheitlicht, Unicode bleibt unangetastet |
| Kette | Jedes Siegel nennt die Kennung des Vorgängers; Anker-Zeilen werden streng gelesen (genau die Zeile, kein Text davor oder danach); fehlender Anfang, Lücken, Austausch, Umordnung und fremde Schlüssel fallen auf |
| Prüfseite | „Echt“ in Grün nur bei bekanntem Schlüssel (eigener oder aus dem Kreis); sonst „Unverändert, aber Absender unbekannt“ |
| Tresor | PBKDF2-SHA-256 (600.000 Runden), AES-256-GCM, Zustand komplett verschlüsselt, Passwort mindestens 10 Zeichen |
| Mehrere Fenster | Sperren, Ändern und Löschen gelten für alle Fenster; ein veraltetes Fenster darf den Tresor nicht überschreiben |
| Backup | gleiches Verfahren mit eigenem Passwort; die Art des Containers ist mit authentifiziert |
| Verbindungs-Codes | Base64url mit Prüfsumme gegen Tippfehler |

Es kommt nur WebCrypto aus dem Browser zum Einsatz. Die Oberfläche setzt keinen Text als HTML ein, und eine strenge Content-Security-Policy erlaubt nur eigene Skripte und Stile. Trusted Types sperrt zusätzlich jede HTML-Einschleusung; nur eine einzige benannte Richtlinie darf die Adresse des eigenen Service Workers liefern.

**Selbst hosten:** ECHT braucht einen **eigenen Ursprung** (eigene Domain oder Subdomain, kein Unterordner auf einem geteilten Host wie `nutzer.github.io/…` oder `/~nutzer/`). Jede andere Seite desselben Ursprungs könnte sonst den gespeicherten Tresor lesen (nur verschlüsselt) und überschreiben oder auf einen älteren Stand zurücksetzen. Zudem lässt sich das Einbetten in fremde Seiten per `<meta>` nicht verbieten. Setze darum beim Hoster dieselben Header wie `serve.mjs`, vor allem `Content-Security-Policy: frame-ancestors 'none'` und `X-Frame-Options: DENY`. Die App beendet sich im Frame zusätzlich selbst.

Ergebnisse der Sicherheitsprüfung mit zwei unabhängigen Red-Team-Agenten stehen in [SECURITY.md](SECURITY.md).

Wichtig für die Kompatibilität: **Wortlisten und Ableitung sind Teil des Protokolls.** Änderungen machen Codes zu älteren Installationen ungültig. Feste Referenzwerte in `test/core.test.mjs` und im Selbsttest der App fangen das ab. Intern rechnet ECHT immer mit den deutschen Wörtern; die englische Liste ist nur eine zweite Anzeige- und Eingabeform derselben 256 Positionen (siehe `js/words.js`). Übersetzungen der Oberfläche liegen in `js/lang-*.js` und berühren das Protokoll nicht.

## Grenzen

- **Drei Wörter aus 256** sind rund 16,7 Millionen Möglichkeiten. Der Code gilt nur wenige Minuten, ein Betrüger hat praktisch einen Versuch. Das schützt nicht, wenn jemand dein entsperrtes Gerät oder den Einladungs-Code in der Hand hat.
- **Der Einladungs-Code enthält das Geheimnis.** Er gehört persönlich oder über einen Ende-zu-Ende-verschlüsselten Messenger weitergegeben, nicht per SMS oder E-Mail.
- **Der Zeitpunkt eines Siegels stammt von der Geräteuhr.** Unabhängig belegt ist er erst, wenn du einen Anker (eine Textzeile mit dem aktuellen Stand der Kette) an jemanden gegeben oder veröffentlicht hast.
- **Ein Siegel beweist Herkunft und Unverändertheit, nicht Wahrheit.** Jeder kann sich selbst signieren und einen beliebigen Namen eintragen. Entscheidend ist der Schlüssel; nur Schlüssel aus deinem Vertrauenskreis zeigt ECHT als bekannt an.
- **Der Beweis verrät Erratenes.** Wer den Text eines Siegels errät, kann ihn mit dem Beweis bestätigen. Versiegle keine kurzen, leicht erratbaren Geheimnisse.
- **Rückfragen und Echtzeit-Weiterleitung:** Wer zwei Anrufe gleichzeitig führt, kann eine Rückfrage weiterreichen. Befolge die Regel „Wer anruft, nennt zuerst“ und beantworte Rückfragen nicht für Anrufer, die sich nicht ausgewiesen haben.
- **Journal ohne Dritte:** Ein Journal kann sich nicht selbst gegen Gabelung oder Rückdatieren nach dem Fakt schützen. Dafür sind die Anker da: Sie wirken erst, wenn jemand anderes sie bekommen hat. Mit dem Journal-Auszug (siehe „Zeitbeleg für Außenstehende“) kann diese Person das auch nachprüfen.
- **Zwischenablage und Arbeitsspeicher:** Kopierte Codes bleiben in der Zwischenablage, bis du etwas anderes kopierst. Nach dem Sperren bleiben Schlüsselreste im Speicher, bis der Browser sie aufräumt.
- **Kein Zugang ohne Passwort und Backup.** Es gibt keine Hintertür und keinen Server, der etwas wiederherstellen könnte.
- **Nicht von Dritten geprüft.** Vor einem Einsatz in sicherheitskritischen Umgebungen sollte der Code ein unabhängiges Audit bekommen.
- **Notrufnummer:** Der Knopf beim Notfall-Code wählt 110 (Deutschland). In anderen Ländern muss die Nummer in `js/circle.js` angepasst werden; eine einstellbare Landesnummer ist als Verbesserung offen.

## Dateien

```
index.html          Einstieg, Content-Security-Policy
css/app.css         Oberfläche (hell und dunkel)
js/words.js         Wortlisten Deutsch/Englisch (Teil des Protokolls)
js/core.js          Kryptokern, läuft im Browser und in Node
js/i18n.js          Sprachen: t(), Sprachwahl
js/lang-en.js       englische Texte (der deutsche Text ist der Schlüssel)
js/ui.js            DOM-Helfer, Dialoge, Formatierung
js/store.js         verschlüsselter Tresor-Speicher
js/gate.js          Einrichten, Entsperren, Backup einspielen
js/circle.js        Vertrauenskreis
js/seals.js         Siegel
js/verify.js        Prüfen
js/settings.js      Einstellungen, Journal, Anker, Selbsttest
js/app.js           Routing und automatische Sperre
sw.js               Service Worker für den Offline-Betrieb
start.bat           Doppelklick-Start unter Windows (Node.js oder eingebauter PowerShell-Server)
start.ps1           Server ohne Node.js für start.bat
start.command       Start unter macOS und Linux
serve.mjs           kleiner Server mit Sicherheits-Headern (Node.js)
icon*.png/.svg      App-Symbole
test/               Unit-Tests (Kern und Übersetzungen)
SECURITY.md         Sicherheitslücken melden, Ergebnisse der Sicherheitsprüfung, offene Punkte
CONTRIBUTING.md     Mitmachen, neue Sprache hinzufügen
LICENSE             GNU Affero General Public License v3
```

## Ideen für später

- QR-Codes beim Verbinden und Scannen von Beweisen
- Anker über öffentliche Zeitstempeldienste (zum Beispiel OpenTimestamps)
- weitere Sprachen (Anleitung in [CONTRIBUTING.md](CONTRIBUTING.md))
- Notrufnummer je nach Land einstellbar
- Schlüsselwechsel mit beglaubigter Übergabe
- Verpackung als Android- und iOS-App

## Mitmachen

Fehler, Ideen und Übersetzungen sind willkommen: [CONTRIBUTING.md](CONTRIBUTING.md). Sicherheitslücken bitte nicht öffentlich melden, sondern wie in [SECURITY.md](SECURITY.md) beschrieben.

## Lizenz

ECHT steht unter der **GNU Affero General Public License, Version 3** ([LICENSE](LICENSE)). Wer ECHT verändert und als Dienst im Netz anbietet, muss den geänderten Quelltext allen Nutzern zugänglich machen. Die App verlinkt deshalb im Tresor auf den Quelltext.
