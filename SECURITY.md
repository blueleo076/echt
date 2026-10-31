# Sicherheit / Security

## Sicherheitslücke melden · Reporting a vulnerability

**Bitte keine öffentlichen Issues für Sicherheitslücken.** Nutze auf GitHub den Reiter „Security“ → „Report a vulnerability“ (privater Meldeweg). Beschreibe, was du gefunden hast, wie man es nachstellt und welche Folgen es hat. Eine Antwort kommt in der Regel innerhalb weniger Tage; nach der Korrektur wird der Fund hier unter „Behoben“ dokumentiert, auf Wunsch mit Namensnennung.

**Please do not open public issues for security problems.** On GitHub use the "Security" tab → "Report a vulnerability" (private reporting). Describe what you found, how to reproduce it and what it affects. You will usually get an answer within a few days; after the fix the finding is documented below under "Behoben" (fixed), crediting you if you wish.

Besonders interessant: Fälschbarkeit von Codes und Siegeln, Umgehen der Sperre oder Verschlüsselung, Einschleusen von Text als HTML, Schwächen im Austausch der Einladungs-Codes. Not in scope: Angriffe, die ein entsperrtes Gerät oder den Einladungs-Code im Besitz des Angreifers voraussetzen (siehe „Grenzen“ im README).

---

# Sicherheitsprüfung

ECHT wurde von vier voneinander unabhängigen Red-Team-Agenten angegriffen: zuerst zwei mit getrennten Schwerpunkten, danach einer mit dem Modell Opus 5.5 und zuletzt einer mit dem Modell Fable 5.1, beide auf hohem Aufwand und jeweils auf dem Stand nach den vorigen Korrekturen. Beide durften nur lesen, rechnen und im Browser testen, nichts am Projekt ändern, und mussten jeden Befund mit einem lauffähigen Nachweis belegen. Jeder Befund wurde danach im Code nachvollzogen, behoben und, wo möglich, erneut im echten Browser mit zwei getrennten Tresoren nachgespielt.

- **Agent 1:** Kryptografie, Codes, Siegel, Tresor, Backup.
- **Agent 2:** Web-Angriffsfläche (Einschleusung, CSP, Service Worker, Testserver, Router, Sperre, Denial-of-Service).

Es ist **kein** externes Audit. Vor einem Einsatz in sicherheitskritischen Umgebungen sollte der Code unabhängig geprüft werden.

## Behoben

| Befund | Schwere | Maßnahme |
| --- | --- | --- |
| Öffentliche Schlüssel in Verbindungs-Codes waren weder echt noch besitzgeprüft: Antwort-Code tauschbar, fremder Schlüssel „borgbar“, Verbindungs-Nr. nur 32 Bit | hoch | Besitznachweis (Signatur über die Verbindung) in Einladung und Antwort, MAC mit dem Geheimnis in der Antwort, Verbindungs-Nr. mit 64 Bit, Vergleich des vollen Schlüssels statt der 64-Bit-Kennung |
| Prüfseite zeigte „Echt und unverändert“ für jeden beliebigen Unterzeichner; eingebetteter Text wurde gegen den eigenen Hash geprüft | hoch bis mittel | Grün nur bei bekanntem Schlüssel, sonst „Unverändert, aber Absender unbekannt“; eingebetteter Text nur bei Text-Siegeln mit passender Länge und wird angezeigt; Name, Dateiname und Notiz als „unbestätigt“ markiert |
| Live-Code ließ sich beliebig oft und etwa zwei Minuten lang wiederverwenden; Anleitung ließ den Code an unbestätigte Anrufer gehen | mittel | Jeder Code gilt einmal (Zeitschritt wird pro Kontakt gespeichert); Anleitung: „Wer anruft, nennt zuerst“; irreführenden Text korrigiert |
| Sperren ließ offene Dialoge (mit Einladungs-Code) stehen | mittel | Beim Sperren werden alle Dialoge geschlossen |
| „Sperren“ und „Alles löschen“ wirkten nur im eigenen Fenster; ein altes Fenster konnte den Tresor überschreiben oder wiederbeleben; ein fehlgeschlagenes Speichern blockierte alle weiteren | mittel | Sperr-Signal und Änderungs-Erkennung zwischen Fenstern, Stand-Prüfung vor jedem Schreiben, gesunde Speicher-Warteschlange |
| Backup-Import: stilles Überschreiben, leeres Passwort, nicht geprüftes Schlüsselpaar, ungeprüfte Einstellungen und Kennungen | mittel | Bestätigung mit Vorschau (Name, Schlüssel-ID, Datum, Anzahl) und Tippbestätigung, Passwort mindestens 10 Zeichen, Schlüsselpaar-Probe, `id == pairId(secret)`, Whitelist der Einstellungen, Aufbau jedes Siegels geprüft; bei Fehlern bleibt der alte Zustand |
| Text-Siegel normalisierten Unicode (NFC): Kelvin-Zeichen und K ergaben denselben Hash | niedrig | Nur Zeilenenden werden vereinheitlicht |
| Journal- und Anker-Prüfung bestätigten fehlenden Anfang, fremde Siegel, falsche Nummer und erfundenes Datum | niedrig | Anfang und Unterzeichner werden erzwungen, `n` wird geprüft, das Datum der Zeile gilt nur als Angabe |
| Unsichtbare und umkehrende Unicode-Zeichen in Namen, Notizen, Dateinamen; unterscheidbare Doppelgänger im Kreis | niedrig | Fremde Texte werden gesäubert angezeigt, gleichnamige Kontakte abgelehnt |
| Sackgasse „Tresor nicht lesbar“ | niedrig | Ausweg: Backup einspielen oder neu beginnen |
| Einbetten in fremde Seiten möglich | niedrig | Header `X-Frame-Options` und `frame-ancestors` im Testserver, Selbstabbruch im Frame, CSP mit Trusted Types |
| Testserver stürzte bei Lesefehler ab | niedrig | Erst lesen, dann Header senden; nur GET und HEAD |
| Service Worker lieferte nach kurzer Vergiftung weiter den falschen Stand aus | niedrig | Netz zuerst, Cache nur als Rückfall |
| Passwort-Mindestlänge 8; Schlüsselableitung aus Fremddaten unbegrenzt | niedrig | Mindestens 10 Zeichen, Iterationen auf 100.000 bis 10 Mio. begrenzt |
| Auto-Sperre per Timer unzuverlässig nach Standby | niedrig | Zeitstempel, Prüfung alle 5 s und beim Zurückkehren |

### Nachprüfung durch Opus 5.5 (hoher Aufwand): Angriff auf die Korrekturen und das Gesamtsystem

| Befund | Schwere | Maßnahme |
| --- | --- | --- |
| Ein Klartext-Tresor (`echt-plain/1`) wurde ohne Passwort geöffnet, auch im laufenden Fenster. Eine zweite Seite desselben Ursprungs konnte so einen Tresor des Angreifers unterschieben, danach bestätigte die App dessen Codes als „Mama“ | hoch | Den Modus ohne Passwort gibt es nicht mehr; Klartext-Einträge gelten als beschädigt und öffnen sich nie; nach einer fremden Änderung bleibt das Fenster immer am Sperrbildschirm |
| Der Schutz vor gleichnamigen Kontakten ließ sich umgehen (unsichtbares U+034F, Akzente, kyrillisches „а“); die Siegel des Doppelgängers erschienen grün als „aus dem Vertrauenskreis“ | mittel | Vergleich über ein „Skelett“ des Namens (ohne Akzente und unsichtbare Zeichen, Lookalikes gleichgesetzt), gemischte Schriften werden abgelehnt, Prüfung nach den `await`s wiederholt |
| Ein veralteter Dialog („Ohne Passwort?“) in einem zweiten Fenster ersetzte einen bestehenden Tresor ohne Rückfrage | mittel | `create()` schreibt nur, wenn kein Tresor existiert; bei jeder Änderung im Speicher werden offene Dialoge geschlossen |
| „Wer anruft, nennt zuerst“ verhindert keine Weiterleitung des Live-Codes, wenn das Opfer selbst auf eine neue Nummer anruft (die README behauptete das Gegenteil) | mittel | Technisch ohne Kanalbindung nicht zu verhindern: README korrigiert, deutlicher Hinweis im Tab „Mein Code“: den Code nur bei einer selbst gewählten, gespeicherten Nummer nennen |
| Unbereinigter Dateiname im grünen Prüfergebnis (Bidi-Zeichen, frei wählbarer Text) | niedrig | Name steht nicht mehr im Urteil, nur gesäubert und als „nicht Teil des Beweises“ in der Tabelle |
| Robustheit: Doppelklick beim Beitritt konnte zwei Kontakte mit gleicher Kennung anlegen und den Tresor dauerhaft unlesbar machen | niedrig | Mehrfach-Absenden wird abgefangen, doppelte Einträge werden beim Laden verworfen statt den Tresor zu sperren |
| Server lieferte Windows-Sonderpfade (`::$DATA`, Endpunkt) | niedrig | Solche Pfade ergeben 404 |

### Systematische Gesamtprüfung durch Fable 5.1 (hoher Aufwand)

Der vierte Prüfer ging alle Bereiche systematisch durch (Landkarte der Angriffsfläche, Abwägung aller Angriffswege nach Machbarkeit und Wirkung, praktische Tests der aussichtsreichen). Er fand **keine kritische oder hohe Lücke** und bestätigte die Korrekturen der früheren Runden im Browser und in Node: Besitznachweis und MAC, Rollen und Einmal-Verwendung der Live-Codes, Urteilslogik der Prüfseite, Trusted Types und CSP, Mehrfenster-Sperre, Entfernen des Klartext-Modus, Testserver (15 Sonderpfade). Zwei niedrige Befunde:

| Befund | Schwere | Maßnahme |
| --- | --- | --- |
| Das Namens-Skelett fing Kapitälchen-Buchstaben (`ᴍᴀᴍᴀ`) und weitere Schriften (Cherokee, Armenisch) nicht ab: ein Kreis-Mitglied konnte beim Verbinden einen gleich aussehenden Namen vorschlagen | niedrig | Kapitälchen im Skelett gleichgesetzt; Namen mit Lautschrift-/Kapitälchen-Blöcken und jede Mischung von Lateinisch mit einer anderen Schrift werden abgelehnt (echte Namen wie „Zoë“, „Müller“, „Ștefan“ bleiben erlaubt) |
| Die Warnung „nur bei einer Nummer, die du kennst“ fehlte im Tab „Ich antworte“, obwohl Rückfragen genauso weitergereicht werden können | niedrig | Derselbe Hinweis steht jetzt dort, wo der Nutzer handelt |

Zusätzlich begrenzt: Verbindungs-Codes werden ab 6000 Zeichen sofort abgelehnt (echte haben rund 400), das Eingabefeld ist entsprechend begrenzt.

Seine Gesamteinschätzung: Am verwundbarsten bleibt der Mensch am Telefon (Weiterleitung, Social Engineering), technisch ohne Kanalbindung nicht lösbar, nur durch Hinweistexte abzumildern. Die größte funktionale Lücke zwischen Versprechen und Werkzeug war das fehlende Journal-Export/Anker-Abgleich für Dritte. Er ist inzwischen eingebaut (siehe unten).

### Erweiterung: Zeitbeleg für Außenstehende (Journal-Auszug und Anker-Abgleich)

Neu eingebaut und danach von einem Opus-Agenten angegriffen, der den Besitzer des Beweises als Angreifer annahm (er will der Prüferin ein später entstandenes Siegel als früher vorhanden verkaufen) und zugleich den ehrlichen Besitzer und die Prüferin als mögliche Opfer betrachtete.

**Ergebnis:** Eine echte Rückdatierung gelang nicht. Die Aussage „spätestens zum Anker-Stand“ hält kryptografisch auch gegen einen Besitzer als Angreifer, solange die Prüferin genau die Zeile aus ihrem Empfangsnachweis einfügt. Probiert wurden unter anderem: neues Siegel in eine verankerte Kette einhängen, Gabelung, Einschub, doppelte Kennungen, `null`/Löcher/Zyklen, Beweis- oder Auszugs-Kennung mit fremdem Inhalt, fremde Siegel und umgeschriebene Schlüsselkennung, ReDoS, riesige Werte, tiefe Verschachtelung, `__proto__`. Schwächen lagen bei Datenschutz und Anzeige:

| Befund | Schwere | Maßnahme |
| --- | --- | --- |
| Der Auszug enthielt für jedes Zwischen-Siegel einen vollständigen, einzeln prüfbaren Beweis. Der ehrliche Besitzer gab damit unbemerkt Fingerabdrücke, Größen, Namen, Notizen und Zeitpunkte weiter; kurze Texte ließen sich erraten | mittel | **Siegel-Format 2:** Zufallszahl im signierten Teil, Kennung = SHA-256 über Vorgänger und Prüfsumme. Der Auszug enthält je Glied nur `{prev, commit}` (rund 200 Byte für drei Glieder), keine Inhalte, Namen, Notizen oder Zeitpunkte; die Zufallszahl macht die Prüfsumme unratbar. Siegel im Format 1 bleiben lesbar, müssen aber vollständig in den Auszug (die App sagt das vor dem Speichern) |
| Die Anzeige nannte Siegel-Nr., Stand-Nr. und Datum als Fakten, obwohl der Angreifer alle frei wählen kann; die einzige bindende Angabe (Kopf-ID) stand nirgends. Ein Doppelgänger-Anker mit gleichem Anfang und Ende der Kopf-ID ließ sich in 77 s erzeugen | mittel | Die volle Kopf-ID wird angezeigt, mit der Aufforderung, sie Zeichen für Zeichen mit dem Empfangsnachweis zu vergleichen; Nummer und Datum sind als „unbestätigt“ markiert; Überschrift „Kette bis zum Anker-Stand in Ordnung“ statt „bestätigt“ |
| `parseAnchor` nahm den ersten Treffer irgendwo im Text („UNGÜLTIG-ECHT-ANKER…“, mehrere Anker) | mittel (Teil des vorigen) | Streng: nach dem Trimmen muss genau die Zeile dastehen |
| Rohtext und Bidi-Zeichen aus `at` landeten im grünen Ergebnis | niedrig | `at` darf nur Zeichen eines ISO-Datums enthalten; Zeilen mit anderen Zeichen werden abgelehnt |
| Der Zeitbeleg erschien grün neben dem Urteil „Der Inhalt stimmt nicht überein“; ein Anker-Datum vor dem Siegel-Datum wurde nur gegen das Beweis-Siegel geprüft | niedrig | Bei abweichendem Inhalt gelb mit dem Satz, dass der Beleg nur für das Siegel gilt; der Zeitsprung-Hinweis entfällt, weil Auszüge keine Zeitpunkte mehr enthalten |

Weitere Eigenschaften der Erweiterung, per Unit-Test und im Browser mit zwei getrennten Ursprüngen (Besitzer mit Tresor, Prüferin ohne) bestätigt: Das Einhängen in eine Kette scheitert, weil die Kennung den Vorgänger bindet (`H(prev ‖ commit)`); ein Glied im Format 1 darf nicht als bloßes `{prev, commit}` auftreten, weil sich dort der Vorgänger nicht binden ließe; Auszüge über 5000 Glieder werden abgelehnt.

**Bewusst offen, die Erweiterung betreffend:**
- Der Beleg zeigt, dass das Siegel existierte, nicht dass es das **einzige oder erste** zu einem Thema war. Wer vorab mehrere Alternativen versiegelt („A gewinnt“, „B gewinnt“) und nur eine zeigt, kann das mit ECHT nicht ausschließen.
- Auch der Zeitpunkt der Anker-Weitergabe bleibt Sache des Empfangsnachweises. Ein unabhängiger Zeitstempel (RFC 3161, OpenTimestamps) über die Kopf-ID würde den Abgleich per Auge ersetzen; das ist eine mögliche spätere Erweiterung.
- Die Zahl der Glieder zwischen Siegel und Anker ist aus dem Auszug ablesbar.

### Vereinfachte Einrichtung (nach den Prüfungen)

Auf Wunsch wurden Start und Einrichtung vereinfacht. Sicherheitsrelevant daran:

- **Ein Passwortfeld statt zwei.** Das Passwort ist beim Anlegen sichtbar (umschaltbar), damit Tippfehler auffallen; die Länge von mindestens 10 Zeichen gilt weiter. Der Vorschlag besteht aus sechs zufälligen Wörtern der Liste (48 Bit); er wird mit einem Hinweis zum Aufschreiben angezeigt. Wer wenig Entropie wählt (kurzer Satz), schwächt den Tresor weiterhin selbst; eine Stärkeanzeige gibt es nicht.
- **Verbinden auf einer Seite.** Ein Einfügefeld erkennt Einladung und Antwort. Alle Prüfungen sind dieselben geblieben (Prüfsumme, Besitznachweis, MAC der Antwort, Namens-Skelett, Dopplungsschutz, Länge); die Antwort wird nur übernommen, wenn sie zu einer von diesem Gerät verschickten Einladung gehört. Nach dem Einfügen geht es automatisch weiter; das ersetzt keine Prüfung, spart nur den Klick.
- **Name bei der Einladung optional.** Ohne Namen heißt der Kontakt „Neue Person“ und übernimmt nach der Antwort den Namen aus der Antwort, aber nur, wenn er die Namensprüfung besteht.
- **Start per Doppelklick.** `start.bat` nutzt Node.js oder, wenn es fehlt, den in Windows eingebauten PowerShell-Server (`start.ps1`). Beide liefern nur die öffentliche Dateiliste aus, mit denselben Sicherheits-Headern, und lehnen Pfadtricks ab (geprüft: `..`, `::$DATA`, Endpunkte, fremde Dateien). Der Server bindet nur an `localhost`.
- **Nicht im Browser geprüft:** Das Installieren als App und die Service-Worker-Registrierung nach dieser Änderung. Im Test-Browser ließ sich zum Zeitpunkt der Prüfung nicht einmal ein leerer Test-Worker registrieren (Umgebungsproblem, nicht ECHT); frühere Versionen des Service Workers waren dort erfolgreich geprüft.

Beim Nachprüfen fiel ein eigener Rückschritt auf: Die neue Trusted-Types-Regel blockierte die Registrierung des Service Workers. Gelöst durch genau eine benannte Richtlinie (`echt-sw`), die nur die Adresse des eigenen Workers liefert. Dass fremde Richtlinien und `innerHTML` weiterhin blockiert sind, wurde im Browser bestätigt.

### Mehrsprachigkeit (Deutsch und Englisch)

Die Oberfläche gibt es jetzt auf Deutsch und Englisch. Sicherheitsrelevant daran, jeweils per Unit-Test oder im Browser geprüft:

- **Das Protokoll ist unverändert.** Codes werden weiterhin aus den deutschen Wörtern der 256 Positionen berechnet (die Referenzwerte der Tests blieben gleich). Die englische Liste ordnet jeder Position ein zweites Wort zu; beim Prüfen gilt jedes der beiden. Die Entropie bleibt 3 × 8 Bit. Ein Code gilt über beide Sprachen hinweg nur einmal (im Browser geprüft: deutsch gesprochen angenommen, danach englisch gesprochen als „schon benutzt“ abgelehnt).
- **Keine Mehrdeutigkeit zwischen den Listen.** Ein Wort, das in beiden Listen vorkommt, muss an derselben Position stehen; sonst würde dieselbe Eingabe je nach Sprache etwas anderes bedeuten. Das erzwingt ein Test. Beide Listen bestehen aus 256 unterschiedlichen Wörtern aus a–z.
- **Übersetzungstexte können nichts einschleusen.** Texte werden wie alle anderen mit `textContent` gesetzt. Fettdruck (`<b>`) wird aus dem Text zerlegt, bevor Werte eingesetzt werden; ein Name wie `<b>x</b>` oder `{name}` bleibt deshalb reiner Text (Unit-Test). Platzhalter und Tags jeder Übersetzung müssen mit dem Original übereinstimmen (Test für jede `js/lang-*.js`).
- **Die gespeicherte Sprachwahl** (`echt.lang` im Browserspeicher) ist keine Geheimnisinformation und wird nur gelesen, wenn sie genau eine bekannte Sprache nennt.
- **Offen:** Die Notruf-Schaltfläche wählt 110 (Deutschland), auch in der englischen Oberfläche.

## Bewusst offen

| Thema | Warum |
| --- | --- |
| Gabelung oder Rückdatieren eines Journals nach dem Fakt, Ersetzen des Endes | Ohne unabhängigen Dritten nicht zu verhindern. Anker wirken erst, wenn jemand anderes sie bekommen hat. Mit Journal-Auszug und Anker kann diese Person seit der Erweiterung „Zeitbeleg“ nachprüfen, dass ein Siegel spätestens bis zum Anker-Stand vorlag |
| Wer in denselben Ursprung schreiben kann (andere Seite auf demselben Host), kann den verschlüsselten Tresor löschen, überschreiben oder auf einen älteren Stand zurücksetzen. Entschlüsseln kann er ihn nicht | Rollback lässt sich nicht erkennen, wenn auch alle Gegenstellen im selben Speicher liegen. Darum braucht ECHT einen eigenen Ursprung (siehe README) |
| Live-Codes und Rückfragen lassen sich bei zwei gleichzeitigen Anrufen weiterreichen, wenn das Opfer selbst auf eine unbekannte Nummer anruft | Gilt für jedes Challenge-Response-Verfahren ohne Kanalbindung; Gegenmittel ist die Regel „Wer anruft, nennt zuerst“ |
| Beweis bestätigt erratene, kurze Texte | Der Hash ist nicht gesalzen; die App warnt beim Versiegeln von Texten. Ein Salz, das nur mit dem Original ausgeliefert wird, wäre ein größerer Umbau |
| Passwortstärke | Nur Mindestlänge, keine Stärkeanzeige |
| Zwischenablage, Schlüsselreste im Speicher nach dem Sperren, Kontakt-ID im Verlauf (`#/circle/<id>`) | Browser-Grenzen bzw. niedriges Risiko |
| Service Worker im Pane und unter `*.localhost` | Im eingebauten Browser lässt er sich nur unter `127.0.0.1` registrieren; das Verhalten bei Vergiftung wurde nur per Simulation geprüft |
| Meta-CSP kann `frame-ancestors` nicht setzen | Beim Selbst-Hosten Header setzen (siehe README) |

## Nachprüfen

```bash
node --test "test/*.test.mjs"
```

Die Tests decken unter anderem ab: geborgter Schlüssel, Schlüsseltausch im Antwort-Code, Vorlese-Trick, fehlender Kettenanfang, fremder Unterzeichner, Kelvin-Zeichen.
