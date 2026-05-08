# Video-Generator — Anweisung an Claude

> **Du bist hier, weil ein User dir den Repo-Link geteilt und gesagt hat: „Setz das lokal bei mir auf."**
> Diese Datei sagt dir, **wie du ihn Schritt für Schritt durchführst** — Beginner-Modus, jeder Klick erklärt.
>
> ⚠️ **Das ist das anspruchsvollste Tool im Stack.** Setup dauert 30–60 Min — vier API-Provider, jeder mit eigenem Account. Sei geduldig und klar, der User soll nicht überfordert werden.

## 0. Vor allem anderen: Claude-Code-Check

**Bist du gerade in Claude Code Desktop?**
- Wenn der User in **Claude Chat** (claude.ai) oder **Cowork** ist → STOPP. Sag ihm:
  > *„Für lokales Setup brauchst du Claude Code Desktop — nur dort kann ich Dateien auf deinem Rechner anfassen, Dependencies installieren und einen Dev-Server starten. Lade das hier runter: https://claude.ai/download. Wenn du installiert hast, öffne Claude Code → **Code** → **Lokal** → wähl `~/claude/` aus. Wirf den Repo-Link dann nochmal hier rein."*
- Wenn er Claude Code Desktop noch nicht installiert hat → führ ihn durch die Installation.

**Voraussetzungen-Check:**
- `node --version` → muss 18+ sein
- `ffmpeg -version` → muss installiert sein, sonst läuft die Pipeline nicht
- Claude-Code Globales `~/.claude/CLAUDE.md` (optional aber empfohlen)
- **Keine Datenbank nötig** — alles wird lokal in `data/projects/` gespeichert

Wenn FFmpeg fehlt:
> *„FFmpeg fehlt — das ist das Tool, das die Videos zusammenschneidet. Auf macOS: `brew install ffmpeg` (falls Homebrew nicht installiert ist, sag mir, ich führ dich durch die Installation). Windows: download von ffmpeg.org. Linux: `sudo apt install ffmpeg`."*

## 1. Was wir hier tun — kurz erklären

Sag dem User ehrlich:

> *„Wir setzen jetzt den Video-Generator lokal bei dir auf. Das ist das anspruchsvollste Tool im Stack — wir brauchen 4 API-Keys, dauert insgesamt 30–60 Minuten beim ersten Mal.
>
> Was du am Ende kannst: Video-Link einwerfen → Tool transkribiert + analysiert + lässt dich pro Szene Skript, Bilder, Videos editieren. Oder: nur Prompt eingeben → Tool baut komplettes Reel von null.
>
> Alle deine Projekte, Skripte, Bilder und Videos werden direkt im Projekt-Ordner unter `data/projects/` gespeichert — keine Datenbank, keine Cloud, alles bleibt lokal bei dir.
>
> Kosten: pro fertigem Reel ~$3–4 für die ganzen APIs. Wir setzen bei allen Anbietern Spend-Caps, damit du kein böses Erwachen hast.
>
> Wir gehen Schritt für Schritt durch. Wenn was hängt, sag Bescheid."*

## 2. Repo klonen

```bash
cd ~/claude
git clone <REPO-URL> video-generator
cd video-generator
```

## 3. FFmpeg-Check

```bash
ffmpeg -version
```

Wenn vorhanden → weiter. Wenn nicht → User durch Installation führen (siehe oben).

## 4. API-Keys holen — gehe nacheinander durch

**Jeder Key einzeln — nicht alle auf einmal, das überfordert.**

### a) Anthropic API Key

> *„Erst der Anthropic-Key (für Skripte + Szenen-Analyse):
>
> 1. https://console.anthropic.com (mit Claude-Pro-Account)
> 2. **Settings** → **API Keys** → **Create Key** → Name `video-generator` → **Create**
> 3. Key kopieren (`sk-ant-api03-...`) — wird **nur einmal** angezeigt!
> 4. **Settings** → **Limits** → **Monthly spend cap** → $20 setzen
>
> Sag Bescheid wenn du den Key hast."*

### b) OpenAI API Key

> *„Jetzt OpenAI für Whisper-Transkription:
>
> 1. https://platform.openai.com
> 2. Login oder Account anlegen → Karte hinterlegen für Pay-as-you-go
> 3. Links: **API keys** → **+ Create new secret key** → Name `video-generator` → **Create**
> 4. Key kopieren (`sk-proj-...`)
> 5. **Settings** → **Limits** → **Monthly budget** → $10
>
> Sag Bescheid wenn du den Key hast."*

### c) Google AI Key (Nano Banana / Gemini)

> *„Google AI für die Bildgenerierung — wir nutzen Nano Banana (gemini-3-pro-image-preview), das ist aktuell das beste KI-Bildmodell:
>
> 1. https://aistudio.google.com/apikey
> 2. **Create API key**
> 3. Wähl ein Google-Cloud-Projekt (oder erstell ein neues — Name z.B. `video-generator`)
> 4. Key kopieren
>
> Sag Bescheid wenn du den Key hast."*

### d) Fal.ai API Key

> *„Letzter Key: Fal.ai für die Videogenerierung (Veo3 Lite + Kling als Fallback):
>
> 1. https://fal.ai/dashboard/keys
> 2. Account anlegen + Email verifizieren
> 3. **Billing** → Karte hinterlegen + Monthly Spend Cap $20
> 4. Zurück zu **API Keys** → **Create API Key** → kopieren
>
> Format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:xxxxxxxx`
>
> Sag Bescheid wenn du den Key hast."*

## 5. Alles in `.env.local` eintragen

Wenn der User alle 4 Keys geschickt hat:

```bash
cat > .env.local <<EOF
ANTHROPIC_API_KEY=<KEY-VOM-USER>
OPENAI_API_KEY=<KEY-VOM-USER>
GOOGLE_API_KEY=<KEY-VOM-USER>
FAL_API_KEY=<KEY-VOM-USER>
EOF
```

Erkläre: *„`.env.local` ist gitignored — deine Keys bleiben nur lokal. NIE diese Datei mit jemandem teilen oder in ein Repo committen."*

## 6. Dependencies installieren

```bash
npm install --legacy-peer-deps
```

Erkläre während des Installs: *„Lädt jetzt alle Pakete — das sind viele weil das Tool ne komplette Pipeline ist (Anthropic SDK, OpenAI SDK, Fal-SDK, Remotion fürs Rendering, FFmpeg-Wrapper). Dauert 2–3 Minuten. `--legacy-peer-deps` brauchen wir, weil Remotion und OpenAI verschiedene Zod-Versionen wollen — kein Funktionsproblem."*

## 7. Dev-Server starten

```bash
npm run dev
```

Sag: *„Tool läuft jetzt auf http://localhost:3000. Lass uns das im Browser öffnen und ein erstes Test-Video machen."*

## 8. Erstes Test-Video — den User durchführen

> *„Ich empfehle als ersten Test den **✨ KI-Entwurf**-Modus — du gibst nur einen kurzen Prompt ein und das Tool baut ein komplettes Szenengerüst. Das ist der billigste + schnellste Weg, die ganze Pipeline einmal zu sehen.
>
> Beispiel-Prompt zum Ausprobieren:
> *‚Erstelle ein 30-sekündiges TikTok-Video über das Thema „Warum Selbstständige täglich Claude nutzen sollten". Zielgruppe: deutsche Solo-Unternehmer 30–50. Stil: direkt, einfach, mit konkreten Beispielen. 1 Sprecher, schaut in Kamera, modernes Büro-Setting.'*
>
> Klick **✨ Szenengerüst von KI generieren**. Dauert ca. 30–60 Sek. Du landest danach im Szenen-Editor."*

Wenn der User im Szenen-Editor ist:

> *„Hier hast du pro Szene: Text-Skript, Bild, Video. Click auf eine Szene → du kannst pro Szene:
> - Text editieren
> - Bild neu generieren (Nano Banana, ~2 Cent)
> - Video generieren (Fal.ai Veo3, ~50 Cent — vorsichtig!)
>
> Erst ALLE Bilder generieren bevor du Videos generierst. Bilder sind günstig und du kannst dranfeilen. Videos sind teuer — nur final-version generieren."*

## Häufige Probleme + Lösungen

| Symptom | Ursache | Fix |
|---|---|---|
| `Cannot find ffmpeg` | FFmpeg nicht installiert | `brew install ffmpeg` (macOS) |
| Whisper 401 | OpenAI-Key ungültig | OpenAI-Dashboard → API Keys → neu erstellen |
| Plattform blockiert Download | YouTube/TikTok detektiert Bot | User durch ytdown.to/cobalt.tools führen + manueller Upload |
| `Gemini returned no image` | Modell überlastet | Nochmal versuchen, Tool retried automatisch + fällt auf flash-image zurück |
| Veo3 zu teuer | Default-Modell-Wahl | In `src/lib/fal-video.js` Default auf Kling setzen — 30% günstiger |
| Bildgenerierung dauert 1+ Min | Normal bei Nano Banana | Geduld — Reasoning-Modell denkt nach |
| Server-Crash bei großem Upload | formidable file-size limit | In `next.config.js`: `api.bodyParser.sizeLimit` checken |

## Power-User-Anpassungen

Wenn der User Sachen ändern will:

- **Kürzere Videos:** Default-Szenen-Anzahl ist in `src/lib/prompt-generator.js`. Kann auf 3–5 Szenen statt 7–10 reduziert werden.
- **Anderer Voice-TTS:** Aktuell wahrscheinlich ElevenLabs. Wenn der User OpenAI TTS will → check `src/lib/transcribe.ts`.
- **Video-Format:** 9:16 (Reel/TikTok) ist Default. 16:9 für YouTube → in der UI bei Projekt-Erstellung umstellbar.

## Wenn alles läuft

> *„Geil — Pipeline läuft. Drei Sachen zum Mitnehmen:
>
> 1. **Spend-Caps prüfen:** Bei allen 4 Anbietern hattest du Caps gesetzt — schau einmal pro Woche in die Dashboards rein, gerade Veo3 kann teuer werden bei vielen Test-Renders.
> 2. **Nicht in der Cloud deployen:** Das Tool ist Single-User-Local. Wenn du es als SaaS verkaufen willst, brauchst du Auth + Credit-System + Rate-Limits — das ist ein eigenes Projekt.
> 3. **Iterieren ist Pflicht:** Erste Reel-Version ist nie perfekt. Bilder neu generieren mit anderem Prompt, Texte umschreiben, Reihenfolge ändern. 3–5 Iterationen pro Szene sind normal."*

---

## 🎨 Branding-Frage — am Ende des Setups stellen

**Wichtig: Sobald das erste Test-Reel generiert ist, frag aktiv:**

> *„Das Tool hat aktuell Herr-Tech-Branding im UI:
> - Logo oben in der Nav (auf jeder Seite: Home, Projects, Scenes, Videos, Export)
> - Footer ‚© 2025 herr.tech · KI Video Creator'
> - Export-Filename startet mit `herr-tech_` (z.B. `herr-tech_1234567890.mp4`)
> - Lavendel-Akzentfarbe (`#B598E2`) durchgängig
>
> Willst du das so behalten oder dein eigenes Branding einbauen?"*

### Wenn der User Branding ändern will

Frag nach:
- **Brand-Name** (für Nav-Subtext + Footer + Filename-Prefix)
- **Primärfarbe** als Hex
- **Logo-Datei** (PNG, transparenter Hintergrund, Höhe ~36px ist gut)
- **Domain** für Footer (z.B. `frau.tech`)

### Was du touchen musst

- **`public/herr-tech-logo.png`** → durch User-Logo ersetzen (gleichen Dateinamen lassen ist am einfachsten — sonst Pfade in 5 Files updaten)
- **`src/pages/index.js`** → Nav-Subtext (`/ social video creator`), Footer-Zeile, Akzentfarbe in `T.accent` und `T.btn`
- **`src/pages/projects.js`** + **`src/pages/scenes/[id].js`** + **`src/pages/videos/[id].js`** + **`src/pages/export/[id].js`** → jeweils Nav-Logo + lokale Design-Tokens (`T.accent`)
- **`src/pages/api/projects/[id]/export-video.js`** Zeile 248 → `const exportFilename = \`herr-tech_${timestamp}.mp4\`;` → Prefix anpassen
- **`src/app/globals.css`** → Globale CSS-Variable falls verwendet (eher nicht — das Tool nutzt inline-Style-Tokens)

### Praktischer Tipp für den User

Sag ihm: *„Wenn dein Branding noch nicht final ist, lass das Herr-Tech-Branding erstmal stehen — das ist nur der Frame, das eigentliche Video bekommt ja eh dein Style. Du kannst das später jederzeit in 5 Min mit mir umfärben."*

### Standard-Default behalten

Wenn der User „passt schon" sagt: nichts ändern. Das Tool ist eh nur für ihn selbst lokal.
