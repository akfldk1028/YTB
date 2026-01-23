/**
 * CaptionService - 자막/캡션 생성 서비스
 *
 * ConsistentShortsWorkflow에서 분리된 자막 관련 로직
 * - 영어 자막 생성 (TTS 싱크 / 문장 통으로)
 *
 * @author Refactored from ConsistentShortsWorkflow.ts
 * @date 2026-01-19
 */

import { logger } from "../../logger";

/**
 * 자막 데이터 인터페이스
 */
export interface Caption {
  text: string;
  startMs: number;
  endMs: number;
  start: number;  // seconds
  end: number;    // seconds
}

/**
 * 씬별 자막 수집 결과
 */
export interface CollectCaptionsResult {
  koreanCaptions: Caption[];
  englishCaptions: Caption[];
}

/**
 * CaptionService 클래스
 * 자막 생성 및 처리 담당
 */
export class CaptionService {
  /**
   * 🔥 Split text into display-friendly chunks
   * catproject용: 긴 문장을 적절한 크기로 분할
   *
   * 알고리즘:
   * 1. 쉼표(,) 기준 1차 분할
   * 2. 5단어 초과 청크는 maxWordsPerChunk 단어씩 재분할
   *
   * @param text - 분할할 텍스트
   * @param maxWordsPerChunk - 청크당 최대 단어 수 (기본 4)
   * @returns 분할된 청크 배열
   */
  private splitTextIntoChunks(text: string, maxWordsPerChunk: number = 4): string[] {
    if (!text || !text.trim()) return [];

    // 1차: 쉼표 기준 분할
    const commaSplit = text.split(',').map(s => s.trim()).filter(s => s);

    const chunks: string[] = [];

    for (const segment of commaSplit) {
      const words = segment.split(/\s+/).filter(w => w);

      // 5단어 이하면 그대로 사용
      if (words.length <= 5) {
        chunks.push(segment);
      } else {
        // 5단어 초과: maxWordsPerChunk 단어씩 분할
        for (let i = 0; i < words.length; i += maxWordsPerChunk) {
          const chunk = words.slice(i, i + maxWordsPerChunk).join(' ');
          chunks.push(chunk);
        }
      }
    }

    return chunks;
  }

  /**
   * 🔥 Generate English captions synced to Korean audio timing
   * Uses Korean TTS captions timing with English text
   *
   * @param englishText - English text to display
   * @param koreanCaptions - Korean TTS captions for timing reference
   * @param totalDuration - Total scene duration in seconds
   * @param skipTTS - If true, split into chunks (catproject); if false, split by words (TTS sync)
   * @returns Array of caption objects with timing
   */
  generateSyncedEnglishCaptions(
    englishText: string,
    koreanCaptions: Caption[],
    totalDuration: number,
    skipTTS: boolean = false
  ): Caption[] {
    if (!englishText) {
      return [];
    }

    // 🔥 catproject (skipTTS mode): 적절한 청크로 분할하여 표시
    // TTS가 없으므로 scene 시간을 청크 수로 균등 분배
    if (skipTTS) {
      const chunks = this.splitTextIntoChunks(englishText.trim());

      if (chunks.length === 0) return [];

      const totalMs = totalDuration * 1000;
      const timePerChunk = totalMs / chunks.length;

      const captions: Caption[] = chunks.map((chunk, i) => ({
        text: chunk,
        startMs: i * timePerChunk,
        endMs: (i + 1) * timePerChunk,
        start: (i * timePerChunk) / 1000,
        end: ((i + 1) * timePerChunk) / 1000
      }));

      logger.debug({
        englishText: englishText.substring(0, 50),
        totalDuration,
        chunkCount: chunks.length,
        chunks: chunks,
        mode: 'skipTTS (chunked)'
      }, "🔥 Generated chunked English captions (catproject mode)");

      return captions;
    }

    // 🔥 TTS mode: 단어별로 쪼개서 TTS 타이밍에 맞춤
    if (!koreanCaptions || koreanCaptions.length === 0) {
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

    const englishCaptions: Caption[] = [];

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
      totalDuration: totalTime / 1000,
      mode: 'TTS (word-by-word)'
    }, "🔥 Generated synced English captions (TTS mode)");

    return englishCaptions;
  }

  /**
   * 🔥 씬별 자막 수집 (한국어 + 영어)
   * ConsistentShortsWorkflow의 4곳 중복 코드 통합
   *
   * @param sceneData - 씬 데이터 (captions 포함)
   * @param textEnglish - 영어 텍스트 (선택)
   * @param sceneDuration - 씬 길이 (초)
   * @param cumulativeDuration - 누적 시간 오프셋 (초)
   * @param skipTTS - TTS 스킵 여부 (catproject)
   * @param sceneIndex - 씬 인덱스 (로깅용)
   * @returns 오프셋 적용된 한국어/영어 자막
   */
  collectSceneCaptions(
    sceneData: { captions?: any[] },
    textEnglish: string | undefined,
    sceneDuration: number,
    cumulativeDuration: number,
    skipTTS: boolean,
    sceneIndex: number
  ): CollectCaptionsResult {
    const result: CollectCaptionsResult = {
      koreanCaptions: [],
      englishCaptions: []
    };

    if (!sceneData?.captions || sceneData.captions.length === 0) {
      return result;
    }

    // 1. 한국어 자막 오프셋 적용
    result.koreanCaptions = sceneData.captions.map((caption: any) => ({
      ...caption,
      startMs: caption.startMs + (cumulativeDuration * 1000),
      endMs: caption.endMs + (cumulativeDuration * 1000),
    }));

    // 2. 영어 자막 생성 + 오프셋 적용
    // 🔥 FIX: 원본 한국어 자막(오프셋 미적용)을 전달해야 함
    // result.koreanCaptions는 이미 오프셋 적용됨 → 이중 오프셋 버그 발생
    if (textEnglish) {
      const englishCaptions = this.generateSyncedEnglishCaptions(
        textEnglish,
        sceneData.captions,  // 원본 전달 (오프셋 미적용)
        sceneDuration,
        skipTTS
      );
      result.englishCaptions = englishCaptions.map((caption: any) => ({
        ...caption,
        startMs: caption.startMs + (cumulativeDuration * 1000),
        endMs: caption.endMs + (cumulativeDuration * 1000),
        start: caption.start + cumulativeDuration,
        end: caption.end + cumulativeDuration
      }));
    }

    logger.debug({
      sceneIndex: sceneIndex + 1,
      koreanCaptionCount: result.koreanCaptions.length,
      englishCaptionCount: result.englishCaptions.length,
      cumulativeDuration
    }, "📝 Collected scene captions");

    return result;
  }
}

// 싱글톤 인스턴스 export
export const captionService = new CaptionService();
