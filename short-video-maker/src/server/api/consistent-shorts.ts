import express from "express";
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";

import { validateCreateShortInput } from "../validator";
import { ShortCreator } from "../../short-creator";
import { logger } from "../../logger";
import { Config } from "../../config";

/**
 * Consistent Shorts API Router
 *
 * This endpoint creates shorts with CHARACTER CONSISTENCY using Nano Banana's
 * reference image feature (inspired by Image_out.ipynb chat mode).
 *
 * Key features:
 * - Maintains the same character across all scenes
 * - Uses previous images as references (max 3)
 * - Optional VEO3 I2V conversion
 * - Perfect for storytelling with consistent characters
 */
export class ConsistentShortsAPIRouter {
  public router: express.Router;
  private shortCreator: ShortCreator;
  private config: Config;

  constructor(config: Config, shortCreator: ShortCreator) {
    this.config = config;
    this.router = express.Router();
    this.shortCreator = shortCreator;

    this.router.use(express.json());
    this.setupRoutes();
  }

  private setupRoutes() {
    /**
     * POST /api/video/consistent-shorts
     *
     * Creates a video with consistent character across all scenes
     *
     * Request Body:
     * {
     *   "character": {
     *     "description": "A young female astronaut with blonde hair...",
     *     "style": "cinematic",
     *     "mood": "adventurous",
     *     "referencePrompts": ["front view", "side view"] // Optional: generate reference set
     *   },
     *   "characterReference": {   // ⭐ NEW: Use stored character profile
     *     "profileId": "otter-couple",
     *     "characterIds": ["husband", "wife"]  // Optional: specific characters
     *   },
     *   "titleText": {  // 🔥 NEW: 상단 제목 (숏츠 어그로용)
     *     "ko": "호텔 조식에 진심인 부부 커플 특징",  // 한국어 제목 (필수)
     *     "en": "Couple's hotel breakfast enthusiasm",  // 영어 (선택)
     *     "position": "top",           // top | center (기본: top)
     *     "style": "highlight",        // highlight (노란배경) | default (흰텍스트)
     *     "duration": "full",          // "full" | 초 단위 숫자
     *     "fontSize": 42,              // 폰트 크기 (기본: 42)
     *     "backgroundColor": "#FFEB3B" // 배경색 (기본: 노란색)
     *   },
     *   "scenes": [
     *     {
     *       "text": "우주에서 떠다니는 외로운 우주비행사",
     *       "textEnglish": "A lonely astronaut floating in space", // 🔥 Optional: English subtitles
     *       "scenePrompt": "Floating in deep space with Earth in background",
     *       "duration": 3
     *     }
     *   ],
     *   "config": {
     *     "orientation": "landscape",
     *     "voice": "am_adam",
     *     "generateVideos": true,  // If true, use VEO3 I2V
     *     "useFrameInterpolation": true, // VEO 3.1 First+Last Frame (smooth scene transitions)
     *     "useStoredImageForVeo": true, // ⭐ Use stored character image directly for VEO (skip NANO BANANA)
     *     "useReferenceSet": false // If true, generate reference images first
     *   },
     *   "audio_config": {  // 🔥 NEW: Sound effects and background music
     *     "transitionSound": { "type": "whoosh", "volume": 0.5 },  // Between scenes
     *     "soundEffects": [
     *       { "type": "preset", "value": "CAT_MEOW", "startTime": 2.5, "volume": 0.7 }
     *     ],
     *     "backgroundMusic": { "source": "chill", "volume": 0.2, "loop": true }
     *   },
     *   "webhook_url": "https://your-n8n-webhook.com/callback"
     * }
     */
    this.router.post(
      "/",
      async (req: ExpressRequest, res: ExpressResponse) => {
        try {
          logger.info("Processing CONSISTENT SHORTS request (character consistency mode)");

          const { character, characterReference, titleText, scenes, config, webhook_url, callback_url, elevenlabs_config, video_config, audio_config } = req.body;

          // 🔥 DEBUG: Check if Korean text is corrupted at API entry
          if (scenes && scenes.length > 0 && scenes[0].text) {
            const firstText = scenes[0].text;
            const firstCharCode = firstText.charCodeAt(0);
            const textHex = firstText.substring(0, 5).split('').map((c: string) => c.charCodeAt(0).toString(16)).join(',');
            const hasKorean = /[\uac00-\ud7af]/.test(firstText);
            logger.info({
              firstCharCode,
              textHex,
              textLength: firstText.length,
              hasKorean,
              rawText: firstText.substring(0, 20)
            }, "🔥 DEBUG API ENTRY: Korean text check at request entry");
          }

          // Validation: Need either character description OR characterReference (stored profile)
          const hasCharacterDescription = character && character.description;
          const hasStoredProfile = characterReference && characterReference.profileId;

          if (!hasCharacterDescription && !hasStoredProfile) {
            res.status(400).json({
              error: "Missing character information",
              message: "Please provide either character.description OR characterReference.profileId for consistent character generation"
            });
            return;
          }

          if (!scenes || !Array.isArray(scenes) || scenes.length === 0) {
            res.status(400).json({
              error: "Missing scenes",
              message: "Please provide at least one scene"
            });
            return;
          }

          const callbackUrl = webhook_url || callback_url;

          // Determine character description and style
          // If using stored profile (characterReference), the description will be loaded by ConsistentShortsWorkflow
          // If using inline character, use it directly
          const characterDescription = character?.description || `Character from profile: ${characterReference?.profileId}`;
          const characterStyle = character?.style || "pixar";
          const characterMood = character?.mood || "dynamic";

          // Prepare scenes with character consistency flags
          const processedScenes = scenes.map((scene: any, index: number) => ({
            text: scene.text || scene.scenePrompt || `Scene ${index + 1}`,
            textEnglish: scene.textEnglish || scene.englishText || undefined, // 🔥 이중 자막용 영어 텍스트
            searchTerms: [], // Not used in consistent mode

            // Image generation data with character info
            imageData: {
              // When using characterReference, the actual prompt will be built by ConsistentShortsWorkflow
              // using the stored character descriptions from GCS
              prompt: hasStoredProfile
                ? scene.scenePrompt || scene.text  // Scene only, profile loaded separately
                : (index === 0
                  ? characterDescription // First scene: full character description
                  : `${characterDescription}. ${scene.scenePrompt || scene.text}`), // Subsequent: char + scene
              style: characterStyle,
              mood: characterMood,
              numberOfImages: 1,

              // Character consistency metadata
              isCharacterConsistent: true,
              characterDescription: characterDescription,
              sceneIndex: index,

              // Flag to indicate using stored profile
              useStoredProfile: hasStoredProfile
            },

            // Video generation (if enabled)
            videoPrompt: scene.scenePrompt || scene.text,

            // Mark as needing image generation
            needsImageGeneration: true,

            // ⭐ Scene-level character IDs (for multi-character stories)
            characterIds: scene.characterIds,

            // 🔥 Scene duration (for skipTTS mode - used by ConsistentShortsWorkflow)
            duration: scene.duration
          }));

          const validationInput = {
            scenes: processedScenes,
            config: {
              orientation: video_config?.orientation || config?.orientation || "portrait",
              voice: elevenlabs_config?.voice || config?.voice || "baRq1qg6PxLsnSQ04d8c",
              musicVolume: video_config?.musicVolume || config?.musicVolume || "low",
              subtitlePosition: video_config?.subtitlePosition || config?.subtitlePosition || "bottom",

              // IMPORTANT: Always use "ffmpeg" for consistent shorts
              // The ConsistentShortsWorkflow handles NANO BANANA image generation internally
              // and optionally converts to VEO3 if metadata.generateVideos=true
              videoSource: "ffmpeg",

              // Caption background color (TikTok style)
              captionBackgroundColor: video_config?.captionBackgroundColor || "#FFEB3B",

              // ElevenLabs TTS settings
              elevenlabs: elevenlabs_config ? {
                model_id: elevenlabs_config.model_id || "eleven_multilingual_v2",
                voice: elevenlabs_config.voice,
                voice_settings: elevenlabs_config.voice_settings || {
                  stability: 0.7,
                  similarity_boost: 0.8,
                  speed: 1.0,
                  style: "narration"
                },
                output_format: elevenlabs_config.output_format || "mp3"
              } : undefined,

              ...config
            }
          };

          const input = validateCreateShortInput(validationInput);

          logger.info({
            scenesCount: input.scenes.length,
            mode: "consistent-shorts",
            generateVideos: config?.generateVideos || false,
            useFrameInterpolation: config?.useFrameInterpolation || false
          }, "API endpoint - About to call shortCreator.addToQueue");

          const videoId = this.shortCreator.addToQueue(
            input.scenes,
            input.config,
            callbackUrl,
            {
              mode: "consistent-shorts",
              characterDescription: character?.description,
              characterStyle: character?.style,
              useReferenceSet: config?.useReferenceSet || false,
              generateVideos: config?.generateVideos || false,
              // ⭐ VEO 3.1 First+Last Frame interpolation (smooth scene transitions)
              useFrameInterpolation: config?.useFrameInterpolation || false,
              // ⭐ Use stored character image directly for VEO (skip NANO BANANA)
              useStoredImageForVeo: config?.useStoredImageForVeo || false,
              // 🔥 Scene transition effects (xfade: fade, dissolve, wipeleft, etc.)
              useSceneTransitions: config?.useSceneTransitions ?? true, // Default: enabled
              sceneTransitionType: config?.sceneTransitionType || 'fade',
              sceneTransitionDuration: config?.sceneTransitionDuration || 0.5,
              youtubeUpload: req.body.youtubeUpload,
              // ⭐ Stored character profile support
              characterProfileId: characterReference?.profileId,
              characterIds: characterReference?.characterIds,
              // 🔥 Audio configuration (sound effects, background music)
              audioConfig: audio_config,
              // 🔥 상단 제목 (숏츠 어그로용)
              titleText: titleText,
              // 🔥 Title text language selection (english | korean)
              language: config?.language || 'korean'
            }
          );

          logger.info({ videoId }, "API endpoint - shortCreator.addToQueue returned");

          const useFrameInterpolation = config?.useFrameInterpolation || false;
          const generateVideos = config?.generateVideos || false;
          const useStoredImageForVeo = config?.useStoredImageForVeo || false;

          logger.info({
            videoId,
            mode: "consistent-shorts",
            sceneCount: scenes.length,
            generateVideos,
            useFrameInterpolation,
            useStoredImageForVeo
          }, useStoredImageForVeo
            ? "✨ CONSISTENT SHORTS video queued with STORED CHARACTER IMAGE for VEO"
            : useFrameInterpolation
              ? "✨ CONSISTENT SHORTS video queued with VEO 3.1 First+Last Frame interpolation"
              : "✨ CONSISTENT SHORTS video queued");

          res.status(201).json({
            videoId,
            mode: "consistent-shorts",
            sceneCount: scenes.length,
            characterDescription: character?.description,
            characterProfileId: characterReference?.profileId,
            characterIds: characterReference?.characterIds,
            generateVideos,
            useFrameInterpolation,
            useStoredImageForVeo,
            titleText: titleText ? { ko: titleText.ko, en: titleText.en } : undefined,
            veoMode: useFrameInterpolation ? "VEO 3.1 (First+Last Frame)" : (generateVideos ? "VEO 3 (First Frame only)" : "none"),
            imageMode: useStoredImageForVeo ? "Stored Character Image → VEO" : "NANO BANANA Generated → VEO",
            message: characterReference?.profileId
              ? `Consistent character video generation started using stored profile '${characterReference.profileId}'.`
              : "Consistent character video generation started. All scenes will feature the same character."
          });

        } catch (error: unknown) {
          logger.error(error, "Error processing CONSISTENT SHORTS request");
          res.status(400).json({
            error: error instanceof Error ? error.message : "Consistent shorts processing failed"
          });
        }
      }
    );

    /**
     * GET /api/video/consistent-shorts/:videoId/status
     *
     * Get status of consistent shorts video generation
     */
    this.router.get(
      "/:videoId/status",
      async (req: ExpressRequest, res: ExpressResponse) => {
        const { videoId } = req.params;

        if (!videoId) {
          res.status(400).json({
            error: "videoId is required",
          });
          return;
        }

        try {
          const status = this.shortCreator.status(videoId);
          const detailedStatus = this.shortCreator.getDetailedStatus(videoId);

          res.status(200).json({
            status,
            mode: "consistent-shorts",
            ...detailedStatus
          });
        } catch (error: unknown) {
          logger.error(error, "Error getting CONSISTENT SHORTS video status");
          res.status(404).json({
            error: "Video not found or error getting status",
            message: error instanceof Error ? error.message : "Unknown error"
          });
        }
      }
    );

    /**
     * POST /api/video/consistent-shorts/reference-set
     *
     * Generate a reference image set for character consistency
     * (Similar to Image_out.ipynb but server-side)
     *
     * Request Body:
     * {
     *   "character": {
     *     "description": "A young female astronaut...",
     *     "style": "cinematic"
     *   },
     *   "variations": {
     *     "angles": ["front view", "45 degree", "side profile"],
     *     "expressions": ["neutral", "smile", "focused"],
     *     "compositions": ["upper body", "full body"]
     *   },
     *   "count": 12
     * }
     */
    this.router.post(
      "/reference-set",
      async (req: ExpressRequest, res: ExpressResponse) => {
        try {
          logger.info("Processing REFERENCE SET generation request");

          const { character, variations, count = 12 } = req.body;

          if (!character || !character.description) {
            res.status(400).json({
              error: "Missing character description"
            });
            return;
          }

          // Forward to image generation service
          const imageGenResponse = await fetch(
            `http://localhost:${this.config.port}/api/images/generate-reference-set`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                baseCharacter: character.description,
                count,
                variations: variations || {
                  angles: ["front view", "45 degree angle", "side profile", "three-quarter view"],
                  expressions: ["neutral expression", "gentle smile", "focused expression"],
                  compositions: ["upper body shot", "full body shot"],
                  lighting: ["soft lighting", "dramatic lighting", "natural lighting"]
                }
              })
            }
          );

          const result = await imageGenResponse.json();

          if (!imageGenResponse.ok) {
            res.status(500).json({
              error: "Reference set generation failed",
              details: result
            });
            return;
          }

          res.json({
            success: true,
            characterDescription: character.description,
            ...result
          });

        } catch (error: unknown) {
          logger.error(error, "Error generating reference set");
          res.status(500).json({
            error: error instanceof Error ? error.message : "Reference set generation failed"
          });
        }
      }
    );
  }
}
