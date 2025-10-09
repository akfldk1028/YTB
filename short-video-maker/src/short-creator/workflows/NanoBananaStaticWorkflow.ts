import fs from "fs-extra";
import path from "path";
import { BaseWorkflow, WorkflowContext, WorkflowResult } from "./BaseWorkflow";
import { VideoProcessor } from "../processors/VideoProcessor";
import { NanoBananaVideoSource } from "../video-sources/NanoBananaVideoSource";
import { NanoBananaStaticVideoHelper } from "../nanoBananaStaticVideo";
import { VIDEO_DIMENSIONS } from "../utils/Constants";
import { logger } from "../../logger";
import { ImageGenerationService } from "../../image-generation/services/ImageGenerationService";
import { ImageModelType } from "../../image-generation/models/imageModels";
import type { Scene, SceneInput } from "../../types/shorts";

export class NanoBananaStaticWorkflow extends BaseWorkflow {
  constructor(
    private videoProcessor: VideoProcessor,
    private nanoBananaSource: NanoBananaVideoSource,
    private imageGenerationService?: ImageGenerationService
  ) {
    super();
  }

  async process(
    scenes: Scene[],
    inputScenes: SceneInput[],
    context: WorkflowContext
  ): Promise<WorkflowResult> {
    try {
      logger.info({ 
        videoId: context.videoId, 
        sceneCount: scenes.length 
      }, "🎬 Processing NANO BANANA static video workflow");

      this.validateScenes(scenes);

      // Create video-specific temp folder - EXACTLY like deprecated code  
      const videoTempDir = this.videoProcessor.createVideoTempDir(context.videoId);
      await fs.ensureDir(videoTempDir);
      logger.info({ videoTempDir, videoId: context.videoId }, "✅ Created video-specific temp directory");
      
      // Force verify folder creation
      const folderExists = await fs.pathExists(videoTempDir);
      if (!folderExists) {
        throw new Error(`Failed to create video temp directory: ${videoTempDir}`);
      }

      try {
        // Step 1: Generate images for ALL scenes at once
        logger.info({ videoId: context.videoId, sceneCount: inputScenes.length }, "🎬 Starting NANO BANANA image generation for all scenes");
        
        const imageDataList = [];
        
        for (let i = 0; i < inputScenes.length; i++) {
          const scene = inputScenes[i];
          logger.info({ sceneIndex: i + 1, totalScenes: inputScenes.length }, "📸 Generating image for scene");
          
          if (!scene.imageData) {
            scene.imageData = {
              prompt: scene.text,
              style: "cinematic",
              mood: "dynamic"
            };
          }
          
          // Generate image directly using ImageGenerationService
          if (!this.imageGenerationService) {
            throw new Error("ImageGenerationService is not available for NANO BANANA mode");
          }
          
          // Set NANO BANANA model
          this.imageGenerationService.setModel(ImageModelType.NANO_BANANA);
          
          // Prepare image generation query
          const enhancedPrompt = `${scene.imageData.prompt || scene.text}. Style: ${scene.imageData.style || "cinematic"}. Mood: ${scene.imageData.mood || "dynamic"}`;
          const aspectRatio = context.orientation === "portrait" ? "9:16" : "16:9";
          
          const result = await this.imageGenerationService.generateImages({
            prompt: enhancedPrompt,
            numberOfImages: 1,
            aspectRatio: aspectRatio as "9:16" | "16:9"
          }, context.videoId, i);
          
          if (!result.success || !result.images || result.images.length === 0) {
            throw new Error(`Failed to generate image for scene ${i + 1}`);
          }
          
          const generatedImage = result.images[0];
          
          // Save image to video ID folder
          const simpleFilename = `scene_${i + 1}_${context.videoId}.png`;
          const savedImagePath = path.join(videoTempDir, simpleFilename);
          
          logger.debug({
            videoTempDir,
            originalFilename: generatedImage.filename,
            simpleFilename,
            savedImagePath,
            videoId: context.videoId,
            sceneIndex: i
          }, "💾 Saving image to videoId folder");
          
          await fs.writeFile(savedImagePath, generatedImage.data);
          
          // Verify file was saved 
          const fileExists = await fs.pathExists(savedImagePath);
          const fileStats = fileExists ? await fs.stat(savedImagePath) : null;
          
          logger.info({
            sceneIndex: i + 1,
            imagePath: savedImagePath,
            filename: generatedImage.filename,
            fileExists,
            fileSize: fileStats?.size,
            imageSize: generatedImage.data.length,
            videoTempDir
          }, "✅ Image generated and saved for scene");
          
          imageDataList.push({
            imagePath: savedImagePath,
            duration: 3, // Default duration, will be updated with actual audio length
            sceneText: scene.text
          });
        }

        // Step 2: Update durations from audio data
        for (let i = 0; i < scenes.length; i++) {
          const scene = scenes[i];
          if (scene.audio?.duration) {
            imageDataList[i].duration = scene.audio.duration;
          }
        }

        // Step 3: Create one static video from all images
        const tempVideoPath = path.join(videoTempDir, `nano_banana_static_${context.videoId}.mp4`);
        const dimensions = context.orientation === "portrait" 
          ? VIDEO_DIMENSIONS.PORTRAIT 
          : VIDEO_DIMENSIONS.LANDSCAPE;

        await this.videoProcessor.createStaticVideoFromMultipleImages(
          imageDataList,
          tempVideoPath,
          dimensions
        );

        logger.info("✅ Static video created from all NANO BANANA images");

        // Step 4: Combine with audio
        const audioFiles: string[] = [];
        for (const scene of scenes) {
          if (scene.audio?.url) {
            const audioFileName = scene.audio.url.split('/').pop();
            const audioPath = this.videoProcessor.createTempPath(audioFileName!);
            if (fs.existsSync(audioPath)) {
              audioFiles.push(audioPath);
            }
          }
        }

        // Concatenate all audio files if multiple scenes
        let finalAudioPath: string;
        const totalDuration = imageDataList.reduce((sum, img) => sum + img.duration, 0);
        const outputPath = this.videoProcessor.createOutputPath(context.videoId);

        if (audioFiles.length > 1) {
          logger.info({ audioFileCount: audioFiles.length }, "Concatenating multiple audio files");
          finalAudioPath = path.join(videoTempDir, `concatenated_audio_${context.videoId}.mp3`);
          await this.videoProcessor.concatenateAudioFiles(audioFiles, finalAudioPath);
          logger.info({ finalAudioPath }, "✅ Audio files concatenated");
        } else {
          finalAudioPath = audioFiles[0];
          logger.debug("Using single audio file (no concatenation needed)");
        }

        // Collect all captions for subtitle overlay
        const allCaptions: any[] = [];
        let cumulativeDuration = 0;

        for (const scene of scenes) {
          if (scene.captions && scene.captions.length > 0) {
            const adjustedCaptions = scene.captions.map((caption: any) => ({
              ...caption,
              startMs: caption.startMs + (cumulativeDuration * 1000),
              endMs: caption.endMs + (cumulativeDuration * 1000),
            }));
            allCaptions.push(...adjustedCaptions);
          }
          cumulativeDuration += scene.audio?.duration || 0;
        }

        // Combine video with audio and add subtitles
        await this.videoProcessor.processSingleScene(
          tempVideoPath,
          finalAudioPath,
          allCaptions,
          totalDuration,
          context.orientation,
          context.config,
          outputPath
        );

        // NOTE: 이미지 파일들은 삭제하지 않음 - VEO3에서 이 이미지들을 사용해야 함
        // temp video는 삭제
        if (fs.existsSync(tempVideoPath)) {
          fs.unlinkSync(tempVideoPath);
        }
        
        logger.info(`✅ Keeping NANO BANANA images in ${videoTempDir} for VEO3 processing`);

        logger.info("🎉 NANO BANANA static video processing complete");

        return {
          outputPath,
          duration: totalDuration,
          scenes
        };

      } finally {
        // NOTE: video ID 폴더는 삭제하지 않음 - VEO3에서 이미지 파일들을 사용해야 함
        logger.debug({ videoTempDir, videoId: context.videoId }, "Keeping video-specific temp directory for VEO3 processing");
      }

    } catch (error) {
      logger.error(error, "Failed to process NANO BANANA static workflow");
      throw new Error(`NANO BANANA static workflow failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}