import { AbsoluteFill, Sequence, Video, useVideoConfig } from 'remotion';
import { SubtitleOverlay } from './SubtitleOverlay';
import { IllustrationSlide } from './IllustrationSlide';

export interface Scene {
  id: number;
  timestamp_start: number;
  timestamp_end: number;
  type: 'illustration' | 'talking_head';
  text_overlay: string;
  illustration_prompt: string;
  style: string;
}

export interface Segment {
  start: number;
  end: number;
  text: string;
}

export interface VideoCompositionProps {
  /** Pfad oder URL zum Originalvideo (optional — ohne Video nur Slides) */
  videoSrc?: string;
  /** Szenenplan aus der Claude-Analyse */
  scenes: Scene[];
  /** Whisper-Segmente für Untertitel */
  segments: Segment[];
}

/**
 * Haupt-Komposition: kombiniert Originalvideo, IllustrationSlides und Untertitel
 * auf der originalen Timeline basierend auf den Claude-Szenen-Timestamps.
 */
export function VideoComposition({ videoSrc, scenes, segments }: VideoCompositionProps) {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: '#000000' }}>

      {/* 1. Originalvideo als Basis-Layer */}
      {videoSrc && (
        <AbsoluteFill>
          <Video src={videoSrc} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </AbsoluteFill>
      )}

      {/* 2. Szenen-Overlays — IllustrationSlides überlagern das Video */}
      {scenes.map((scene) => {
        const from = Math.round(scene.timestamp_start * fps);
        const durationInFrames = Math.max(
          fps, // mindestens 1 Sekunde
          Math.round((scene.timestamp_end - scene.timestamp_start) * fps)
        );

        if (scene.type !== 'illustration') return null;

        return (
          <Sequence key={scene.id} from={from} durationInFrames={durationInFrames}>
            <IllustrationSlide
              text_overlay={scene.text_overlay}
              illustration_prompt={scene.illustration_prompt}
              style={scene.style}
            />
          </Sequence>
        );
      })}

      {/* 3. Untertitel immer oben */}
      {segments.length > 0 && (
        <SubtitleOverlay segments={segments} />
      )}

    </AbsoluteFill>
  );
}
