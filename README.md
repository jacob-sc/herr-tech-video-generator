# 🎬 Video-Generator

Lokale Pipeline: Video oder Prompt rein → Skript, Bilder, Untertitel, finales Video raus. Powered by **Whisper · Claude · Gemini (Nano Banana) · Fal.ai (Veo3)**.

> ⚠️ **Wichtig:** Das ist das anspruchsvollste Tool im Stack. Setup ist 30–60 Minuten beim ersten Mal — vier API-Provider, jede mit eigenem Account + Spend-Cap. Wenn du komplett neu bist mit Claude Code, fang lieber mit der Sales-Page oder dem Karussell-Generator an.

## Was das Tool kann

- **Video hochladen / Link einfügen** (YouTube, TikTok, Instagram, Twitter, Vimeo) → Whisper transkribiert → Claude segmentiert in Szenen → Screenshots werden gemacht → Claude analysiert visuell
- **Eigenes Video von KI generieren lassen:** Prompt rein → Claude schreibt Skript + Bildprompts → Bilder via **Gemini (Nano Banana)** → Videos via **Fal.ai (Veo3 Lite + Kling als Fallback)** → finales Reel
- **Pro Szene editierbar:** Text, Bild, Video alles iterativ verbesserbar
- **Export als MP4** mit Untertiteln + Voiceover

## Was du brauchst

- **Claude Code Desktop** — [claude.ai/download](https://claude.ai/download)
- **Node.js 18+** — [nodejs.org](https://nodejs.org)
- **FFmpeg** auf deinem Rechner installiert
- **4 API-Keys** (Anthropic, OpenAI, Google AI, Fal.ai)
- 30–60 Minuten Zeit fürs erste Setup

> **Keine Datenbank nötig.** Alle Projekte, Skripte, Bilder und Videos werden direkt im lokalen Ordner `data/projects/` gespeichert.

## Kosten — ehrlich

Pro Video-Generierung (45-Sek-Reel):

| Posten | Kosten |
|---|---|
| Claude (Skript + Analyse) | ~$0.10–0.30 |
| Whisper (Transkription) | ~$0.05 |
| Gemini Nano Banana (Bilder) | ~$0.02 pro Bild × ~10 = $0.20 |
| Fal.ai Veo3 Lite (Videos) | ~$0.50 pro Clip × ~5 = $2.50 |
| **Pro Reel** | **~$3–4** |

Setz dir bei jedem Anbieter ein **monatliches Spend-Cap**. Veo3 ist die teuerste Komponente — pass beim Auto-Generieren auf.

---

## Setup in 6 Schritten

### 1. Repo klonen

In **Claude Code Desktop**:

> *„Setz das Video-Generator Tool lokal bei mir auf: https://github.com/jacob-sc/herr-tech-video-generator"*

> ℹ️ Nicht aus Claude Chat oder Cowork — nur Claude Code Desktop kann lokal Dateien schreiben und Dev-Server starten.

### 2. FFmpeg installieren (falls noch nicht)

**macOS (mit Homebrew):**
```bash
brew install ffmpeg
```

**Windows:** Download von [ffmpeg.org/download](https://ffmpeg.org/download.html) und in PATH eintragen.

**Linux:** `sudo apt install ffmpeg` (Debian/Ubuntu)

Check: `ffmpeg -version`

### 3. Vier API-Keys holen

#### a) Anthropic
1. [console.anthropic.com](https://console.anthropic.com) → **Settings** → **API Keys** → **Create Key**
2. Name: `video-generator` → **Create** → Key kopieren
3. **Limits** → **Monthly spend cap** → $20

#### b) OpenAI (für Whisper)
1. [platform.openai.com](https://platform.openai.com) → links **API keys** → **+ Create new secret key**
2. Name: `video-generator` → **Create** → Key kopieren
3. **Settings** → **Limits** → **Monthly budget** → $10

#### c) Google AI (Gemini / Nano Banana — Bildgenerierung)
1. [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. **Create API key** → wähl Google-Cloud-Projekt (oder „new project")
3. Key kopieren

#### d) Fal.ai (Veo3 Lite — Videogenerierung)
1. [fal.ai/dashboard/keys](https://fal.ai/dashboard/keys)
2. Account anlegen → Verify Email
3. **Create API Key** → Key kopieren (sieht aus wie `xxxxxxxx:xxxxxxxxxx`)
4. **Billing** → Karte hinterlegen + Spend-Cap $20/Monat

### 4. Keys eintragen

Sag Claude einfach:

> *„Hier sind meine Keys:
> - Anthropic: \[Key]
> - OpenAI: \[Key]
> - Google AI: \[Key]
> - Fal.ai: \[Key]"*

Claude trägt alles in `.env.local` ein — gitignored, bleibt auf deinem Rechner.

### 5. Dependencies installieren

```bash
npm install --legacy-peer-deps
```

Dauert beim ersten Mal 2–3 Minuten (Anthropic SDK, OpenAI SDK, Fal-SDK, Remotion fürs Rendering, FFmpeg-Wrapper).

### 6. Dev-Server starten

```bash
npm run dev
```

Browser: **http://localhost:3000**

## Erste Nutzung

Du hast drei Modi:

1. **🔗 Video-Link** — TikTok-/YouTube-/Insta-URL einfügen, das Tool zieht das Video runter und analysiert es
2. **📁 Datei hochladen** — Eigenes Video (MP4 / MOV / WebM, bis 500 MB)
3. **✨ KI-Entwurf** — Nur Prompt eingeben, Tool baut komplettes Szenengerüst von null

**Empfehlung beim ersten Test:** Modus 3 (KI-Entwurf) — du lernst die Pipeline kennen, ohne ein echtes Video runterladen zu müssen.

Nach der Generierung landest du im **Szenen-Editor:**
- Pro Szene: Text, Bild, Video editierbar
- Bilder neu generieren mit anderem Prompt
- Videos neu generieren (achtung Kosten!)
- Reihenfolge per Drag & Drop ändern

Wenn alles passt: **Export** → Final-MP4 mit Untertiteln + TTS-Voiceover.

## Was du bewusst NICHT bekommst (im Standalone-Modus)

- ❌ Kein Login / kein User-Management — du allein nutzt das lokal
- ❌ Kein Email-Versand
- ❌ Kein Admin-Dashboard
- ❌ Kein Vertex AI Fallback (Bildgenerierung nur via Gemini Nano Banana — sauberer + bessere Qualität als Vertex)
- ❌ Kein Hosting-Setup

Das ist beabsichtigt. Wenn du das Tool später als SaaS verkaufen willst, ist das ein eigenes Projekt — Auth, Credits, Hosting bauen wir dann separat.

## Troubleshooting

**`Cannot find ffmpeg` beim Verarbeiten?**
FFmpeg ist nicht installiert oder nicht in PATH. Check: `ffmpeg -version`. Macht nichts → `brew install ffmpeg`.

**Whisper-Aufruf gibt 401?**
OpenAI-Key ungültig oder abgelaufen. Im OpenAI-Dashboard prüfen, ggf. neu erstellen.

**Bildgenerierung hängt / "Gemini returned no image"?**
Nano Banana ist gelegentlich überlastet. Tool retried automatisch + fällt auf `gemini-2.5-flash-image` zurück. Wenn beide ausfallen: warten, später nochmal.

**Veo3-Aufruf zu teuer?**
Du kannst in `src/lib/fal-video.js` den Default auf `kling-v3` setzen (~30% billiger, etwas geringere Qualität). Sag Claude: *„Default-Video-Modell auf Kling stellen."*

**Plattform blockiert Download (YouTube/TikTok)?**
Kommt vor — die Plattformen detektieren manchmal Bots. Lösung: Video manuell mit [ytdown.to](https://app.ytdown.to/de23/) (YouTube) oder [cobalt.tools](https://cobalt.tools) runterladen, dann via **📁 Datei hochladen** rein.

## Wo was liegt (Architektur)

- `src/pages/api/projects/` — Projekt-CRUD + Pipeline-Endpoints
- `src/pages/api/projects/[id]/process.js` — die Haupt-SSE-Pipeline (Transkribieren → Szenen → Screenshots → Analyse)
- `src/pages/api/projects/[id]/scenes/[sceneId]/generate-image.js` — Bild generieren (Gemini)
- `src/pages/api/projects/[id]/scenes/[sceneId]/generate-video.js` — Video generieren (Fal.ai)
- `src/lib/claude.ts` — Claude-Wrapper (Skripte + Analyse)
- `src/lib/whisper.ts` — Whisper-Wrapper
- `src/lib/imagen.js` — Gemini Bildgenerierung (Nano Banana)
- `src/lib/fal-video.js` — Fal.ai-Wrapper für Veo3 Lite + Kling
- `src/lib/ffmpeg.ts` — FFmpeg-Pipeline (Schnitt, Untertitel)
- `src/lib/transcribe.ts` — Whisper-Pipeline
- `src/lib/scenes.ts` — Szenen-Erkennung
- `data/` — Projekte + generierte Assets (gitignored)

---

> Teil von [Herr Tech Starter Tools](../README.md) — Modul 3 vom Claude Code Starter Paket.
