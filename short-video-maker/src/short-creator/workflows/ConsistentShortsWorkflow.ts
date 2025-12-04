import fs from "fs-extra";
import path from "path";
import { BaseWorkflow, WorkflowContext, WorkflowResult } from "./BaseWorkflow";
import { VideoProcessor } from "../processors/VideoProcessor";
import { GoogleVeoAPI } from "../libraries/GoogleVeo";
import { VIDEO_DIMENSIONS } from "../utils/Constants";
import { logger } from "../../logger";
import { ImageGenerationService } from "../../image-generation/services/ImageGenerationService";
import { ImageModelType } from "../../image-generation/models/imageModels";
import { CharacterStorageService } from "../../character-store/CharacterStorageService";
import type { CharacterProfile, Character } from "../../character-store/types";
import type { Scene, SceneInput } from "../../types/shorts";

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

        // ⭐ NEW: Load stored character images if profileId is provided
        // This enables character persistence across multiple video sessions!
        const characterProfileId = context.metadata?.characterProfileId as string | undefined;
        const characterIds = context.metadata?.characterIds as string[] | undefined;

        // 🔍 DEBUG: Always log this check
        logger.info({
          characterProfileId,
          characterIds,
          hasCharacterStorage: !!this.characterStorage,
          characterStorageEnabled: this.characterStorage?.isEnabled?.() ?? false
        }, "🔍 DEBUG: Checking if should load stored character images");

        if (characterProfileId) {
          logger.info({
            characterProfileId,
            characterIds
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
          }

          logger.info({
            storedImageCount: storedImages.length,
            previousImagesTotal: previousImages.length
          }, "✅ Stored character images loaded as initial references");
        }

        for (let i = 0; i < inputScenes.length; i++) {
          const scene = inputScenes[i];

          logger.info({
            sceneIndex: i + 1,
            totalScenes: inputScenes.length,
            hasPreviousImages: previousImages.length > 0,
            referenceImageCount: Math.min(previousImages.length, 3)
          }, "📸 Generating image for scene with character consistency");

          if (!scene.imageData) {
            scene.imageData = {
              prompt: scene.text,
              style: "cinematic",
              mood: "dynamic"
            };
          }

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

          // Save image
          const simpleFilename = `consistent_scene_${i + 1}_${context.videoId}.png`;
          const savedImagePath = path.join(videoTempDir, simpleFilename);

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

          // ⭐ Add to previous images for next scene reference
          previousImages.push({
            data: generatedImage.data,
            mimeType: generatedImage.mimeType || "image/png",
            sceneIndex: i
          });

          imageDataList.push({
            imagePath: savedImagePath,
            duration: 3, // Will be updated with actual audio length
            sceneText: scene.text,
            imageBuffer: generatedImage.data
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
          logger.info("🎬 Converting consistent images to videos with VEO3 I2V");

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

            logger.info({
              sceneIndex: i + 1,
              duration
            }, "🔄 Converting image to video with VEO3");

            try {
              // Convert image to base64 for VEO3
              const imageBase64 = imageData.imageBuffer.toString('base64');

              // VEO3 I2V generation
              const videoPrompt = scene.videoPrompt || scene.text || `Scene ${i + 1}`;

              const video = await this.veoAPI.findVideo(
                [videoPrompt],
                duration,          // minDurationSeconds (number)
                [],                // excludeIds
                context.orientation, // orientation
                300000,            // timeout (5 minutes)
                0,                 // retryCounter
                {                  // initialImage for I2V
                  data: imageBase64,
                  mimeType: "image/png"
                }
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
            }

            logger.info({
              clipCount: trimmedVideoPaths.length,
              clips: trimmedVideoPaths
            }, "🎬 Combining trimmed VEO3 video clips");

            tempVideoPath = path.join(videoTempDir, `veo3_combined_${context.videoId}.mp4`);
            await this.videoProcessor.combineVideoClips(trimmedVideoPaths, tempVideoPath);

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
            }

            // 모든 처리된 클립 결합
            tempVideoPath = path.join(videoTempDir, `mixed_combined_${context.videoId}.mp4`);
            await this.videoProcessor.combineVideoClips(processedClips, tempVideoPath);
          }

          logger.info({
            clipCount: sceneResults.length,
            outputPath: tempVideoPath
          }, "✅ Video clips combined");

          // Step 3B: Combine with audio
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

          // Copy final video to standard location for GCS upload
          const standardVideoPath = path.join(
            this.videoProcessor.getConfig().videosDirPath,
            `${context.videoId}.mp4`
          );

          await fs.promises.copyFile(tempFinalPath, standardVideoPath);
          logger.info({
            from: tempFinalPath,
            to: standardVideoPath
          }, "✅ Final video copied to standard location for GCS upload");

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

          // Copy final video to standard location for GCS upload
          const standardVideoPath = path.join(
            this.videoProcessor.getConfig().videosDirPath,
            `${context.videoId}.mp4`
          );

          await fs.promises.copyFile(tempFinalPath, standardVideoPath);
          logger.info({
            from: tempFinalPath,
            to: standardVideoPath
          }, "✅ Final video copied to standard location for GCS upload");

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
