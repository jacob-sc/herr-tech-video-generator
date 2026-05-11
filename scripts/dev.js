#!/usr/bin/env node
/*
 * Startet `next dev` mit sauberer Env.
 *
 * Hintergrund: Claude Code Desktop setzt fuer seinen eigenen API-Zugriff zwei
 * Env-Variablen in jede Shell, die er startet:
 *   - ANTHROPIC_API_KEY=""           (leer)
 *   - ANTHROPIC_BASE_URL=https://api.anthropic.com   (ohne /v1)
 *
 * Beide haben in Next.js Vorrang vor `.env.local`, weshalb Tools, die aus
 * Claude Code Desktop heraus gestartet werden, sonst entweder
 *   - "ANTHROPIC_API_KEY fehlt" oder
 *   - 404 Not Found (weil der API-Pfad zu /messages statt /v1/messages geht)
 * werfen.
 *
 * Dieses Skript laedt `.env.local` mit Override und entfernt eine defekte
 * ANTHROPIC_BASE_URL, bevor `next dev` gestartet wird. CLI-Args (z.B. --port)
 * werden weitergereicht.
 */

const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')

const root = path.join(__dirname, '..')
const envPath = path.join(root, '.env.local')

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8')
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.replace(/^﻿/, '').trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

if (
  process.env.ANTHROPIC_BASE_URL &&
  !/\/v1\/?$/.test(process.env.ANTHROPIC_BASE_URL)
) {
  delete process.env.ANTHROPIC_BASE_URL
}

const nextBin = path.join(
  root,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'next.cmd' : 'next',
)
const args = ['dev', ...process.argv.slice(2)]
const child = spawn(nextBin, args, { stdio: 'inherit' })

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})
