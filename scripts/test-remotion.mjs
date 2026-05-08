#!/usr/bin/env node
/**
 * Test-Script für die Remotion Video-Komposition.
 * Startet das Remotion Studio mit Beispiel-Szenen-Daten.
 *
 * Verwendung:
 *   node scripts/test-remotion.mjs
 *   node scripts/test-remotion.mjs --json pfad/zu/scenes.json
 */

import { execSync } from 'child_process';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';

// ── Beispiel-Daten ────────────────────────────────────────────────────────────

const EXAMPLE_DATA = {
  scenes: [
    {
      id: 1,
      timestamp_start: 0,
      timestamp_end: 4,
      type: 'illustration',
      text_overlay: 'Deine Klinik verliert 15.000€/Monat',
      illustration_prompt: 'Modern clinic, red warning icons, money flying away',
      style: 'flat design, dark background, red accent',
    },
    {
      id: 2,
      timestamp_start: 4,
      timestamp_end: 9,
      type: 'talking_head',
      text_overlay: 'Das muss nicht so sein',
      illustration_prompt: '',
      style: 'dark background',
    },
    {
      id: 3,
      timestamp_start: 9,
      timestamp_end: 14,
      type: 'illustration',
      text_overlay: 'KI löst das Problem automatisch',
      illustration_prompt: 'Futuristic AI interface, green checkmarks, efficiency dashboard',
      style: 'flat design, dark background, indigo accent',
    },
    {
      id: 4,
      timestamp_start: 14,
      timestamp_end: 18,
      type: 'illustration',
      text_overlay: 'Jetzt kostenlos testen',
      illustration_prompt: 'Clean call-to-action screen, white button, dark background',
      style: 'flat design, dark background, white accent',
    },
  ],
  segments: [
    { start: 0,  end: 2,  text: 'Deine Klinik verliert jeden Monat Geld.' },
    { start: 2,  end: 4,  text: 'Ineffiziente Prozesse kosten 15.000€.' },
    { start: 4,  end: 7,  text: 'Das muss nicht so sein.' },
    { start: 7,  end: 9,  text: 'Es gibt eine bessere Lösung.' },
    { start: 9,  end: 11, text: 'KI automatisiert deine Abläufe.' },
    { start: 11, end: 14, text: 'Und spart dir Zeit und Geld.' },
    { start: 14, end: 18, text: 'Jetzt kostenlos testen!' },
  ],
};

// ── Argumente parsen ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const jsonFlag = args.indexOf('--json');
let data = EXAMPLE_DATA;

if (jsonFlag !== -1 && args[jsonFlag + 1]) {
  const jsonPath = resolve(args[jsonFlag + 1]);
  if (!existsSync(jsonPath)) {
    console.error(`❌ Datei nicht gefunden: ${jsonPath}`);
    process.exit(1);
  }
  data = JSON.parse(readFileSync(jsonPath, 'utf-8'));
  console.log(`📂 Lade Daten aus: ${jsonPath}`);
} else {
  console.log('📋 Verwende Beispiel-Daten (--json <pfad> für eigene Daten)');
}

// ── Daten in tmp/ speichern ───────────────────────────────────────────────────

if (!existsSync('tmp')) mkdirSync('tmp');
const tmpPath = resolve('tmp/remotion-test-data.json');
writeFileSync(tmpPath, JSON.stringify(data, null, 2));

console.log('');
console.log('🎬 Remotion Studio wird gestartet…');
console.log(`📊 ${data.scenes.length} Szenen | ${data.segments.length} Segmente`);
console.log('');
console.log('Szenen-Übersicht:');
data.scenes.forEach((s) => {
  const icon = s.type === 'illustration' ? '🖼 ' : '🎙 ';
  console.log(`  ${icon} [${s.timestamp_start}s–${s.timestamp_end}s] ${s.text_overlay}`);
});
console.log('');
console.log('Studio öffnet sich unter → http://localhost:3001');
console.log('');

// ── Remotion Studio starten ───────────────────────────────────────────────────

try {
  execSync('npx remotion studio src/remotion/index.ts', {
    stdio: 'inherit',
    env: { ...process.env, REMOTION_TEST_DATA: tmpPath },
  });
} catch {
  // Studio wurde manuell beendet — kein Fehler
}
