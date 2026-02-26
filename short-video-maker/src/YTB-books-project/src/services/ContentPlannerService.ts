/**
 * ContentPlannerService
 * AI를 사용하여 책/문서 청크를 분석하고 Shorts 계획을 생성
 *
 * 기능:
 * - 청크 분석하여 Shorts 개수 결정
 * - 각 Short당 Scene 분할
 * - 나레이션 텍스트 및 이미지 프롬프트 생성
 */

import { logger } from '../../../config';
import type { BookChunk } from '../types';
import { Neo4jService } from './Neo4jService';
import {
  buildAnalysisPrompt,
  buildEntityEpisodePrompt,
  buildDetailedEpisodePrompt,
  buildCurriculumAnalysisPrompt,
  buildFormulaCentricCurriculumPrompt,
  buildFormulaCentricEpisodePrompt,
  extractFormulasFromChunks,
  getAudienceGuide,
  getELI5Rules,
  getMathContentGuide,
  getHumanitiesContentGuide,
  getSocialScienceContentGuide,
  getContentTypeGuide,
  detectPrimaryContentType,
} from './prompts';

// ============================================
// Types
// ============================================

export interface ScenePlan {
  sceneIndex: number;
  sceneType: 'hook' | 'intro' | 'problem' | 'solution' | 'explanation' | 'example' | 'data' | 'comparison' | 'conclusion' | 'cta';
  narrationText: string;           // 나레이션 (한국어)
  visualPrompt: string;            // 이미지 생성 프롬프트 (영어)
  durationHint: number;            // 예상 길이 (초)
  sourceChunkIds: string[];        // 참조된 청크 ID들
  /** v2.7.0: 청크에서 추출된 LaTeX 수식 배열 (직접 렌더링용) */
  latexFormulas?: string[];
  /** v3.3.0: 커리큘럼에서 할당된 수식 (LaTeX) */
  assignedFormula?: string;
  /** v3.3.0: 수식 이름 (예: "Reconstruction Loss") */
  formulaName?: string;
  /** v3.3.0: 수식의 고등학생 수준 비유 */
  formulaMetaphor?: string;
  /** v11.0: 시작 키프레임 이미지 프롬프트 (NEB VEO 모드) */
  firstFramePrompt?: string;
  /** v11.0: 종료 키프레임 이미지 프롬프트 (NEB VEO 모드) */
  lastFramePrompt?: string;
}

export interface ShortPlan {
  shortIndex: number;
  title: string;                   // Short 제목
  hook: string;                    // 시작 훅 (첫 3초)
  theme: string;                   // 주제/테마
  scenes: ScenePlan[];
  totalDuration: number;           // 총 예상 길이 (초)
  tags: string[];                  // YouTube 태그
  /** v8.1: 에피소드 요약 (다음 에피소드 컨텍스트 + YouTube 설명용, 100자) */
  summary?: string;
  /** v8.1: YouTube SEO 설명문 (500-1500자, 검색+추천 최적화) */
  description?: string;
}

export interface ShortsPlan {
  bookId: string;
  bookTitle: string;
  totalShorts: number;
  character: {
    description: string;           // 캐릭터 설명 (프롬프트용)
    style: string;                 // 스타일 (ghibli, anime, realistic 등)
  };
  shorts: ShortPlan[];
  metadata: {
    analyzedAt: string;
    totalChunks: number;
    totalScenes: number;
    estimatedTotalDuration: number;
  };
}

/**
 * 대상 청중 난이도 레벨
 * - elementary: 초등학생도 이해 가능 (ELI5 스타일)
 * - general: 일반 성인 (기본값)
 * - professional: 전문가/학술 수준
 */
export type AudienceLevel = 'elementary' | 'general' | 'professional';

/**
 * 콘텐츠 분야 유형
 * - math_science: 수학, 과학, 공학, AI/ML 논문
 * - humanities: 철학, 역사, 문학, 언어학, 미학
 * - social_science: 경제학, 사회학, 정치학, 심리학
 * - auto: 콘텐츠에서 자동 감지 (기본값)
 */
export type ContentType = 'math_science' | 'humanities' | 'social_science' | 'empathy_lifestyle' | 'auto';

export interface ContentPlannerConfig {
  apiKey: string;
  model?: string;                  // default: gemini-3-flash-preview
  maxShortsPerBook?: number;       // default: 10
  maxScenesPerShort?: number;      // default: 8
  targetShortDuration?: number;    // default: 60 (seconds)
  language?: 'ko' | 'en';          // default: ko
  style?: string;                  // default: 'educational illustration'
  audienceLevel?: AudienceLevel;   // default: general (NEW: 설명 난이도)
  useELI5Style?: boolean;          // default: true (NEW: 쉬운 설명 모드)
  contentType?: ContentType;       // default: auto (콘텐츠 분야 자동 감지)
  /** v7.0: 스타일 프로파일에서 생성된 visualPrompt 작성 가이드 (설정 시 내부 ghibli 하드코딩 대체) */
  visualPromptStyleGuide?: string;
  /** v10.0: 스타일별 커스텀 인게이지먼트 가이드 (미설정 시 기본 getViralEngagementGuide 사용) */
  engagementGuideOverride?: string;
  /** v11.0: VEO 3.1 Frame Interpolation 활성화 — 씬별 firstFramePrompt/lastFramePrompt 생성 */
  useVeoInterpolation?: boolean;
}

// ============================================
// Service
// ============================================

export class ContentPlannerService {
  private apiKey: string;
  private baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
  private model: string;
  private config: Required<Omit<ContentPlannerConfig, 'apiKey' | 'visualPromptStyleGuide' | 'engagementGuideOverride' | 'useVeoInterpolation'>> & { visualPromptStyleGuide?: string; engagementGuideOverride?: string; useVeoInterpolation?: boolean };

  constructor(config: ContentPlannerConfig) {
    if (!config.apiKey) {
      throw new Error('Google Gemini API key is required');
    }

    this.apiKey = config.apiKey;
    this.model = config.model || 'gemini-3-flash-preview';
    this.config = {
      model: this.model,
      maxShortsPerBook: config.maxShortsPerBook || 10,
      maxScenesPerShort: config.maxScenesPerShort || 8,
      targetShortDuration: config.targetShortDuration || 60,
      language: config.language || 'ko',
      style: config.style || 'educational illustration, clean visual style',
      audienceLevel: config.audienceLevel || 'general',
      useELI5Style: config.useELI5Style ?? true,  // 기본값: 쉬운 설명 활성화
      contentType: config.contentType || 'auto',    // 기본값: 자동 감지
      visualPromptStyleGuide: config.visualPromptStyleGuide,  // v7.0: 스타일별 가이드 (없으면 ghibli 기본)
      engagementGuideOverride: config.engagementGuideOverride,  // v10.0: 스타일별 인게이지먼트 가이드
      useVeoInterpolation: config.useVeoInterpolation  // v11.0: VEO 키프레임 프롬프트 생성
    };

    logger.info({ model: this.model, config: this.config }, 'ContentPlannerService initialized');
  }

  /**
   * 청크들을 분석하여 Shorts 계획 생성
   */
  async analyzeAndPlan(
    bookId: string,
    bookTitle: string,
    chunks: BookChunk[],
    characterDescription?: string
  ): Promise<ShortsPlan> {
    logger.info({ bookId, bookTitle, chunkCount: chunks.length }, 'Starting content analysis');

    // 청크 텍스트 결합
    const combinedText = chunks.map((c, i) =>
      `[청크 ${i + 1}] ${c.text}`
    ).join('\n\n');

    // AI 분석 요청
    const analysisPrompt = this.buildAnalysisPrompt(bookTitle, combinedText, characterDescription);
    const response = await this.callGeminiAPI(analysisPrompt);

    // JSON 파싱
    const plan = this.parseAIResponse(response, bookId, bookTitle, chunks);

    logger.info({
      bookId,
      totalShorts: plan.totalShorts,
      totalScenes: plan.metadata.totalScenes
    }, 'Content analysis completed');

    return plan;
  }

  /** @see prompts/analysisPrompt.ts */
  private buildAnalysisPrompt(bookTitle: string, content: string, characterDescription?: string): string {
    return buildAnalysisPrompt(this.config, bookTitle, content, characterDescription);
  }

  /** @see prompts/contentGuides.ts */
  private getAudienceGuide(level: AudienceLevel): string { return getAudienceGuide(level); }

  /** @see prompts/contentGuides.ts */
  private getELI5Rules(): string { return getELI5Rules(); }

  /** @see prompts/contentGuides.ts */
  private getMathContentGuide(): string { return getMathContentGuide(); }

  /** @see prompts/contentGuides.ts */
  private getHumanitiesContentGuide(): string { return getHumanitiesContentGuide(); }

  /** @see prompts/contentGuides.ts */
  private getSocialScienceContentGuide(): string { return getSocialScienceContentGuide(); }

  /**
   * AI 기반 문서 분야 판별 (Gemini Flash)
   * 문서의 처음+중간 청크 샘플을 보고 분야를 판별
   * 1회 호출 후 결과를 Neo4j에 저장하여 캐시
   */
  async detectDocumentContentType(chunks: { text: string }[]): Promise<ContentType> {
    // 샘플: 첫 2개 + 중간 1개 청크 (최대 3000자씩)
    const sampleChunks: string[] = [];
    if (chunks.length > 0) sampleChunks.push(chunks[0].text.substring(0, 3000));
    if (chunks.length > 2) sampleChunks.push(chunks[Math.floor(chunks.length / 2)].text.substring(0, 3000));
    if (chunks.length > 1) sampleChunks.push(chunks[chunks.length - 1].text.substring(0, 2000));

    const sampleText = sampleChunks.join('\n\n---\n\n');

    const prompt = `다음 문서의 학문 분야를 판별하세요.

## 문서 샘플
${sampleText}

## 분류 기준
반드시 아래 중 하나만 선택하세요:
- math_science: 수학, 물리학, 화학, 생물학, 컴퓨터과학, AI/ML, 공학, 의학
- humanities: 철학, 역사, 문학, 언어학, 미학, 종교학, 고고학, 예술
- social_science: 경제학, 사회학, 정치학, 심리학, 법학, 교육학, 인류학, 경영학
- empathy_lifestyle: 자기계발, 직장생활, 라이프스타일, 습관, 동기부여, 커리어

## 출력 (JSON만)
{"contentType": "math_science", "reason": "판별 이유 한 줄"}`;

    try {
      const response = await this.callGeminiAPI(prompt);
      const parsed = JSON.parse(response.trim());
      const detected = parsed.contentType as ContentType;

      if (['math_science', 'humanities', 'social_science', 'empathy_lifestyle'].includes(detected)) {
        logger.info({ detected, reason: parsed.reason }, 'Document content type detected by AI');
        return detected;
      }
    } catch (error) {
      logger.error({ error }, 'AI content type detection failed, using keyword fallback');
    }

    // fallback: 키워드 기반
    const fallback = this.detectPrimaryContentType(sampleText);
    return fallback === null ? 'math_science' : fallback;
  }

  /** @see prompts/contentGuides.ts */
  private detectPrimaryContentType(content: string): ContentType | null { return detectPrimaryContentType(content, this.config.contentType); }

  /** @see prompts/contentGuides.ts */
  private getContentTypeGuide(content: string): string { return getContentTypeGuide(content, this.config.contentType); }

  /**
   * Gemini API 호출
   */
  private async callGeminiAPI(prompt: string): Promise<string> {
    const url = `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`;

    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json'
      }
    };

    logger.debug({ model: this.model, promptLength: prompt.length }, 'Calling Gemini API');

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error({ status: response.status, error: errorText }, 'Gemini API error');
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
      logger.error({ response: data }, 'No text in Gemini response');
      throw new Error('No text in Gemini API response');
    }

    return data.candidates[0].content.parts[0].text;
  }

  /**
   * AI 응답에서 JSON 문자열 추출 (markdown code fence 제거)
   */
  private extractJSON(responseText: string): string {
    let jsonStr = responseText.trim();
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.slice(7);
    }
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.slice(3);
    }
    if (jsonStr.endsWith('```')) {
      jsonStr = jsonStr.slice(0, -3);
    }
    return jsonStr.trim();
  }

  /**
   * AI 응답 파싱
   */
  private parseAIResponse(
    responseText: string,
    bookId: string,
    bookTitle: string,
    chunks: BookChunk[]
  ): ShortsPlan {
    let parsed: any;

    try {
      // JSON 추출 (마크다운 코드 블록 제거)
      let jsonStr = responseText.trim();
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.slice(7);
      }
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.slice(3);
      }
      if (jsonStr.endsWith('```')) {
        jsonStr = jsonStr.slice(0, -3);
      }

      parsed = JSON.parse(jsonStr.trim());
    } catch (error) {
      logger.error({ error, responseText: responseText.substring(0, 500) }, 'Failed to parse AI response');
      throw new Error('Failed to parse AI response as JSON');
    }

    // 계획 구성
    const shorts: ShortPlan[] = (parsed.shorts || []).map((s: any, idx: number) => {
      const scenes: ScenePlan[] = (s.scenes || []).map((sc: any, scIdx: number) => ({
        sceneIndex: sc.sceneIndex ?? scIdx,
        sceneType: sc.sceneType || 'explanation',
        narrationText: sc.narrationText || '',
        visualPrompt: sc.visualPrompt || '',
        durationHint: sc.durationHint || 5,
        sourceChunkIds: sc.sourceChunkIds || [`chunk_${scIdx}`],
        assignedFormula: sc.assignedFormula || undefined,
        formulaName: sc.formulaName || undefined,
        formulaMetaphor: sc.formulaMetaphor || undefined,
        firstFramePrompt: sc.firstFramePrompt || undefined,
        lastFramePrompt: sc.lastFramePrompt || undefined,
      }));

      return {
        shortIndex: s.shortIndex ?? idx,
        title: s.title || `Short ${idx + 1}`,
        hook: s.hook || '',
        theme: s.theme || '',
        scenes,
        totalDuration: scenes.reduce((sum, sc) => sum + sc.durationHint, 0),
        tags: s.tags || []
      };
    });

    const totalScenes = shorts.reduce((sum, s) => sum + s.scenes.length, 0);
    const totalDuration = shorts.reduce((sum, s) => sum + s.totalDuration, 0);

    return {
      bookId,
      bookTitle,
      totalShorts: shorts.length,
      character: {
        description: parsed.character?.description || `A friendly narrator character, ${this.config.style} style`,
        style: parsed.character?.style || this.config.style
      },
      shorts,
      metadata: {
        analyzedAt: new Date().toISOString(),
        totalChunks: chunks.length,
        totalScenes,
        estimatedTotalDuration: totalDuration
      }
    };
  }

  /**
   * 단일 청크에서 Scene 생성 (간단한 케이스)
   */
  async createSceneFromChunk(
    chunk: BookChunk,
    sceneIndex: number,
    style?: string
  ): Promise<ScenePlan> {
    const prompt = `다음 텍스트를 기반으로 YouTube Shorts의 한 Scene을 생성해주세요.

텍스트:
${chunk.text}

## 출력 (JSON)
{
  "sceneIndex": ${sceneIndex},
  "sceneType": "explanation",
  "narrationText": "한국어 나레이션 (자연스러운 구어체)",
  "visualPrompt": "English image prompt, ${style || this.config.style} style, detailed visual",
  "durationHint": 5
}`;

    const response = await this.callGeminiAPI(prompt);
    const parsed = JSON.parse(response);

    return {
      sceneIndex: parsed.sceneIndex ?? sceneIndex,
      sceneType: parsed.sceneType || 'explanation',
      narrationText: parsed.narrationText || chunk.text.substring(0, 200),
      visualPrompt: parsed.visualPrompt || `${chunk.text.substring(0, 100)}, ${style || this.config.style} style`,
      durationHint: parsed.durationHint || 5,
      sourceChunkIds: [chunk.id]
    };
  }

  // ============================================
  // Entity-Based Multi-Episode Planning (NEB Integration)
  // ============================================

  /**
   * NEB 엔티티 클러스터 기반 다중 에피소드 계획 생성
   * 각 핵심 엔티티(기술/개념)마다 독립적인 에피소드 생성
   */
  async analyzeAndPlanByEntityClusters(
    neo4jService: Neo4jService,
    fileName: string,
    characterDescription?: string
  ): Promise<ShortsPlan> {
    logger.info({ fileName }, 'Starting entity-based multi-episode planning');

    // 1. NEB에서 엔티티 클러스터 조회
    const clusters = await neo4jService.getEntityClusters(fileName);

    if (clusters.length === 0) {
      logger.warn({ fileName }, 'No entity clusters found, falling back to simple planning');
      const chunks = await neo4jService.getChunks(fileName);
      return this.analyzeAndPlan(fileName, fileName, chunks, characterDescription);
    }

    logger.info({ fileName, clusterCount: clusters.length }, 'Entity clusters retrieved');

    // 2. 각 클러스터별로 에피소드 생성
    const shorts: ShortPlan[] = [];

    for (let i = 0; i < clusters.length; i++) {
      const cluster = clusters[i];

      // 클러스터의 청크 텍스트 조회
      const chunkTexts = await neo4jService.getClusterChunkTexts(cluster.chunkIds);
      const combinedText = chunkTexts.join('\n\n');

      logger.info({
        cluster: cluster.clusterName,
        mainEntity: cluster.mainEntity,
        chunkCount: cluster.chunkIds.length
      }, `Planning episode ${i + 1}`);

      // 클러스터별 에피소드 프롬프트 생성
      const episodePrompt = this.buildEntityEpisodePrompt(
        fileName,
        cluster,
        combinedText,
        i,
        clusters.length,
        characterDescription
      );

      try {
        const response = await this.callGeminiAPI(episodePrompt);
        const parsed = JSON.parse(response.trim());

        const scenes: ScenePlan[] = (parsed.scenes || []).map((sc: any, scIdx: number) => ({
          sceneIndex: sc.sceneIndex ?? scIdx,
          sceneType: sc.sceneType || 'explanation',
          narrationText: sc.narrationText || '',
          visualPrompt: sc.visualPrompt || '',
          durationHint: sc.durationHint || 7,
          sourceChunkIds: cluster.chunkIds.slice(0, 3)  // 클러스터 청크 참조
        }));

        shorts.push({
          shortIndex: i,
          title: parsed.title || cluster.clusterName,
          hook: parsed.hook || `${cluster.mainEntity}에 대해 알아볼까요?`,
          theme: cluster.mainEntity,
          scenes,
          totalDuration: scenes.reduce((sum, sc) => sum + sc.durationHint, 0),
          tags: [cluster.mainEntity, ...cluster.relatedEntities.slice(0, 3)]
        });
      } catch (error) {
        logger.error({ error, cluster: cluster.clusterName }, 'Failed to generate episode');
      }
    }

    const totalScenes = shorts.reduce((sum, s) => sum + s.scenes.length, 0);
    const totalDuration = shorts.reduce((sum, s) => sum + s.totalDuration, 0);

    const plan: ShortsPlan = {
      bookId: fileName,
      bookTitle: fileName.replace('.pdf', ''),
      totalShorts: shorts.length,
      character: {
        description: characterDescription || `A friendly narrator character, ${this.config.style} style`,
        style: this.config.style
      },
      shorts,
      metadata: {
        analyzedAt: new Date().toISOString(),
        totalChunks: clusters.reduce((sum, c) => sum + c.chunkIds.length, 0),
        totalScenes,
        estimatedTotalDuration: totalDuration
      }
    };

    logger.info({
      fileName,
      totalShorts: plan.totalShorts,
      totalScenes,
      clusters: clusters.map(c => c.mainEntity)
    }, 'Entity-based multi-episode planning completed');

    return plan;
  }

  /** @see prompts/entityEpisodePrompt.ts */
  private buildEntityEpisodePrompt(
    fileName: string,
    cluster: {
      clusterId: string;
      clusterName: string;
      mainEntity: string;
      relatedEntities: string[];
      chunkIds: string[];
    },
    content: string,
    episodeIndex: number,
    totalEpisodes: number,
    characterDescription?: string
  ): string { return buildEntityEpisodePrompt(this.config, fileName, cluster, content, episodeIndex, totalEpisodes, characterDescription); }

  // ============================================
  // Sequential Curriculum Planning (v2.5.0)
  // 에피소드 연결성 + 상세 설명 + 수학/기술 커버
  // ============================================

  /**
   * 순차적 커리큘럼 기반 다중 에피소드 계획 생성
   * - 전체 문서를 학습 순서대로 분할
   * - 에피소드 간 연결성 보장
   * - 모든 내용을 상세히 설명
   * - 수학/기술 내용 필수 포함
   */
  async analyzeAndPlanSequentialCurriculum(
    bookId: string,
    bookTitle: string,
    chunks: BookChunk[],
    characterDescription?: string
  ): Promise<ShortsPlan> {
    logger.info({ bookId, bookTitle, chunkCount: chunks.length }, 'Starting SEQUENTIAL CURRICULUM planning');

    // v3.3.0: 수식 3개 이상 + math_science → 수식 중심 커리큘럼으로 분기
    const allFormulas = chunks.flatMap(c => c.latexFormulas || []);
    const uniqueFormulas = [...new Set(allFormulas)].filter(f => f.trim().length > 2);
    const detectedType = this.detectPrimaryContentType(
      chunks.map(c => c.text).join('\n').substring(0, 10000)
    );
    if (uniqueFormulas.length >= 3 && (detectedType === 'math_science' || this.config.contentType === 'math_science')) {
      logger.info({
        formulaCount: uniqueFormulas.length,
        contentType: detectedType
      }, 'v3.3.0: 수식 3개 이상 감지 → 수식 중심 커리큘럼으로 전환');
      return this.analyzeAndPlanFormulaCentricCurriculum(bookId, bookTitle, chunks, characterDescription);
    }

    // 1단계: 전체 문서 분석하여 커리큘럼 구조 생성 (v3.1.0: 수식 포함)
    const combinedText = chunks.map((c, i) => {
      let text = `[청크 ${i + 1}/${chunks.length}]${c.sectionTitle ? ` (${c.sectionTitle})` : ''}\n${c.text}`;
      if (c.latexFormulas && c.latexFormulas.length > 0) {
        text += `\n\n[이 청크의 주요 수식]\n${c.latexFormulas.map((f, j) => `${j+1}. $$${f}$$`).join('\n')}`;
      }
      return text;
    }).join('\n\n---\n\n');

    const curriculumPrompt = this.buildCurriculumAnalysisPrompt(bookTitle, combinedText, characterDescription);
    const curriculumResponse = await this.callGeminiAPI(curriculumPrompt);

    let curriculum: any;
    try {
      curriculum = JSON.parse(curriculumResponse.trim());
    } catch (e) {
      logger.error({ error: e }, 'Failed to parse curriculum JSON');
      throw new Error('Curriculum analysis failed');
    }

    logger.info({
      totalEpisodes: curriculum.episodes?.length,
      topics: curriculum.episodes?.map((e: any) => e.topic)
    }, 'Curriculum structure generated');

    // 2단계: 각 에피소드를 순차적으로 상세 생성 (이전 에피소드 컨텍스트 포함)
    const shorts: ShortPlan[] = [];
    let previousEpisodeSummary = '';

    for (let i = 0; i < (curriculum.episodes || []).length; i++) {
      const episodeOutline = curriculum.episodes[i];

      logger.info({
        episodeNumber: i + 1,
        topic: episodeOutline.topic,
        chunkRange: episodeOutline.chunkRange
      }, `Generating detailed episode ${i + 1}`);

      // 해당 에피소드에 필요한 청크 텍스트 추출
      const startChunk = episodeOutline.chunkRange?.[0] || 0;
      const endChunk = episodeOutline.chunkRange?.[1] || chunks.length - 1;
      const relevantChunks = chunks.slice(startChunk, endChunk + 1);
      const episodeContent = relevantChunks.map(c => c.text).join('\n\n');

      const episodePrompt = this.buildDetailedEpisodePrompt(
        bookTitle,
        episodeOutline,
        episodeContent,
        i,
        curriculum.episodes.length,
        previousEpisodeSummary,
        characterDescription,
        relevantChunks
      );

      try {
        const episodeResponse = await this.callGeminiAPI(episodePrompt);
        const parsed = JSON.parse(this.extractJSON(episodeResponse));

        const scenes: ScenePlan[] = (parsed.scenes || []).map((sc: any, scIdx: number) => ({
          sceneIndex: sc.sceneIndex ?? scIdx,
          sceneType: sc.sceneType || 'explanation',
          narrationText: sc.narrationText || '',
          visualPrompt: sc.visualPrompt || '',
          durationHint: sc.durationHint || 7,
          sourceChunkIds: relevantChunks.map(c => c.id),
          assignedFormula: sc.assignedFormula || undefined,
          formulaName: sc.formulaName || undefined,
          formulaMetaphor: sc.formulaMetaphor || undefined,
          firstFramePrompt: sc.firstFramePrompt || undefined,
          lastFramePrompt: sc.lastFramePrompt || undefined,
        }));

        const short: ShortPlan = {
          shortIndex: i,
          title: parsed.title || episodeOutline.topic,
          hook: parsed.hook || '',
          theme: episodeOutline.topic,
          scenes,
          totalDuration: scenes.reduce((sum, sc) => sum + sc.durationHint, 0),
          tags: parsed.tags || [episodeOutline.topic]
        };

        shorts.push(short);

        // 다음 에피소드를 위해 이번 에피소드 요약 저장
        previousEpisodeSummary = parsed.summary || `Episode ${i + 1}: ${episodeOutline.topic} - ${scenes.map(s => s.narrationText.substring(0, 50)).join(' / ')}`;

      } catch (error) {
        logger.error({ error, episode: i + 1 }, 'Failed to generate episode');
      }
    }

    const totalScenes = shorts.reduce((sum, s) => sum + s.scenes.length, 0);
    const totalDuration = shorts.reduce((sum, s) => sum + s.totalDuration, 0);

    const plan: ShortsPlan = {
      bookId,
      bookTitle,
      totalShorts: shorts.length,
      character: {
        description: characterDescription || `A friendly narrator character, ${this.config.style} style`,
        style: this.config.style
      },
      shorts,
      metadata: {
        analyzedAt: new Date().toISOString(),
        totalChunks: chunks.length,
        totalScenes,
        estimatedTotalDuration: totalDuration
      }
    };

    logger.info({
      bookId,
      totalShorts: plan.totalShorts,
      totalScenes,
      totalDuration
    }, 'Sequential curriculum planning completed');

    return plan;
  }

  /** @see prompts/curriculumAnalysisPrompt.ts */
  private buildCurriculumAnalysisPrompt(
    bookTitle: string,
    content: string,
    characterDescription?: string
  ): string { return buildCurriculumAnalysisPrompt(bookTitle, content, characterDescription); }

  /** @see prompts/detailedEpisodePrompt.ts */
  private extractFormulasFromChunks(chunks: BookChunk[]): {latex: string, context: string}[] { return extractFormulasFromChunks(chunks); }

  /** @see prompts/detailedEpisodePrompt.ts */
  private buildDetailedEpisodePrompt(
    bookTitle: string,
    episodeOutline: any,
    content: string,
    episodeIndex: number,
    totalEpisodes: number,
    previousEpisodeSummary: string,
    characterDescription?: string,
    relevantChunks?: BookChunk[]
  ): string { return buildDetailedEpisodePrompt(this.config, bookTitle, episodeOutline, content, episodeIndex, totalEpisodes, previousEpisodeSummary, characterDescription, relevantChunks); }

  // ============================================
  // Formula-Centric Curriculum Planning (v3.3.0)
  // 수식이 중심인 커리큘럼: 모든 수식 추출 → 수식별 에피소드 구성
  // ============================================

  /**
   * v3.3.0: 수식 중심 커리큘럼 분석 및 계획 생성
   * 조건: contentType === 'math_science' AND 수식 3개 이상
   * 기존 analyzeAndPlanSequentialCurriculum()의 수식 중심 분기
   */
  async analyzeAndPlanFormulaCentricCurriculum(
    bookId: string,
    bookTitle: string,
    chunks: BookChunk[],
    characterDescription?: string
  ): Promise<ShortsPlan> {
    logger.info({ bookId, bookTitle, chunkCount: chunks.length }, 'Starting FORMULA-CENTRIC curriculum planning (v3.3.0)');

    // 1단계: 수식 중심 커리큘럼 구조 생성
    const combinedText = chunks.map((c, i) => {
      let text = `[청크 ${i + 1}/${chunks.length}]${c.sectionTitle ? ` (${c.sectionTitle})` : ''}\n${c.text}`;
      if (c.latexFormulas && c.latexFormulas.length > 0) {
        text += `\n\n[이 청크의 주요 수식]\n${c.latexFormulas.map((f, j) => `${j+1}. $$${f}$$`).join('\n')}`;
      }
      return text;
    }).join('\n\n---\n\n');

    const curriculumPrompt = this.buildFormulaCentricCurriculumPrompt(bookTitle, combinedText);
    const curriculumResponse = await this.callGeminiAPI(curriculumPrompt);

    let curriculum: any;
    try {
      curriculum = JSON.parse(this.extractJSON(curriculumResponse));
    } catch (e) {
      logger.error({ error: e, responsePreview: curriculumResponse.substring(0, 300) }, 'Failed to parse formula-centric curriculum JSON, falling back to sequential');
      return this.analyzeAndPlanSequentialCurriculum(bookId, bookTitle, chunks, characterDescription);
    }

    logger.info({
      totalEpisodes: curriculum.episodes?.length,
      formulaGroups: curriculum.formulaGroups?.length,
      topics: curriculum.episodes?.map((e: any) => e.topic)
    }, 'Formula-centric curriculum structure generated');

    // 2단계: 각 에피소드를 수식 중심으로 상세 생성
    const shorts: ShortPlan[] = [];
    let previousEpisodeSummary = '';

    for (let i = 0; i < (curriculum.episodes || []).length; i++) {
      const episodeOutline = curriculum.episodes[i];

      logger.info({
        episodeNumber: i + 1,
        topic: episodeOutline.topic,
        formulaCount: episodeOutline.formulas?.length
      }, `Generating formula-centric episode ${i + 1}`);

      // 해당 에피소드에 필요한 청크 텍스트 추출
      const startChunk = episodeOutline.chunkRange?.[0] || 0;
      const endChunk = episodeOutline.chunkRange?.[1] || chunks.length - 1;
      const relevantChunks = chunks.slice(startChunk, endChunk + 1);
      const episodeContent = relevantChunks.map(c => c.text).join('\n\n');

      const episodePrompt = this.buildFormulaCentricEpisodePrompt(
        bookTitle,
        episodeOutline,
        episodeContent,
        i,
        curriculum.episodes.length,
        previousEpisodeSummary,
        characterDescription
      );

      try {
        const episodeResponse = await this.callGeminiAPI(episodePrompt);
        const parsed = JSON.parse(this.extractJSON(episodeResponse));

        const scenes: ScenePlan[] = (parsed.scenes || []).map((sc: any, scIdx: number) => ({
          sceneIndex: sc.sceneIndex ?? scIdx,
          sceneType: sc.sceneType || 'explanation',
          narrationText: sc.narrationText || '',
          visualPrompt: sc.visualPrompt || '',
          durationHint: sc.durationHint || 8,
          sourceChunkIds: relevantChunks.map(c => c.id),
          assignedFormula: sc.assignedFormula || undefined,
          formulaName: sc.formulaName || undefined,
          formulaMetaphor: sc.formulaMetaphor || undefined,
          firstFramePrompt: sc.firstFramePrompt || undefined,
          lastFramePrompt: sc.lastFramePrompt || undefined,
        }));

        const short: ShortPlan = {
          shortIndex: i,
          title: parsed.title || episodeOutline.topic,
          hook: parsed.hook || '',
          theme: episodeOutline.topic,
          scenes,
          totalDuration: scenes.reduce((sum, sc) => sum + sc.durationHint, 0),
          tags: parsed.tags || [episodeOutline.topic]
        };

        shorts.push(short);
        previousEpisodeSummary = parsed.summary || `Episode ${i + 1}: ${episodeOutline.topic}`;

      } catch (error) {
        logger.error({ error, episode: i + 1 }, 'Failed to generate formula-centric episode');
      }
    }

    const totalScenes = shorts.reduce((sum, s) => sum + s.scenes.length, 0);
    const totalDuration = shorts.reduce((sum, s) => sum + s.totalDuration, 0);

    const plan: ShortsPlan = {
      bookId,
      bookTitle,
      totalShorts: shorts.length,
      character: {
        description: characterDescription || `A friendly narrator character, ${this.config.style} style`,
        style: this.config.style
      },
      shorts,
      metadata: {
        analyzedAt: new Date().toISOString(),
        totalChunks: chunks.length,
        totalScenes,
        estimatedTotalDuration: totalDuration
      }
    };

    logger.info({
      bookId,
      totalShorts: plan.totalShorts,
      totalScenes,
      totalDuration,
      scenesWithFormula: shorts.reduce((sum, s) => sum + s.scenes.filter(sc => sc.assignedFormula).length, 0)
    }, 'Formula-centric curriculum planning completed (v3.3.0)');

    return plan;
  }

  /** @see prompts/formulaCentricPrompts.ts */
  private buildFormulaCentricCurriculumPrompt(
    bookTitle: string,
    content: string
  ): string { return buildFormulaCentricCurriculumPrompt(bookTitle, content); }

  /** @see prompts/formulaCentricPrompts.ts */
  private buildFormulaCentricEpisodePrompt(
    bookTitle: string,
    episodeOutline: any,
    content: string,
    episodeIndex: number,
    totalEpisodes: number,
    previousEpisodeSummary: string,
    characterDescription?: string
  ): string { return buildFormulaCentricEpisodePrompt(this.config, bookTitle, episodeOutline, content, episodeIndex, totalEpisodes, previousEpisodeSummary, characterDescription); }

  /**
   * 기존 계획 수정 (Scene 추가/제거)
   */
  async refinePlan(
    plan: ShortsPlan,
    feedback: string
  ): Promise<ShortsPlan> {
    const prompt = `현재 YouTube Shorts 계획을 피드백을 반영하여 수정해주세요.

## 현재 계획
${JSON.stringify(plan, null, 2)}

## 피드백
${feedback}

## 출력
수정된 계획을 동일한 JSON 형식으로 출력하세요.`;

    const response = await this.callGeminiAPI(prompt);
    const parsed = JSON.parse(response);

    // 기존 메타데이터 유지하면서 수정된 내용 반영
    return {
      ...plan,
      ...parsed,
      metadata: {
        ...plan.metadata,
        analyzedAt: new Date().toISOString()
      }
    };
  }
}

// ============================================
// Factory
// ============================================

export function createContentPlannerService(config?: Partial<ContentPlannerConfig>): ContentPlannerService {
  // API 키 우선순위: 직접 전달 > GOOGLE_GEMINI_API_KEY > GEMINI_API_KEY > GOOGLE_API_KEY
  const apiKey = config?.apiKey
    || process.env.GOOGLE_GEMINI_API_KEY
    || process.env.GEMINI_API_KEY
    || process.env.GOOGLE_API_KEY
    || '';

  if (!apiKey) {
    logger.warn('No Gemini API key found. Set GOOGLE_GEMINI_API_KEY environment variable.');
  }

  return new ContentPlannerService({
    apiKey,
    model: config?.model || 'gemini-3-flash-preview',
    maxShortsPerBook: config?.maxShortsPerBook,
    maxScenesPerShort: config?.maxScenesPerShort,
    targetShortDuration: config?.targetShortDuration,
    language: config?.language,
    style: config?.style,
    audienceLevel: config?.audienceLevel,    // NEW: 대상 청중 레벨
    useELI5Style: config?.useELI5Style,      // NEW: ELI5 쉬운 설명 모드
    contentType: config?.contentType,         // NEW: 콘텐츠 분야 (auto/math_science/humanities/social_science)
    visualPromptStyleGuide: config?.visualPromptStyleGuide,  // v7.0: 스타일별 visualPrompt 가이드
    engagementGuideOverride: config?.engagementGuideOverride,  // v10.0: 스타일별 인게이지먼트 가이드
    useVeoInterpolation: config?.useVeoInterpolation  // v11.0: VEO 키프레임 프롬프트
  });
}
