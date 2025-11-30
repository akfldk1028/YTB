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
  video: string;
  audio: {
    url: string;
    duration: number;
  };
};

export const sceneInput = z.object({
  text: z.string().describe("Text to be spoken in the video"),
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
});
export type SceneInput = z.infer<typeof sceneInput>;

export enum VoiceEnum {
  // 🔥 ElevenLabs Shorts-optimized voices (Recommended for YouTube Shorts/TikTok/Reels)
  el_arfa = "N8CqI3qXFmT0tJHnzlrq",      // Female - Reels/Shorts optimized
  el_axl = "baRq1qg6PxLsnSQ04d8c",       // Male - Energetic, cinematic (DEFAULT, recommended)
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
