/**
 * KoreanCaptionSplitter - 한국어 자막 분리 유틸리티
 *
 * TTS에서 alignment 데이터가 없을 때 (Gemini, Google TTS)
 * narration을 어절 단위로 분리하고 시간을 할당
 *
 * 원리:
 * - 공백 기준 어절 분리
 * - 각 어절의 음절 수에 비례하여 시간 할당
 * - 최소/최대 duration 제한으로 자연스러운 자막 표시
 */

import type { Caption } from '../../types/shorts';
import { logger } from '../../logger';

/**
 * 한국어 음절 수 계산
 * - 한글 완성형 문자: 1음절
 * - 영문, 숫자: 0.5음절 (한국어보다 빠르게 발음)
 * - 특수문자, 공백: 0음절
 */
export function countSyllables(text: string): number {
  let count = 0;

  for (const char of text) {
    const code = char.charCodeAt(0);

    // 한글 완성형 (가-힣): U+AC00 ~ U+D7A3
    if (code >= 0xAC00 && code <= 0xD7A3) {
      count += 1;
    }
    // 한글 자모 (ㄱ-ㅎ, ㅏ-ㅣ): U+3131 ~ U+318E
    else if (code >= 0x3131 && code <= 0x318E) {
      count += 0.5;
    }
    // 영문 대소문자
    else if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) {
      count += 0.3;
    }
    // 숫자
    else if (code >= 48 && code <= 57) {
      count += 0.3;
    }
    // 그 외 (구두점, 공백 등): 무시
  }

  return Math.max(count, 0.5); // 최소 0.5 음절
}

/**
 * 어절별 시간 비율 계산
 */
function calculateTimeRatios(words: string[]): number[] {
  const syllableCounts = words.map(countSyllables);
  const totalSyllables = syllableCounts.reduce((a, b) => a + b, 0);

  return syllableCounts.map(count => count / totalSyllables);
}

/**
 * Narration을 어절 단위로 분리하고 시간 할당
 *
 * @param narration - 전체 narration 텍스트
 * @param totalDurationMs - 전체 오디오 길이 (밀리초)
 * @param startTimeMs - 시작 시간 (밀리초, 기본값 0)
 * @param options - 추가 옵션
 */
export function splitNarrationToCaptions(
  narration: string,
  totalDurationMs: number,
  startTimeMs: number = 0,
  options?: {
    minDurationMs?: number;  // 최소 자막 표시 시간 (기본 400ms)
    maxDurationMs?: number;  // 최대 자막 표시 시간 (기본 4000ms)
    groupSize?: number;      // 그룹당 최대 어절 수 (기본 5)
    maxCaptions?: number;    // 🔥 최대 자막 수 제한 (기본 8)
  }
): Caption[] {
  const minDuration = options?.minDurationMs ?? 400;
  const maxDuration = options?.maxDurationMs ?? 4000;
  const groupSize = options?.groupSize ?? 5;  // 🔥 3 → 5 (더 큰 그룹)
  const maxCaptions = options?.maxCaptions ?? 8;  // 🔥 씬당 최대 8개 자막

  // 공백 기준 어절 분리 (빈 문자열 제거)
  const words = narration.split(/\s+/).filter(w => w.length > 0);

  if (words.length === 0) {
    logger.warn({ narration }, '[KoreanCaptionSplitter] 빈 narration');
    return [];
  }

  // 🔥 항상 그룹화 적용 (자막 수 제한을 위해)
  const shouldGroup = true;
  let processedUnits = shouldGroup
    ? groupWords(words, groupSize)
    : words.map(w => [w]); // 각 어절을 단일 배열로

  // 🔥 최대 자막 수 제한 적용
  if (processedUnits.length > maxCaptions) {
    // 그룹을 합쳐서 maxCaptions 이하로 만듦
    const mergedUnits: string[][] = [];
    const mergeSize = Math.ceil(processedUnits.length / maxCaptions);

    for (let i = 0; i < processedUnits.length; i += mergeSize) {
      const merged = processedUnits.slice(i, i + mergeSize).flat();
      mergedUnits.push(merged);
    }
    processedUnits = mergedUnits;

    logger.debug({
      originalCount: words.length,
      afterGrouping: processedUnits.length,
      maxCaptions,
    }, '[KoreanCaptionSplitter] 자막 수 제한 적용');
  }

  // 처리 단위별 시간 비율 계산
  const unitTexts = processedUnits.map(group => group.join(' '));
  const timeRatios = calculateTimeRatios(unitTexts);

  // Caption 생성
  const captions: Caption[] = [];
  let currentTime = startTimeMs;

  for (let i = 0; i < processedUnits.length; i++) {
    const text = unitTexts[i];
    const ratio = timeRatios[i];

    // 시간 할당 (비율 기반)
    let duration = totalDurationMs * ratio;

    // 최소/최대 제한 적용
    duration = Math.max(minDuration, Math.min(maxDuration, duration));

    captions.push({
      text,
      startMs: Math.round(currentTime),
      endMs: Math.round(currentTime + duration),
    });

    currentTime += duration;
  }

  // 마지막 자막의 endMs를 전체 duration에 맞춤
  if (captions.length > 0) {
    const lastCaption = captions[captions.length - 1];
    const expectedEndMs = startTimeMs + totalDurationMs;

    // 시간 조정이 필요하면 비례 조정
    if (lastCaption.endMs !== expectedEndMs) {
      const scaleFactor = totalDurationMs / (lastCaption.endMs - startTimeMs);
      let adjustedTime = startTimeMs;

      for (const caption of captions) {
        const originalDuration = caption.endMs - caption.startMs;
        caption.startMs = Math.round(adjustedTime);
        const adjustedDuration = originalDuration * scaleFactor;
        adjustedTime += adjustedDuration;
        caption.endMs = Math.round(adjustedTime);
      }

      // 마지막 자막 endMs 정확히 맞춤
      captions[captions.length - 1].endMs = Math.round(startTimeMs + totalDurationMs);
    }
  }

  logger.debug({
    narration: narration.substring(0, 50) + '...',
    wordCount: words.length,
    captionCount: captions.length,
    totalDurationMs,
    grouped: shouldGroup,
  }, '[KoreanCaptionSplitter] 자막 분리 완료');

  return captions;
}

/**
 * 어절 그룹화 (긴 문장용)
 */
function groupWords(words: string[], maxGroupSize: number): string[][] {
  const groups: string[][] = [];
  let currentGroup: string[] = [];

  for (const word of words) {
    currentGroup.push(word);

    // 그룹 크기 도달 또는 문장 부호로 끝나면 그룹 완료
    const endsWithPunctuation = /[.!?。！？,，;；]$/.test(word);

    if (currentGroup.length >= maxGroupSize || endsWithPunctuation) {
      groups.push([...currentGroup]);
      currentGroup = [];
    }
  }

  // 남은 어절 처리
  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  return groups;
}

/**
 * 여러 씬의 narration을 연속적인 Caption으로 변환
 *
 * @param scenes - 씬 배열 (narration, duration 포함)
 * @returns 전체 Caption 배열
 */
export function createCaptionsFromScenes(
  scenes: Array<{ narration: string; duration: number }>,
  options?: {
    minDurationMs?: number;
    maxDurationMs?: number;
    groupSize?: number;
  }
): Caption[] {
  const allCaptions: Caption[] = [];
  let cumulativeTimeMs = 0;

  for (const scene of scenes) {
    const durationMs = scene.duration * 1000; // 초 → 밀리초
    const sceneCaptions = splitNarrationToCaptions(
      scene.narration,
      durationMs,
      cumulativeTimeMs,
      options
    );

    allCaptions.push(...sceneCaptions);
    cumulativeTimeMs += durationMs;
  }

  return allCaptions;
}

// Default export
export default {
  countSyllables,
  splitNarrationToCaptions,
  createCaptionsFromScenes,
};
