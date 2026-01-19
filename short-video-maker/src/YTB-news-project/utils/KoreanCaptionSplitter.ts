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
    initialDelayMs?: number; // 🔥 TTS 시작 지연 (기본 300ms) - 자막이 TTS보다 빨리 나오는 문제 해결
  }
): Caption[] {
  const minDuration = options?.minDurationMs ?? 400;
  const maxDuration = options?.maxDurationMs ?? 4000;
  const groupSize = options?.groupSize ?? 5;  // 🔥 3 → 5 (더 큰 그룹)
  const maxCaptions = options?.maxCaptions ?? 8;  // 🔥 씬당 최대 8개 자막
  const initialDelay = options?.initialDelayMs ?? 500;  // 🔥 TTS startup delay 보정 (자막이 빠름 → 500ms)

  // 🔥 DEBUG: 입력 narration 검증 (자막 corruption 추적용)
  const narrationHex = Buffer.from(narration, 'utf-8').toString('hex');
  logger.debug({
    narrationInput: narration.substring(0, 100),
    narrationHex: narrationHex.substring(0, 150),
    narrationLength: narration.length,
    totalDurationMs,
    startTimeMs
  }, '[CAPTION SPLIT DEBUG] 입력 narration 검증');

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

  // 🔥 실제 자막에 사용할 duration (initialDelay 제외)
  const effectiveDuration = totalDurationMs - initialDelay;

  // Caption 생성
  const captions: Caption[] = [];
  // 🔥 TTS startup delay 적용 - 자막이 TTS보다 빨리 나오는 문제 해결
  let currentTime = startTimeMs + initialDelay;

  for (let i = 0; i < processedUnits.length; i++) {
    const text = unitTexts[i];
    const ratio = timeRatios[i];

    // 시간 할당 (비율 기반) - 🔥 effectiveDuration 사용 (initialDelay 제외)
    let duration = effectiveDuration * ratio;

    // 최소/최대 제한 적용
    duration = Math.max(minDuration, Math.min(maxDuration, duration));

    // 🔥 FIX: 자막 타이밍 겹침 방지
    // Math.round() 대신 ceil/floor 사용하여 겹침 방지
    // startMs는 올림, endMs는 내림 → 최소 1ms 갭 보장
    const captionStartMs = Math.ceil(currentTime);
    const captionEndMs = Math.floor(currentTime + duration);

    captions.push({
      text,
      startMs: captionStartMs,
      endMs: captionEndMs,
    });

    currentTime += duration;
  }

  // 🔥 마지막 자막의 endMs를 전체 duration에 맞춤 (initialDelay 고려)
  if (captions.length > 0) {
    const lastCaption = captions[captions.length - 1];
    const expectedEndMs = startTimeMs + totalDurationMs;
    const captionStartTime = startTimeMs + initialDelay;  // 🔥 자막 시작 시간 (delay 포함)

    // 시간 조정이 필요하면 비례 조정
    if (lastCaption.endMs !== expectedEndMs) {
      // 🔥 scaleFactor 계산: 자막 시작부터 끝까지의 비율
      const actualCaptionDuration = lastCaption.endMs - captionStartTime;
      const targetCaptionDuration = totalDurationMs - initialDelay;
      const scaleFactor = targetCaptionDuration / actualCaptionDuration;

      let adjustedTime = captionStartTime;  // 🔥 initialDelay 이후부터 시작

      for (const caption of captions) {
        const originalDuration = caption.endMs - caption.startMs;
        // 🔥 FIX: 자막 타이밍 겹침 방지 (ceil/floor 사용)
        caption.startMs = Math.ceil(adjustedTime);
        const adjustedDuration = originalDuration * scaleFactor;
        adjustedTime += adjustedDuration;
        caption.endMs = Math.floor(adjustedTime);
      }

      // 마지막 자막 endMs 정확히 맞춤
      captions[captions.length - 1].endMs = Math.round(startTimeMs + totalDurationMs);
    }
  }

  // 🔥 DEBUG: 최종 자막 텍스트 검증 (corruption 추적용)
  const captionTexts = captions.map(c => c.text);
  const captionHexSamples = captions.slice(0, 3).map(c => ({
    text: c.text.substring(0, 30),
    hex: Buffer.from(c.text, 'utf-8').toString('hex').substring(0, 60)
  }));

  logger.debug({
    narration: narration.substring(0, 50) + '...',
    wordCount: words.length,
    captionCount: captions.length,
    captionTexts: captionTexts.slice(0, 5),  // 첫 5개 자막 텍스트
    captionHexSamples,  // 첫 3개 자막 hex
    totalDurationMs,
    initialDelayMs: initialDelay,
    grouped: shouldGroup,
  }, '[KoreanCaptionSplitter] 자막 분리 완료 (자막 텍스트 검증)');

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
