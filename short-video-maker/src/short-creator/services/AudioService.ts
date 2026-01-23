/**
 * AudioService - 오디오 생성 및 믹싱 서비스
 *
 * ConsistentShortsWorkflow에서 분리된 오디오 관련 로직
 * - generateSoundEffects: Freesound API로 사운드 이펙트 생성
 * - generateBackgroundMusic: Loudly API로 배경음악 생성
 * - mixAudioWithSoundEffects: 오디오 믹싱
 *
 * @author Refactored from ConsistentShortsWorkflow.ts
 * @date 2026-01-19
 */

import fs from "fs-extra";
import path from "path";
import cuid from "cuid";
import { logger } from "../../logger";
import { FreesoundSoundEffects, FREESOUND_PRESETS as FreesoundPresets, LoudlyBGM } from "../../YTB-tts";
import type { AudioConfig } from "../../types/shorts";
import type { FFMpeg } from "../../YTB-ffmpeg";

/**
 * 오디오 오버레이 정보
 */
export interface AudioOverlay {
  path: string;
  startTime: number;
  volume: number;
  loop?: boolean;
  seekStart?: number;
}

/**
 * AudioService 클래스
 * 오디오 생성 및 믹싱 담당
 */
export class AudioService {
  /**
   * 🔥 Generate sound effects using Freesound API (무료)
   * Returns array of audio file paths with timing info
   */
  async generateSoundEffects(
    audioConfig: AudioConfig | undefined,
    tempDirPath: string,
    sceneDurations: number[],
    apiKey: string
  ): Promise<AudioOverlay[]> {
    if (!audioConfig || (!audioConfig.soundEffects?.length && !audioConfig.transitionSound)) {
      return [];
    }

    const soundEffects = new FreesoundSoundEffects({ apiKey });
    const overlays: AudioOverlay[] = [];

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

        logger.info({ transitionType, sceneCount: sceneDurations.length }, "🎵 Generating transition sounds from Freesound");

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
        logger.info({ count: audioConfig.soundEffects.length }, "🎵 Generating custom sound effects from Freesound");

        for (const sfxConfig of audioConfig.soundEffects) {
          let audioResult;

          if (sfxConfig.type === 'preset') {
            // Use preset from FreesoundPresets
            const presetValue = sfxConfig.value ?? '';
            const presetKey = presetValue as keyof typeof FreesoundPresets;
            if (presetValue && FreesoundPresets[presetKey]) {
              audioResult = await soundEffects.generate({
                text: FreesoundPresets[presetKey],
                duration_seconds: sfxConfig.duration ?? null
              });
            } else {
              logger.warn({ preset: sfxConfig.value }, "Unknown sound effect preset, using as custom search query");
              audioResult = await soundEffects.generate({
                text: presetValue || 'ambient sound',
                duration_seconds: sfxConfig.duration ?? null
              });
            }
          } else if (sfxConfig.type === 'freesound') {
            // 🔥 Freesound custom search query using 'prompt' field
            const searchQuery = sfxConfig.prompt ?? sfxConfig.value ?? 'ambient sound';
            logger.info({ searchQuery, type: 'freesound' }, "🎵 Freesound custom search");
            audioResult = await soundEffects.generate({
              text: searchQuery,
              duration_seconds: sfxConfig.duration ?? null
            });
          } else {
            // Custom description (used as search query) - legacy support
            audioResult = await soundEffects.generate({
              text: sfxConfig.prompt ?? sfxConfig.value ?? 'ambient sound',
              duration_seconds: sfxConfig.duration ?? null
            });
          }

          if (audioResult) {
            const sfxPath = path.join(tempDirPath, `sfx-${cuid()}.mp3`);
            await fs.writeFile(sfxPath, Buffer.from(audioResult.audio));

            // 🔥 Calculate start time based on sceneIndex or absolute startTime
            let calculatedStartTime: number;
            if (sfxConfig.sceneIndex !== undefined && sfxConfig.sceneIndex < sceneStartTimes.length) {
              // Scene-based timing (recommended): sceneStartTime + offset
              calculatedStartTime = sceneStartTimes[sfxConfig.sceneIndex] + (sfxConfig.offset ?? 0);
              logger.info({
                sceneIndex: sfxConfig.sceneIndex,
                sceneStartTime: sceneStartTimes[sfxConfig.sceneIndex],
                offset: sfxConfig.offset ?? 0,
                calculatedStartTime
              }, "🎯 Sound effect synced to scene");
            } else {
              // Absolute timing (legacy)
              calculatedStartTime = sfxConfig.startTime ?? 0;
            }

            overlays.push({
              path: sfxPath,
              startTime: Math.max(0, calculatedStartTime),
              volume: sfxConfig.volume ?? 0.5
            });

            logger.info({
              preset: sfxConfig.value,
              soundName: audioResult.soundName,
              soundId: audioResult.soundId,
              startTime: calculatedStartTime
            }, "✅ Sound effect from Freesound");
          }
        }
      }

      logger.info({ overlayCount: overlays.length }, "✅ Sound effects generated from Freesound");
      return overlays;

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }, "❌ Failed to generate sound effects, continuing without them");
      return [];
    }
  }

  /**
   * 🎵 Generate background music using Loudly API (or local fallback)
   * Returns audio overlay info for mixing with other audio
   */
  async generateBackgroundMusic(
    audioConfig: AudioConfig | undefined,
    tempDirPath: string,
    totalDuration: number,
    videoId: string
  ): Promise<AudioOverlay | null> {
    if (!audioConfig?.backgroundMusic) {
      return null;
    }

    const bgmConfig = audioConfig.backgroundMusic;

    logger.info({
      source: bgmConfig.source,
      volume: bgmConfig.volume,
      loop: bgmConfig.loop,
      totalDuration
    }, "🎵 Generating background music");

    try {
      const loudlyBGM = new LoudlyBGM();

      // Generate BGM based on source type
      let bgmResult;

      if (typeof bgmConfig.source === 'string') {
        // Check if it's a URL, preset, or mood
        if (bgmConfig.source.startsWith('http://') || bgmConfig.source.startsWith('https://')) {
          // Direct URL: download and use as BGM
          logger.info({ url: bgmConfig.source }, '📥 Downloading BGM from URL...');
          const response = await fetch(bgmConfig.source);
          if (!response.ok) {
            throw new Error(`Failed to download BGM: ${response.status} ${response.statusText}`);
          }
          const audioBuffer = await response.arrayBuffer();
          bgmResult = {
            audio: new Uint8Array(audioBuffer),
            trackTitle: 'Custom URL BGM',
            source: 'url',
            license: 'user-provided',
            duration: totalDuration
          };
        } else if (bgmConfig.source.startsWith('preset:')) {
          // Use preset: "preset:CAT_CUTE"
          const presetName = bgmConfig.source.replace('preset:', '');
          bgmResult = await loudlyBGM.generateFromPreset(presetName as any, totalDuration);
        } else {
          // Use as mood or text prompt
          bgmResult = await loudlyBGM.generateForMood(bgmConfig.source, totalDuration);
        }
      } else {
        // MusicMoodEnum
        bgmResult = await loudlyBGM.generateForMood(bgmConfig.source, totalDuration);
      }

      // Save BGM to file
      const bgmPath = path.join(tempDirPath, `bgm_${videoId}.mp3`);
      // Handle both Uint8Array and ArrayBuffer types
      const audioBuffer = bgmResult.audio instanceof Uint8Array
        ? Buffer.from(bgmResult.audio.buffer, bgmResult.audio.byteOffset, bgmResult.audio.byteLength)
        : Buffer.from(bgmResult.audio);
      await fs.writeFile(bgmPath, audioBuffer);

      logger.info({
        bgmPath,
        trackTitle: bgmResult.trackTitle,
        source: bgmResult.source,
        license: bgmResult.license,
        duration: bgmResult.duration
      }, "✅ Background music generated");

      return {
        path: bgmPath,
        startTime: 0,  // BGM starts at beginning
        volume: bgmConfig.volume ?? 0.3,  // Default lower volume for BGM
        loop: bgmConfig.loop ?? true,  // Default to loop
        seekStart: bgmConfig.seekStart ?? 0  // 🔥 Skip first N seconds (for BGM intro skip)
      };

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error),
        source: bgmConfig.source
      }, "❌ Failed to generate background music, continuing without it");
      return null;
    }
  }

  /**
   * 🔥 Mix audio files with sound effects and BGM
   *
   * This method handles:
   * 1. Concatenating TTS audio files
   * 2. Generating sound effects (transitions + custom)
   * 3. Generating background music (Loudly API or local)
   * 4. Mixing everything together with FFmpeg
   *
   * @returns Path to mixed audio file, or undefined if no audio processing needed
   */
  async mixAudioWithSoundEffects(params: {
    audioFiles: string[];
    sceneDurations: number[];
    audioConfig: AudioConfig | undefined;
    apiKey: string | undefined;
    tempDirPath: string;
    videoId: string;
    skipTTS?: boolean;
    ffmpeg: FFMpeg;  // FFMpeg 인스턴스를 파라미터로 받음
  }): Promise<string | undefined> {
    const { audioFiles, sceneDurations, audioConfig, apiKey, tempDirPath, videoId, skipTTS, ffmpeg } = params;
    const totalDuration = sceneDurations.reduce((sum, d) => sum + d, 0);

    // Check if we have any audio processing to do
    const hasTTSAudio = audioFiles.length > 0;
    const hasSoundEffects = audioConfig && (audioConfig.soundEffects?.length || audioConfig.transitionSound);
    const hasBGM = audioConfig?.backgroundMusic;

    // Skip if no audio config and not in skipTTS mode
    if (!audioConfig && !skipTTS) {
      logger.warn({
        hasAudioConfig: !!audioConfig,
        skipTTS
      }, "⚠️ No audio configuration, skipping audio processing");
      return undefined;
    }

    // Skip if no audio files AND not in skipTTS mode AND no BGM
    if (!hasTTSAudio && !skipTTS && !hasBGM) {
      logger.warn("No audio files to mix");
      return undefined;
    }

    logger.info({
      hasTTSAudio,
      hasSoundEffects,
      hasBGM,
      skipTTS,
      totalDuration
    }, "🎵 Audio configuration detected, processing...");

    try {
      // 1. Generate sound effects (if API key available)
      let soundEffectOverlays: AudioOverlay[] = [];
      if (hasSoundEffects && apiKey) {
        soundEffectOverlays = await this.generateSoundEffects(
          audioConfig,
          tempDirPath,
          sceneDurations,
          apiKey
        );
      }

      // 2. Generate background music
      const bgmOverlay = await this.generateBackgroundMusic(
        audioConfig,
        tempDirPath,
        totalDuration,
        videoId
      );

      // Combine all overlays (BGM first, then sound effects)
      const allOverlays: AudioOverlay[] = [];
      if (bgmOverlay) {
        allOverlays.push(bgmOverlay);
      }
      allOverlays.push(...soundEffectOverlays);

      logger.info({
        bgmIncluded: !!bgmOverlay,
        sfxCount: soundEffectOverlays.length,
        totalOverlays: allOverlays.length
      }, "🎵 Audio overlays prepared");

      // 3. Handle differently based on TTS mode
      if (hasTTSAudio) {
        // 3A. TTS mode: Concatenate TTS audio files, then mix with overlays
        let baseAudioPath = path.join(tempDirPath, `concat_audio_${videoId}.mp3`);
        if (audioFiles.length === 1) {
          await fs.copyFile(audioFiles[0], baseAudioPath);
        } else if (audioFiles.length > 1) {
          await ffmpeg.concatAudios(audioFiles, baseAudioPath);
        }

        if (allOverlays.length > 0) {
          const mixedAudioPath = path.join(tempDirPath, `mixed_audio_${videoId}.mp3`);
          await ffmpeg.mixAudioTracks(
            baseAudioPath,
            allOverlays,
            mixedAudioPath,
            totalDuration
          );
          logger.info({
            overlayCount: allOverlays.length,
            hasBGM: !!bgmOverlay,
            outputPath: mixedAudioPath
          }, "✅ Audio mixed (TTS + SFX + BGM)");
          return mixedAudioPath;
        } else {
          return baseAudioPath;
        }
      } else {
        // 3B. 🔥 skipTTS mode: Create audio from overlays only
        if (allOverlays.length > 0) {
          const overlayAudioPath = path.join(tempDirPath, `overlay_audio_${videoId}.mp3`);

          // Use createAudioFromSoundEffects which handles multiple overlays on silent base
          await ffmpeg.createAudioFromSoundEffects(
            allOverlays,
            overlayAudioPath,
            totalDuration
          );

          logger.info({
            overlayCount: allOverlays.length,
            hasBGM: !!bgmOverlay,
            outputPath: overlayAudioPath,
            skipTTS: true
          }, "✅ Audio created from overlays (skipTTS mode)");

          return overlayAudioPath;
        } else {
          // No overlays, generate silent audio
          const silentPath = path.join(tempDirPath, `silent_audio_${videoId}.mp3`);
          await ffmpeg.generateSilentAudio(silentPath, totalDuration);
          return silentPath;
        }
      }
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }, "❌ Failed to mix audio, continuing without effects");
      return undefined;
    }
  }
}

// 싱글톤 인스턴스 export
export const audioService = new AudioService();
