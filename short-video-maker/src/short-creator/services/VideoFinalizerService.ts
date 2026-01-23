/**
 * VideoFinalizerService - 비디오 최종 처리 서비스
 *
 * ConsistentShortsWorkflow에서 분리된 비디오 finalization 로직
 * - 오디오를 비디오에 적용
 * - 자막/타이틀 적용 준비
 *
 * @author Refactored from ConsistentShortsWorkflow.ts
 * @date 2026-01-19
 */

import fs from "fs-extra";
import { logger } from "../../logger";
import type { FFMpeg } from "../../YTB-ffmpeg";
import { OrientationEnum } from "../../types/shorts";

/**
 * 오디오 적용 파라미터
 */
export interface ApplyAudioToVideoParams {
  videoPath: string;           // 입력 비디오 경로
  outputPath: string;          // 출력 비디오 경로
  finalAudioPath?: string;     // 믹싱된 오디오 (AudioService에서 반환)
  audioFiles: string[];        // 원본 오디오 파일 배열 (fallback용)
  videoId: string;             // 로깅용 비디오 ID
  ffmpeg: FFMpeg;              // FFMpeg 인스턴스
  videoProcessorCombine: (videoPath: string, audioPaths: string[], outputPath: string) => Promise<void>;
}

/**
 * 자막 설정 파라미터
 */
export interface PrepareSubtitleParams {
  language: 'english' | 'korean';
  allKoreanCaptions: any[];
  allEnglishCaptions: any[];
  skipTTS: boolean;
}

/**
 * 자막 설정 결과
 */
export interface SubtitleConfig {
  primaryCaptions: any[];
  secondaryCaptions: any[] | null;
  subtitlePosition?: { yPosition: string; fontSize?: number };
}

/**
 * 자막 적용 파라미터
 */
export interface ApplySubtitlesParams {
  inputPath: string;           // 오디오 적용된 비디오
  outputPath: string;          // 최종 출력 경로
  titleText: { ko?: string; en?: string } | null;  // 제목 텍스트
  allKoreanCaptions: any[];    // 한국어 자막
  allEnglishCaptions: any[];   // 영어 자막
  language: 'english' | 'korean';  // 자막 언어
  orientation: OrientationEnum;    // 비디오 방향
  totalDuration: number;       // 총 길이
  skipTTS: boolean;            // skipTTS 모드
  videoId: string;             // 로깅용
  addSubtitlesFunction: (
    inputPath: string,
    outputPath: string,
    titleText: any,
    primaryCaptions: any[],
    secondaryCaptions: any[] | null,
    orientation: OrientationEnum,
    duration: number,
    language?: 'english' | 'korean',
    subtitleConfig?: { yPosition: string; fontSize?: number }
  ) => Promise<any>;
}

/**
 * VideoFinalizerService 클래스
 * 비디오 최종 처리 담당
 */
export class VideoFinalizerService {
  /**
   * 🔥 오디오를 비디오에 적용
   * ConsistentShortsWorkflow의 2곳 중복 코드 통합
   *
   * 우선순위:
   * 1. finalAudioPath (믹싱된 오디오) → replaceVideoAudio
   * 2. audioFiles (원본 TTS 오디오) → combineVideoWithAudio
   * 3. 둘 다 없음 (skipTTS) → 비디오 복사
   *
   * @param params - 오디오 적용 파라미터
   */
  async applyAudioToVideo(params: ApplyAudioToVideoParams): Promise<void> {
    const {
      videoPath,
      outputPath,
      finalAudioPath,
      audioFiles,
      videoId,
      ffmpeg,
      videoProcessorCombine
    } = params;

    if (finalAudioPath) {
      // 1순위: 믹싱된 오디오 사용 (BGM + SFX 포함)
      logger.info({
        videoId,
        audioSource: 'mixed'
      }, "🎵 Applying mixed audio to video");

      await ffmpeg.replaceVideoAudio(
        videoPath,
        finalAudioPath,
        outputPath,
        0
      );
    } else if (audioFiles.length > 0) {
      // 2순위: 원본 TTS 오디오 사용
      logger.info({
        videoId,
        audioSource: 'original',
        audioFileCount: audioFiles.length
      }, "🎵 Combining video with original audio files");

      await videoProcessorCombine(videoPath, audioFiles, outputPath);
    } else {
      // 3순위: 오디오 없음 (skipTTS 모드)
      logger.info({
        videoId,
        audioSource: 'none'
      }, "🔇 No audio files (skipTTS mode), copying video as-is");

      await fs.promises.copyFile(videoPath, outputPath);
    }
  }

  /**
   * 🔥 자막 설정 준비
   * 언어별 자막 선택 및 위치 설정
   *
   * @param params - 자막 설정 파라미터
   * @returns 자막 설정 (primaryCaptions, secondaryCaptions, position)
   */
  prepareSubtitleConfig(params: PrepareSubtitleParams): SubtitleConfig {
    const { language, allKoreanCaptions, allEnglishCaptions, skipTTS } = params;

    // 언어별 자막 선택 - english면 영어만, korean이면 한국어만
    const primaryCaptions = language === 'english' ? allEnglishCaptions : allKoreanCaptions;
    const secondaryCaptions = null; // 단일 언어 모드 - 이중 자막 비활성화

    // skipTTS (catproject) 모드: 자막 위치 하단 (h*0.70) + 폰트 크기 줄임
    const subtitlePosition = skipTTS
      ? { yPosition: 'h*0.70', fontSize: 60 }  // catproject: 자막 하단 + 60px (기본 90px에서 줄임)
      : undefined;               // 기본값 (중앙, 90px)

    logger.debug({
      language,
      primaryCaptionCount: primaryCaptions.length,
      skipTTS,
      subtitlePosition: subtitlePosition?.yPosition || 'default'
    }, "📝 Subtitle config prepared");

    return {
      primaryCaptions,
      secondaryCaptions,
      subtitlePosition
    };
  }

  /**
   * 🔥 자막을 비디오에 적용
   * ConsistentShortsWorkflow의 2곳 중복 코드 통합
   *
   * @param params - 자막 적용 파라미터
   */
  async applySubtitlesToVideo(params: ApplySubtitlesParams): Promise<void> {
    const {
      inputPath,
      outputPath,
      titleText,
      allKoreanCaptions,
      allEnglishCaptions,
      language,
      orientation,
      totalDuration,
      skipTTS,
      videoId,
      addSubtitlesFunction
    } = params;

    // 자막 설정 준비
    const subtitleConfig = this.prepareSubtitleConfig({
      language,
      allKoreanCaptions,
      allEnglishCaptions,
      skipTTS
    });

    const { primaryCaptions, secondaryCaptions, subtitlePosition } = subtitleConfig;

    // 자막 또는 제목이 있으면 적용
    if (primaryCaptions.length > 0 || titleText) {
      logger.info({
        hasTitleText: !!titleText,
        titleTextKo: titleText?.ko,
        titleTextEn: titleText?.en,
        language,
        primaryCaptionCount: primaryCaptions.length,
        secondaryCaptionCount: 0,
        captionLanguage: language === 'english' ? 'English only' : 'Korean only',
        videoDuration: totalDuration,
        videoId
      }, "🎬 Applying title and subtitles to video");

      await addSubtitlesFunction(
        inputPath,
        outputPath,
        titleText || null,
        primaryCaptions,
        secondaryCaptions,
        orientation,
        totalDuration,
        language,
        subtitlePosition
      );

      logger.info({
        outputPath,
        hasTitleText: !!titleText,
        hasCaptions: primaryCaptions.length > 0
      }, "✅ Final video with title and subtitles created");
    } else {
      // 자막/제목 없음 - 비디오 복사
      logger.info({
        videoId,
        reason: 'no subtitles or title'
      }, "📋 No subtitles or title, copying video as-is");

      await fs.promises.copyFile(inputPath, outputPath);
    }
  }
}

// 싱글톤 인스턴스 export
export const videoFinalizerService = new VideoFinalizerService();
