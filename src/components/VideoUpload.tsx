'use client';

import { useRef, useState } from 'react';

type TargetLanguage = 'original' | 'english' | 'german';

interface UploadResult {
  filename: string;
  path: string;
  metadata: { duration: number; width: number; height: number; fps: number };
  targetLanguage: TargetLanguage;
}

interface UrlResult {
  text: string;
  segments: Array<{ start: number; end: number; text: string }>;
  language: string;
  originalLanguage?: string;
  duration: number;
  savedTo?: string;
  meta: { title: string; platform: string; sourceUrl: string };
}

interface Props {
  onUploaded: (result: UploadResult) => void;
  onUrlTranscribed: (result: UrlResult) => void;
}

const PLATFORM_ICONS: Record<string, string> = {
  YouTube: '▶', Instagram: '📷', TikTok: '♪',
  'Twitter/X': '✕', Facebook: 'f', Vimeo: 'V', Web: '🔗',
};

const LANGUAGE_OPTIONS: { value: TargetLanguage; label: string; hint: string }[] = [
  { value: 'original', label: 'Originalsprache',  hint: 'Whisper erkennt automatisch' },
  { value: 'english',  label: 'Englisch',          hint: 'Whisper übersetzt direkt' },
  { value: 'german',   label: 'Deutsch',            hint: 'Transkription + Claude-Übersetzung' },
];

export default function VideoUpload({ onUploaded, onUrlTranscribed }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<'file' | 'url'>('file');
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [loadingLabel, setLoadingLabel] = useState('');
  const [targetLanguage, setTargetLanguage] = useState<TargetLanguage>('original');

  // ── Datei-Upload ──────────────────────────────────────────
  async function handleFile(file: File) {
    setError(null);
    setLoading(true);
    setLoadingLabel('Video wird hochgeladen…');
    try {
      const form = new FormData();
      form.append('video', file);
      const res = await fetch('/api/upload', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Upload fehlgeschlagen');
      onUploaded({ ...data, targetLanguage });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Upload');
    } finally {
      setLoading(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  // ── URL-Transkription ─────────────────────────────────────
  async function handleUrl() {
    if (!url.trim()) return;
    setError(null);
    setLoading(true);
    setLoadingLabel(
      targetLanguage === 'german'
        ? 'Audio laden → Whisper → Claude übersetzt…'
        : 'Audio laden & transkribieren…'
    );
    try {
      const res = await fetch('/api/transcribe-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), targetLanguage }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Transkription fehlgeschlagen');
      onUrlTranscribed(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler');
    } finally {
      setLoading(false);
    }
  }

  function detectPlatform(u: string) {
    if (/youtube\.com|youtu\.be/.test(u)) return 'YouTube';
    if (/instagram\.com/.test(u)) return 'Instagram';
    if (/tiktok\.com/.test(u)) return 'TikTok';
    if (/twitter\.com|x\.com/.test(u)) return 'Twitter/X';
    if (/facebook\.com|fb\.watch/.test(u)) return 'Facebook';
    if (/vimeo\.com/.test(u)) return 'Vimeo';
    return '';
  }

  const detectedPlatform = detectPlatform(url);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      {/* Tab-Leiste */}
      <div className="flex border-b border-gray-200">
        {(['file', 'url'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-3 text-sm font-medium transition-colors
              ${tab === t
                ? 'bg-white text-indigo-600 border-b-2 border-indigo-600'
                : 'bg-gray-50 text-gray-500 hover:text-gray-700'}`}
          >
            {t === 'file' ? 'Datei hochladen' : 'Video-Link einfügen'}
          </button>
        ))}
      </div>

      <div className="p-6 space-y-4">

        {/* ── Sprach-Selektor (immer sichtbar) ── */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Transkript-Sprache
          </p>
          <div className="flex gap-2">
            {LANGUAGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setTargetLanguage(opt.value)}
                title={opt.hint}
                className={`flex-1 rounded-xl border py-2 px-3 text-xs font-medium transition-colors
                  ${targetLanguage === opt.value
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-gray-400">
            {LANGUAGE_OPTIONS.find((o) => o.value === targetLanguage)?.hint}
          </p>
        </div>

        {/* ── Tab: Datei ── */}
        {tab === 'file' && (
          <div
            onClick={() => !loading && inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition-colors
              ${dragging ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:border-indigo-400 hover:bg-gray-50'}
              ${loading ? 'pointer-events-none opacity-60' : ''}`}
          >
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept="video/mp4,video/quicktime,video/x-msvideo,video/webm"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            {loading ? (
              <div className="flex flex-col items-center gap-3">
                <div className="h-9 w-9 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
                <p className="text-sm text-gray-500">{loadingLabel}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="rounded-full bg-indigo-100 p-3">
                  <svg className="h-7 w-7 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-gray-900">Video hierher ziehen oder klicken</p>
                  <p className="mt-0.5 text-sm text-gray-500">MP4, MOV, AVI, WebM</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Tab: URL ── */}
        {tab === 'url' && (
          <div className="space-y-3">
            <div className="flex gap-2 flex-wrap text-xs text-gray-400">
              {['YouTube', 'Instagram', 'TikTok', 'Twitter/X', 'Facebook', 'Vimeo'].map((p) => (
                <span key={p} className="rounded-full border border-gray-200 px-2 py-0.5">
                  {PLATFORM_ICONS[p]} {p}
                </span>
              ))}
            </div>

            <div className="relative">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !loading && handleUrl()}
                placeholder="https://www.youtube.com/watch?v=… oder TikTok / Instagram Link"
                disabled={loading}
                className="w-full rounded-xl border border-gray-300 py-3 pl-4 pr-36 text-sm
                  focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
              />
              {detectedPlatform && !loading && (
                <span className="absolute right-28 top-1/2 -translate-y-1/2 text-xs font-medium text-indigo-600">
                  {PLATFORM_ICONS[detectedPlatform]} {detectedPlatform}
                </span>
              )}
              <button
                onClick={handleUrl}
                disabled={!url.trim() || loading}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-indigo-600
                  px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700
                  disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? '…' : 'Transkribieren'}
              </button>
            </div>

            {loading && (
              <div className="flex items-center gap-3 rounded-lg bg-indigo-50 px-4 py-3">
                <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
                <p className="text-sm text-indigo-700">{loadingLabel}</p>
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}
      </div>
    </div>
  );
}
