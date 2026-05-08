'use client';

import { TranscriptionResult } from '@/lib/whisper';

interface Props {
  transcription: TranscriptionResult;
}

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function TranscriptionView({ transcription }: Props) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Transkription</h2>
        <div className="flex gap-3 text-sm text-gray-500">
          <span>Sprache: <strong className="text-gray-800">{transcription.language.toUpperCase()}</strong></span>
          <span>Dauer: <strong className="text-gray-800">{formatTime(transcription.duration)}</strong></span>
        </div>
      </div>

      <div className="mb-4 rounded-lg bg-gray-50 p-4 text-sm text-gray-700 leading-relaxed">
        {transcription.text}
      </div>

      <details className="group">
        <summary className="cursor-pointer text-sm font-medium text-indigo-600 hover:text-indigo-700 select-none">
          Segmente anzeigen ({transcription.segments.length})
        </summary>
        <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
          {transcription.segments.map((seg, i) => (
            <div key={i} className="flex gap-3 text-sm">
              <span className="shrink-0 font-mono text-xs text-gray-400 pt-0.5 w-20">
                {formatTime(seg.start)} – {formatTime(seg.end)}
              </span>
              <span className="text-gray-700">{seg.text}</span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
