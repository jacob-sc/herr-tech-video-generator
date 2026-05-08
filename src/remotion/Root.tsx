import { Composition } from 'remotion';
import { VideoComposition, VideoCompositionProps } from './components/VideoComposition';
import React from 'react';

const VideoCompositionAny = VideoComposition as any;

const EXAMPLE_SCENES = [
  {
    id: 1, timestamp_start: 0, timestamp_end: 4, type: 'illustration' as const,
    text_overlay: 'Deine Klinik verliert 15.000€/Monat',
    illustration_prompt: 'Modern clinic, warning icons, money flying away',
    style: 'flat design, dark background',
  },
  {
    id: 2, timestamp_start: 4, timestamp_end: 9, type: 'talking_head' as const,
    text_overlay: 'Das muss nicht so sein', illustration_prompt: '', style: 'dark background',
  },
  {
    id: 3, timestamp_start: 9, timestamp_end: 14, type: 'illustration' as const,
    text_overlay: 'KI löst das Problem automatisch',
    illustration_prompt: 'Futuristic AI interface, green checkmarks',
    style: 'flat design, dark background',
  },
];

const EXAMPLE_SEGMENTS = [
  { start: 0,  end: 2,  text: 'Deine Klinik verliert jeden Monat Geld.' },
  { start: 2,  end: 4,  text: 'Ineffiziente Prozesse kosten 15.000€.' },
  { start: 4,  end: 7,  text: 'Das muss nicht so sein.' },
  { start: 7,  end: 9,  text: 'Es gibt eine bessere Lösung.' },
  { start: 9,  end: 11, text: 'KI automatisiert deine Abläufe.' },
  { start: 11, end: 14, text: 'Und spart dir Zeit und Geld.' },
];

const DEFAULT_PROPS: VideoCompositionProps = {
  videoSrc: undefined,
  scenes: EXAMPLE_SCENES,
  segments: EXAMPLE_SEGMENTS,
};

/**
 * calculateMetadata berechnet durationInFrames dynamisch aus den übergebenen Props.
 * Das ist wichtig damit --props beim CLI-Render die korrekte Video-Länge setzen.
 */
async function calculateMetadata({ props }: { props: any }) {
  const fps = 30;
  const scenes = props.scenes?.length ? props.scenes : EXAMPLE_SCENES;
  const lastEnd = Math.max(...scenes.map((s: any) => s.timestamp_end));
  const durationInFrames = Math.round(lastEnd * fps) + fps; // +1s Puffer
  return { durationInFrames, fps, width: 1920, height: 1080 };
}

export function RemotionRoot() {
  return (
    <Composition
      id="Herr-Tech-VideoEditor"
      component={VideoCompositionAny}
      durationInFrames={Math.round(14 * 30) + 30} // Fallback für Studio-Preview
      fps={30}
      width={1920}
      height={1080}
      defaultProps={DEFAULT_PROPS}
      calculateMetadata={calculateMetadata}
    />
  );
}
