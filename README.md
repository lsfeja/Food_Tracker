# Foodtracker (Web-App)

Private All-in-one-Sport-App als **PWA**: Kalorien- und Makro-Tracking, Trainingsplan und
Statistiken. Läuft auf **Cloudflare** (ein Worker liefert Frontend und API aus, Daten in
**D1**) und wird auf dem iPhone wie eine App vom Home-Bildschirm gestartet. Zugriffsschutz
übernimmt **Cloudflare Access**; die App hat kein eigenes Login.

Ziel wie bei der iOS-Version: Eine Mahlzeit loggen oder ein Training abhaken dauert Sekunden.

> Die frühere native iOS-App (SwiftUI) ist mit dem Git-Tag `ios-final` archiviert
> (gleicher Stand: Branch `claude/foodtracker-ios-app-n2c1fe`).

## Funktionen

**Ernährung**
- **Wochenbudget** (V3): Wochenplan = (Grundumsatz + Ø Aktivkalorien der letzten 4 Wochen) × 7.
  Mehr Training als im Schnitt füllt den Rest der Woche auf (mindestens 3 Tage), weniger kürzt
  die Folgetage; Ruhetage aus dem Plan sind geschützt, die Tage haben eine Untergrenze (max.
  Defizit pro Tag einstellbar). Gegessenes über/unter dem Tagesziel wandert auf die Folgetage und
  in die nächste Woche; nicht unterzubringende Kürzungen nur anteilig (Standard 70 %).
- Tagesübersicht: Ring mit verbleibenden kcal des Tagesziels, Wochenkarte, Makro-Balken,
  Einträge (wischen zum Bearbeiten/Löschen), großer **+**-Button (gedrückt halten → Scan/Etikett).
- Hinzufügen: zuletzt/häufig verwendete und eigene Lebensmittel, Suche in Open Food Facts,
  Menge in Gramm (Nährwerte pro 100 g werden skaliert), neue Lebensmittel, Schnelleintrag.
- **Barcode-Scan** über die iPhone-Kamera (ZXing) mit Open-Food-Facts-Abfrage; unbekannte
  Produkte → Etikett fotografieren oder manuell erfassen.
- **Etikett-Foto**: Texterkennung im Browser (Tesseract.js, Deutsch/Englisch) liest die
  Werte pro 100 g; du bestätigst sie im Editor.
- Grundumsatz (Ruhe + Alltagsbewegung), Makroziele, Anteil der aktiven Kalorien (50–100 %).
- **Urlaubstage**: einzelne Tage als „nicht getrackt“ markieren (auch im Voraus, in den
  Einstellungen oder per Schalter am Tag): kein Budget, keine Bilanz, nicht im 4-Wochen-Schnitt;
  Strava-Aktivitäten zählen trotzdem in der Sportstatistik.
- **Ziel-Slider**: Defizit (Fett reduzieren) oder Überschuss (Masse aufbauen) in kcal/Tag; das
  Defizit ist durch die Untergrenze des Wochenbudgets begrenzt, der Überschuss auf +750.
- Verlauf: Tage und Wochen mit Diagrammen; jeder Tag lässt sich öffnen und nachtragen.

**Plan**
- Trainingskalender als To-do-Liste pro Woche (Woche/Tag), heute hervorgehoben, Wochenleiste
  zum Wischen, **+** pro Tag, Abhaken, Wischen zum Löschen/Duplizieren,
  **Drag & Drop** (lange drücken) zwischen Tagen.
- Details je Sportart: Kraft (Sätze × Wdh. × Gewicht, Ist-Werte, „letztes Mal“,
  Pausentimer, neue Bestwerte), Ausdauer (Dauer, Distanz, Zonen/RPE, Intervalle),
  Mobility/Yoga/Ruhetag/Eigene (Notizen, Dauer). Krafttraining bleibt in der App
  (kein Upload zu Strava).
- Workout-Bibliothek (Kopie beim Einplanen), Wochenvorlagen (Woche speichern, Vorlage mit
  Vorschau laden: hinzufügen oder ersetzen – erledigte Einheiten bleiben).
- **Strava**: Aktivitäten werden Einheiten am selben Tag zugeordnet und haken sie ab;
  ungeplante Aktivitäten erscheinen in der Liste; manuell verknüpfen/lösen.

**Statistik**
- Zeitraum Woche/Monat/Jahr/Gesamt, Jahresauswahl.
- Ausdauer (pro Sportart oder Rad gesamt): km, Zeit, Höhenmeter, Wochen-/Monatsvolumen,
  Jahr vs. Vorjahr, Rekorde, Indoor-Anteil, **Jahresziele** (km/h, „im Plan“/„hinterher“).
- Kraft: **Maximalgewicht pro Übung**, bester Satz, geschätztes 1RM (Epley), Volumen,
  Bestwerte, Verlauf pro Übung.
- Plan (geplant vs. erledigt, Trainingszeit pro Sportart) und Ernährung (Durchschnitte,
  Tage im/über Budget, gegessen vs. aktiv).
- **Strava-Historie**: einmaliger Import aller früheren Aktivitäten, mit Rate-Limit-Pausen,
  läuft im Hintergrund weiter.

**Offline**: App-Oberfläche und zuletzt geladene Daten sind offline lesbar; Änderungen
brauchen eine Verbindung.

**Nicht in dieser Version** (im Datenmodell vorbereitet): KI-Schätzmodus
(`food_entries.source = 'ai'`, `is_estimated`), Garmin-Import (`connections.provider`,
`activities.source`, Rate-Limits und Import-Status pro Anbieter).

**Was eine PWA nicht kann** (gab es nur in der iOS-App): Widgets, Steuerelement im
Kontrollzentrum, Siri-Kurzbefehle. Ersatz: Links wie `/add?mode=barcode`, `/add?mode=label`,
`/plan` oder `/stats` als Lesezeichen bzw. eigenes Home-Bildschirm-Symbol anlegen.

## Architektur

| Teil | Technik |
|------|---------|
| Frontend | Vite, React, TypeScript, PWA (vite-plugin-pwa), TanStack Query mit IndexedDB-Cache |
| Backend | Cloudflare Worker mit Static Assets, API unter `/api` (Hono) |
| Datenbank | Cloudflare D1, SQL-Migrationen in `migrations/` |
| Hintergrund | Cron Trigger alle 30 min (Strava-Sync, Historien-Import) |
| Auth | Cloudflare Access; E-Mail aus `Cf-Access-Authenticated-User-Email` bzw. geprüftem Access-JWT |

Rein logische Teile (Budget, Parser, Statistik, Matching, Wochenvorlagen) liegen in
`src/shared/` und sind mit Vitest getestet; die Worker-API wird mit Miniflare gegen eine
lokale D1 getestet. Details: [CLAUDE.md](CLAUDE.md).

## Lokal starten

Voraussetzungen: Node.js 20 oder neuer (empfohlen 22) und npm.

```sh
npm ci
cp .dev.vars.example .dev.vars        # lokale Werte, wird nicht committet
npm run db:migrate:local              # lokale D1 (in .wrangler/) anlegen/migrieren
npm run build                         # Frontend nach dist/client bauen
npm run dev:worker                    # wrangler dev → http://localhost:8787
```

Lokal gibt es kein Cloudflare Access: Alle Anfragen laufen als `DEV_USER_EMAIL` aus
`.dev.vars`. Für Strava lokal `STRAVA_CLIENT_SECRET` in `.dev.vars` eintragen und in den
Strava-API-Einstellungen vorübergehend `localhost` als Callback-Domain setzen.

Frontend mit Hot Reload: zusätzlich zu `npm run dev:worker` in einem zweiten Terminal
`npm run dev` starten und http://localhost:5173 öffnen (API-Aufrufe gehen an den Worker).

Prüfen:

```sh
npm test            # Vitest: Logik + Worker-API gegen lokale D1 (Migrationen werden angewendet)
npm run typecheck   # TypeScript (Frontend, Worker, Tests)
npm run build       # Produktions-Build inkl. Service Worker
```

## Einrichtung auf Cloudflare

### 1. D1-Datenbank anlegen und migrieren

```sh
npx wrangler login
npx wrangler d1 create foodtracker
```

Die ausgegebene `database_id` in `wrangler.toml` bei `[[d1_databases]]` eintragen und
committen (die ID ist kein Geheimnis). Dann die Tabellen anlegen:

```sh
npm run db:migrate:remote
```

Neue Migrationen kommen als weitere Dateien in `migrations/` dazu; `npm run deploy`
wendet sie vor jedem Deploy an.

### 2. Secrets setzen

Secrets nur über Wrangler (oder im Dashboard unter *Worker › Settings › Variables and
Secrets* als Typ *Secret*), nie in `wrangler.toml`, im Code oder im Frontend:

```sh
npx wrangler secret put STRAVA_CLIENT_ID        # z. B. 298532
npx wrangler secret put STRAVA_CLIENT_SECRET    # aus https://www.strava.com/settings/api
npx wrangler secret put TOKEN_ENCRYPTION_KEY    # z. B. Ausgabe von: openssl rand -base64 32
```

`TOKEN_ENCRYPTION_KEY` verschlüsselt die Strava-Tokens (AES-GCM) in D1. Wird der Schlüssel
geändert, muss Strava in den Einstellungen neu verbunden werden.

Hinweis: Secrets lassen sich erst setzen, wenn der Worker existiert. Bei einem neuen Projekt
also zuerst einmal deployen (Schritt 4), dann die Secrets setzen – Strava ist bis dahin in
den Einstellungen als „nicht konfiguriert“ markiert.

### 3. Strava-Callback-Domain

In den [Strava-API-Einstellungen](https://www.strava.com/settings/api) unter
**Authorization Callback Domain** die Domain der App eintragen – nur den Hostnamen, ohne
`https://` und ohne Pfad, z. B. `foodtracker.example.com` oder
`foodtracker.<dein-subdomain>.workers.dev`. Die App nutzt als Callback
`https://<domain>/api/strava/callback`; Token-Austausch und Refresh laufen im Worker.

### 4. Deploy über „Import a repository“

1. Cloudflare-Dashboard › **Workers & Pages** › **Create** › **Import a repository**.
2. GitHub verbinden und dieses Repository wählen.
3. Einstellungen:
   - **Production branch**: `web` (bzw. `main`, sobald der Branch gemergt ist)
   - **Build command**: `npm run build`
   - **Deploy command**: `npm run deploy` (wendet D1-Migrationen an, dann `wrangler deploy`)
   - Root directory: leer lassen (Repository-Wurzel)
4. Speichern und deployen. Jeder Push auf den Branch deployt automatisch; der Cron Trigger
   aus `wrangler.toml` wird mit eingerichtet.

Falls der Deploy-Schritt bei den Migrationen an fehlenden Rechten scheitert: dem API-Token
der Builds (*Worker › Settings › Build › API token*) die Berechtigung **D1 Edit** geben –
oder Migrationen lokal mit `npm run db:migrate:remote` ausführen und als Deploy-Befehl
`npx wrangler deploy` verwenden.

### 5. Cloudflare Access einrichten

Ohne Access ist die App öffentlich – diesen Schritt nicht auslassen.

**Variante A – eigene Domain (empfohlen):**
1. *Worker › Settings › Domains & Routes* › **Custom domain** hinzufügen
   (z. B. `foodtracker.example.com`; die Domain muss bei Cloudflare liegen).
2. *Zero Trust › Access › Applications* › **Add an application** › **Self-hosted**:
   Domain = deine App-Domain (ganze Domain, kein Pfad). Policy: **Allow**, Include
   **Emails** = deine E-Mail-Adresse. Sitzungsdauer großzügig wählen (z. B. 1 Monat),
   damit die App nicht ständig neu fragt.
3. Die `workers.dev`-Adresse deaktivieren (*Domains & Routes* › workers.dev › Disable),
   damit niemand die App an Access vorbei erreicht.

**Variante B – nur workers.dev:** *Worker › Settings › Domains & Routes* › bei
`workers.dev` **Cloudflare Access** aktivieren. Danach in *Zero Trust › Access ›
Applications* die erzeugte App öffnen und die Policy auf deine E-Mail-Adresse beschränken.

**In beiden Fällen** in der Access-Application den **Application Audience (AUD) Tag**
kopieren und zusammen mit der Team-Domain (steht unter *Zero Trust › Settings*, Form
`<team>.cloudflareaccess.com`) in `wrangler.toml` eintragen:

```toml
[vars]
ACCESS_TEAM_DOMAIN = "deinteam.cloudflareaccess.com"
ACCESS_AUD = "…aud-tag…"
```

Committen und pushen. Dann prüft der Worker bei jeder API-Anfrage das signierte Access-JWT
und nutzt dessen E-Mail – ein gefälschter `Cf-Access-Authenticated-User-Email`-Header reicht
nicht mehr. Ohne diese beiden Werte vertraut der Worker dem Header allein (nur sinnvoll,
solange die App ausschließlich hinter Access erreichbar ist). Die Daten werden pro E-Mail
getrennt gespeichert.

### 6. Auf dem iPhone installieren

1. Die App-Adresse in **Safari** öffnen und über Access anmelden.
2. Teilen-Symbol › **Zum Home-Bildschirm** › Hinzufügen.
3. Die App vom Home-Bildschirm starten: Sie läuft im Vollbild ohne Browserleiste.
   Home-Bildschirm-Apps haben unter iOS einen eigenen Speicher – falls Access dort noch
   einmal nach der Anmeldung fragt, einfach erneut anmelden.
4. Einstellungen (Zahnrad im Ernährung-Tab) › **Connect Strava**. Die Strava-Anmeldung
   öffnet sich in einem Browserfenster; danach „Fertig“ tippen – die App zeigt die
   Verbindung, sobald sie wieder im Vordergrund ist. Optional unter *Activity History* den
   kompletten Verlauf importieren.
5. Beim ersten Barcode-Scan fragt iOS nach dem Kamerazugriff – erlauben.

Schnellzugriffe: `https://<domain>/add?mode=barcode` (Scanner) oder `…/add?mode=label`
(Etikett) in Safari öffnen und ebenfalls zum Home-Bildschirm hinzufügen.

## Datenmodell (D1)

| Tabelle | Inhalt |
|---------|--------|
| `users` | Nutzer pro Access-E-Mail |
| `settings` | Ziele, Wochenbudget, Anteil aktiver kcal, Zeitzone |
| `foods` | eigene Lebensmittel (pro 100 g, Barcode, Nutzungsstatistik) |
| `food_entries` | Einträge mit **absoluten** Nährwerten (Bearbeiten eines Lebensmittels ändert keine Historie); `source` manual/barcode/label/ai, `is_estimated` |
| `connections` | OAuth-Verbindungen pro Anbieter (Tokens verschlüsselt) |
| `activities` | importierte Aktivitäten (`source` + `external_id`), aktive kcal, Distanz, Zeit, Höhenmeter, indoor |
| `planned_sessions` | Trainingseinheiten (Tag, Reihenfolge, Sport, Status, Details als JSON, Strava-Verknüpfung) |
| `workout_templates`, `week_templates` | Bibliothek und Wochenvorlagen |
| `yearly_goals` | Jahresziele (km/Stunden) pro Sport-Filter |
| `untracked_days` | Urlaubstage (nicht getrackt) |
| `backfill_state`, `rate_limits`, `oauth_states` | Historien-Import, API-Limits pro Anbieter, OAuth-State |

## Projektstruktur

```
src/web/      React-App (Tabs Ernährung, Plan, Statistik), PWA
src/worker/   Worker: Hono-API, Auth, D1-Zugriff, Strava, Cron
src/shared/   reine Logik + API-Typen (Frontend und Worker)
migrations/   D1-Migrationen
test/worker/  API-Tests (Miniflare + lokale D1)
public/       Icons, Favicon (OCR-Dateien werden beim Build nach public/ocr kopiert)
```
