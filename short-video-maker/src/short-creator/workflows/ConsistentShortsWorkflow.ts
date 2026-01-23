import fs from "fs-extra";
import path from "path";
import cuid from "cuid";
import { BaseWorkflow, WorkflowContext, WorkflowResult } from "./BaseWorkflow";
import { VideoProcessor } from "../processors/VideoProcessor";
import { GoogleVeoAPI } from "../libraries/GoogleVeo";
import { RunwayAPI } from "../libraries/RunwayAPI";
import { VIDEO_DIMENSIONS } from "../utils/Constants";
import { logger } from "../../logger";
import { ImageGenerationService } from "../../image-generation/services/ImageGenerationService";
import { ImageModelType } from "../../image-generation/models/imageModels";
import { CharacterStorageService } from "../../character-store/CharacterStorageService";
// CharacterProfile, Character types moved to CharacterHelper.ts
import type { Scene, SceneInput, AudioConfig, SceneCharacterImages, TitleTextConfig } from "../../types/shorts";
// 🔥 2026-01-19: 분리된 서비스 import (YTB-tts -> AudioService로 이동)
import { captionService } from "../services/CaptionService";
import { characterHelper } from "../services/CharacterHelper";
import { audioService } from "../services/AudioService";
import { videoFinalizerService } from "../services/VideoFinalizerService";
import { veo3ProcessorService } from "../services/VEO3ProcessorService";

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
    private veoAPI?: GoogleVeoAPI | RunwayAPI,
    private characterStorage?: CharacterStorageService
  ) {
    super();
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
          const sceneCharacterImages = characterHelper.getSceneCharacterImages(
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
            // ⭐ SINGLE CHARACTER: Use NANO BANANA with stored image as REFERENCE
            // 🔥 FIX: Previously used stored image directly as first frame (bad for VEO)
            // Now: Generate scene-specific image with stored character as reference
            const characterImage = sceneCharacterImages.images[0];

            logger.info({
              sceneIndex: i + 1,
              characterId: characterImage.characterId,
              imageSize: characterImage.data.length
            }, "🎯 Using NANO BANANA with stored character image as REFERENCE (not direct use)");

            // Set NANO BANANA model
            this.imageGenerationService.setModel(ImageModelType.NANO_BANANA);

            // Build scene-specific prompt
            const scenePrompt = `${scene.imageData?.prompt || scene.text}. Style: ${scene.imageData?.style || "pixar"}. Mood: ${scene.imageData?.mood || "dynamic"}. Maintain consistent character appearance.`;
            const aspectRatio = context.orientation === "portrait" ? "9:16" : "16:9";

            // Use stored character image as REFERENCE only
            const referenceImages = [{
              data: characterImage.data,
              mimeType: characterImage.mimeType
            }];

            logger.debug({
              sceneIndex: i + 1,
              characterId: characterImage.characterId,
              prompt: scenePrompt.substring(0, 100)
            }, "🔗 Using stored character image as reference for scene-specific generation");

            // Generate scene-specific image with character reference
            const result = await this.imageGenerationService.generateImages({
              prompt: scenePrompt,
              numberOfImages: 1,
              aspectRatio: aspectRatio as "9:16" | "16:9",
              referenceImages: referenceImages  // Character reference for consistency
            }, context.videoId, i);

            if (!result.success || !result.images || result.images.length === 0) {
              throw new Error(`Failed to generate scene image for scene ${i + 1}`);
            }

            const generatedImage = result.images[0];
            finalImage = {
              data: generatedImage.data,
              mimeType: generatedImage.mimeType || "image/png"
            };

            // Save generated image
            const simpleFilename = `singlechar_scene_${i + 1}_${context.videoId}.png`;
            savedImagePath = path.join(videoTempDir, simpleFilename);
            await fs.writeFile(savedImagePath, generatedImage.data);

            logger.info({
              sceneIndex: i + 1,
              characterId: characterImage.characterId,
              imagePath: savedImagePath,
              usedCharacterReference: true
            }, "✅ Scene-specific image generated with character reference");

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
            const multiCharPrompt = characterHelper.buildMultiCharacterPrompt(
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
            // Original flow: Generate images (no useStoredImageForVeo or no characters)
            // 🔥 GPT-First Mode: First scene with GPT-4o, rest with NanoBanana using GPT image as reference
            const useGPTFirst = context.config.useGPTFirst === true;

            // Enhanced prompt with character consistency
            const enhancedPrompt = `${scene.imageData.prompt || scene.text}. Style: ${scene.imageData.style || "cinematic"}. Mood: ${scene.imageData.mood || "dynamic"}. Maintain consistent character appearance.`;
            const aspectRatio = context.orientation === "portrait" ? "9:16" : "16:9";

            if (useGPTFirst && i === 0) {
              // 🎨 GPT-First Mode: Scene 0 - Generate with GPT-4o (no reference)
              logger.info({
                sceneIndex: i + 1,
                prompt: enhancedPrompt.substring(0, 100),
                mode: 'GPT-First'
              }, "🎨 GPT-First Mode: Generating FIRST scene with GPT-4o (this becomes the reference)");

              // Set GPT_IMAGE_1 model
              this.imageGenerationService.setModel(ImageModelType.GPT_IMAGE_1);

              // Generate WITHOUT reference (this is the character reference image)
              const result = await this.imageGenerationService.generateImages({
                prompt: enhancedPrompt,
                numberOfImages: 1,
                aspectRatio: aspectRatio as "9:16" | "16:9"
                // NO referenceImages - GPT generates the base character
              }, context.videoId, i);

              if (!result.success || !result.images || result.images.length === 0) {
                throw new Error(`GPT-First: Failed to generate first scene image with GPT-4o`);
              }

              const generatedImage = result.images[0];

              finalImage = {
                data: generatedImage.data,
                mimeType: generatedImage.mimeType || "image/png"
              };

              // Save GPT image
              const simpleFilename = `gpt_first_scene_${i + 1}_${context.videoId}.png`;
              savedImagePath = path.join(videoTempDir, simpleFilename);

              await fs.writeFile(savedImagePath, generatedImage.data);

              logger.info({
                sceneIndex: i + 1,
                imagePath: savedImagePath,
                fileSize: generatedImage.data.length,
                mode: 'GPT-First'
              }, "✅ GPT-First: First scene generated with GPT-4o - this is now the character reference!");

            } else {
              // 🔗 NanoBanana Mode: Scene 1~N (or all scenes if useGPTFirst is false)
              // Set NANO BANANA model (best for character consistency)
              this.imageGenerationService.setModel(ImageModelType.NANO_BANANA);

              // ⭐ KEY FEATURE: Use previous images as references (max 3)
              // GPT-First: previousImages[0] is the GPT-generated character reference
              // This is like Chat Mode in ipynb - maintains character consistency!
              // 🔥 FIX: Always include stored character images to prevent drift
              // Stored images have sceneIndex < 0, generated images have sceneIndex >= 0
              const storedImages = previousImages.filter(img => img.sceneIndex < 0);
              const generatedImages = previousImages.filter(img => img.sceneIndex >= 0);
              // Always include ALL stored character images + only most recent generated images
              // Total max 3 to not overwhelm NANO BANANA
              const maxGenerated = Math.max(0, 3 - storedImages.length);
              const recentGenerated = generatedImages.slice(-maxGenerated);
              const combinedRefs = [...storedImages, ...recentGenerated];
              const referenceImages = combinedRefs.length > 0
                ? combinedRefs.map(img => ({
                    data: img.data,
                    mimeType: img.mimeType
                  }))
                : undefined;

              logger.info({
                sceneIndex: i,
                storedImageCount: storedImages.length,
                generatedImageCount: generatedImages.length,
                usedGeneratedCount: recentGenerated.length,
                totalReferenceCount: combinedRefs.length,
                useGPTFirst,
                hasGPTReference: useGPTFirst && generatedImages.length > 0,
                prompt: enhancedPrompt.substring(0, 80)
              }, useGPTFirst
                ? "🔗 GPT-First Mode: Using GPT image as reference for NanoBanana"
                : "🔗 Reference images (stored chars ALWAYS included to prevent drift)");

              // Generate image with references
              const result = await this.imageGenerationService.generateImages({
                prompt: enhancedPrompt,
                numberOfImages: 1,
                aspectRatio: aspectRatio as "9:16" | "16:9",
                referenceImages: referenceImages // ⭐ GPT-First: GPT image is in here!
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
              const simpleFilename = useGPTFirst
                ? `gpt_ref_scene_${i + 1}_${context.videoId}.png`
                : `consistent_scene_${i + 1}_${context.videoId}.png`;
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
                usedReferences: referenceImages?.length || 0,
                useGPTFirst
              }, useGPTFirst
                ? "✅ GPT-First: Scene generated with NanoBanana using GPT reference"
                : "✅ Consistent character image generated and saved");
            }
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
        // 🔥 Fix: skipTTS 모드에서 inputScenes[i].duration 사용
        for (let i = 0; i < scenes.length; i++) {
          const scene = scenes[i];
          const inputDuration = (inputScenes[i] as any)?.duration;
          if (scene.audio?.duration) {
            // 최소 씬 길이 보장: TTS가 짧아도 충분한 콘텐츠 제공
            imageDataList[i].duration = Math.max(scene.audio.duration, MIN_SCENE_DURATION);
          } else if (inputDuration) {
            // skipTTS 모드: inputScenes에서 duration 가져옴
            imageDataList[i].duration = Math.max(inputDuration, MIN_SCENE_DURATION);
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
            // 🔥 FIX: Also check inputScenes[i].duration for skipTTS mode
            const duration = imageData.duration || scenes[i]?.audio?.duration || inputScenes[i]?.duration || 8;

            // ⭐ VEO 3.1 First+Last Frame: Check if same characters in next scene
            const hasNextScene = i < imageDataList.length - 1;
            const currentCharacterIds = inputScenes[i].characterIds || [];
            const nextCharacterIds = hasNextScene ? (inputScenes[i + 1].characterIds || []) : [];

            // 🔥 FIX: Only use next scene as lastFrame if SAME characters
            // Otherwise, character morphing causes face distortion!
            const sameCharactersInNextScene = hasNextScene &&
              currentCharacterIds.length === nextCharacterIds.length &&
              currentCharacterIds.every(id => nextCharacterIds.includes(id));

            const nextSceneImage = (hasNextScene && sameCharactersInNextScene) ? imageDataList[i + 1] : null;

            // 🔥 NEW: For character consistency, use SAME image as both first and last frame
            // This tells VEO to keep the character consistent throughout the scene
            const useSameImageForLastFrame = useFrameInterpolation && !sameCharactersInNextScene;

            logger.info({
              sceneIndex: i + 1,
              duration,
              useFrameInterpolation,
              hasNextScene,
              sameCharactersInNextScene,
              useSameImageForLastFrame,
              currentCharacterIds,
              nextCharacterIds,
              willUseLastFrame: useFrameInterpolation
            }, useFrameInterpolation
              ? (sameCharactersInNextScene
                  ? "🔄 VEO 3.1: Using NEXT scene image as lastFrame (same characters)"
                  : "🔄 VEO 3.1: Using SAME image as lastFrame (different characters - prevents morphing)")
              : "🔄 Converting image to video with VEO3 (no frame interpolation)");

            try {
              // Convert image to base64 for VEO3
              const imageBase64 = imageData.imageBuffer.toString('base64');

              // VEO3 I2V generation
              const videoPrompt = scene.videoPrompt || scene.text || `Scene ${i + 1}`;

              // ⭐ Prepare lastImage for VEO 3.1 First+Last Frame interpolation
              // 🔥 FIX: Use same image as lastFrame when characters differ between scenes
              const lastImage = useFrameInterpolation
                ? (nextSceneImage
                    ? { data: nextSceneImage.imageBuffer.toString('base64'), mimeType: "image/png" }
                    : { data: imageBase64, mimeType: "image/png" })  // Same image as first frame
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

              // 🔥 Fix: Get ACTUAL video duration from ffprobe (VEO may return different length)
              const actualDuration = await this.videoProcessor.getFFmpeg().getVideoDuration(videoPath);

              logger.info({
                sceneIndex: i + 1,
                requestedDuration: duration,
                actualDuration,
                difference: duration - actualDuration
              }, actualDuration !== duration
                ? "⚠️ VEO3 returned different duration than requested!"
                : "✅ VEO3 duration matches request");

              sceneResults.push({
                type: 'video',
                path: videoPath,
                duration: actualDuration  // 🔥 Use ACTUAL duration, not requested!
              });

              veo3SuccessCount++;

              logger.info({
                sceneIndex: i + 1,
                videoPath,
                actualDuration
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
              // 🔥 Fix: skipTTS 모드에서 inputScenes[i].duration 사용
              const inputDuration = (inputScenes[i] as any)?.duration;
              const audioDuration = scenes[i]?.audio?.duration || inputDuration || result.duration;
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

              // 🔥 Collect captions with time offset for subtitles (refactored)
              const sceneData = scenes[i];
              const inputScene = inputScenes[i];
              const captionResult = captionService.collectSceneCaptions(
                sceneData,
                (inputScene as any)?.textEnglish,
                sceneDuration,
                cumulativeDuration,
                context.config?.skipTTS === true,
                i
              );
              allCaptions.push(...captionResult.koreanCaptions);
              allEnglishCaptions.push(...captionResult.englishCaptions);
              cumulativeDuration += sceneDuration;
            }

            // 🔥 Scene transition settings from metadata
            const useSceneTransitions = context.metadata?.useSceneTransitions ?? true;
            const sceneTransitionType = (context.metadata?.sceneTransitionType as string) || 'fade';
            const sceneTransitionDuration = (context.metadata?.sceneTransitionDuration as number) || 0.5;

            // 🔥 Refactored: xfade 캡션 타이밍 조정 (VEO3ProcessorService)
            if (useSceneTransitions && trimmedVideoPaths.length > 1) {
              const xfadeSceneDurations = scenes.map(s =>
                Math.max(s?.audio?.duration || MIN_SCENE_DURATION, MIN_SCENE_DURATION)
              );
              veo3ProcessorService.adjustCaptionsForXfade({
                koreanCaptions: allCaptions,
                englishCaptions: allEnglishCaptions,
                sceneDurations: xfadeSceneDurations,
                transitionDuration: sceneTransitionDuration,
                minSceneDuration: MIN_SCENE_DURATION
              });
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

            // 🔥 Collect captions with time offset for subtitles (static mode, refactored)
            for (let i = 0; i < scenes.length; i++) {
              const sceneData = scenes[i];
              const inputScene = inputScenes[i];
              const sceneDuration = imageDataList[i]?.duration || Math.max(sceneData?.audio?.duration || MIN_SCENE_DURATION, MIN_SCENE_DURATION);

              const captionResult = captionService.collectSceneCaptions(
                sceneData,
                (inputScene as any)?.textEnglish,
                sceneDuration,
                cumulativeDuration,
                context.config?.skipTTS === true,
                i
              );
              allCaptions.push(...captionResult.koreanCaptions);
              allEnglishCaptions.push(...captionResult.englishCaptions);
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
              // 🔥 Fix: skipTTS 모드에서 inputScenes[i].duration 사용
              const inputDuration = (inputScenes[i] as any)?.duration;
              const audioDuration = scenes[i]?.audio?.duration || inputDuration || result.duration;
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

              // 🔥 Collect captions with time offset for subtitles (mixed mode, refactored)
              const sceneData = scenes[i];
              const inputScene = inputScenes[i];
              const captionResult = captionService.collectSceneCaptions(
                sceneData,
                (inputScene as any)?.textEnglish,
                sceneDuration,
                cumulativeDuration,
                context.config?.skipTTS === true,
                i
              );
              allCaptions.push(...captionResult.koreanCaptions);
              allEnglishCaptions.push(...captionResult.englishCaptions);
              cumulativeDuration += sceneDuration;
            }

            // 모든 처리된 클립 결합 (xfade 전환 효과 적용)
            const useSceneTransitionsMixed = context.metadata?.useSceneTransitions ?? true;
            const sceneTransitionTypeMixed = (context.metadata?.sceneTransitionType as string) || 'fade';
            const sceneTransitionDurationMixed = (context.metadata?.sceneTransitionDuration as number) || 0.5;

            // 🔥 Refactored: xfade 캡션 타이밍 조정 (VEO3ProcessorService) - mixed mode
            if (useSceneTransitionsMixed && processedClips.length > 1) {
              const xfadeSceneDurationsMixed = scenes.map(s =>
                Math.max(s?.audio?.duration || MIN_SCENE_DURATION, MIN_SCENE_DURATION)
              );
              veo3ProcessorService.adjustCaptionsForXfade({
                koreanCaptions: allCaptions,
                englishCaptions: allEnglishCaptions,
                sceneDurations: xfadeSceneDurationsMixed,
                transitionDuration: sceneTransitionDurationMixed,
                minSceneDuration: MIN_SCENE_DURATION
              });
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
          const skipTTSMode = context.config?.skipTTS === true;

          for (let sceneIdx = 0; sceneIdx < scenes.length; sceneIdx++) {
            const scene = scenes[sceneIdx];
            // 🔥 FIX: Also check inputScenes[i].duration for skipTTS mode
            const inputDuration = inputScenes[sceneIdx]?.duration;
            if (scene.audio?.duration) {
              sceneDurations.push(scene.audio.duration);
            } else if (inputDuration) {
              sceneDurations.push(inputDuration);
            } else {
              sceneDurations.push(MIN_SCENE_DURATION);
            }

            // Only collect audio files if URL exists (skip for skipTTS mode)
            if (scene.audio?.url) {
              const audioFileName = scene.audio.url.split('/').pop();
              if (audioFileName) {
                audioFiles.push(path.join(this.videoProcessor.getConfig().tempDirPath, audioFileName));
              }
            }
          }

          logger.info({
            sceneDurations,
            audioFilesCount: audioFiles.length,
            skipTTSMode
          }, "📊 Scene audio data collected");

          // 🔥 Sound Effects Integration (using AudioService)
          const audioConfig = context.metadata?.audioConfig as AudioConfig | undefined;
          const finalAudioPath = await audioService.mixAudioWithSoundEffects({
            audioFiles,
            sceneDurations,
            audioConfig,
            apiKey: context.systemConfig.freesoundApiKey,
            tempDirPath: videoTempDir,
            videoId: context.videoId,
            skipTTS: skipTTSMode,
            ffmpeg: this.videoProcessor.getFFmpeg()
          });

          const tempFinalPath = path.join(videoTempDir, `final_${context.videoId}.mp4`);

          // 🔥 Refactored: 오디오 적용 로직 통합 (VideoFinalizerService)
          await videoFinalizerService.applyAudioToVideo({
            videoPath: tempVideoPath,
            outputPath: tempFinalPath,
            finalAudioPath,
            audioFiles,
            videoId: context.videoId,
            ffmpeg: this.videoProcessor.getFFmpeg(),
            videoProcessorCombine: this.videoProcessor.combineVideoWithAudio.bind(this.videoProcessor)
          });

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
            scenesCount: scenes.length
          }, "🔍 DEBUG: Pre-subtitle check state");

          // 🔥 Refactored: 자막 적용 로직 통합 (VideoFinalizerService)
          const titleLanguage = (context.metadata?.language as 'english' | 'korean') || 'korean';
          await videoFinalizerService.applySubtitlesToVideo({
            inputPath: tempFinalPath,
            outputPath: standardVideoPath,
            titleText: titleText || null,
            allKoreanCaptions: allCaptions,
            allEnglishCaptions,
            language: titleLanguage,
            orientation: context.orientation,
            totalDuration: cumulativeDuration,
            skipTTS: skipTTSMode,
            videoId: context.videoId,
            addSubtitlesFunction: this.videoProcessor.addTitleAndSubtitlesToVideo.bind(this.videoProcessor)
          });

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

          // 🔥 Collect captions with time offset for subtitles (no VEO3 static mode, refactored)
          for (let i = 0; i < scenes.length; i++) {
            const sceneData = scenes[i];
            const inputScene = inputScenes[i];
            const sceneDuration = imageDataList[i]?.duration || Math.max(sceneData?.audio?.duration || MIN_SCENE_DURATION, MIN_SCENE_DURATION);

            const captionResult = captionService.collectSceneCaptions(
              sceneData,
              (inputScene as any)?.textEnglish,
              sceneDuration,
              cumulativeDuration,
              context.config?.skipTTS === true,
              i
            );
            allCaptions.push(...captionResult.koreanCaptions);
            allEnglishCaptions.push(...captionResult.englishCaptions);
            cumulativeDuration += sceneDuration;
          }

          // Step 4: Combine with audio (+ Sound Effects Integration)
          const audioFiles: string[] = [];
          const sceneDurations: number[] = [];
          const skipTTSMode = context.config?.skipTTS === true;

          for (let sceneIdx = 0; sceneIdx < scenes.length; sceneIdx++) {
            const scene = scenes[sceneIdx];
            // 🔥 FIX: Also check inputScenes[i].duration for skipTTS mode
            const inputDuration = inputScenes[sceneIdx]?.duration;
            if (scene.audio?.duration) {
              sceneDurations.push(scene.audio.duration);
            } else if (inputDuration) {
              sceneDurations.push(inputDuration);
            } else {
              sceneDurations.push(MIN_SCENE_DURATION);
            }

            // Only collect audio files if URL exists (skip for skipTTS mode)
            if (scene.audio?.url) {
              const audioFileName = scene.audio.url.split('/').pop();
              if (audioFileName) {
                audioFiles.push(path.join(this.videoProcessor.getConfig().tempDirPath, audioFileName));
              }
            }
          }

          logger.info({
            sceneDurations,
            audioFilesCount: audioFiles.length,
            skipTTSMode
          }, "📊 Scene audio data collected (non-VEO path)");

          // 🔥 Sound Effects Integration (using AudioService)
          const audioConfig = context.metadata?.audioConfig as AudioConfig | undefined;
          const finalAudioPath = await audioService.mixAudioWithSoundEffects({
            audioFiles,
            sceneDurations,
            audioConfig,
            apiKey: context.systemConfig.freesoundApiKey,
            tempDirPath: videoTempDir,
            videoId: context.videoId,
            skipTTS: skipTTSMode,
            ffmpeg: this.videoProcessor.getFFmpeg()
          });

          const tempFinalPath = path.join(videoTempDir, `final_${context.videoId}.mp4`);

          // 🔥 Refactored: 오디오 적용 로직 통합 (VideoFinalizerService)
          await videoFinalizerService.applyAudioToVideo({
            videoPath: tempVideoPath,
            outputPath: tempFinalPath,
            finalAudioPath,
            audioFiles,
            videoId: context.videoId,
            ffmpeg: this.videoProcessor.getFFmpeg(),
            videoProcessorCombine: this.videoProcessor.combineVideoWithAudio.bind(this.videoProcessor)
          });

          // 🔥 Apply synchronized subtitles to final video
          const standardVideoPath = path.join(
            this.videoProcessor.getConfig().videosDirPath,
            `${context.videoId}.mp4`
          );

          // 🔥 Refactored: 자막 적용 로직 통합 (VideoFinalizerService)
          const titleLanguageNoVeo = (context.metadata?.language as 'english' | 'korean') || 'korean';
          await videoFinalizerService.applySubtitlesToVideo({
            inputPath: tempFinalPath,
            outputPath: standardVideoPath,
            titleText: titleText || null,
            allKoreanCaptions: allCaptions,
            allEnglishCaptions,
            language: titleLanguageNoVeo,
            orientation: context.orientation,
            totalDuration: cumulativeDuration,
            skipTTS: skipTTSMode,
            videoId: context.videoId,
            addSubtitlesFunction: this.videoProcessor.addTitleAndSubtitlesToVideo.bind(this.videoProcessor)
          });

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
