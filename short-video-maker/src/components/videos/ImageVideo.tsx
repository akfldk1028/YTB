import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";
import { z } from "zod";

loadFont();

export const imageVideoSchema = z.object({
  imagePath: z.string(),
  audioPath: z.string().optional(),
  subtitles: z.array(z.object({
    text: z.string(),
    start: z.number(),
    end: z.number(),
  })).optional(),
  title: z.string().optional(),
});

export type ImageVideoProps = z.infer<typeof imageVideoSchema>;

export const ImageVideo: React.FC<ImageVideoProps> = ({
  imagePath,
  audioPath,
  subtitles = [],
  title,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps, width, height } = useVideoConfig();

  // Ken Burns effect - slow zoom and pan
  const scale = interpolate(frame, [0, durationInFrames], [1, 1.2], {
    extrapolateRight: "clamp",
  });

  const translateX = interpolate(frame, [0, durationInFrames], [0, -20], {
    extrapolateRight: "clamp",
  });

  const translateY = interpolate(frame, [0, durationInFrames], [0, -10], {
    extrapolateRight: "clamp",
  });

  // Get current subtitle
  const currentTime = frame / fps;
  const currentSubtitle = subtitles.find(
    (sub) => currentTime >= sub.start && currentTime <= sub.end
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* Background Image with Ken Burns Effect */}
      <AbsoluteFill
        style={{
          transform: `scale(${scale}) translate(${translateX}px, ${translateY}px)`,
          transformOrigin: "center center",
        }}
      >
        <Img
          src={imagePath}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center",
          }}
        />
      </AbsoluteFill>

      {/* Dark overlay for text readability */}
      <AbsoluteFill
        style={{
          background: "linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.1) 50%, rgba(0,0,0,0.6) 100%)",
        }}
      />

      {/* Title */}
      {title && (
        <AbsoluteFill
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            paddingTop: height * 0.1,
            paddingLeft: width * 0.05,
            paddingRight: width * 0.05,
          }}
        >
          <div
            style={{
              fontSize: Math.min(width * 0.06, 48),
              fontWeight: "bold",
              color: "white",
              textAlign: "center",
              textShadow: "2px 2px 4px rgba(0,0,0,0.8)",
              fontFamily: "Inter",
              lineHeight: 1.2,
            }}
          >
            {title}
          </div>
        </AbsoluteFill>
      )}

      {/* Subtitle */}
      {currentSubtitle && (
        <AbsoluteFill
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            paddingBottom: height * 0.15,
            paddingLeft: width * 0.1,
            paddingRight: width * 0.1,
          }}
        >
          <div
            style={{
              fontSize: Math.min(width * 0.04, 32),
              fontWeight: "600",
              color: "white",
              textAlign: "center",
              backgroundColor: "rgba(0,0,0,0.7)",
              padding: "12px 20px",
              borderRadius: "8px",
              fontFamily: "Inter",
              lineHeight: 1.3,
              backdropFilter: "blur(4px)",
            }}
          >
            {currentSubtitle.text}
          </div>
        </AbsoluteFill>
      )}

      {/* Audio */}
      {audioPath && (
        <audio
          src={audioPath}
          autoPlay
          style={{
            position: "absolute",
            left: "-9999px",
            visibility: "hidden",
          }}
        />
      )}
    </AbsoluteFill>
  );
};