import {
  AbsoluteFill,
  Sequence,
  Series,
  useCurrentFrame,
  useVideoConfig,
  Audio,
  OffthreadVideo,
  interpolate,
  spring,
} from "remotion";
import { z } from "zod";
import { loadFont } from "@remotion/google-fonts/BarlowCondensed";
import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";

import {
  calculateVolume,
  createCaptionPages,
  shortVideoSchema,
} from "../utils";

const { fontFamily } = loadFont(); // "Barlow Condensed"
const { fontFamily: montserratFont } = loadMontserrat(); // Modern Shorts font

// 🔥 TikTok/Shorts 스타일 색상 팔레트
const SHORTS_COLORS = {
  yellow: '#FFEB3B',      // 밝은 노란색 - 에너지 넘침
  green: '#00E676',       // 네온 그린 - 신선함
  pink: '#FF4081',        // 핫 핑크 - 눈에 띔
  cyan: '#00BCD4',        // 시안 - 시원함
  orange: '#FF9800',      // 오렌지 - 따뜻함
  purple: '#E040FB',      // 퍼플 - 세련됨
  white: '#FFFFFF',       // 흰색 기본
};

export const PortraitVideo: React.FC<z.infer<typeof shortVideoSchema>> = ({
  scenes,
  music,
  config,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // 🔥 숏츠 스타일 하이라이트 색상 (기본: 노란색으로 변경)
  const captionBackgroundColor = config.captionBackgroundColor ?? SHORTS_COLORS.yellow;

  // 🔥 TikTok 스타일 팝업 효과 active 스타일
  const activeStyle = {
    backgroundColor: captionBackgroundColor,
    color: captionBackgroundColor === SHORTS_COLORS.yellow ? '#000' : '#FFF', // 노란색이면 검정 글씨
    padding: "12px 16px",
    marginLeft: "-8px",
    marginRight: "-8px",
    borderRadius: "12px",
    transform: "scale(1.15)", // 🔥 팝업 효과!
    display: "inline-block",
    boxShadow: "0 4px 20px rgba(0,0,0,0.4)", // 입체감
  };

  const captionPosition = config.captionPosition ?? "center";
  let captionStyle = {};
  if (captionPosition === "top") {
    captionStyle = { top: 120 };
  }
  if (captionPosition === "center") {
    captionStyle = { top: "50%", transform: "translateY(-50%)" };
  }
  if (captionPosition === "bottom") {
    captionStyle = { bottom: 150 }; // 🔥 조금 더 위로 (Shorts 안전 영역)
  }

  const [musicVolume, musicMuted] = calculateVolume(config.musicVolume);

  return (
    <AbsoluteFill style={{ backgroundColor: "white" }}>
      <Audio
        loop
        src={music.url}
        delayRenderTimeoutInMilliseconds={300000}
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
            lineMaxLength: 20,
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
                <OffthreadVideo src={video} muted delayRenderTimeoutInMilliseconds={300000} />
                <Audio src={audio.url} delayRenderTimeoutInMilliseconds={300000} />
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
                                fontSize: "5.5em", // 🔥 약간 줄여서 가독성 향상
                                fontFamily: montserratFont, // 🔥 더 모던한 폰트
                                fontWeight: 900, // 🔥 최대 굵기
                                color: "white",
                                WebkitTextStroke: "4px black", // 🔥 더 두꺼운 테두리
                                WebkitTextFillColor: "white",
                                textShadow: "0px 4px 20px rgba(0,0,0,0.8), 0px 0px 40px rgba(0,0,0,0.5)", // 🔥 더 강한 그림자
                                textAlign: "center",
                                width: "100%",
                                textTransform: "uppercase",
                                letterSpacing: "2px", // 🔥 글자 간격
                                lineHeight: 1.3,
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
                                        fontWeight: 900,
                                        transition: "all 0.1s ease-out", // 🔥 부드러운 전환
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
