import fs from "fs-extra";
import path from "path";
import cuid from "cuid";
import { BaseWorkflow, WorkflowContext, WorkflowResult } from "./BaseWorkflow";
import { VideoProcessor } from "../processors/VideoProcessor";
import { GoogleVeoAPI } from "../libraries/GoogleVeo";
import { VIDEO_DIMENSIONS } from "../utils/Constants";
import { logger } from "../../logger";
import { ImageGenerationService } from "../../image-generation/services/ImageGenerationService";
import { ImageModelType } from "../../image-generation/models/imageModels";
import { CharacterStorageService } from "../../character-store/CharacterStorageService";
import type { CharacterProfile, Character } from "../../character-store/types";
import type { Scene, SceneInput, AudioConfig, SoundEffectConfig, SceneCharacterImages, CharacterImageInfo, TitleTextConfig } from "../../types/shorts";
import { ElevenLabsSoundEffects, SoundEffectPresets } from "../libraries/elevenlabs-tts";

/**
 * Minimum scene duration in seconds.
 * VEO3 generates 6-second videos minimum, so we use 5 seconds to ensure
 * good video content even when TTS audio is shorter.
 *
 * Scene duration = Math.max(audioDuration, MIN_SCENE_DURATION)
 * - If audio is 1.5s → scene plays for 5s (audio at start, video continues)
 * - If audio is 7s → scene plays for 7s (audio matches video)
 */
const MIN_SCENE_DURATION = 5;

/**
 * Consistent Shorts Workflow
 *
 * Inspired by Image_out.ipynb Chat Mode:
 * - Generates images with CHARACTER CONSISTENCY
 * - Uses previous images as references (max 3)
 * - Optional VEO3 I2V conversion
 * - Perfect for storytelling with same character
 *
 * How it works (like Chat Mode in ipynb):
 * Scene 1: Generate character image (no references)
 * Scene 2: Generate with Scene 1 as reference → same character!
 * Scene 3: Generate with Scene 1, 2 as references → same character!
 * Scene 4: Generate with Scene 2, 3 as references (max 3) → same character!
 */
export class ConsistentShortsWorkflow extends BaseWorkflow {
  constructor(
    private videoProcessor: VideoProcessor,
    private imageGenerationService?: ImageGenerationService,
    private veoAPI?: GoogleVeoAPI,
    private characterStorage?: CharacterStorageService
  ) {
    super();
  }

  /**
   * 🔥 Generate English captions synced to Korean audio timing
   * Uses Korean TTS captions timing with English text
   */
  private generateSyncedEnglishCaptions(
    englishText: string,
    koreanCaptions: any[],
    totalDuration: number
  ): any[] {
    if (!englishText || !koreanCaptions || koreanCaptions.length === 0) {
      return [];
    }

    const englishWords = englishText.split(/\s+/).filter(w => w.trim());
    if (englishWords.length === 0) return [];

    const firstCaption = koreanCaptions[0];
    const lastCaption = koreanCaptions[koreanCaptions.length - 1];
    const koreanStartTime = firstCaption?.startMs ?? (firstCaption?.start ? firstCaption.start * 1000 : 0);
    const koreanEndTime = lastCaption?.endMs ?? (lastCaption?.end ? lastCaption.end * 1000 : totalDuration * 1000);
    const totalTime = koreanEndTime - koreanStartTime;
    const timePerWord = totalTime / englishWords.length;

    const englishCaptions: any[] = [];

    for (let i = 0; i < englishWords.length; i++) {
      englishCaptions.push({
        text: englishWords[i],
        startMs: koreanStartTime + (i * timePerWord),
        endMs: koreanStartTime + ((i + 1) * timePerWord),
        start: (koreanStartTime + (i * timePerWord)) / 1000,
        end: (koreanStartTime + ((i + 1) * timePerWord)) / 1000
      });
    }

    logger.debug({
      englishWordCount: englishWords.length,
      koreanCaptionCount: koreanCaptions.length,
      totalDuration: totalTime / 1000
    }, "🔥 Generated synced English captions");

    return englishCaptions;
  }

  /**
   * 🔥 Generate sound effects using ElevenLabs API
   * Returns array of audio file paths with timing info
   */
  private async generateSoundEffects(
    audioConfig: AudioConfig | undefined,
    tempDirPath: string,
    sceneDurations: number[],
    apiKey: string
  ): Promise<Array<{ path: string; startTime: number; volume: number; loop?: boolean }>> {
    if (!audioConfig || (!audioConfig.soundEffects?.length && !audioConfig.transitionSound)) {
      return [];
    }

    const soundEffects = new ElevenLabsSoundEffects({ apiKey });
    const overlays: Array<{ path: string; startTime: number; volume: number; loop?: boolean }> = [];

    // Calculate cumulative scene start times
    const sceneStartTimes: number[] = [];
    let cumulativeTime = 0;
    for (const duration of sceneDurations) {
      sceneStartTimes.push(cumulativeTime);
      cumulativeTime += duration;
    }

    try {
      // 1. Generate transition sounds (between scenes)
      if (audioConfig.transitionSound && sceneDurations.length > 1) {
        const transitionType = audioConfig.transitionSound.type;
        const transitionVolume = audioConfig.transitionSound.volume ?? 0.5;

        logger.info({ transitionType, sceneCount: sceneDurations.length }, "🎵 Generating transition sounds");

        const transitionResult = await soundEffects.generateTransition(transitionType);

        // Save transition audio once (will be reused)
        const transitionPath = path.join(tempDirPath, `transition-${cuid()}.mp3`);
        await fs.writeFile(transitionPath, Buffer.from(transitionResult.audio));

        // Add transition between each scene
        for (let i = 1; i < sceneDurations.length; i++) {
          // Place transition sound at scene boundary (slightly before)
          const transitionTime = sceneStartTimes[i] - 0.3;
          overlays.push({
            path: transitionPath,
            startTime: Math.max(0, transitionTime),
            volume: transitionVolume
          });
        }
      }

      // 2. Generate custom sound effects
      if (audioConfig.soundEffects && audioConfig.soundEffects.length > 0) {
        logger.info({ count: audioConfig.soundEffects.length }, "🎵 Generating custom sound effects");

        for (const sfxConfig of audioConfig.soundEffects) {
          let audioResult;

          if (sfxConfig.type === 'preset') {
            // Use preset from SoundEffectPresets
            const presetKey = sfxConfig.value as keyof typeof SoundEffectPresets;
            if (SoundEffectPresets[presetKey]) {
              audioResult = await soundEffects.generate({
                text: SoundEffectPresets[presetKey],
                duration_seconds: sfxConfig.duration ?? null,
                prompt_influence: 0.3
              });
            } else {
              logger.warn({ preset: sfxConfig.value }, "Unknown sound effect preset, using as custom prompt");
              audioResult = await soundEffects.generate({
                text: sfxConfig.value,
                duration_seconds: sfxConfig.duration ?? null
              });
            }
          } else {
            // Custom description
            audioResult = await soundEffects.generate({
              text: sfxConfig.value,
              duration_seconds: sfxConfig.duration ?? null
            });
          }

          if (audioResult) {
            const sfxPath = path.join(tempDirPath, `sfx-${cuid()}.mp3`);
            await fs.writeFile(sfxPath, Buffer.from(audioResult.audio));

            overlays.push({
              path: sfxPath,
              startTime: sfxConfig.startTime,
              volume: sfxConfig.volume ?? 0.5
            });
          }
        }
      }

      logger.info({ overlayCount: overlays.length }, "✅ Sound effects generated");
      return overlays;

    } catch (error) {
      logger.error({ error }, "❌ Failed to generate sound effects, continuing without them");
      return [];
    }
  }

  /**
   * Load stored character reference images from GCS
   * These images serve as the starting point for character consistency
   */
  private async loadStoredCharacterImages(
    profileId: string,
    characterIds?: string[]
  ): Promise<Array<{ data: Buffer; mimeType: string; characterId: string; description: string }>> {
    if (!this.characterStorage || !this.characterStorage.isEnabled()) {
      logger.warn("CharacterStorageService not available, skipping stored images");
      return [];
    }

    try {
      // Load profile
      const profileResult = await this.characterStorage.getProfile(profileId);
      if (!profileResult.success || !profileResult.data) {
        logger.warn({ profileId }, "Character profile not found");
        return [];
      }

      const profile = profileResult.data;

      // Load character images
      const imagesResult = await this.characterStorage.loadCharacterImages(profileId);
      if (!imagesResult.success || !imagesResult.data) {
        logger.warn({ profileId }, "No character images found");
        return [];
      }

      const storedImages: Array<{ data: Buffer; mimeType: string; characterId: string; description: string }> = [];

      // Filter by characterIds if provided
      const targetCharacters = characterIds
        ? profile.characters.filter(c => characterIds.includes(c.id))
        : profile.characters;

      for (const character of targetCharacters) {
        const imageBase64 = imagesResult.data.get(character.id);
        if (imageBase64) {
          storedImages.push({
            data: Buffer.from(imageBase64, 'base64'),
            mimeType: 'image/png',
            characterId: character.id,
            description: character.description
          });
        }
      }

      logger.info({
        profileId,
        loadedCharacters: storedImages.length,
        characterIds: storedImages.map(c => c.characterId)
      }, "✅ Loaded stored character reference images");

      return storedImages;

    } catch (error) {
      logger.error({ error, profileId }, "Failed to load stored character images");
      return [];
    }
  }

  /**
   * Build character description from stored profile
   */
  private buildCharacterDescription(profile: CharacterProfile, characters: Character[]): string {
    const descriptions = characters.map(c => {
      let desc = c.description;
      if (c.distinguishingFeatures) {
        desc += `. Distinguishing features: ${c.distinguishingFeatures}`;
      }
      return `${c.name}: ${desc}`;
    });

    let fullDescription = descriptions.join('\n');
    if (profile.defaultStyle) {
      fullDescription += `\nStyle: ${profile.defaultStyle}`;
    }
    if (profile.defaultMood) {
      fullDescription += `\nMood: ${profile.defaultMood}`;
    }

    return fullDescription;
  }

  /**
   * ⭐ Get all character images for a scene (supports N characters)
   * @param characterIds - Array of character IDs for this scene
   * @param imageMap - Map of characterId → image data
   * @returns SceneCharacterImages with all available character images
   */
  private getSceneCharacterImages(
    characterIds: string[],
    imageMap: Map<string, { data: Buffer; mimeType: string; description: string }>
  ): SceneCharacterImages {
    const images: CharacterImageInfo[] = [];

    for (const characterId of characterIds) {
      const imageData = imageMap.get(characterId);
      if (imageData) {
        images.push({
          characterId,
          data: imageData.data,
          mimeType: imageData.mimeType,
          description: imageData.description
        });
      } else {
        logger.warn({ characterId }, "⚠️ Character image not found in map");
      }
    }

    const result: SceneCharacterImages = {
      characterIds,
      images,
      isSingleCharacter: images.length === 1,
      isMultiCharacter: images.length > 1,
      characterCount: images.length
    };

    logger.debug({
      requestedCharacters: characterIds.length,
      foundCharacters: images.length,
      characterIds: images.map(img => img.characterId)
    }, "📸 Got scene character images");

    return result;
  }

  /**
   * ⭐ Build prompt for multi-character scene
   * Combines all character descriptions with the scene prompt
   * @param sceneCharacters - SceneCharacterImages with character info
   * @param scenePrompt - Original scene prompt/description
   * @param style - Image generation style
   * @param mood - Image generation mood
   * @returns Enhanced prompt for NANO BANANA
   */
  private buildMultiCharacterPrompt(
    sceneCharacters: SceneCharacterImages,
    scenePrompt: string,
    style: string = "pixar",
    mood: string = "dynamic"
  ): string {
    // Build character descriptions
    const characterDescriptions = sceneCharacters.images
      .map(img => `[${img.characterId}]: ${img.description}`)
      .join('\n');

    // Combine into enhanced prompt
    const enhancedPrompt = `Scene with ${sceneCharacters.characterCount} characters together:
${characterDescriptions}

Scene: ${scenePrompt}
Style: ${style}
Mood: ${mood}

IMPORTANT: Show ALL ${sceneCharacters.characterCount} characters together in the same scene. Maintain each character's unique appearance and features.`;

    logger.debug({
      characterCount: sceneCharacters.characterCount,
      characterIds: sceneCharacters.characterIds,
      promptLength: enhancedPrompt.length
    }, "📝 Built multi-character prompt");

    return enhancedPrompt;
  }

  /**
   * Validate scenes for Consistent Shorts workflow
   * Unlike base validation, we only require audio since we generate our own images/videos
   */
  private validateConsistentShortsScenes(scenes: Scene[]): void {
    if (!scenes || scenes.length === 0) {
      throw new Error("No scenes provided for processing");
    }

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      // Only check for audio - video will be generated by this workflow
      if (!scene.audio) {
        throw new Error(`Scene ${i + 1} is missing audio`);
      }
    }
  }

  async process(
    scenes: Scene[],
    inputScenes: SceneInput[],
    context: WorkflowContext
  ): Promise<WorkflowResult> {
    try {
      // 🔍 DEBUG: Log full context.metadata to understand what's being passed
      logger.info({
        videoId: context.videoId,
        sceneCount: scenes.length,
        mode: "consistent-shorts",
        hasMetadata: !!context.metadata,
        metadataKeys: context.metadata ? Object.keys(context.metadata) : [],
        characterProfileId: context.metadata?.characterProfileId,
        characterIds: context.metadata?.characterIds,
        fullMetadata: JSON.stringify(context.metadata || {}).substring(0, 500)
      }, "✨ Processing CONSISTENT SHORTS workflow - DEBUG metadata");

      // Custom validation for Consistent Shorts: only require audio (we generate our own images/videos)
      this.validateConsistentShortsScenes(scenes);

      if (!this.imageGenerationService) {
        throw new Error("ImageGenerationService is required for Consistent Shorts mode");
      }

      // Create video-specific temp folder
      const videoTempDir = this.videoProcessor.createVideoTempDir(context.videoId);
      await fs.ensureDir(videoTempDir);
      logger.info({ videoTempDir, videoId: context.videoId }, "✅ Created video-specific temp directory");

      const folderExists = await fs.pathExists(videoTempDir);
      if (!folderExists) {
        throw new Error(`Failed to create video temp directory: ${videoTempDir}`);
      }

      // 🔥 Subtitle support: collect captions with time offsets
      const allCaptions: any[] = [];
      const allEnglishCaptions: any[] = [];  // 🔥 이중 자막: 영어 캡션
      let cumulativeDuration = 0;

      try {
        // Step 1: Generate images with CHARACTER CONSISTENCY
        logger.info({
          videoId: context.videoId,
          sceneCount: inputScenes.length
        }, "🎨 Starting CONSISTENT image generation (like Chat Mode in ipynb)");

        const imageDataList: Array<{
          imagePath: string;
          duration: number;
          sceneText: string;
          imageBuffer: Buffer;
        }> = [];

        // Track previous images for reference (like Chat history)
        const previousImages: Array<{
          data: Buffer;
          mimeType: string;
          sceneIndex: number;
        }> = [];

        // ⭐ NEW: Map to store character images by characterId for direct VEO usage
        const storedCharacterImageMap: Map<string, { data: Buffer; mimeType: string; description: string }> = new Map();

        // ⭐ NEW: Load stored character images if profileId is provided
        // This enables character persistence across multiple video sessions!
        const characterProfileId = context.metadata?.characterProfileId as string | undefined;
        const characterIds = context.metadata?.characterIds as string[] | undefined;
        // ⭐ NEW: Option to use stored image directly for VEO (skip NANO BANANA)
        const useStoredImageForVeo = context.metadata?.useStoredImageForVeo === true;
        // 🔥 상단 제목 (숏츠 어그로용)
        const titleText = context.metadata?.titleText as TitleTextConfig | undefined;

        // 🔍 DEBUG: Always log this check
        logger.info({
          characterProfileId,
          characterIds,
          useStoredImageForVeo,
          hasCharacterStorage: !!this.characterStorage,
          characterStorageEnabled: this.characterStorage?.isEnabled?.() ?? false
        }, "🔍 DEBUG: Checking if should load stored character images");

        if (characterProfileId) {
          logger.info({
            characterProfileId,
            characterIds,
            useStoredImageForVeo
          }, "🎭 Loading stored character reference images for consistency");

          const storedImages = await this.loadStoredCharacterImages(characterProfileId, characterIds);

          // Add stored images as initial references (index: -1 to -N)
          for (let idx = 0; idx < storedImages.length; idx++) {
            const stored = storedImages[idx];
            previousImages.push({
              data: stored.data,
              mimeType: stored.mimeType,
              sceneIndex: -(idx + 1) // Negative index for stored images
            });

            // ⭐ NEW: Also store in map for direct VEO access
            storedCharacterImageMap.set(stored.characterId, {
              data: stored.data,
              mimeType: stored.mimeType,
              description: stored.description
            });
          }

          logger.info({
            storedImageCount: storedImages.length,
            previousImagesTotal: previousImages.length,
            storedCharacterIds: Array.from(storedCharacterImageMap.keys()),
            useStoredImageForVeo
          }, "✅ Stored character images loaded as initial references");
        }

        for (let i = 0; i < inputScenes.length; i++) {
          const scene = inputScenes[i];

          // ⭐ Scene-level character support: use scene.characterIds if provided
          const sceneCharacterIds = scene.characterIds || characterIds;

          // If scene has different characterIds than video-level, reload character images
          if (sceneCharacterIds && characterProfileId &&
              JSON.stringify(sceneCharacterIds) !== JSON.stringify(characterIds)) {
            logger.info({
              sceneIndex: i + 1,
              sceneCharacterIds,
              videoCharacterIds: characterIds
            }, "🎭 Scene has different character set, loading scene-specific characters");

            const sceneStoredImages = await this.loadStoredCharacterImages(characterProfileId, sceneCharacterIds);

            // Temporarily replace reference images for this scene
            // Clear old stored images and add scene-specific ones
            const nonStoredImages = previousImages.filter(img => img.sceneIndex >= 0);
            previousImages.length = 0;

            for (let idx = 0; idx < sceneStoredImages.length; idx++) {
              const stored = sceneStoredImages[idx];
              previousImages.push({
                data: stored.data,
                mimeType: stored.mimeType,
                sceneIndex: -(idx + 1)
              });
            }

            // Add back generated scene images
            previousImages.push(...nonStoredImages);
          }

          logger.info({
            sceneIndex: i + 1,
            totalScenes: inputScenes.length,
            hasPreviousImages: previousImages.length > 0,
            referenceImageCount: Math.min(previousImages.length, 3),
            sceneCharacterIds,
            useStoredImageForVeo
          }, "📸 Generating image for scene with character consistency");

          if (!scene.imageData) {
            scene.imageData = {
              prompt: scene.text,
              style: "cinematic",
              mood: "dynamic"
            };
          }

          // ⭐ Multi-Character Support: Get ALL character images for this scene
          const sceneCharacterImages = this.getSceneCharacterImages(
            sceneCharacterIds || [],
            storedCharacterImageMap
          );

          let finalImage: { data: Buffer; mimeType: string };
          let savedImagePath: string;

          // ⭐ Decision Tree for useStoredImageForVeo:
          // 1. Single character + useStoredImageForVeo → Use stored image directly (skip NANO BANANA)
          // 2. Multiple characters + useStoredImageForVeo → Use NANO BANANA with ALL character images as references
          // 3. No useStoredImageForVeo → Original flow (NANO BANANA generates based on prompt)
          const shouldUseDirectStoredImage = useStoredImageForVeo && sceneCharacterImages.isSingleCharacter;
          const shouldUseMultiCharacterReference = useStoredImageForVeo && sceneCharacterImages.isMultiCharacter;

          if (shouldUseDirectStoredImage) {
            // ⭐ SINGLE CHARACTER: Use stored image directly (skip NANO BANANA)
            const characterImage = sceneCharacterImages.images[0];

            logger.info({
              sceneIndex: i + 1,
              characterId: characterImage.characterId,
              imageSize: characterImage.data.length
            }, "🎯 Using STORED single character image directly for VEO (skipping NANO BANANA)");

            finalImage = {
              data: characterImage.data,
              mimeType: characterImage.mimeType
            };

            // Save stored image to temp directory
            const simpleFilename = `stored_character_scene_${i + 1}_${context.videoId}.png`;
            savedImagePath = path.join(videoTempDir, simpleFilename);
            await fs.writeFile(savedImagePath, characterImage.data);

            logger.info({
              sceneIndex: i + 1,
              characterId: characterImage.characterId,
              imagePath: savedImagePath
            }, "✅ Stored character image saved for VEO");

          } else if (shouldUseMultiCharacterReference) {
            // ⭐ MULTIPLE CHARACTERS: Use NANO BANANA with ALL character images as references
            logger.info({
              sceneIndex: i + 1,
              characterCount: sceneCharacterImages.characterCount,
              characterIds: sceneCharacterImages.characterIds,
              imageSizes: sceneCharacterImages.images.map(img => img.data.length)
            }, "🎭 Multi-character scene: Using NANO BANANA with ALL character images as references");

            // Set NANO BANANA model
            this.imageGenerationService.setModel(ImageModelType.NANO_BANANA);

            // Build multi-character prompt
            const multiCharPrompt = this.buildMultiCharacterPrompt(
              sceneCharacterImages,
              scene.imageData.prompt || scene.text,
              scene.imageData.style || "pixar",
              scene.imageData.mood || "dynamic"
            );
            const aspectRatio = context.orientation === "portrait" ? "9:16" : "16:9";

            // Use ALL stored character images as references for NANO BANANA
            const referenceImages = sceneCharacterImages.images.map(img => ({
              data: img.data,
              mimeType: img.mimeType
            }));

            logger.debug({
              sceneIndex: i + 1,
              referenceImageCount: referenceImages.length,
              prompt: multiCharPrompt.substring(0, 150)
            }, "🔗 Using ALL character images as references for multi-character scene");

            // Generate combined image with all character references
            const result = await this.imageGenerationService.generateImages({
              prompt: multiCharPrompt,
              numberOfImages: 1,
              aspectRatio: aspectRatio as "9:16" | "16:9",
              referenceImages: referenceImages
            }, context.videoId, i);

            if (!result.success || !result.images || result.images.length === 0) {
              throw new Error(`Failed to generate multi-character image for scene ${i + 1}`);
            }

            const generatedImage = result.images[0];
            finalImage = {
              data: generatedImage.data,
              mimeType: generatedImage.mimeType || "image/png"
            };

            // Save generated image
            const simpleFilename = `multichar_scene_${i + 1}_${context.videoId}.png`;
            savedImagePath = path.join(videoTempDir, simpleFilename);
            await fs.writeFile(savedImagePath, generatedImage.data);

            logger.info({
              sceneIndex: i + 1,
              characterIds: sceneCharacterImages.characterIds,
              imagePath: savedImagePath,
              usedReferences: referenceImages.length
            }, "✅ Multi-character combined image generated and saved");

          } else {
            // Original flow: Generate with NANO BANANA (no useStoredImageForVeo or no characters)
            // Set NANO BANANA model (best for character consistency)
            this.imageGenerationService.setModel(ImageModelType.NANO_BANANA);

            // Enhanced prompt with character consistency
            const enhancedPrompt = `${scene.imageData.prompt || scene.text}. Style: ${scene.imageData.style || "cinematic"}. Mood: ${scene.imageData.mood || "dynamic"}. Maintain consistent character appearance.`;
            const aspectRatio = context.orientation === "portrait" ? "9:16" : "16:9";

            // ⭐ KEY FEATURE: Use previous images as references (max 3)
            // This is like Chat Mode in ipynb - maintains character consistency!
            // ⭐ UPDATED: If we have stored character images, use them even for scene 0
            const referenceImages = previousImages.length > 0
              ? previousImages.slice(-3).map(img => ({
                  data: img.data,
                  mimeType: img.mimeType
                }))
              : undefined;

            logger.debug({
              sceneIndex: i,
              referenceImageCount: referenceImages?.length || 0,
              prompt: enhancedPrompt.substring(0, 100)
            }, "🔗 Using reference images for consistency");

            // Generate image with references
            const result = await this.imageGenerationService.generateImages({
              prompt: enhancedPrompt,
              numberOfImages: 1,
              aspectRatio: aspectRatio as "9:16" | "16:9",
              referenceImages: referenceImages // ⭐ Chat Mode magic!
            }, context.videoId, i);

            if (!result.success || !result.images || result.images.length === 0) {
              throw new Error(`Failed to generate consistent image for scene ${i + 1}`);
            }

            const generatedImage = result.images[0];

            finalImage = {
              data: generatedImage.data,
              mimeType: generatedImage.mimeType || "image/png"
            };

            // Save image
            const simpleFilename = `consistent_scene_${i + 1}_${context.videoId}.png`;
            savedImagePath = path.join(videoTempDir, simpleFilename);

            await fs.writeFile(savedImagePath, generatedImage.data);

            // Verify save
            const fileExists = await fs.pathExists(savedImagePath);
            const fileStats = fileExists ? await fs.stat(savedImagePath) : null;

            logger.info({
              sceneIndex: i + 1,
              imagePath: savedImagePath,
              filename: simpleFilename,
              fileExists,
              fileSize: fileStats?.size,
              usedReferences: referenceImages?.length || 0
            }, "✅ Consistent character image generated and saved");
          }

          // ⭐ Add to previous images for next scene reference
          previousImages.push({
            data: finalImage.data,
            mimeType: finalImage.mimeType,
            sceneIndex: i
          });

          imageDataList.push({
            imagePath: savedImagePath,
            duration: 3, // Will be updated with actual audio length
            sceneText: scene.text,
            imageBuffer: finalImage.data
          });
        }

        logger.info({
          totalImages: imageDataList.length,
          characterConsistent: true
        }, "🎉 All images generated with consistent character!");

        // Step 2: Update durations from audio data (with minimum scene duration)
        for (let i = 0; i < scenes.length; i++) {
          const scene = scenes[i];
          if (scene.audio?.duration) {
            // 최소 씬 길이 보장: TTS가 짧아도 충분한 콘텐츠 제공
            imageDataList[i].duration = Math.max(scene.audio.duration, MIN_SCENE_DURATION);
          }
        }

        // Step 3A: VEO3 I2V conversion (if enabled)
        logger.info({
          hasGenerateVideosFlag: !!context.metadata?.generateVideos,
          generateVideosValue: context.metadata?.generateVideos,
          hasVeoAPI: !!this.veoAPI,
          willUseVEO3: !!(context.metadata?.generateVideos && this.veoAPI)
        }, "🔍 Checking VEO3 I2V condition");

        if (context.metadata?.generateVideos && this.veoAPI) {
          const useFrameInterpolation = context.metadata?.useFrameInterpolation === true;

          logger.info({
            useFrameInterpolation,
            supportsInterpolation: this.veoAPI.supportsFrameInterpolation?.() ?? false
          }, useFrameInterpolation
            ? "🎬 Converting consistent images to videos with VEO3.1 First+Last Frame interpolation"
            : "🎬 Converting consistent images to videos with VEO3 I2V");

          // Track which scenes use VEO3 video vs fallback image
          const sceneResults: Array<{
            type: 'video' | 'image';
            path: string;
            duration: number;
          }> = [];

          let veo3SuccessCount = 0;
          let veo3FailCount = 0;

          for (let i = 0; i < imageDataList.length; i++) {
            const imageData = imageDataList[i];
            const scene = inputScenes[i];
            const duration = imageData.duration || scenes[i]?.audio?.duration || 8;

            // ⭐ VEO 3.1: Use next scene's image as lastFrame for smooth transition
            const hasNextScene = i < imageDataList.length - 1;
            const nextSceneImage = hasNextScene ? imageDataList[i + 1] : null;

            logger.info({
              sceneIndex: i + 1,
              duration,
              useFrameInterpolation,
              hasNextScene,
              willUseLastFrame: useFrameInterpolation && hasNextScene
            }, useFrameInterpolation && hasNextScene
              ? "🔄 Converting with VEO 3.1 First+Last Frame interpolation"
              : "🔄 Converting image to video with VEO3");

            try {
              // Convert image to base64 for VEO3
              const imageBase64 = imageData.imageBuffer.toString('base64');

              // VEO3 I2V generation
              const videoPrompt = scene.videoPrompt || scene.text || `Scene ${i + 1}`;

              // ⭐ Prepare lastImage for VEO 3.1 First+Last Frame interpolation
              const lastImage = (useFrameInterpolation && nextSceneImage)
                ? {
                    data: nextSceneImage.imageBuffer.toString('base64'),
                    mimeType: "image/png"
                  }
                : undefined;

              const video = await this.veoAPI.findVideo(
                [videoPrompt],
                duration,          // minDurationSeconds (number)
                [],                // excludeIds
                context.orientation, // orientation
                300000,            // timeout (5 minutes)
                0,                 // retryCounter
                {                  // initialImage for I2V (first frame)
                  data: imageBase64,
                  mimeType: "image/png"
                },
                lastImage          // ⭐ lastImage for VEO 3.1 (last frame)
              );

              // Download VEO3 video
              const videoPath = path.join(videoTempDir, `veo3_scene_${i + 1}_${context.videoId}.mp4`);
              await this.videoProcessor.downloadVideo(video.url, videoPath);

              sceneResults.push({
                type: 'video',
                path: videoPath,
                duration
              });

              veo3SuccessCount++;

              logger.info({
                sceneIndex: i + 1,
                videoPath
              }, "✅ VEO3 video generated from consistent image");

            } catch (veoError) {
              // VEO3 실패 → 이미지로 fallback
              veo3FailCount++;

              logger.warn({
                sceneIndex: i + 1,
                error: veoError instanceof Error ? veoError.message : 'Unknown error',
                totalFailed: veo3FailCount
              }, "⚠️ VEO3 failed for scene, falling back to static image");

              sceneResults.push({
                type: 'image',
                path: imageData.imagePath,
                duration
              });
            }
          }

          logger.info({
            totalScenes: imageDataList.length,
            veo3Success: veo3SuccessCount,
            veo3Failed: veo3FailCount,
            fallbackUsed: veo3FailCount > 0
          }, "📊 VEO3 conversion summary");

          // 혼합 처리: VEO3 비디오 + fallback 이미지 결합
          let tempVideoPath: string;

          if (veo3FailCount === 0) {
            // 모든 scene VEO3 성공 → 각 비디오를 적절한 길이로 트리밍 후 결합
            // VEO3는 최소 6초 비디오를 생성하므로, 최소 씬 길이 보장 필요
            const trimmedVideoPaths: string[] = [];

            for (let i = 0; i < sceneResults.length; i++) {
              const result = sceneResults[i];
              const audioDuration = scenes[i]?.audio?.duration || result.duration;
              // 최소 씬 길이 보장: TTS가 짧아도 VEO3 콘텐츠 활용
              const sceneDuration = Math.max(audioDuration, MIN_SCENE_DURATION);

              const trimmedPath = path.join(videoTempDir, `trimmed_scene_${i + 1}_${context.videoId}.mp4`);

              logger.info({
                sceneIndex: i + 1,
                originalPath: result.path,
                audioDuration,
                sceneDuration,
                minSceneDuration: MIN_SCENE_DURATION,
                trimmedPath
              }, "✂️ Trimming VEO3 video (respecting min scene duration)");

              await this.videoProcessor.trimVideo(result.path, trimmedPath, sceneDuration);
              trimmedVideoPaths.push(trimmedPath);

              // 🔥 Collect captions with time offset for subtitles
              const sceneData = scenes[i];
              const inputScene = inputScenes[i];  // Get original input for textEnglish
              if (sceneData?.captions && sceneData.captions.length > 0) {
                const adjustedCaptions = sceneData.captions.map((caption: any) => ({
                  ...caption,
                  startMs: caption.startMs + (cumulativeDuration * 1000),
                  endMs: caption.endMs + (cumulativeDuration * 1000),
                }));
                allCaptions.push(...adjustedCaptions);

                // 🔥 이중 자막: 영어 캡션 수집
                const textEnglish = (inputScene as any)?.textEnglish;
                if (textEnglish) {
                  const englishCaptions = this.generateSyncedEnglishCaptions(
                    textEnglish,
                    adjustedCaptions,
                    sceneDuration
                  );
                  allEnglishCaptions.push(...englishCaptions);
                  logger.debug({
                    sceneIndex: i + 1,
                    englishCaptionCount: englishCaptions.length
                  }, "📝 Collected English captions for dual subtitles");
                }

                logger.debug({
                  sceneIndex: i + 1,
                  captionCount: adjustedCaptions.length,
                  timeOffset: cumulativeDuration
                }, "📝 Collected scene captions with time offset");
              }
              cumulativeDuration += sceneDuration;
            }

            // 🔥 Scene transition settings from metadata
            const useSceneTransitions = context.metadata?.useSceneTransitions ?? true;
            const sceneTransitionType = (context.metadata?.sceneTransitionType as string) || 'fade';
            const sceneTransitionDuration = (context.metadata?.sceneTransitionDuration as number) || 0.5;

            // 🔥 FIX: Adjust caption timing for xfade overlap
            // xfade causes scenes to overlap, shortening total video duration
            // Scene N starts earlier by (N-1) * transitionDuration
            if (useSceneTransitions && trimmedVideoPaths.length > 1) {
              const transitionCount = trimmedVideoPaths.length - 1;
              const totalOverlap = transitionCount * sceneTransitionDuration;

              // Recalculate caption timings to account for xfade overlap
              let adjustedTime = 0;
              let captionIndex = 0;
              for (let i = 0; i < scenes.length; i++) {
                const sceneData = scenes[i];
                const sceneDuration = Math.max(scenes[i]?.audio?.duration || MIN_SCENE_DURATION, MIN_SCENE_DURATION);
                const overlapAdjustment = i > 0 ? sceneTransitionDuration : 0;

                // Adjust all captions for this scene
                while (captionIndex < allCaptions.length) {
                  const caption = allCaptions[captionIndex];
                  const originalSceneOffset = i === 0 ? 0 :
                    scenes.slice(0, i).reduce((sum, s) => sum + Math.max(s?.audio?.duration || MIN_SCENE_DURATION, MIN_SCENE_DURATION), 0);

                  // Check if this caption belongs to current scene
                  if (caption.startMs >= originalSceneOffset * 1000 &&
                      caption.startMs < (originalSceneOffset + sceneDuration) * 1000) {
                    // Adjust for xfade overlap (earlier scenes)
                    const xfadeOffset = i * sceneTransitionDuration * 1000;
                    caption.startMs -= xfadeOffset;
                    caption.endMs -= xfadeOffset;
                    captionIndex++;
                  } else {
                    break;
                  }
                }
              }

              logger.info({
                transitionCount,
                totalOverlap,
                adjustedCaptionCount: allCaptions.length
              }, "🎬 Adjusted caption timing for xfade overlap");
            }

            logger.info({
              clipCount: trimmedVideoPaths.length,
              clips: trimmedVideoPaths,
              useSceneTransitions,
              sceneTransitionType,
              sceneTransitionDuration
            }, "🎬 Combining trimmed VEO3 video clips");

            tempVideoPath = path.join(videoTempDir, `veo3_combined_${context.videoId}.mp4`);

            if (useSceneTransitions && trimmedVideoPaths.length > 1) {
              // 🔥 xfade 전환 효과로 부드러운 씬 전환
              await this.videoProcessor.combineVideoClipsWithXfade(
                trimmedVideoPaths,
                tempVideoPath,
                sceneTransitionDuration,
                sceneTransitionType
              );
            } else {
              await this.videoProcessor.combineVideoClips(trimmedVideoPaths, tempVideoPath);
            }

          } else if (veo3SuccessCount === 0) {
            // 모든 scene VEO3 실패 → 정적 이미지 비디오
            logger.info("⚠️ All VEO3 failed, creating static video from images");

            const dimensions = context.orientation === "portrait"
              ? VIDEO_DIMENSIONS.PORTRAIT
              : VIDEO_DIMENSIONS.LANDSCAPE;

            tempVideoPath = path.join(videoTempDir, `fallback_static_${context.videoId}.mp4`);
            await this.videoProcessor.createStaticVideoFromMultipleImages(
              imageDataList,
              tempVideoPath,
              dimensions
            );

            // 🔥 Collect captions with time offset for subtitles (static mode)
            for (let i = 0; i < scenes.length; i++) {
              const sceneData = scenes[i];
              const inputScene = inputScenes[i];  // Get original input for textEnglish
              const sceneDuration = imageDataList[i]?.duration || Math.max(sceneData?.audio?.duration || MIN_SCENE_DURATION, MIN_SCENE_DURATION);

              if (sceneData?.captions && sceneData.captions.length > 0) {
                const adjustedCaptions = sceneData.captions.map((caption: any) => ({
                  ...caption,
                  startMs: caption.startMs + (cumulativeDuration * 1000),
                  endMs: caption.endMs + (cumulativeDuration * 1000),
                }));
                allCaptions.push(...adjustedCaptions);

                // 🔥 이중 자막: 영어 캡션 수집 (static mode)
                const textEnglish = (inputScene as any)?.textEnglish;
                if (textEnglish) {
                  const englishCaptions = this.generateSyncedEnglishCaptions(
                    textEnglish,
                    adjustedCaptions,
                    sceneDuration
                  );
                  allEnglishCaptions.push(...englishCaptions);
                }

                logger.debug({
                  sceneIndex: i + 1,
                  captionCount: adjustedCaptions.length,
                  timeOffset: cumulativeDuration
                }, "📝 Collected scene captions with time offset (static mode)");
              }
              cumulativeDuration += sceneDuration;
            }

          } else {
            // 혼합: 일부 성공, 일부 실패 → VEO3 비디오 트리밍 + 실패한 것은 이미지로
            logger.info({
              successCount: veo3SuccessCount,
              failCount: veo3FailCount
            }, "🔀 Mixed results: combining VEO3 videos with static images");

            const dimensions = context.orientation === "portrait"
              ? VIDEO_DIMENSIONS.PORTRAIT
              : VIDEO_DIMENSIONS.LANDSCAPE;

            const processedClips: string[] = [];

            for (let i = 0; i < sceneResults.length; i++) {
              const result = sceneResults[i];
              const audioDuration = scenes[i]?.audio?.duration || result.duration;
              // 최소 씬 길이 보장: TTS가 짧아도 충분한 콘텐츠 제공
              const sceneDuration = Math.max(audioDuration, MIN_SCENE_DURATION);

              if (result.type === 'video') {
                // VEO3 성공 → 최소 씬 길이 보장하여 트리밍
                const trimmedPath = path.join(videoTempDir, `trimmed_mixed_${i + 1}_${context.videoId}.mp4`);
                await this.videoProcessor.trimVideo(result.path, trimmedPath, sceneDuration);
                processedClips.push(trimmedPath);
              } else {
                // VEO3 실패 → 이미지로 비디오 생성 (최소 씬 길이 적용)
                const imageVideoPath = path.join(videoTempDir, `image_to_video_${i + 1}_${context.videoId}.mp4`);
                await this.videoProcessor.createStaticVideoFromMultipleImages(
                  [{ imagePath: result.path, duration: sceneDuration }],
                  imageVideoPath,
                  dimensions
                );
                processedClips.push(imageVideoPath);
              }

              // 🔥 Collect captions with time offset for subtitles (mixed mode)
              const sceneData = scenes[i];
              const inputScene = inputScenes[i];  // Get original input for textEnglish
              if (sceneData?.captions && sceneData.captions.length > 0) {
                const adjustedCaptions = sceneData.captions.map((caption: any) => ({
                  ...caption,
                  startMs: caption.startMs + (cumulativeDuration * 1000),
                  endMs: caption.endMs + (cumulativeDuration * 1000),
                }));
                allCaptions.push(...adjustedCaptions);

                // 🔥 이중 자막: 영어 캡션 수집 (mixed mode)
                const textEnglish = (inputScene as any)?.textEnglish;
                if (textEnglish) {
                  const englishCaptions = this.generateSyncedEnglishCaptions(
                    textEnglish,
                    adjustedCaptions,
                    sceneDuration
                  );
                  allEnglishCaptions.push(...englishCaptions);
                }

                logger.debug({
                  sceneIndex: i + 1,
                  captionCount: adjustedCaptions.length,
                  timeOffset: cumulativeDuration
                }, "📝 Collected scene captions with time offset (mixed mode)");
              }
              cumulativeDuration += sceneDuration;
            }

            // 모든 처리된 클립 결합 (xfade 전환 효과 적용)
            const useSceneTransitionsMixed = context.metadata?.useSceneTransitions ?? true;
            const sceneTransitionTypeMixed = (context.metadata?.sceneTransitionType as string) || 'fade';
            const sceneTransitionDurationMixed = (context.metadata?.sceneTransitionDuration as number) || 0.5;

            // 🔥 FIX: Adjust caption timing for xfade overlap (mixed mode)
            if (useSceneTransitionsMixed && processedClips.length > 1) {
              let captionIndex = 0;
              for (let i = 0; i < scenes.length; i++) {
                const sceneDuration = Math.max(scenes[i]?.audio?.duration || MIN_SCENE_DURATION, MIN_SCENE_DURATION);
                const originalSceneOffset = i === 0 ? 0 :
                  scenes.slice(0, i).reduce((sum, s) => sum + Math.max(s?.audio?.duration || MIN_SCENE_DURATION, MIN_SCENE_DURATION), 0);

                while (captionIndex < allCaptions.length) {
                  const caption = allCaptions[captionIndex];
                  if (caption.startMs >= originalSceneOffset * 1000 &&
                      caption.startMs < (originalSceneOffset + sceneDuration) * 1000) {
                    const xfadeOffset = i * sceneTransitionDurationMixed * 1000;
                    caption.startMs -= xfadeOffset;
                    caption.endMs -= xfadeOffset;
                    captionIndex++;
                  } else {
                    break;
                  }
                }
              }

              logger.info({
                transitionCount: processedClips.length - 1,
                adjustedCaptionCount: allCaptions.length
              }, "🎬 Adjusted caption timing for xfade overlap (mixed mode)");
            }

            tempVideoPath = path.join(videoTempDir, `mixed_combined_${context.videoId}.mp4`);

            if (useSceneTransitionsMixed && processedClips.length > 1) {
              // 🔥 xfade 전환 효과로 부드러운 씬 전환
              await this.videoProcessor.combineVideoClipsWithXfade(
                processedClips,
                tempVideoPath,
                sceneTransitionDurationMixed,
                sceneTransitionTypeMixed
              );
            } else {
              await this.videoProcessor.combineVideoClips(processedClips, tempVideoPath);
            }
          }

          logger.info({
            clipCount: sceneResults.length,
            outputPath: tempVideoPath,
            useSceneTransitions: context.metadata?.useSceneTransitions ?? true
          }, "✅ Video clips combined");

          // Step 3B: Combine with audio
          const audioFiles: string[] = [];
          const sceneDurations: number[] = [];
          for (const scene of scenes) {
            if (scene.audio?.url) {
              const audioFileName = scene.audio.url.split('/').pop();
              if (audioFileName) {
                audioFiles.push(path.join(this.videoProcessor.getConfig().tempDirPath, audioFileName));
              }
              sceneDurations.push(scene.audio.duration || MIN_SCENE_DURATION);
            }
          }

          // 🔥 Sound Effects Integration
          const audioConfig = context.metadata?.audioConfig as AudioConfig | undefined;
          let finalAudioPath: string | undefined;

          if (audioConfig && context.systemConfig.elevenLabsApiKey) {
            logger.info({ audioConfig }, "🎵 Sound effects configuration detected, processing...");

            // 1. Concatenate TTS audio files first
            const tempConcatAudioPath = path.join(videoTempDir, `concat_audio_${context.videoId}.mp3`);
            if (audioFiles.length === 1) {
              await fs.copyFile(audioFiles[0], tempConcatAudioPath);
            } else if (audioFiles.length > 1) {
              await this.videoProcessor.getFFmpeg().concatAudios(audioFiles, tempConcatAudioPath);
            }

            // 2. Generate sound effects
            const soundEffectOverlays = await this.generateSoundEffects(
              audioConfig,
              videoTempDir,
              sceneDurations,
              context.systemConfig.elevenLabsApiKey
            );

            // 3. Mix sound effects with TTS audio if any overlays were generated
            if (soundEffectOverlays.length > 0) {
              const totalDuration = sceneDurations.reduce((sum, d) => sum + d, 0);
              const mixedAudioPath = path.join(videoTempDir, `mixed_audio_${context.videoId}.mp3`);

              await this.videoProcessor.getFFmpeg().mixAudioTracks(
                tempConcatAudioPath,
                soundEffectOverlays,
                mixedAudioPath,
                totalDuration
              );

              finalAudioPath = mixedAudioPath;
              logger.info({
                overlayCount: soundEffectOverlays.length,
                outputPath: mixedAudioPath
              }, "✅ Sound effects mixed with TTS audio");
            } else {
              finalAudioPath = tempConcatAudioPath;
            }
          }

          const tempFinalPath = path.join(videoTempDir, `final_${context.videoId}.mp4`);

          if (finalAudioPath) {
            // Use mixed audio with sound effects
            await this.videoProcessor.getFFmpeg().replaceVideoAudio(
              tempVideoPath,
              finalAudioPath,
              tempFinalPath,
              0
            );
          } else {
            // Original flow: combine video with audio files
            await this.videoProcessor.combineVideoWithAudio(
              tempVideoPath,
              audioFiles,
              tempFinalPath
            );
          }

          // 🔥 Apply synchronized subtitles to final video
          const standardVideoPath = path.join(
            this.videoProcessor.getConfig().videosDirPath,
            `${context.videoId}.mp4`
          );

          // 🔥 DEBUG: Log what we have before subtitle check
          logger.info({
            allCaptionsLength: allCaptions.length,
            allCaptionsFirst: allCaptions[0] ? JSON.stringify(allCaptions[0]) : null,
            hasTitleText: !!titleText,
            scenesCount: scenes.length,
            sceneCaptions: scenes.map((s, i) => ({
              sceneIndex: i,
              hasCaptions: !!s.captions,
              captionCount: s.captions?.length || 0
            }))
          }, "🔍 DEBUG: Pre-subtitle check state");

          // 🔥 제목(titleText) + 자막 적용
          if (allCaptions.length > 0 || titleText) {
            logger.info({
              hasTitleText: !!titleText,
              titleTextKo: titleText?.ko,
              koreanCaptionCount: allCaptions.length,
              englishCaptionCount: allEnglishCaptions.length,
              videoDuration: cumulativeDuration,
              videoId: context.videoId
            }, "🎬 Applying title and subtitles to video");

            await this.videoProcessor.addTitleAndSubtitlesToVideo(
              tempFinalPath,
              standardVideoPath,
              titleText || null,    // 상단 제목 (선택)
              allCaptions,          // 한국어 자막
              allEnglishCaptions.length > 0 ? allEnglishCaptions : null,  // 영어 자막 (선택)
              context.orientation,
              cumulativeDuration    // 영상 총 길이 (제목 duration 계산용)
            );

            logger.info({
              outputPath: standardVideoPath,
              hasTitleText: !!titleText,
              hasDualSubtitles: allEnglishCaptions.length > 0
            }, "✅ Final video with title and subtitles created");
          } else {
            // No subtitles or title, copy final video as-is
            await fs.promises.copyFile(tempFinalPath, standardVideoPath);
            logger.info({
              from: tempFinalPath,
              to: standardVideoPath
            }, "✅ Final video copied to standard location for GCS upload (no overlay)");
          }

          // Calculate total duration
          const totalDuration = this.calculateTotalDuration(scenes);

          return {
            outputPath: standardVideoPath,
            duration: totalDuration,
            scenes
          };

        } else {
          // Step 3B: Static video from images (no VEO3)
          logger.info("🎞️ Creating static video from consistent images");

          const tempVideoPath = path.join(videoTempDir, `consistent_static_${context.videoId}.mp4`);
          const dimensions = context.orientation === "portrait"
            ? VIDEO_DIMENSIONS.PORTRAIT
            : VIDEO_DIMENSIONS.LANDSCAPE;

          await this.videoProcessor.createStaticVideoFromMultipleImages(
            imageDataList,
            tempVideoPath,
            dimensions
          );

          logger.info("✅ Static video created from consistent character images");

          // 🔥 Collect captions with time offset for subtitles (no VEO3 static mode)
          for (let i = 0; i < scenes.length; i++) {
            const sceneData = scenes[i];
            const inputScene = inputScenes[i];  // Get original input for textEnglish
            const sceneDuration = imageDataList[i]?.duration || Math.max(sceneData?.audio?.duration || MIN_SCENE_DURATION, MIN_SCENE_DURATION);

            if (sceneData?.captions && sceneData.captions.length > 0) {
              const adjustedCaptions = sceneData.captions.map((caption: any) => ({
                ...caption,
                startMs: caption.startMs + (cumulativeDuration * 1000),
                endMs: caption.endMs + (cumulativeDuration * 1000),
              }));
              allCaptions.push(...adjustedCaptions);

              // 🔥 이중 자막: 영어 캡션 수집 (no VEO3 static mode)
              const textEnglish = (inputScene as any)?.textEnglish;
              if (textEnglish) {
                const englishCaptions = this.generateSyncedEnglishCaptions(
                  textEnglish,
                  adjustedCaptions,
                  sceneDuration
                );
                allEnglishCaptions.push(...englishCaptions);
              }

              logger.debug({
                sceneIndex: i + 1,
                captionCount: adjustedCaptions.length,
                timeOffset: cumulativeDuration
              }, "📝 Collected scene captions with time offset (no VEO3 static mode)");
            }
            cumulativeDuration += sceneDuration;
          }

          // Step 4: Combine with audio
          const audioFiles: string[] = [];
          for (const scene of scenes) {
            if (scene.audio?.url) {
              const audioFileName = scene.audio.url.split('/').pop();
              if (audioFileName) {
                audioFiles.push(path.join(this.videoProcessor.getConfig().tempDirPath, audioFileName));
              }
            }
          }

          const tempFinalPath = path.join(videoTempDir, `final_${context.videoId}.mp4`);
          await this.videoProcessor.combineVideoWithAudio(
            tempVideoPath,
            audioFiles,
            tempFinalPath
          );

          // 🔥 Apply synchronized subtitles to final video
          const standardVideoPath = path.join(
            this.videoProcessor.getConfig().videosDirPath,
            `${context.videoId}.mp4`
          );

          // 🔥 Apply title text and/or subtitles (no VEO3 static mode)
          if (allCaptions.length > 0 || titleText) {
            logger.info({
              hasTitleText: !!titleText,
              titleTextKo: titleText?.ko,
              koreanCaptionCount: allCaptions.length,
              englishCaptionCount: allEnglishCaptions.length,
              videoDuration: cumulativeDuration,
              videoId: context.videoId
            }, "📝 Applying title text and subtitles (no VEO3 static mode)");

            await this.videoProcessor.addTitleAndSubtitlesToVideo(
              tempFinalPath,
              standardVideoPath,
              titleText || null,
              allCaptions,
              allEnglishCaptions.length > 0 ? allEnglishCaptions : null,
              context.orientation,
              cumulativeDuration
            );

            logger.info({
              outputPath: standardVideoPath,
              hasTitleText: !!titleText,
              hasDualSubtitles: allEnglishCaptions.length > 0
            }, "✅ Final video with title and subtitles created (no VEO3 static mode)");
          } else {
            // No subtitles or title, copy final video as-is
            await fs.promises.copyFile(tempFinalPath, standardVideoPath);
            logger.info({
              from: tempFinalPath,
              to: standardVideoPath
            }, "✅ Final video copied to standard location for GCS upload (no subtitles/title)");
          }

          // Calculate total duration
          const totalDuration = this.calculateTotalDuration(scenes);

          return {
            outputPath: standardVideoPath,
            duration: totalDuration,
            scenes
          };
        }

      } catch (error) {
        logger.error({ error, videoId: context.videoId }, "❌ Consistent Shorts workflow failed");
        throw error;
      }

    } catch (error) {
      logger.error({ error }, "Failed to process Consistent Shorts workflow");
      throw error;
    }
  }
}
