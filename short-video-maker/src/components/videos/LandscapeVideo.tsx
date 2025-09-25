import {
  AbsoluteFill,
  Sequence,
  Series,
  useCurrentFrame,
  useVideoConfig,
  Audio,
  OffthreadVideo,
} from "remotion";
import { z } from "zod";
import { loadFont } from "@remotion/google-fonts/BarlowCondensed";

import {
  calculateVolume,
  createCaptionPages,
  shortVideoSchema,
} from "../utils";

const { fontFamily } = loadFont(); // "Barlow Condensed"

export const LandscapeVideo: React.FC<z.infer<typeof shortVideoSchema>> = ({
  scenes,
  music,
  config,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const captionBackgroundColor = config.captionBackgroundColor ?? "blue";

  const activeStyle = {
    backgroundColor: captionBackgroundColor,
    padding: "10px",
    marginLeft: "-10px",
    marginRight: "-10px",
    borderRadius: "10px",
  };

  const captionPosition = config.captionPosition ?? "center";
  let captionStyle = {};
  if (captionPosition === "top") {
    captionStyle = { top: 100 };
  }
  if (captionPosition === "center") {
    captionStyle = { top: "50%", transform: "translateY(-50%)" };
  }
  if (captionPosition === "bottom") {
    captionStyle = { bottom: 100 };
  }

  const [musicVolume, musicMuted] = calculateVolume(config.musicVolume);

  return (
    <AbsoluteFill style={{ backgroundColor: "white" }}>
      <Audio
        loop
        src={music.url}
        delayRenderTimeoutInMilliseconds={60000}
        startFrom={music.start * fps}
        endAt={music.end * fps}
        volume={() => musicVolume}
        muted={musicMuted}
      />

      <Series>
        {scenes.map((scene, i) => {
          const { captions, audio, video } = scene;
          const pages = createCaptionPages({
            captions,
            lineMaxLength: 30,
            lineCount: 1,
            maxDistanceMs: 1000,
          });

          // Each scene duration in frames
          let sceneDurationInFrames = scene.audio.duration * fps;
          if (config.paddingBack && i === scenes.length - 1) {
            sceneDurationInFrames += (config.paddingBack / 1000) * fps;
          }

          return (
            <Series.Sequence 
              durationInFrames={Math.round(sceneDurationInFrames)}
              key={`scene-${i}`}
            >
              <AbsoluteFill>
                <OffthreadVideo src={video} muted delayRenderTimeoutInMilliseconds={60000} />
                <Audio src={audio.url} delayRenderTimeoutInMilliseconds={60000} />
                {pages.map((page, j) => {
                  return (
                    <Sequence
                      key={`scene-${i}-page-${j}`}
                      from={Math.round((page.startMs / 1000) * fps)}
                      durationInFrames={Math.round(
                        ((page.endMs - page.startMs) / 1000) * fps,
                      )}
                    >
                      <div
                        style={{
                          position: "absolute",
                          left: 0,
                          width: "100%",
                          ...captionStyle,
                        }}
                      >
                        {page.lines.map((line, k) => {
                          return (
                            <p
                              style={{
                                fontSize: "8em",
                                fontFamily: fontFamily,
                                fontWeight: "black",
                                color: "white",
                                WebkitTextStroke: "2px black",
                                WebkitTextFillColor: "white",
                                textShadow: "0px 0px 10px black",
                                textAlign: "center",
                                width: "100%",
                                // uppercase
                                textTransform: "uppercase",
                              }}
                              key={`scene-${i}-page-${j}-line-${k}`}
                            >
                              {line.texts.map((text, l) => {
                                const currentSceneFrame = useCurrentFrame();
                                const active =
                                  currentSceneFrame >=
                                    (text.startMs / 1000) * fps &&
                                  currentSceneFrame <= (text.endMs / 1000) * fps;
                                return (
                                  <>
                                    <span
                                      style={{
                                        fontWeight: "bold",
                                        ...(active ? activeStyle : {}),
                                      }}
                                      key={`scene-${i}-page-${j}-line-${k}-text-${l}`}
                                    >
                                      {text.text}
                                    </span>
                                    {l < line.texts.length - 1 ? " " : ""}
                                  </>
                                );
                              })}
                            </p>
                          );
                        })}
                      </div>
                    </Sequence>
                  );
                })}
              </AbsoluteFill>
            </Series.Sequence>
          );
        })}
      </Series>
    </AbsoluteFill>
  );
};
