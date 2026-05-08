import { AbsoluteFill, Video, useVideoConfig, Sequence } from 'remotion';
import { AnalysisResult } from '../lib/claude';

interface Props {
  videoPath: string;
  analysis: AnalysisResult;
}

export function VideoComposition({ videoPath, analysis }: Props) {
  const { fps } = useVideoConfig();

  // Nur "keep" und "shorten" Szenen rendern
  const keptScenes = analysis.scenes.filter(
    (s) => s.suggestedAction !== 'cut'
  );

  let currentFrame = 0;

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {keptScenes.map((scene, i) => {
        const startSec = scene.startTime;
        const endSec =
          scene.suggestedAction === 'shorten'
            ? scene.startTime + (scene.endTime - scene.startTime) * 0.6
            : scene.endTime;

        const durationFrames = Math.max(1, Math.round((endSec - startSec) * fps));
        const fromFrame = currentFrame;
        currentFrame += durationFrames;

        return (
          <Sequence key={i} from={fromFrame} durationInFrames={durationFrames}>
            <AbsoluteFill>
              <Video src={videoPath} startFrom={Math.round(startSec * fps)} />
            </AbsoluteFill>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}
