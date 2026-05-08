import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

interface Segment {
  start: number;
  end: number;
  text: string;
}

interface Props {
  segments: Segment[];
}

/**
 * Animierte Untertitel die basierend auf den Whisper-Timestamps ein- und ausgeblendet werden.
 * Erscheint unten mittig, mit sanftem Fade-in pro Segment.
 */
export function SubtitleOverlay({ segments }: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const currentTime = frame / fps;

  // Aktives Segment zur aktuellen Zeit finden
  const currentSegment = segments.find(
    (s) => currentTime >= s.start && currentTime < s.end
  );

  if (!currentSegment) return null;

  // Frame innerhalb des aktuellen Segments
  const segmentFrame = frame - Math.round(currentSegment.start * fps);

  // Fade-in: erste 4 Frames
  const fadeIn = interpolate(segmentFrame, [0, 4], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Fade-out: letzte 4 Frames des Segments
  const segmentDuration = Math.round((currentSegment.end - currentSegment.start) * fps);
  const fadeOut = interpolate(segmentFrame, [segmentDuration - 4, segmentDuration], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const opacity = Math.min(fadeIn, fadeOut);

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        paddingBottom: 80,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.82)',
          color: '#ffffff',
          padding: '16px 48px',
          borderRadius: 8,
          fontSize: 42,
          fontWeight: 600,
          maxWidth: '75%',
          textAlign: 'center',
          opacity,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          lineHeight: 1.3,
          textShadow: '0 2px 8px rgba(0,0,0,0.8)',
        }}
      >
        {currentSegment.text}
      </div>
    </AbsoluteFill>
  );
}
