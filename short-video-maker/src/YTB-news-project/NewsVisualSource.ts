/**
 * NewsVisualSource - 뉴스 비주얼 소스 추상화
 *
 * 🔥 비주얼 소스 우선순위:
 * 1. Pexels 스톡 비디오 (가장 자연스러움, 역동적)
 * 2. Pexels 스톡 이미지 (비디오 없을 때)
 * 3. Nano Banana (AI 이미지 생성) - 최후의 수단
 *
 * n8n에서 image_generation 옵션으로 제어 가능:
 * - 'pexels_stock': Pexels만 사용 (비디오 → 이미지 순)
 * - 'nanoBanana': AI 생성만 사용 (기존 방식)
 * - 'hybrid': Pexels 비디오 → Pexels 이미지 → AI fallback (권장)
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
  type: 'video' | 'image';
  path: string;  // 비디오 또는 이미지 경로
  source: 'pexels_video' | 'pexels_image' | 'ai';
  duration?: number;  // 비디오일 경우 실제 duration
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
  duration: number;  // 필요한 비디오 길이
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
      logger.warn('[NewsVisualSource] Pexels API 키 없음 - 스톡 사용 불가');
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
   *
   * 우선순위: Pexels 비디오 → Pexels 이미지 → AI 이미지
   */
  async getVisual(
    request: VisualRequest,
    mode: ImageGenerationMode = 'hybrid'
  ): Promise<VisualResult> {
    const { prompt, orientation, style, sceneIndex, videoId, duration } = request;

    logger.info({
      mode,
      prompt: prompt.substring(0, 50) + '...',
      sceneIndex,
      duration,
    }, '[NewsVisualSource] 비주얼 요청');

    // 검색어 추출 (프롬프트에서 키워드 추출)
    const searchTerms = this.extractSearchTerms(prompt);

    const orientationEnum = orientation === 'portrait'
      ? OrientationEnum.portrait
      : OrientationEnum.landscape;

    // 모드별 처리
    switch (mode) {
      case 'pexels_stock':
        // Pexels만 사용 (비디오 → 이미지 순)
        return this.getPexelsVisual(searchTerms, orientationEnum, sceneIndex, videoId, duration);

      case 'nanoBanana':
        // AI만 사용
        return this.getAIImage(prompt, orientation, style, sceneIndex, videoId);

      case 'hybrid':
      default:
        // 1차: Pexels 비디오/이미지 시도
        if (this.pexelsApi) {
          try {
            return await this.getPexelsVisual(searchTerms, orientationEnum, sceneIndex, videoId, duration);
          } catch (pexelsError) {
            logger.warn({ error: pexelsError, searchTerms }, '[NewsVisualSource] Pexels 실패, AI fallback');
          }
        }

        // 2차: AI fallback
        return this.getAIImage(prompt, orientation, style, sceneIndex, videoId);
    }
  }

  /**
   * 🔥 Pexels 비주얼 가져오기 (비디오 우선, 이미지 fallback)
   */
  private async getPexelsVisual(
    searchTerms: string[],
    orientation: OrientationEnum,
    sceneIndex: number,
    videoId: string,
    duration: number
  ): Promise<VisualResult> {
    if (!this.pexelsApi) {
      throw new Error('Pexels API not initialized');
    }

    // 1️⃣ 먼저 비디오 검색 시도
    try {
      const video = await this.pexelsApi.findVideo(
        searchTerms,
        duration,  // 최소 필요 길이
        this.usedPexelsIds,
        orientation
      );

      // 중복 방지
      this.usedPexelsIds.push(video.id);

      // 비디오 다운로드
      const videoPath = path.join(this.tempDir, `scene_${sceneIndex}.mp4`);
      await this.downloadFile(video.url, videoPath);

      logger.info({
        sceneIndex,
        pexelsId: video.id,
        type: 'video',
        searchTerms,
      }, '[NewsVisualSource] ✅ Pexels 비디오 획득');

      return {
        type: 'video',
        path: videoPath,
        source: 'pexels_video',
        metadata: {
          pexelsId: video.id,
          searchTerms,
        },
      };
    } catch (videoError) {
      logger.debug({ error: videoError, searchTerms }, '[NewsVisualSource] 비디오 없음, 이미지로 fallback');
    }

    // 2️⃣ 비디오 없으면 이미지 검색
    const image = await this.pexelsApi.findImage(
      searchTerms,
      orientation,
      this.usedPexelsIds
    );

    // 중복 방지
    this.usedPexelsIds.push(image.id);

    // 이미지 다운로드
    const imagePath = path.join(this.tempDir, `scene_${sceneIndex}.png`);
    await this.downloadFile(image.url, imagePath);

    logger.info({
      sceneIndex,
      pexelsId: image.id,
      photographer: image.photographer,
      type: 'image',
      searchTerms,
    }, '[NewsVisualSource] ✅ Pexels 이미지 획득');

    return {
      type: 'image',
      path: imagePath,
      source: 'pexels_image',
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

    logger.info({ sceneIndex, source: 'ai' }, '[NewsVisualSource] ✅ AI 이미지 생성 완료');

    return {
      type: 'image',
      path: imagePath,
      source: 'ai',
    };
  }

  /**
   * 프롬프트에서 검색어 추출 (개선된 버전)
   * 🔥 뉴스 키워드 우선, 불필요한 단어 철저히 제거
   */
  private extractSearchTerms(prompt: string): string[] {
    // 🔥 뉴스 관련 키워드 먼저 추출 (이게 가장 정확)
    const newsKeywords = this.extractNewsKeywords(prompt);

    // 뉴스 키워드가 2개 이상이면 그것만 사용 (불필요한 단어 혼합 방지)
    if (newsKeywords.length >= 2) {
      logger.debug({ newsKeywords }, '[NewsVisualSource] 뉴스 키워드 사용');
      return newsKeywords.slice(0, 4);  // 최대 4개
    }

    // 🔥 뉴스 키워드가 없거나 부족하면 프롬프트에서 추출
    // 불필요한 단어 대폭 확장
    const stopWords = [
      // 스타일/형식 관련
      'style', 'vertical', 'horizontal', '9:16', '16:9',
      'high', 'quality', 'text', 'watermark', 'professional',
      'infographic', 'cg', 'illustration', 'animation', 'animated',
      'clean', 'design', 'modern', 'contemporary', 'sketch',
      'diagram', 'imagery', 'overlay', 'vibe', 'lighting',
      // 일반적인 단어
      'confident', 'warm', 'approachable', 'presenting', 'new',
      'former', 'complex', 'scale', 'waving', 'goodbye',
      'button', 'subscribe', 'like', 'simulation', 'map',
      // 형용사/부사
      'very', 'really', 'quite', 'just', 'good', 'great', 'nice',
      // 관사/전치사
      'the', 'and', 'for', 'with', 'from', 'into',
    ];

    let cleanPrompt = prompt.toLowerCase();
    stopWords.forEach(word => {
      // 단어 경계로 정확히 매치
      cleanPrompt = cleanPrompt.replace(new RegExp(`\\b${word}\\b`, 'gi'), '');
    });

    // 🔥 의미 있는 명사/동사만 추출 (4자 이상)
    const words = cleanPrompt
      .split(/[,.\s]+/)
      .filter(word => word.length >= 4)  // 4자 이상만
      .filter(word => !/^\d+$/.test(word))  // 숫자 제외
      .slice(0, 3);  // 최대 3개만 (너무 많으면 검색 결과 분산)

    // 뉴스 키워드 + 추출된 단어 합치기
    const combined = [...new Set([...newsKeywords, ...words])].slice(0, 4);

    logger.debug({ newsKeywords, words, combined }, '[NewsVisualSource] 검색어 추출');

    // 🔥 아무것도 없으면 기본 뉴스 관련 용어
    return combined.length > 0 ? combined : ['news broadcast', 'business'];
  }

  /**
   * 뉴스 관련 키워드 추출
   * 🔥 확장된 keywordMap - 테크/비즈니스/일반 뉴스 용어 포함
   */
  private extractNewsKeywords(prompt: string): string[] {
    const keywords: string[] = [];
    const promptLower = prompt.toLowerCase();

    // 🔥 대폭 확장된 키워드 맵
    const keywordMap: Record<string, string[]> = {
      // 테크/반도체
      'semiconductor': ['semiconductor', 'microchip', 'electronics factory'],
      'chip': ['microchip', 'semiconductor', 'electronics'],
      '반도체': ['semiconductor', 'microchip', 'electronics factory'],
      'ai': ['artificial intelligence', 'robot', 'computer'],
      'artificial intelligence': ['artificial intelligence', 'robot', 'computer'],
      'processor': ['microchip', 'computer', 'technology'],
      'cpu': ['microchip', 'computer', 'technology'],
      'gpu': ['microchip', 'computer', 'technology'],
      'memory': ['microchip', 'computer', 'technology'],
      'server': ['data center', 'server room', 'technology'],
      'data center': ['data center', 'server room', 'technology'],

      // 기업/비즈니스
      'samsung': ['electronics factory', 'technology', 'corporate office'],
      'apple': ['technology', 'smartphone', 'corporate office'],
      'google': ['technology', 'corporate office', 'computer'],
      'microsoft': ['technology', 'corporate office', 'computer'],
      'factory': ['factory', 'manufacturing', 'industrial'],
      'manufacturing': ['factory', 'manufacturing', 'industrial'],
      'company': ['corporate office', 'business meeting', 'business'],
      'corporate': ['corporate office', 'business meeting', 'business'],
      'ceo': ['business meeting', 'corporate office', 'executive'],
      'investment': ['stock market', 'finance', 'business'],
      'market': ['stock market', 'trading', 'finance'],

      // 정치/정부
      'government': ['government', 'politics', 'parliament'],
      'president': ['politics', 'government', 'speech'],
      'congress': ['parliament', 'politics', 'government'],
      'parliament': ['parliament', 'politics', 'government'],
      'election': ['election', 'voting', 'politics'],
      'policy': ['government', 'politics', 'meeting'],

      // 법률/사법
      'court': ['court', 'law', 'justice'],
      'law': ['court', 'law', 'justice'],
      'judge': ['court', 'law', 'justice'],
      'lawsuit': ['court', 'law', 'justice'],

      // 경제/금융
      'economy': ['economy', 'business', 'finance'],
      'stock': ['stock market', 'trading', 'finance'],
      'trading': ['trading', 'stock market', 'finance'],
      'bank': ['bank', 'finance', 'money'],
      'tax': ['tax', 'finance', 'money'],
      'inflation': ['economy', 'money', 'finance'],

      // 군사/안보
      'military': ['military', 'defense', 'army'],
      'defense': ['military', 'defense', 'security'],
      'war': ['military', 'conflict', 'war'],
      'drone': ['drone', 'aircraft', 'military'],
      'missile': ['military', 'missile', 'defense'],

      // 미디어/방송
      'news': ['news broadcast', 'journalist', 'newsroom'],
      'studio': ['news studio', 'broadcast', 'television'],
      'presenter': ['news anchor', 'broadcast', 'television'],
      'journalist': ['journalist', 'reporter', 'news'],
      'anchor': ['news anchor', 'broadcast', 'television'],
      'newsroom': ['newsroom', 'broadcast', 'news studio'],
      'intro': ['news studio', 'broadcast', 'news anchor'],
      'outro': ['news studio', 'broadcast', 'thank you'],

      // 법원/재판
      'courtroom': ['courtroom', 'court', 'justice'],
      'trial': ['courtroom', 'trial', 'justice'],
      'minister': ['government official', 'politics', 'parliament'],

      // 환경/에너지
      'climate': ['climate', 'environment', 'nature'],
      'energy': ['energy', 'power plant', 'electricity'],
      'solar': ['solar panel', 'renewable energy', 'energy'],
      'electric': ['electric car', 'electricity', 'energy'],
      'battery': ['battery', 'electric car', 'energy'],

      // 의료/건강
      'health': ['hospital', 'medical', 'healthcare'],
      'hospital': ['hospital', 'medical', 'healthcare'],
      'vaccine': ['vaccine', 'medical', 'healthcare'],
      'medicine': ['medicine', 'medical', 'healthcare'],

      // 교통/인프라
      'airport': ['airport', 'airplane', 'travel'],
      'train': ['train', 'railway', 'transportation'],
      'highway': ['highway', 'road', 'transportation'],
      'construction': ['construction', 'building', 'infrastructure'],
    };

    for (const [key, values] of Object.entries(keywordMap)) {
      if (promptLower.includes(key)) {
        keywords.push(...values.slice(0, 2));
      }
    }

    // 🔥 매칭된 키워드가 없으면 프롬프트에서 직접 추출 시도
    if (keywords.length === 0) {
      // 프롬프트의 주요 단어들을 검색어로 사용
      const importantWords = promptLower
        .replace(/[^a-z가-힣\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 3)
        .slice(0, 3);

      if (importantWords.length > 0) {
        return importantWords;
      }
    }

    return keywords.length > 0 ? keywords : ['business', 'technology'];
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
   * 파일 다운로드 (비디오/이미지 공용)
   */
  private async downloadFile(url: string, outputPath: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download: ${response.status}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(outputPath, buffer);
  }

  /**
   * 사용된 Pexels ID 초기화
   */
  resetUsedIds(): void {
    this.usedPexelsIds = [];
  }
}
