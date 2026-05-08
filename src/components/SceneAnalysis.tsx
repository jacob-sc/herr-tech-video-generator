'use client';

import { AnalysisResult } from '@/lib/claude';

interface Props {
  analysis: AnalysisResult;
  onRender?: () => void;
  rendering?: boolean;
}

const ACTION_STYLES = {
  keep: 'bg-green-100 text-green-800',
  cut: 'bg-red-100 text-red-800',
  shorten: 'bg-yellow-100 text-yellow-800',
} as const;

const ACTION_LABELS = {
  keep: 'Behalten',
  cut: 'Schneiden',
  shorten: 'Kürzen',
} as const;

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function SceneAnalysis({ analysis, onRender, rendering }: Props) {
  return (
    <div className="space-y-6">
      {/* Zusammenfassung */}
      <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-5">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-indigo-600">
          KI-Zusammenfassung
        </h2>
        <p className="text-gray-800">{analysis.overallSummary}</p>
        <p className="mt-2 text-sm text-indigo-700 font-medium">
          Geschätzte Endlänge nach Schnitt: {formatTime(analysis.estimatedFinalDuration)}
        </p>
      </div>

      {/* Szenen */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Szenenanalyse</h2>
        <div className="space-y-3">
          {analysis.scenes.map((scene, i) => (
            <div key={i} className="rounded-xl border border-gray-100 p-4 hover:border-gray-200 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-900">{scene.title}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ACTION_STYLES[scene.suggestedAction]}`}>
                      {ACTION_LABELS[scene.suggestedAction]}
                    </span>
                    <span className="text-xs text-gray-400 font-mono">
                      {formatTime(scene.startTime)} – {formatTime(scene.endTime)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">{scene.summary}</p>
                  <p className="mt-1 text-xs text-gray-400 italic">{scene.reason}</p>
                </div>
                <div className="shrink-0 flex flex-col items-center">
                  <div className={`text-lg font-bold ${scene.keepRating >= 7 ? 'text-green-600' : scene.keepRating >= 4 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {scene.keepRating}
                  </div>
                  <div className="text-xs text-gray-400">/10</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Edit-Tipps */}
      {analysis.editSuggestions.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <h2 className="mb-3 text-lg font-semibold text-gray-900">Schnitt-Empfehlungen</h2>
          <ul className="space-y-2">
            {analysis.editSuggestions.map((tip, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-700">
                <span className="text-indigo-400 shrink-0">→</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Render-Button */}
      {onRender && (
        <button
          onClick={onRender}
          disabled={rendering}
          className="w-full rounded-xl bg-indigo-600 py-3 px-6 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {rendering ? (
            <>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Video wird gerendert…
            </>
          ) : (
            'Video mit Remotion rendern'
          )}
        </button>
      )}
    </div>
  );
}
