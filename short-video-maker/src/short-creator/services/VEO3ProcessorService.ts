/**
 * VEO3ProcessorService - VEO3 비디오 처리 서비스
 *
 * ConsistentShortsWorkflow에서 분리된 VEO3 관련 로직
 * - xfade 전환 시 캡션 타이밍 조정
 * - 전환 구간 겹침 방지
 *
 * @author Refactored from ConsistentShortsWorkflow.ts
 * @date 2026-01-20
 */

import { logger } from "../../logger";
import type { Caption } from "./CaptionService";

/**
 * xfade 캡션 조정 파라미터
 */
export interface XfadeAdjustmentParams {
  koreanCaptions: Caption[];        // 한국어 캡션 배열 (in-place 수정)
  englishCaptions: Caption[];       // 영어 캡션 배열 (in-place 수정)
  sceneDurations: number[];         // 각 씬 길이 배열 (초)
  transitionDuration: number;       // xfade 전환 시간 (초)
  minSceneDuration: number;         // 최소 씬 길이 (초)
}

/**
 * VEO3ProcessorService 클래스
 * VEO3 비디오 처리 및 캡션 타이밍 조정 담당
 */
export class VEO3ProcessorService {
  /**
   * 🔥 한국어 캡션 xfade 오프셋 조정
   * 각 씬의 캡션 시작/종료 시간을 xfade 겹침만큼 앞당김
   *
   * @param captions - 캡션 배열 (in-place 수정)
   * @param sceneDurations - 각 씬 길이 배열
   * @param transitionDuration - xfade 전환 시간
   * @param minSceneDuration - 최소 씬 길이
   */
  private adjustKoreanCaptionsForXfade(
    captions: Caption[],
    sceneDurations: number[],
    transitionDuration: number,
    minSceneDuration: number
  ): void {
    let captionIndex = 0;

    for (let i = 0; i < sceneDurations.length; i++) {
      const sceneDuration = Math.max(sceneDurations[i] || minSceneDuration, minSceneDuration);
      const originalSceneOffset = i === 0 ? 0 :
        sceneDurations.slice(0, i).reduce((sum, d) => sum + Math.max(d || minSceneDuration, minSceneDuration), 0);

      // 현재 씬에 속하는 캡션들 조정
      while (captionIndex < captions.length) {
        const caption = captions[captionIndex];

        // 캡션이 현재 씬에 속하는지 확인
        if (caption.startMs >= originalSceneOffset * 1000 &&
            caption.startMs < (originalSceneOffset + sceneDuration) * 1000) {
          // xfade 오프셋 적용 (앞 씬들의 전환으로 인한 시간 단축)
          const xfadeOffset = i * transitionDuration * 1000;
          caption.startMs -= xfadeOffset;
          caption.endMs -= xfadeOffset;
          captionIndex++;
        } else {
          break;
        }
      }
    }
  }

  /**
   * 🔥 영어 캡션 xfade 오프셋 조정
   * start/end (초 단위) 필드도 함께 조정
   *
   * @param captions - 캡션 배열 (in-place 수정)
   * @param sceneDurations - 각 씬 길이 배열
   * @param transitionDuration - xfade 전환 시간
   * @param minSceneDuration - 최소 씬 길이
   */
  private adjustEnglishCaptionsForXfade(
    captions: Caption[],
    sceneDurations: number[],
    transitionDuration: number,
    minSceneDuration: number
  ): void {
    let captionIndex = 0;

    for (let i = 0; i < sceneDurations.length; i++) {
      const sceneDuration = Math.max(sceneDurations[i] || minSceneDuration, minSceneDuration);
      const originalSceneOffset = i === 0 ? 0 :
        sceneDurations.slice(0, i).reduce((sum, d) => sum + Math.max(d || minSceneDuration, minSceneDuration), 0);

      // 현재 씬에 속하는 캡션들 조정
      while (captionIndex < captions.length) {
        const caption = captions[captionIndex];

        // 캡션이 현재 씬에 속하는지 확인
        if (caption.startMs >= originalSceneOffset * 1000 &&
            caption.startMs < (originalSceneOffset + sceneDuration) * 1000) {
          // xfade 오프셋 적용
          const xfadeOffset = i * transitionDuration * 1000;
          caption.startMs -= xfadeOffset;
          caption.endMs -= xfadeOffset;
          // 초 단위 필드도 조정
          if (caption.start !== undefined) caption.start -= xfadeOffset / 1000;
          if (caption.end !== undefined) caption.end -= xfadeOffset / 1000;
          captionIndex++;
        } else {
          break;
        }
      }
    }
  }

  /**
   * 🔥 전환 구간 캡션 겹침 방지
   * 씬 전환 시점 근처의 캡션이 다음 씬과 겹치지 않도록 종료 시간 조정
   *
   * @param captions - 캡션 배열 (in-place 수정)
   * @param sceneDurations - 각 씬 길이 배열
   * @param transitionDuration - xfade 전환 시간
   * @param minSceneDuration - 최소 씬 길이
   */
  private preventTransitionOverlap(
    captions: Caption[],
    sceneDurations: number[],
    transitionDuration: number,
    minSceneDuration: number
  ): void {
    const transitionGapMs = transitionDuration * 1000;
    let currentSceneEndMs = 0;

    for (let i = 0; i < sceneDurations.length; i++) {
      const sceneDuration = Math.max(sceneDurations[i] || minSceneDuration, minSceneDuration);
      currentSceneEndMs = (currentSceneEndMs + sceneDuration - (i > 0 ? transitionDuration : 0)) * 1000;

      // 마지막 씬이 아닌 경우에만 겹침 방지 적용
      if (i < sceneDurations.length - 1) {
        const nextSceneStartMs = currentSceneEndMs;

        // 전환 구간에 걸친 캡션 찾아서 종료 시간 조정
        for (const caption of captions) {
          if (caption.endMs > nextSceneStartMs - transitionGapMs &&
              caption.endMs <= nextSceneStartMs + transitionGapMs &&
              caption.startMs < nextSceneStartMs) {
            const originalEnd = caption.endMs;
            caption.endMs = Math.max(caption.startMs + 100, nextSceneStartMs - transitionGapMs);

            logger.debug({
              sceneIndex: i + 1,
              originalEnd,
              newEnd: caption.endMs,
              transitionGapMs
            }, "Adjusted caption end to prevent xfade overlap");
          }
        }
      }
    }
  }

  /**
   * 🔥 xfade 전환 시 캡션 타이밍 전체 조정
   * ConsistentShortsWorkflow.ts의 2곳 중복 코드 통합
   *
   * 처리 순서:
   * 1. 한국어 캡션 xfade 오프셋 조정
   * 2. 한국어 캡션 전환 구간 겹침 방지
   * 3. 영어 캡션 xfade 오프셋 조정
   *
   * @param params - xfade 조정 파라미터
   */
  adjustCaptionsForXfade(params: XfadeAdjustmentParams): void {
    const {
      koreanCaptions,
      englishCaptions,
      sceneDurations,
      transitionDuration,
      minSceneDuration
    } = params;

    // 조정이 필요한지 확인
    if (sceneDurations.length <= 1) {
      logger.debug("Single scene, no xfade adjustment needed");
      return;
    }

    const transitionCount = sceneDurations.length - 1;
    const totalOverlap = transitionCount * transitionDuration;

    // 1. 한국어 캡션 xfade 오프셋 조정
    this.adjustKoreanCaptionsForXfade(
      koreanCaptions,
      sceneDurations,
      transitionDuration,
      minSceneDuration
    );

    // 2. 한국어 캡션 전환 구간 겹침 방지
    this.preventTransitionOverlap(
      koreanCaptions,
      sceneDurations,
      transitionDuration,
      minSceneDuration
    );

    // 3. 영어 캡션 xfade 오프셋 조정
    this.adjustEnglishCaptionsForXfade(
      englishCaptions,
      sceneDurations,
      transitionDuration,
      minSceneDuration
    );

    logger.info({
      transitionCount,
      totalOverlap,
      transitionGapMs: transitionDuration * 1000,
      adjustedKoreanCaptionCount: koreanCaptions.length,
      adjustedEnglishCaptionCount: englishCaptions.length
    }, "Adjusted caption timing for xfade overlap");
  }
}

// 싱글톤 인스턴스 export
export const veo3ProcessorService = new VEO3ProcessorService();
