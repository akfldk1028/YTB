import z from "zod";

export enum MusicMoodEnum {
  sad = "sad",
  melancholic = "melancholic",
  happy = "happy",
  euphoric = "euphoric/high",
  excited = "excited",
  chill = "chill",
  uneasy = "uneasy",
  angry = "angry",
  dark = "dark",
  hopeful = "hopeful",
  contemplative = "contemplative",
  funny = "funny/quirky",
}

export enum CaptionPositionEnum {
  top = "top",
  center = "center",
  bottom = "bottom",
}

export type Scene = {
  captions: Caption[];
  englishCaptions?: Caption[];  // 🔥 이중 자막: 영어 자막
  video: string;
  audio: {
    url: string;
    duration: number;
  };
};

export const sceneInput = z.object({
  text: z.string().describe("Text to be spoken in the video"),
  textEnglish: z.string().optional().describe("English translation of text for dual subtitles"),
  searchTerms: z
    .array(z.string())
    .describe(
      "Search term for video, 1 word, and at least 2-3 search terms should be provided for each scene. Make sure to match the overall context with the word - regardless what the video search result would be.",
    ),
  imageData: z.object({
    data: z.string().optional().describe("Base64 encoded image data"),
    mimeType: z.string().optional().describe("MIME type of the image (e.g., image/jpeg, image/png)"),
    prompt: z.string().optional().describe("Image generation prompt"),
    style: z.string().optional().describe("Image generation style"),
    mood: z.string().optional().describe("Image generation mood"),
    generateMultiple: z.boolean().optional().describe("Whether to generate multiple images for consistency"),
    useConsistency: z.boolean().optional().describe("Whether to use consistency mode (alias for generateMultiple)"),
    count: z.number().optional().describe("Number of images to generate (default: 4)"),
    numberOfImages: z.number().optional().describe("Number of images to generate (alias for count)"),
  }).optional().describe("Optional image data for image-to-video generation"),
  needsImageGeneration: z.boolean().optional().describe("Whether this scene needs image generation"),
  video: z.string().optional().describe("Pre-existing video URL for this scene"),
  videoPrompt: z.string().optional().describe("Prompt for video generation"),
  // ⭐ Scene-level character specification for multi-character stories
  characterIds: z.array(z.string()).optional().describe("Character IDs to use in this scene (e.g., ['kkam-i'] or ['kkam-i', 'ddal-gi'])"),
});
export type SceneInput = z.infer<typeof sceneInput>;

export enum VoiceEnum {
  // 🔥 ElevenLabs Premade voices (FREE - 무료 사용 가능)
  el_rachel = "21m00Tcm4TlvDq8ikWAM",    // Female - American (DEFAULT, premade, FREE)
  el_adam = "pNInz6obpgDQGcFmaJgB",      // Male - American (premade, FREE)
  el_sam = "yoZ06aMxZJJ28mfd3POQ",       // Male - American (premade, FREE)

  // 🔥 ElevenLabs Shorts-optimized voices (유료 - Paid subscription required)
  el_arfa = "N8CqI3qXFmT0tJHnzlrq",      // Female - Reels/Shorts optimized
  el_axl = "baRq1qg6PxLsnSQ04d8c",       // Male - Energetic, cinematic
  el_anika = "ecp3DWciuUyW7BYM7II1",     // Female - Sweet & Lively
  el_ashley = "bxiObU1YDrf7lrFAyV99",    // Female - YouTube/TikTok
  el_brittney = "kPzsL2i3teMYv0FxEYQ6",  // Female - Social media
  el_arthur = "TtRFBnwQdH1k01vR0hMz",    // Male - Social media optimized
  el_aiden = "dyTPmGzuLaJM15vpN3DS",     // Male - Happy Video
  el_snap = "gWaDC0oXAheKoZfljzuI",      // Male - Vibrant Energy
  el_ash = "2TgCsDinEcLJ95vqmLKm",       // Male - YouTube, natural
}

export enum OrientationEnum {
  landscape = "landscape",
  portrait = "portrait",
}

export enum MusicVolumeEnum {
  muted = "muted",
  low = "low",
  medium = "medium",
  high = "high",
}

export const renderConfig = z.object({
  paddingBack: z
    .number()
    .optional()
    .describe(
      "For how long the video should be playing after the speech is done, in milliseconds. 1500 is a good value.",
    ),
  music: z
    .nativeEnum(MusicMoodEnum)
    .optional()
    .describe("Music tag to be used to find the right music for the video"),
  captionPosition: z
    .nativeEnum(CaptionPositionEnum)
    .optional()
    .describe("Position of the caption in the video"),
  captionBackgroundColor: z
    .string()
    .optional()
    .describe(
      "Background color of the caption, a valid css color, default is blue",
    ),
  voice: z
    .nativeEnum(VoiceEnum)
    .optional()
    .describe("Voice to be used for the speech. Kokoro (af_heart, etc) or ElevenLabs (el_axl, etc)"),
  orientation: z
    .nativeEnum(OrientationEnum)
    .optional()
    .describe("Orientation of the video, default is portrait"),
  musicVolume: z
    .nativeEnum(MusicVolumeEnum)
    .optional()
    .describe("Volume of the music, default is high"),
  videoSource: z
    .enum(["pexels", "veo", "leonardo", "both", "ffmpeg"])
    .optional()
    .describe("Video source for this specific request"),
});
export type RenderConfig = z.infer<typeof renderConfig>;

export type Voices = `${VoiceEnum}`;

export type Video = {
  id: string;
  url: string;
  width: number;
  height: number;
};
export type Caption = {
  text: string;
  startMs: number;
  endMs: number;
};

/**
 * 🔥 Sound Effect Configuration
 * Supports ElevenLabs Sound Effects API
 */
export type SoundEffectConfig = {
  /** Sound effect type: preset, custom, or transition */
  type: 'preset' | 'custom' | 'transition';
  /** Preset name (WHOOSH, CAT_MEOW, etc.) or custom description */
  value: string;
  /** Start time in seconds (relative to scene or video) */
  startTime: number;
  /** Duration in seconds (optional, auto if not specified) */
  duration?: number;
  /** Volume level (0.0 to 1.0, default 0.5) */
  volume?: number;
};

/**
 * 🔥 Audio Configuration for video generation
 */
export type AudioConfig = {
  /** Background music settings */
  backgroundMusic?: {
    /** Music mood for auto-selection or URL for custom */
    source: MusicMoodEnum | string;
    /** Volume level (0.0 to 1.0, default 0.2) */
    volume?: number;
    /** Loop music throughout video */
    loop?: boolean;
  };
  /** Sound effects to overlay on TTS audio */
  soundEffects?: SoundEffectConfig[];
  /** Scene transition sound effect (applies between all scenes) */
  transitionSound?: {
    /** Type: whoosh, ding, pop, swipe */
    type: 'whoosh' | 'ding' | 'pop' | 'swipe';
    /** Volume level (0.0 to 1.0, default 0.5) */
    volume?: number;
  };
};

export type CaptionLine = {
  texts: Caption[];
};
export type CaptionPage = {
  startMs: number;
  endMs: number;
  lines: CaptionLine[];
};

export const createShortInput = z.object({
  scenes: z.array(sceneInput).describe("Each scene to be created"),
  config: renderConfig.describe("Configuration for rendering the video"),
});
export type CreateShortInput = z.infer<typeof createShortInput>;

export type VideoStatus = "processing" | "ready" | "failed";

export type Music = {
  file: string;
  start: number;
  end: number;
  mood: string;
};
export type MusicForVideo = Music & {
  url: string;
};

export type MusicTag = `${MusicMoodEnum}`;

export type kokoroModelPrecision = "fp32" | "fp16" | "q8" | "q4" | "q4f16";

export type whisperModels =
  | "tiny"
  | "tiny.en"
  | "base"
  | "base.en"
  | "small"
  | "small.en"
  | "medium"
  | "medium.en"
  | "large-v1"
  | "large-v2"
  | "large-v3"
  | "large-v3-turbo";

/**
 * ⭐ Title Text Configuration (상단 제목/Hook)
 * 숏츠 어그로용 상단 제목 텍스트 설정
 */
export type TitleTextConfig = {
  /** 한국어 제목 (필수) */
  ko: string;
  /** 영어 제목 (선택) */
  en?: string;
  /** 위치: top (기본) 또는 center */
  position?: 'top' | 'center';
  /** 스타일: highlight (노란 배경, 기본) 또는 default (흰색 텍스트) */
  style?: 'highlight' | 'default';
  /** 표시 시간: 'full' (전체, 기본) 또는 초 단위 숫자 */
  duration?: 'full' | number;
  /** 폰트 크기 (기본: 42) */
  fontSize?: number;
  /** 배경색 (기본: #FFEB3B 노란색) */
  backgroundColor?: string;
  /** 텍스트 색 (기본: #000000 검정) */
  textColor?: string;
};

/**
 * ⭐ Multi-Character Scene Support
 * 다중 캐릭터 씬 처리를 위한 타입 정의
 */

/** 개별 캐릭터 이미지 정보 */
export type CharacterImageInfo = {
  characterId: string;
  data: Buffer;
  mimeType: string;
  description: string;
};

/** 씬별 캐릭터 이미지 정보 (N개 캐릭터 지원) */
export type SceneCharacterImages = {
  /** 씬에 포함된 캐릭터 ID 목록 */
  characterIds: string[];
  /** 각 캐릭터의 이미지 정보 */
  images: CharacterImageInfo[];
  /** 단일 캐릭터 씬 여부 */
  isSingleCharacter: boolean;
  /** 다중 캐릭터 씬 여부 */
  isMultiCharacter: boolean;
  /** 캐릭터 수 */
  characterCount: number;
};
