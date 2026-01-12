/**
 * NewsVisualSource - 뉴스 비주얼 소스 추상화
 *
 * 비주얼 소스 우선순위:
 * 1. Pexels 스톡 이미지 (자연스럽고 YouTube 정책 안전)
 * 2. Nano Banana (AI 이미지 생성) - fallback
 *
 * n8n에서 image_generation 옵션으로 제어 가능:
 * - 'pexels_stock': Pexels만 사용 (실패시 에러)
 * - 'nanoBanana': AI 생성만 사용 (기존 방식)
 * - 'hybrid': Pexels 우선, 실패시 AI fallback (권장)
 */

import path from 'path';
import fs from 'fs-extra';
import { logger } from '../logger';
import { PexelsAPI, type PexelsImage } from '../short-creator/libraries/Pexels';
import { ImageGenerationService } from '../image-generation/services/ImageGenerationService';
import { ImageModelType } from '../image-generation/models/imageModels';
import { OrientationEnum } from '../types/shorts';
import { Config } from '../config';

// 비주얼 소스 타입
export type ImageGenerationMode = 'pexels_stock' | 'nanoBanana' | 'hybrid';

// 비주얼 결과 타입
export interface VisualResult {
  type: 'image';
  imagePath: string;
  source: 'pexels' | 'ai';
  metadata?: {
    pexelsId?: string;
    photographer?: string;
    searchTerms?: string[];
  };
}

// 비주얼 요청 파라미터
export interface VisualRequest {
  prompt: string;
  orientation: 'portrait' | 'landscape';
  style?: string;
  sceneIndex: number;
  videoId: string;
}

/**
 * NewsVisualSource
 */
export class NewsVisualSource {
  private pexelsApi?: PexelsAPI;
  private imageService?: ImageGenerationService;
  private config: Config;
  private tempDir: string;
  private usedPexelsIds: string[] = [];

  constructor(tempDir: string) {
    this.config = new Config();
    this.tempDir = tempDir;
  }

  /**
   * 초기화
   */
  async initialize(): Promise<void> {
    // Pexels API 초기화
    if (this.config.pexelsApiKey) {
      this.pexelsApi = new PexelsAPI(this.config.pexelsApiKey);
      logger.info('[NewsVisualSource] Pexels API 초기화 완료');
    } else {
      logger.warn('[NewsVisualSource] Pexels API 키 없음 - 스톡 이미지 사용 불가');
    }

    // Nano Banana (Gemini) 초기화
    if (this.config.googleGeminiApiKey) {
      this.imageService = new ImageGenerationService(
        this.config.googleGeminiApiKey,
        ImageModelType.NANO_BANANA,
        this.config.tempDirPath
      );
      logger.info('[NewsVisualSource] Nano Banana 초기화 완료');
    }
  }

  /**
   * 비주얼 가져오기 (메인 메서드)
   */
  async getVisual(
    request: VisualRequest,
    mode: ImageGenerationMode = 'hybrid'
  ): Promise<VisualResult> {
    const { prompt, orientation, style, sceneIndex, videoId } = request;

    logger.info({
      mode,
      prompt: prompt.substring(0, 50) + '...',
      sceneIndex,
    }, '[NewsVisualSource] 비주얼 요청');

    // 검색어 추출 (프롬프트에서 키워드 추출)
    const searchTerms = this.extractSearchTerms(prompt);

    const orientationEnum = orientation === 'portrait'
      ? OrientationEnum.portrait
      : OrientationEnum.landscape;

    // 모드별 처리
    switch (mode) {
      case 'pexels_stock':
        return this.getPexelsImage(searchTerms, orientationEnum, sceneIndex, videoId);

      case 'nanoBanana':
        return this.getAIImage(prompt, orientation, style, sceneIndex, videoId);

      case 'hybrid':
      default:
        // 1차: Pexels 시도
        if (this.pexelsApi) {
          try {
            return await this.getPexelsImage(searchTerms, orientationEnum, sceneIndex, videoId);
          } catch (pexelsError) {
            logger.warn({ error: pexelsError, searchTerms }, '[NewsVisualSource] Pexels 실패, AI fallback');
          }
        }

        // 2차: AI fallback
        return this.getAIImage(prompt, orientation, style, sceneIndex, videoId);
    }
  }

  /**
   * Pexels 스톡 이미지 가져오기
   */
  private async getPexelsImage(
    searchTerms: string[],
    orientation: OrientationEnum,
    sceneIndex: number,
    videoId: string
  ): Promise<VisualResult> {
    if (!this.pexelsApi) {
      throw new Error('Pexels API not initialized');
    }

    const image = await this.pexelsApi.findImage(
      searchTerms,
      orientation,
      this.usedPexelsIds
    );

    // 중복 방지를 위해 사용된 ID 저장
    this.usedPexelsIds.push(image.id);

    // 이미지 다운로드
    const imagePath = path.join(this.tempDir, `scene_${sceneIndex}.png`);
    await this.downloadImage(image.url, imagePath);

    logger.info({
      sceneIndex,
      pexelsId: image.id,
      photographer: image.photographer,
      searchTerms,
    }, '[NewsVisualSource] Pexels 이미지 획득');

    return {
      type: 'image',
      imagePath,
      source: 'pexels',
      metadata: {
        pexelsId: image.id,
        photographer: image.photographer,
        searchTerms,
      },
    };
  }

  /**
   * AI 이미지 생성 (Nano Banana)
   */
  private async getAIImage(
    prompt: string,
    orientation: 'portrait' | 'landscape',
    style: string | undefined,
    sceneIndex: number,
    videoId: string
  ): Promise<VisualResult> {
    if (!this.imageService) {
      throw new Error('Image generation service not initialized');
    }

    const aspectRatio = orientation === 'portrait' ? '9:16' : '16:9';
    const enhancedPrompt = this.enhancePrompt(prompt, style);

    const result = await this.imageService.generateImages(
      {
        prompt: enhancedPrompt,
        numberOfImages: 1,
        aspectRatio: aspectRatio as '9:16' | '16:9',
      },
      videoId,
      sceneIndex
    );

    if (!result.success || !result.images?.[0]) {
      throw new Error(`AI 이미지 생성 실패: scene ${sceneIndex}`);
    }

    const imagePath = path.join(this.tempDir, `scene_${sceneIndex}.png`);
    await fs.writeFile(imagePath, result.images[0].data);

    logger.info({ sceneIndex, source: 'ai' }, '[NewsVisualSource] AI 이미지 생성 완료');

    return {
      type: 'image',
      imagePath,
      source: 'ai',
    };
  }

  /**
   * 프롬프트에서 검색어 추출
   */
  private extractSearchTerms(prompt: string): string[] {
    // 뉴스 관련 불필요한 단어 제거
    const stopWords = [
      'style', 'vertical', 'horizontal', '9:16', '16:9',
      'high quality', 'no text', 'no watermark', 'professional',
      'infographic', 'CG', 'illustration', 'animation', 'animated',
    ];

    // 프롬프트를 단어로 분리
    let cleanPrompt = prompt.toLowerCase();
    stopWords.forEach(word => {
      cleanPrompt = cleanPrompt.replace(new RegExp(word, 'gi'), '');
    });

    // 핵심 키워드 추출 (2단어 이상)
    const words = cleanPrompt
      .split(/[,.\s]+/)
      .filter(word => word.length > 2)
      .slice(0, 5); // 최대 5개 키워드

    // 뉴스 관련 기본 키워드 추가
    const newsKeywords = this.extractNewsKeywords(prompt);

    return [...new Set([...newsKeywords, ...words])];
  }

  /**
   * 뉴스 관련 키워드 추출
   */
  private extractNewsKeywords(prompt: string): string[] {
    const keywords: string[] = [];
    const promptLower = prompt.toLowerCase();

    // 주제별 키워드 매핑
    const keywordMap: Record<string, string[]> = {
      'government': ['government', 'politics', 'official'],
      'court': ['court', 'law', 'justice', 'legal'],
      'economy': ['economy', 'business', 'finance', 'money'],
      'military': ['military', 'army', 'defense', 'security'],
      'technology': ['technology', 'digital', 'computer', 'tech'],
      'drone': ['drone', 'aircraft', 'aerial', 'flying'],
      'tax': ['tax', 'finance', 'money', 'government'],
      'news': ['news', 'broadcast', 'reporter', 'journalism'],
      'studio': ['studio', 'broadcast', 'news anchor'],
      'presenter': ['presenter', 'anchor', 'host', 'broadcast'],
    };

    for (const [key, values] of Object.entries(keywordMap)) {
      if (promptLower.includes(key)) {
        keywords.push(...values.slice(0, 2));
      }
    }

    return keywords.length > 0 ? keywords : ['news', 'broadcast'];
  }

  /**
   * 프롬프트 강화 (AI 생성용)
   */
  private enhancePrompt(prompt: string, style?: string): string {
    const prefix = {
      news_infographic: 'Professional news infographic, clean design,',
      breaking_news: 'Breaking news style, urgent, bold,',
      documentary: 'Documentary style, realistic,',
    }[style || 'news_infographic'] || 'News style,';

    return `${prefix} ${prompt}, high quality, no text, no watermark`;
  }

  /**
   * 이미지 다운로드
   */
  private async downloadImage(url: string, outputPath: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(outputPath, buffer);
  }

  /**
   * 사용된 Pexels ID 초기화 (새 비디오 시작 시)
   */
  resetUsedIds(): void {
    this.usedPexelsIds = [];
  }
}
