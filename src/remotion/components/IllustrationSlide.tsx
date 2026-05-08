import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

interface Props {
  text_overlay: string;
  illustration_prompt: string;
  style?: string;
}

/**
 * Vollbild-Szene mit dunklem Hintergrund, großem Text und Fade-in-Animation.
 * Farben: Schwarz/Dunkel als BG, Weiß als Text, Rot als Akzent.
 */
export function IllustrationSlide({ text_overlay, illustration_prompt, style }: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Fade-in: 0 → 1 in den ersten 0.4 Sekunden
  const opacity = interpolate(frame, [0, fps * 0.4], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Slide-up: 40px → 0px in den ersten 0.4 Sekunden
  const translateY = interpolate(frame, [0, fps * 0.4], [40, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Roter Akzentbalken erscheint etwas früher
  const accentOpacity = interpolate(frame, [0, fps * 0.25], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Stil aus dem style-String lesen: "flat design, dark background, red accent" → rote Akzentfarbe
  const accentColor = '#B598E2'; // Herr Tech Markenfarbe

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#0a0a0a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        padding: '80px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Roter Akzentbalken oben */}
      <div
        style={{
          width: 64,
          height: 5,
          backgroundColor: accentColor,
          borderRadius: 3,
          marginBottom: 40,
          opacity: accentOpacity,
        }}
      />

      {/* Haupt-Text groß und bold */}
      <div
        style={{
          opacity,
          transform: `translateY(${translateY}px)`,
          color: '#ffffff',
          fontSize: 80,
          fontWeight: 900,
          lineHeight: 1.1,
          textAlign: 'center',
          maxWidth: '80%',
          letterSpacing: '-1px',
        }}
      >
        {text_overlay}
      </div>

      {/* illustration_prompt ist nur ein internes Generations-Hint, nicht anzeigen */}

      {/* Dekorativer unterer Akzentbalken */}
      <div
        style={{
          position: 'absolute',
          bottom: 60,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 120,
          height: 2,
          backgroundColor: accentColor,
          opacity: accentOpacity * 0.4,
          borderRadius: 1,
        }}
      />
    </AbsoluteFill>
  );
}
