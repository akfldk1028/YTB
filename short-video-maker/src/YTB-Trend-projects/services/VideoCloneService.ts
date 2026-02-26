/**
 * VideoCloneService (Node 5 — 오케스트레이터)
 * YouTube URL → 스타일 분석 → 새 교육 영상 생성
 *
 * Pipeline:
 *   1. Download (YouTubeDownloaderService)
 *   2. Analyze (GeminiVideoAnalyzerService)
 *   3. Build Profile (StyleProfileBuilderService)
 *   4. Plan Scenes (content → scene[] with prompts)
 *   5. Generate Images (NanoBanana via SceneImageService)
 *   6. Generate Videos (Provider × N scenes)
 *   7. Generate TTS (GeminiTTS × N scenes)
 *   8. Assemble (FFmpeg: concat + audio + subtitles)
 */

import path from 'path';
import fs from 'fs-extra';
import { GoogleGenAI } from '@google/genai';
import { logger, Config } from '../../config';
import { OrientationEnum } from '../../types/shorts';
import type { RenderConfig } from '../../types/shorts';
import { YouTubeDownloaderService } from './YouTubeDownloaderService';
import { GeminiVideoAnalyzerService } from './GeminiVideoAnalyzerService';
import { StyleProfileBuilderService } from './StyleProfileBuilderService';
import { KenBurnsVideoGenProvider } from '../providers/KenBurnsVideoGenProvider';
import { GrokVideoGenProvider } from '../providers/GrokVideoGenProvider';
import { Veo3VideoGenProvider } from '../providers/Veo3VideoGenProvider';
import { BaseVideoGenProvider } from '../providers/BaseVideoGenProvider';
import { SceneImageService } from '../../YTB-books-project/src/services/SceneImageService';
import { GeminiTTS } from '../../YTB-tts/providers/tts/GeminiTTS';
import { AudioProcessor } from '../../YTB-ffmpeg/AudioProcessor';
import { VideoConcat } from '../../YTB-ffmpeg/VideoConcat';
import { VideoEditor } from '../../YTB-ffmpeg/VideoEditor';
import { SCENE_PLANNING_PROMPT } from '../utils/PromptTemplates';
import {
  VideoGenProvider,
  type VideoCloneRequest,
  type VideoCloneResult,
  type VideoCloneCosts,
  type VideoCloneTiming,
  type TrendStyleProfile,
  type ScenePlan,
} from '../types';

const SCENE_COUNT = 5;
const MODEL = 'gemini-2.0-flash';

export class VideoCloneService {
  private config: Config;
  private downloader: YouTubeDownloaderService;
  private analyzer: GeminiVideoAnalyzerService;
  private profileBuilder: StyleProfileBuilderService;
  private audioProcessor: AudioProcessor;
  private videoConcat: VideoConcat;
  private videoEditor: VideoEditor;
  private geminiTTS: GeminiTTS;
  private imageService: SceneImageService;
  private ai: GoogleGenAI;
  private tempDir: string;

  constructor(config: Config) {
    if (!config.googleGeminiApiKey) {
      throw new Error('[VideoCloneService] GOOGLE_GEMINI_API_KEY is required');
    }

    this.config = config;
    const baseTempDir = path.join(config.tempDirPath, 'trend');

    this.tempDir = baseTempDir;
    this.downloader = new YouTubeDownloaderService(path.join(baseTempDir, 'downloads'));
    this.analyzer = new GeminiVideoAnalyzerService(config.googleGeminiApiKey);
    this.profileBuilder = new StyleProfileBuilderService(path.join(baseTempDir, 'profiles'));
    this.audioProcessor = new AudioProcessor();
    this.videoConcat = new VideoConcat();
    this.videoEditor = new VideoEditor();
    this.ai = new GoogleGenAI({ apiKey: config.googleGeminiApiKey });

    this.geminiTTS = new GeminiTTS({
      apiKey: config.googleGeminiApiKey,
      model: 'gemini-2.5-flash-preview-tts',
      defaultGender: 'male',
    });

    this.imageService = new SceneImageService(
      config.googleGeminiApiKey,
      config.openaiApiKey || '',
      path.join(baseTempDir, 'images'),
    );
  }

  /** 분석만 수행 (영상 생성 X) */
  async analyzeOnly(url: string): Promise<{
    success: boolean;
    profile?: TrendStyleProfile;
    error?: string;
  }> {
    // 1. 다운로드
    const dlResult = await this.downloader.download({ url });
    if (!dlResult.success || !dlResult.videoPath) {
      return { success: false, error: dlResult.error || 'Download failed' };
    }

    try {
      // 2. 분석
      const analysis = await this.analyzer.analyze({ videoPath: dlResult.videoPath });
      if (!analysis.success || !analysis.styleDNA) {
        return { success: false, error: analysis.error || 'Analysis failed' };
      }

      // 3. 프로필 빌드
      const channel = dlResult.metadata?.channel || 'Unknown';
      const profile = this.profileBuilder.build(analysis.styleDNA, url, channel);
      await this.profileBuilder.save(profile);

      return { success: true, profile };
    } finally {
      // 다운로드 파일 클린업
      if (dlResult.videoPath) {
        await fs.remove(dlResult.videoPath).catch(() => {});
      }
    }
  }

  /** 전체 파이프라인 실행 */
  async clone(request: VideoCloneRequest): Promise<VideoCloneResult> {
    const startTime = Date.now();
    const costs: VideoCloneCosts = { analysis: 0, videoGeneration: 0, tts: 0, total: 0 };
    const timing: VideoCloneTiming = { downloadMs: 0, analysisMs: 0, videoGenMs: 0, totalMs: 0 };

    const sessionDir = path.join(this.tempDir, `session_${Date.now()}`);
    await fs.ensureDir(sessionDir);

    let pipelineSuccess = false;

    try {
      let profile: TrendStyleProfile;

      // ── Step 1-3: 프로필 얻기 ──
      if (request.forceStyleProfile) {
        const cached = await this.profileBuilder.load(request.forceStyleProfile);
        if (!cached) {
          return { success: false, error: `Profile not found: ${request.forceStyleProfile}` };
        }
        profile = cached;
        logger.info({ profileId: profile.id }, '[Clone] Using cached profile');
      } else {
        const dlStart = Date.now();
        const dlResult = await this.downloader.download({ url: request.referenceUrl });
        timing.downloadMs = Date.now() - dlStart;

        if (!dlResult.success || !dlResult.videoPath) {
          return { success: false, error: dlResult.error || 'Download failed' };
        }

        const analyzeStart = Date.now();
        const analysis = await this.analyzer.analyze({ videoPath: dlResult.videoPath });
        timing.analysisMs = Date.now() - analyzeStart;
        costs.analysis = this.analyzer.getCostEstimate();

        await fs.remove(dlResult.videoPath).catch(() => {});

        if (!analysis.success || !analysis.styleDNA) {
          return { success: false, error: analysis.error || 'Analysis failed' };
        }

        const channel = dlResult.metadata?.channel || 'Unknown';
        profile = this.profileBuilder.build(analysis.styleDNA, request.referenceUrl, channel);
        await this.profileBuilder.save(profile);
      }

      // ── Step 4: 씬 계획 ──
      const sceneDuration = profile.sceneTimingRules.explanationDuration;
      const scenes = await this.planScenes(profile, request.content, SCENE_COUNT, sceneDuration);

      if (scenes.length === 0) {
        return { success: false, error: 'Scene planning returned empty result' };
      }

      logger.info({ sceneCount: scenes.length }, '[Clone] Scenes planned');

      // ── Step 5: 이미지 생성 ──
      // Map<sceneIndex, imagePath> — 실패한 씬은 제외
      const imageMap = new Map<number, string>();
      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        const styledPrompt = this.buildImagePrompt(scene, profile);

        const imgResult = await this.imageService.generateSceneImage(
          styledPrompt,
          i,
          '9:16',
        );

        if (imgResult.success && imgResult.imageBuffer) {
          const imgPath = path.join(sessionDir, `scene_${i}.png`);
          await fs.writeFile(imgPath, imgResult.imageBuffer);
          imageMap.set(i, imgPath);
        } else {
          logger.warn({ scene: i, error: imgResult.error }, '[Clone] Image gen failed, skipping scene');
        }
      }

      // ── Step 6: 비디오 생성 ──
      const videoGenStart = Date.now();
      const provider = this.getProvider(
        request.provider || VideoGenProvider.KENBURNS,
        sessionDir,
        profile.videoGeneration.motionStyle,
      );

      // Map<sceneIndex, videoPath> — index 정렬 유지
      const videoMap = new Map<number, string>();
      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        const imagePath = imageMap.get(i);

        if (!imagePath) {
          continue;
        }

        const videoResult = await provider.generateVideo({
          prompt: scene.visualPrompt,
          duration: scene.duration,
          aspectRatio: '9:16',
          styleHint: profile.videoGeneration.motionStyle,
          imagePath,
        });

        if (videoResult.success && videoResult.videoPath) {
          videoMap.set(i, videoResult.videoPath);
          costs.videoGeneration += videoResult.costEstimate || 0;
        } else {
          logger.warn({ scene: i, error: videoResult.error }, '[Clone] Video gen failed, skipping');
        }
      }

      timing.videoGenMs = Date.now() - videoGenStart;

      if (videoMap.size === 0) {
        return { success: false, error: 'All video generations failed' };
      }

      // ── Step 7: TTS 생성 (비디오 성공한 씬만) ──
      const successIndices = Array.from(videoMap.keys()).sort((a, b) => a - b);
      const audioFiles: string[] = [];
      const sceneVideoPaths: string[] = [];
      const sceneDurations: number[] = [];

      for (const idx of successIndices) {
        const scene = scenes[idx];

        try {
          const ttsResult = await this.geminiTTS.generate(
            scene.narration,
            profile.ttsConfig.voice,
            {
              language: 'ko',
              gender: profile.ttsConfig.gender,
              stylePrompt: profile.ttsConfig.stylePrompt,
            },
          );

          const audioPath = path.join(sessionDir, `audio_${idx}.mp3`);
          await this.audioProcessor.savePcmToMp3(ttsResult.audio, audioPath);
          const mp3Duration = await this.audioProcessor.getAudioDuration(audioPath);

          audioFiles.push(audioPath);
          sceneDurations.push(mp3Duration);
          costs.tts += 0.001;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn({ scene: idx, error: msg }, '[Clone] TTS failed');
          const silentPath = path.join(sessionDir, `silent_${idx}.mp3`);
          await this.audioProcessor.generateSilentAudio(silentPath, scene.duration);
          audioFiles.push(silentPath);
          sceneDurations.push(scene.duration);
        }

        sceneVideoPaths.push(videoMap.get(idx)!);
      }

      // ── Step 8: 합성 ──
      const finalAudioPath = path.join(sessionDir, 'final_audio.mp3');
      if (audioFiles.length > 1) {
        await this.audioProcessor.concatAudiosWithCrossfade(audioFiles, finalAudioPath, 0.1);
      } else if (audioFiles.length === 1) {
        await fs.copy(audioFiles[0], finalAudioPath);
      }

      const concatVideoPath = path.join(sessionDir, 'concat_video.mp4');
      if (sceneVideoPaths.length > 1) {
        await this.videoConcat.concatVideos(sceneVideoPaths, concatVideoPath);
      } else {
        await fs.copy(sceneVideoPaths[0], concatVideoPath);
      }

      const totalDuration = sceneDurations.reduce((a, b) => a + b, 0);
      const outputPath = path.join(sessionDir, 'output_final.mp4');

      const emptyConfig: RenderConfig = {};
      await this.videoEditor.combineVideoWithAudioAndCaptions(
        concatVideoPath,
        finalAudioPath,
        [],
        outputPath,
        totalDuration,
        OrientationEnum.portrait,
        emptyConfig,
        true, // skipSubtitles
      );

      costs.total = costs.analysis + costs.videoGeneration + costs.tts;
      timing.totalMs = Date.now() - startTime;
      pipelineSuccess = true;

      logger.info({
        outputPath,
        totalDuration: Math.round(totalDuration),
        totalCost: `$${costs.total.toFixed(2)}`,
        totalTimeS: Math.round(timing.totalMs / 1000),
        provider: request.provider || VideoGenProvider.KENBURNS,
      }, '[Clone] Pipeline complete');

      return {
        success: true,
        outputVideoPath: outputPath,
        profileUsed: profile.id,
        costs,
        timing,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error({ error: msg }, '[Clone] Pipeline failed');
      return { success: false, error: msg };
    } finally {
      // 실패 시 세션 디렉토리 정리
      if (!pipelineSuccess) {
        await fs.remove(sessionDir).catch(() => {});
      }
    }
  }

  /** 프로필 목록 조회 */
  async getProfiles() {
    return this.profileBuilder.listProfiles();
  }

  /** 프로필 상세 조회 */
  async getProfile(id: string) {
    return this.profileBuilder.load(id);
  }

  // ── 내부 메서드 ──

  private async planScenes(
    profile: TrendStyleProfile,
    content: VideoCloneRequest['content'],
    sceneCount: number,
    sceneDuration: number,
  ): Promise<ScenePlan[]> {
    try {
      const prompt = SCENE_PLANNING_PROMPT(
        JSON.stringify(profile.styleDNA, null, 2),
        content,
        sceneCount,
        sceneDuration,
      );

      const response = await this.ai.models.generateContent({
        model: MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });

      let rawText: string;
      try {
        rawText = response.text || '';
      } catch {
        rawText = '';
      }

      let jsonStr = rawText;
      const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) {
        jsonStr = fenceMatch[1].trim();
      }

      const scenes = JSON.parse(jsonStr) as ScenePlan[];
      return scenes;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error({ error: msg }, '[Clone] Scene planning failed, using fallback');
      return this.buildFallbackScenes(content, sceneDuration);
    }
  }

  private buildFallbackScenes(
    content: VideoCloneRequest['content'],
    duration: number,
  ): ScenePlan[] {
    const scenes: ScenePlan[] = [];

    scenes.push({
      index: 0,
      type: 'hook',
      narration: content.hook,
      visualPrompt: `Educational hook scene: ${content.title}. Engaging visual that draws attention.`,
      duration,
    });

    content.mainPoints.forEach((point, i) => {
      scenes.push({
        index: i + 1,
        type: 'explanation',
        narration: point,
        visualPrompt: `Educational explanation: ${point}. Clean diagram or concept illustration.`,
        duration,
      });
    });

    scenes.push({
      index: scenes.length,
      type: 'conclusion',
      narration: content.conclusion,
      visualPrompt: `Conclusion scene: ${content.title}. Summary and call to action.`,
      duration,
    });

    return scenes;
  }

  private buildImagePrompt(scene: ScenePlan, profile: TrendStyleProfile): string {
    const prefix = scene.type === 'hook' || scene.type === 'conclusion'
      ? profile.imageGeneration.narrativePrefix
      : profile.imageGeneration.educationalPrefix;

    return `${prefix}${scene.visualPrompt}. ${profile.imageGeneration.globalSuffix}`;
  }

  private getProvider(
    providerType: VideoGenProvider,
    sessionDir: string,
    motionStyle?: string,
  ): BaseVideoGenProvider {
    switch (providerType) {
      case VideoGenProvider.GROK_IMG2V:
        if (!this.config.xaiApiKey) {
          logger.warn('[Clone] XAI_API_KEY not set, falling back to Ken Burns');
          return new KenBurnsVideoGenProvider(sessionDir, motionStyle);
        }
        return new GrokVideoGenProvider(this.config.xaiApiKey, sessionDir);

      case VideoGenProvider.VEO3_T2V:
        if (!this.config.googleGeminiApiKey) {
          logger.warn('[Clone] GOOGLE_GEMINI_API_KEY not set, falling back to Ken Burns');
          return new KenBurnsVideoGenProvider(sessionDir, motionStyle);
        }
        return new Veo3VideoGenProvider(
          this.config.googleGeminiApiKey,
          sessionDir,
          this.config.veoModel,
        );

      case VideoGenProvider.KENBURNS:
      default:
        return new KenBurnsVideoGenProvider(sessionDir, motionStyle);
    }
  }
}
