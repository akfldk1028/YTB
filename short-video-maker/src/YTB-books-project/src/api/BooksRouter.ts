/**
 * Books API Router
 * Neo4j에서 책 데이터 조회 및 Shorts 생성 API
 *
 * GET  /api/books                  - 책 목록 조회
 * GET  /api/books/stats            - 그래프 통계
 * GET  /api/books/connection       - Neo4j 연결 테스트
 * GET  /api/books/:bookId          - 책 상세 (청크 포함)
 * GET  /api/books/:bookId/chunks   - 청크 목록
 * POST /api/books/:bookId/analyze  - AI 분석 → Shorts 계획 생성
 * POST /api/books/:bookId/shorts   - Shorts 생성 요청
 * POST /api/books/search           - 유사 청크 검색
 * POST /api/books/test-video       - 이미지+TTS 비디오 생성 테스트
 * POST /api/books/:bookId/generate-video - 책 기반 비디오 생성 (plan 필요)
 * GET  /api/books/download/:videoId - 비디오 다운로드
 */

import { Router, Request, Response } from 'express';
import { Neo4jService, createNeo4jService } from '../services/Neo4jService';
import { ContentPlannerService, createContentPlannerService, ShortsPlan, ContentType } from '../services/ContentPlannerService';
import { getBooksVideoService, BOOKS_PROJECT_CONFIG } from '../services/BooksVideoService';
import { GhibliImageService } from '../services/GhibliImageService';
import { logger, Config } from '../../../config';
import { GoogleCloudStorageService } from '../../../storage/GoogleCloudStorageService';

export class BooksRouter {
  public router: Router;
  private neo4jService: Neo4jService | null = null;
  private contentPlannerService: ContentPlannerService | null = null;

  // 분석 결과 캐시 (메모리, 프로덕션에서는 Redis 사용 권장)
  private plansCache: Map<string, ShortsPlan> = new Map();

  constructor() {
    this.router = Router();
    this.setupRoutes();
  }

  private async getNeo4jService(): Promise<Neo4jService> {
    if (!this.neo4jService) {
      this.neo4jService = createNeo4jService();
    }
    return this.neo4jService;
  }

  private getContentPlannerService(options?: {
    audienceLevel?: 'elementary' | 'general' | 'professional';
    useELI5Style?: boolean;
    style?: string;
    maxShortsPerBook?: number;
    maxScenesPerShort?: number;
    contentType?: ContentType;
  }): ContentPlannerService {
    // 옵션이 변경되면 새 서비스 생성
    if (options) {
      return createContentPlannerService({
        audienceLevel: options.audienceLevel,
        useELI5Style: options.useELI5Style,
        style: options.style,
        maxShortsPerBook: options.maxShortsPerBook,
        maxScenesPerShort: options.maxScenesPerShort,
        contentType: options.contentType
      });
    }
    // 기본 서비스 (캐시)
    if (!this.contentPlannerService) {
      this.contentPlannerService = createContentPlannerService();
    }
    return this.contentPlannerService;
  }

  /**
   * v3.5.0: 씬 타입별 이미지 전략 판별
   * - narrative: hook, intro, conclusion, cta → 캐릭터 등장, NanoBanana character reference
   * - educational: explanation, example, data, comparison, deep_dive → 캐릭터 없음, 교육 시각화
   * - formula: assignedFormula가 있는 씬 → 수식 비유 이미지, 캐릭터 없음
   */
  private getSceneImageStrategy(scene: { type?: string; hasFormula?: boolean; assignedFormula?: string }): 'narrative' | 'educational' | 'formula' {
    if (scene.assignedFormula || scene.hasFormula) return 'formula';
    const sceneType = scene.type || 'explanation';
    if (['explanation', 'example', 'data', 'comparison', 'deep_dive', 'problem', 'solution'].includes(sceneType)) {
      return 'educational';
    }
    return 'narrative';
  }

  /**
   * Books 프로젝트 전용: 씬별 이미지 생성
   * v3.5.0: 씬 타입별 이미지 전략 분기
   * - narrative (hook/intro/conclusion): 캐릭터 이미지, NanoBanana character reference
   * - educational (explanation/example/data): 교육 시각화, 캐릭터 없음
   * - formula (수식 씬): 수식 비유 이미지, 캐릭터 없음
   * - 주제 변경 시 GPT-4o 새 이미지, 동일 주제는 NanoBanana 스타일 참조
   */
  /**
   * 설명 씬 프롬프트 보정: 캐릭터 위주 → 교육 인포그래픽/다이어그램 스타일
   * - explanation, example, data, comparison 타입에 적용
   * - 일관된 교육 시각 스타일 유지 (clean whiteboard + labeled diagram)
   */
  private enhanceExplanationPrompt(prompt: string, sceneType: string, narration: string): string {
    // v3.2.4: 원래 프롬프트 다양성을 최대한 유지 — 획일적 변환 제거
    const explanationTypes = ['explanation', 'example', 'data', 'comparison'];
    if (!explanationTypes.includes(sceneType)) return prompt;

    // 이미 인포그래픽/다이어그램 스타일이면 그대로
    if (/infographic|diagram|flowchart|whiteboard|chart/i.test(prompt)) return prompt;

    // 나레이션에서 핵심 개념 추출 (괄호 안 설명 포함)
    const conceptMatch = narration.match(/[가-힣]+\([^)]+\)/g) || [];
    const conceptHint = conceptMatch.length > 0
      ? ` Key concepts: ${conceptMatch.join(', ')}.`
      : '';

    // v3.2.4: 원래 프롬프트를 유지하면서 교육적 힌트만 추가
    return `${prompt.trim()}${conceptHint} Use visual metaphors and icons instead of text. Portrait 9:16`;
  }

  private async generateSceneImages(
    scenes: Array<{ id: string; type?: string; visualDesc?: string; narration?: string; hasFormula?: boolean; assignedFormula?: string }>,
    ghibliService: GhibliImageService,
    neo4j: Neo4jService,
    tempDir: string,
    config: any,
    episodeId: string
  ): Promise<{ imagePaths: string[]; failedScene?: number }> {
    const fs = await import('fs-extra');
    const path = await import('path');
    const imagePaths: string[] = [];
    let prevImagePath: string | undefined;

    // v3.5.0: 교육 씬용 참조 이미지 관리 (주제 변경 감지)
    let lastEducationalTopic = '';
    let educationalRef: { data: Buffer; mimeType: string } | undefined;

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const sceneType = scene.type || 'explanation';
      const strategy = this.getSceneImageStrategy(scene);

      let rawPrompt = scene.visualDesc || scene.narration || `Scene ${i + 1}`;
      // v3.3.0: 수식 씬이면 FORMULA_CONCEPT_PREFIX 키워드 주입
      if (scene.hasFormula && !/educational concept illustration/i.test(rawPrompt)) {
        rawPrompt = `Educational concept illustration, visual metaphor for mathematical concept. ${rawPrompt}`;
      }
      // 설명 씬은 인포그래픽 스타일로 보정
      const visualPrompt = this.enhanceExplanationPrompt(rawPrompt, sceneType, scene.narration || '');

      // v3.5.0: 주제 변경 감지 (교육/수식 씬)
      const currentTopic = scene.assignedFormula || sceneType;
      const topicChanged = (strategy !== 'narrative') && (currentTopic !== lastEducationalTopic || !educationalRef);

      logger.info({
        sceneIndex: i,
        sceneId: scene.id,
        strategy,
        topicChanged,
        currentTopic,
        visualPrompt: visualPrompt.substring(0, 50)
      }, `Scene ${i + 1}/${scenes.length} 이미지 생성 중 (${strategy})`);

      let imageResult;

      if (strategy === 'narrative') {
        // ── 서사 씬: 캐릭터 등장, 기존 로직 ──
        imageResult = await ghibliService.generateSceneImage(
          visualPrompt,
          i,
          (config.orientation === 'landscape' ? '16:9' : '9:16'),
          {
            mood: config.mood || 'whimsical',
            timeOfDay: config.timeOfDay || 'day',
            characterDescription: config.characterDescription,
            imageMode: 'narrative'
          },
          episodeId
        );
      } else {
        // ── 교육/수식 씬: 캐릭터 없음 ──
        const imageMode = strategy === 'formula' ? 'formula' : 'educational';

        if (topicChanged) {
          // 주제 변경 → GPT-4o로 새 이미지 생성
          imageResult = await ghibliService.generateSceneImage(
            visualPrompt,
            i,
            (config.orientation === 'landscape' ? '16:9' : '9:16'),
            {
              imageMode,
              forceGpt: true
              // characterDescription 의도적으로 제거!
            },
            episodeId
          );

          // 성공 시 교육 reference 갱신
          if (imageResult.success && imageResult.imageBuffer) {
            educationalRef = {
              data: imageResult.imageBuffer,
              mimeType: imageResult.mimeType || 'image/png'
            };
            lastEducationalTopic = currentTopic;
          }
        } else {
          // 동일 주제 → NanoBanana + 교육 reference (스타일 참조)
          imageResult = await ghibliService.generateSceneImage(
            visualPrompt,
            i,
            (config.orientation === 'landscape' ? '16:9' : '9:16'),
            {
              imageMode,
              forceGpt: false,
              educationalReference: educationalRef
              // characterDescription 의도적으로 제거!
            },
            episodeId
          );
        }
      }

      if (imageResult.success && imageResult.imageBuffer) {
        const imagePath = path.default.join(tempDir, `scene_${i}.png`);
        await fs.default.writeFile(imagePath, imageResult.imageBuffer);
        imagePaths.push(imagePath);
        prevImagePath = imagePath;

        await neo4j.updateSceneAssets(scene.id, { imagePath });

        logger.info({
          sceneIndex: i,
          generator: imageResult.generator,
          imageSize: imageResult.imageBuffer.length,
          strategy
        }, `Scene ${i + 1} 이미지 생성 완료`);
      } else if (prevImagePath) {
        // 실패 시 이전 이미지로 fallback
        const imagePath = path.default.join(tempDir, `scene_${i}.png`);
        await fs.default.copy(prevImagePath, imagePath);
        imagePaths.push(imagePath);
        logger.warn({ sceneIndex: i, error: imageResult.error }, `Scene ${i + 1} 실패 - 이전 이미지 재사용`);
      } else {
        // 첫 씬부터 실패
        return { imagePaths, failedScene: i };
      }
    }

    return { imagePaths };
  }

  /**
   * v3.4.0: 에피소드 비디오 생성 공통 파이프라인
   * generate-video와 generate-next-episode에서 공유
   * 이미지 생성 → 수식 배분 → 비디오 생성 → GCS 업로드 → 상태 업데이트
   */
  private async generateEpisodeVideoPipeline(
    episode: import('../types').EpisodeWithScenes,
    config: any,
    neo4j: Neo4jService
  ): Promise<{
    success: boolean;
    videoResult?: any;
    gcsUrl?: string;
    publicUrl?: string;
    error?: string;
  }> {
    const appConfig = new Config();
    const ghibliService = new GhibliImageService(
      appConfig.googleGeminiApiKey || '',
      appConfig.openaiApiKey || '',
      appConfig.tempDirPath
    );

    const fs = await import('fs-extra');
    const path = await import('path');
    const tempDir = path.default.join(appConfig.tempDirPath, `episode_${episode.id}`);
    await fs.default.ensureDir(tempDir);

    // 1. 청크 LaTeX 조회
    const allChunkIds = episode.scenes
      .flatMap(s => s.sourceChunkIds || [])
      .filter((id, index, self) => id && self.indexOf(id) === index);

    const chunkLatexMap = new Map<string, string[]>();
    if (allChunkIds.length > 0) {
      try {
        const latexResult = await neo4j.runQuery(
          `MATCH (c:Chunk) WHERE c.id IN $chunkIds AND c.latexFormulas IS NOT NULL
           RETURN c.id as id, c.latexFormulas as latexFormulas`,
          { chunkIds: allChunkIds }
        );
        for (const record of latexResult) {
          const id = record.get('id');
          const formulas = record.get('latexFormulas');
          if (id && formulas && Array.isArray(formulas) && formulas.length > 0) {
            chunkLatexMap.set(id, formulas);
          }
        }
        if (chunkLatexMap.size > 0) {
          logger.info({ chunksWithLatex: chunkLatexMap.size }, '📐 청크에서 LaTeX 수식 발견');
        }
      } catch (error) {
        logger.warn({ error }, '⚠️ 청크 LaTeX 조회 실패 - 스킵');
      }
    }

    // 2. Scene type 변환 함수
    const mapSceneType = (type: string): 'hook' | 'intro' | 'problem' | 'solution' | 'explanation' | 'example' | 'data' | 'comparison' | 'conclusion' | 'cta' => {
      const validTypes = ['hook', 'intro', 'problem', 'solution', 'explanation', 'example', 'data', 'comparison', 'conclusion', 'cta'] as const;
      if (validTypes.includes(type as any)) {
        return type as typeof validTypes[number];
      }
      if (type === 'climax') return 'conclusion';
      return 'explanation';
    };

    // 3. 수식→씬 배분 (커리큘럼 할당 우선 → fallback 청크 수식)
    const allUniqueFormulas: string[] = [];
    const formulaSet = new Set<string>();
    for (const s of episode.scenes) {
      for (const chunkId of (s.sourceChunkIds || [])) {
        const formulas = chunkLatexMap.get(chunkId);
        if (formulas) {
          for (const f of formulas) {
            if (!formulaSet.has(f)) {
              formulaSet.add(f);
              allUniqueFormulas.push(f);
            }
          }
        }
      }
    }

    const sceneFormulaMap = new Map<number, string[]>();
    let assignedCount = 0;
    episode.scenes.forEach((s: any, i: number) => {
      if (s.assignedFormula) {
        sceneFormulaMap.set(i, [s.assignedFormula]);
        assignedCount++;
      }
    });

    if (assignedCount === 0) {
      const formulaEligibleTypes = ['explanation', 'example', 'data', 'comparison'];
      const eligibleIndices: number[] = [];
      episode.scenes.forEach((s, i) => {
        const st = mapSceneType(s.type);
        if (formulaEligibleTypes.includes(st)) {
          eligibleIndices.push(i);
        }
      });

      const meaningfulFormulas = allUniqueFormulas.filter(f => f.trim().length > 2);
      if (meaningfulFormulas.length > 0) {
        for (let fi = 0; fi < eligibleIndices.length; fi++) {
          const formulaIdx = fi % meaningfulFormulas.length;
          sceneFormulaMap.set(eligibleIndices[fi], [meaningfulFormulas[formulaIdx]]);
        }
      }
    }

    logger.info({
      totalFormulas: allUniqueFormulas.length,
      assignedFromCurriculum: assignedCount,
      fallbackAssigned: sceneFormulaMap.size - assignedCount,
      assignedScenes: sceneFormulaMap.size
    }, 'v3.4.0: 수식→씬 배분 완료 (공통 파이프라인)');

    // 4. 이미지 생성
    const scenesWithFormula = episode.scenes.map((s, i) => {
      const hasFormula = sceneFormulaMap.has(i);
      const assignedFormula = (s as any).assignedFormula || (sceneFormulaMap.get(i)?.[0]) || undefined;
      return { ...s, hasFormula, assignedFormula };
    });

    logger.info({ sceneCount: episode.scenes.length }, 'Scene 이미지 생성 시작');

    const { imagePaths, failedScene } = await this.generateSceneImages(
      scenesWithFormula, ghibliService, neo4j, tempDir, config, episode.id
    );

    if (failedScene !== undefined) {
      await neo4j.updateEpisodeStatus(episode.id, 'approved');
      await fs.default.remove(tempDir);
      return { success: false, error: `Failed to generate image for scene ${failedScene + 1}` };
    }

    // 첫 이미지를 masterImage로 저장
    const masterImagePath = imagePaths[0];
    await neo4j.updateEpisodeStatus(episode.id, 'producing', { masterImagePath });

    // 5. 비디오 생성
    logger.info({ imageCount: imagePaths.length }, '📹 비디오 생성 시작');

    const videoService = getBooksVideoService();

    const shortPlan = {
      shortIndex: episode.episodeNumber - 1,
      title: episode.title,
      hook: episode.hook || '',
      theme: 'book',
      scenes: episode.scenes.map((s: any, i: number) => {
        const assignedFormulas = sceneFormulaMap.get(i);
        return {
          sceneIndex: i,
          sceneType: mapSceneType(s.type),
          narrationText: s.narration || '',
          visualPrompt: s.visualDesc || '',
          durationHint: s.durationSec || 7,
          sourceChunkIds: s.sourceChunkIds || [],
          latexFormulas: assignedFormulas,
          assignedFormula: s.assignedFormula || undefined,
          formulaName: s.formulaName || undefined,
          formulaMetaphor: s.formulaMetaphor || undefined,
        };
      }),
      totalDuration: episode.scenes.reduce((sum: number, s: any) => sum + (s.durationSec || 7), 0),
      tags: episode.hashtags || []
    };

    const videoResult = await videoService.createShortVideo({
      bookId: episode.documentId,
      shortPlan,
      imagePaths,
      config: {
        ...BOOKS_PROJECT_CONFIG,
        ...config.ttsVoice && { ttsVoice: config.ttsVoice },
        ...config.ttsGender && { ttsGender: config.ttsGender },
        ...config.orientation && { orientation: config.orientation },
        ...config.subtitleYPosition && { subtitleYPosition: config.subtitleYPosition },
      }
    });

    // 임시 이미지 폴더 정리
    await fs.default.remove(tempDir);

    if (!videoResult.success) {
      await neo4j.updateEpisodeStatus(episode.id, 'approved');
      return { success: false, error: `Video generation failed: ${videoResult.error}` };
    }

    if (!videoResult.videoId || !videoResult.videoPath) {
      await neo4j.updateEpisodeStatus(episode.id, 'approved');
      return { success: false, error: 'Video generation succeeded but videoId or videoPath is missing' };
    }

    // 6. GCS 업로드
    let gcsUrl: string | undefined;
    let publicUrl: string | undefined;

    try {
      const gcsService = new GoogleCloudStorageService(appConfig);
      const uploadResult = await gcsService.uploadVideo(
        videoResult.videoId,
        videoResult.videoPath,
        (progress) => {
          logger.info({
            videoId: videoResult.videoId,
            percentComplete: progress.percentComplete
          }, '📤 GCS 업로드 진행 중');
        }
      );

      if (uploadResult.success) {
        gcsUrl = uploadResult.gcsPath;
        publicUrl = uploadResult.publicUrl;
        logger.info({
          videoId: videoResult.videoId,
          gcsPath: gcsUrl,
          publicUrl
        }, '✅ GCS 업로드 완료');
      }
    } catch (gcsError) {
      logger.warn({
        error: gcsError,
        videoId: videoResult.videoId
      }, '⚠️ GCS 업로드 실패 (로컬 파일은 유지)');
    }

    // 7. Episode 상태 completed
    await neo4j.updateEpisodeStatus(episode.id, 'completed', {
      videoPath: videoResult.videoPath
    });

    logger.info({
      episodeId: episode.id,
      videoId: videoResult.videoId,
      videoPath: videoResult.videoPath,
      gcsUrl,
      duration: videoResult.duration
    }, '✅ Episode 비디오 생성 완료');

    return {
      success: true,
      videoResult,
      gcsUrl,
      publicUrl,
    };
  }

  private setupRoutes() {
    // GET /api/books - 책 목록
    this.router.get('/', async (req: Request, res: Response) => {
      try {
        const neo4j = await this.getNeo4jService();
        const books = await neo4j.getBooks();

        res.json({
          success: true,
          count: books.length,
          books
        });
      } catch (error) {
        logger.error({ error }, '❌ Failed to get books');
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // GET /api/books/pending - 미처리 문서 (Shorts 미생성)
    this.router.get('/pending', async (req: Request, res: Response) => {
      try {
        const neo4j = await this.getNeo4jService();
        const books = await neo4j.getUnprocessedDocuments();

        res.json({
          success: true,
          count: books.length,
          message: `${books.length} documents pending for Shorts generation`,
          books
        });
      } catch (error) {
        logger.error({ error }, '❌ Failed to get pending books');
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // ============================================
    // Episode/Scene API (정적 라우트 - /:bookId 보다 먼저 정의)
    // ============================================

    // GET /api/books/episodes/stats - Episode/Scene 통계
    this.router.get('/episodes/stats', async (req: Request, res: Response) => {
      try {
        const neo4j = await this.getNeo4jService();
        const stats = await neo4j.getEpisodeStats();

        res.json({
          success: true,
          stats
        });
      } catch (error) {
        logger.error({ error }, '❌ Failed to get episode stats');
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // DELETE /api/books/episodes/document/:documentId - 문서의 에피소드 삭제
    this.router.post('/episodes/delete', async (req: Request, res: Response) => {
      try {
        const { documentId, deleteCompleted = false } = req.body;
        if (!documentId) {
          return res.status(400).json({ success: false, error: 'documentId required' });
        }

        const neo4j = await this.getNeo4jService();
        const result = deleteCompleted
          ? await neo4j.deleteAllEpisodes(documentId)
          : await neo4j.deleteDraftEpisodes(documentId);

        res.json({
          success: true,
          ...result,
          message: `Deleted ${result.deletedEpisodes} episodes and ${result.deletedScenes} scenes for ${documentId}`
        });
      } catch (error) {
        logger.error({ error }, 'Failed to delete episodes');
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // GET /api/books/episodes/pending - 다음 처리할 Episode
    this.router.get('/episodes/pending', async (req: Request, res: Response) => {
      try {
        const { documentId } = req.query;
        const neo4j = await this.getNeo4jService();
        const episode = await neo4j.getNextPendingEpisode(documentId as string | undefined);

        if (!episode) {
          return res.json({
            success: true,
            message: 'No pending episodes',
            episode: null
          });
        }

        // Episode와 함께 Scenes도 조회
        const episodeWithScenes = await neo4j.getEpisodeWithScenes(episode.id);

        res.json({
          success: true,
          episode: episodeWithScenes
        });
      } catch (error) {
        logger.error({ error }, '❌ Failed to get pending episode');
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // GET /api/books/episodes/:episodeId - Episode 상세 (Scenes 포함)
    this.router.get('/episodes/:episodeId', async (req: Request, res: Response) => {
      try {
        const { episodeId } = req.params;
        const neo4j = await this.getNeo4jService();
        const episode = await neo4j.getEpisodeWithScenes(episodeId);

        if (!episode) {
          return res.status(404).json({
            success: false,
            error: `Episode not found: ${episodeId}`
          });
        }

        res.json({
          success: true,
          episode
        });
      } catch (error) {
        logger.error({ error }, '❌ Failed to get episode');
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // PUT /api/books/episodes/:episodeId/status - Episode 상태 업데이트
    this.router.put('/episodes/:episodeId/status', async (req: Request, res: Response) => {
      try {
        const { episodeId } = req.params;
        const { status, masterImagePath, videoPath, youtubeId } = req.body;

        const validStatuses = ['draft', 'approved', 'producing', 'completed', 'uploaded'];
        if (!status || !validStatuses.includes(status)) {
          return res.status(400).json({
            success: false,
            error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
          });
        }

        const neo4j = await this.getNeo4jService();
        const success = await neo4j.updateEpisodeStatus(episodeId, status, {
          masterImagePath,
          videoPath,
          youtubeId
        });

        if (!success) {
          return res.status(404).json({
            success: false,
            error: `Episode not found: ${episodeId}`
          });
        }

        res.json({
          success: true,
          episodeId,
          status,
          message: `Episode status updated to '${status}'`
        });
      } catch (error) {
        logger.error({ error }, '❌ Failed to update episode status');
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // ============================================
    // Phase 3: Episode → Video 생성 파이프라인
    // ============================================

    // POST /api/books/episodes/:episodeId/generate-video - Episode 비디오 생성
    // v3.4.0: generateEpisodeVideoPipeline() 공통 메서드 사용
    this.router.post('/episodes/:episodeId/generate-video', async (req: Request, res: Response) => {
      try {
        const { episodeId } = req.params;
        const { config = {} } = req.body;

        const neo4j = await this.getNeo4jService();

        const episode = await neo4j.getEpisodeWithScenes(episodeId);
        if (!episode) {
          return res.status(404).json({ success: false, error: `Episode not found: ${episodeId}` });
        }
        if (!episode.scenes || episode.scenes.length === 0) {
          return res.status(400).json({ success: false, error: `Episode has no scenes: ${episodeId}` });
        }

        logger.info({
          episodeId, title: episode.title, sceneCount: episode.scenes.length, status: episode.status
        }, '🎬 Episode 비디오 생성 시작');

        await neo4j.updateEpisodeStatus(episodeId, 'producing');

        const result = await this.generateEpisodeVideoPipeline(episode, config, neo4j);

        if (!result.success) {
          return res.status(500).json({ success: false, error: result.error });
        }

        return res.json({
          success: true,
          episodeId,
          videoId: result.videoResult.videoId,
          videoPath: result.videoResult.videoPath,
          gcsUrl: result.gcsUrl,
          publicUrl: result.publicUrl,
          duration: result.videoResult.duration,
          details: result.videoResult.details,
          message: 'Episode video generated successfully'
        });
      } catch (error) {
        logger.error({ error }, '❌ Failed to generate episode video');
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // POST /api/books/episodes/:episodeId/generate-images - Episode 이미지만 생성 (비디오 제외)
    this.router.post('/episodes/:episodeId/generate-images', async (req: Request, res: Response) => {
      try {
        const { episodeId } = req.params;
        const { config = {} } = req.body;

        const neo4j = await this.getNeo4jService();
        const episode = await neo4j.getEpisodeWithScenes(episodeId);

        if (!episode) {
          return res.status(404).json({
            success: false,
            error: `Episode not found: ${episodeId}`
          });
        }

        if (!episode.scenes || episode.scenes.length === 0) {
          return res.status(400).json({
            success: false,
            error: `Episode has no scenes: ${episodeId}`
          });
        }

        logger.info({
          episodeId,
          sceneCount: episode.scenes.length
        }, '🖼️ Episode 이미지 생성 시작');

        const appConfig = new Config();
        const ghibliService = new GhibliImageService(
          appConfig.googleGeminiApiKey || '',
          appConfig.openaiApiKey || '',
          appConfig.tempDirPath
        );

        const fs = await import('fs-extra');
        const path = await import('path');
        const outputDir = path.default.join(appConfig.tempDirPath, 'episode_images', episodeId);
        await fs.default.ensureDir(outputDir);

        const results: Array<{
          sceneIndex: number;
          sceneId: string;
          success: boolean;
          imagePath?: string;
          generator?: string;
          error?: string;
        }> = [];

        // v3.5.0: 교육 씬용 참조 이미지 관리
        let lastEduTopic = '';
        let eduRef: { data: Buffer; mimeType: string } | undefined;

        for (let i = 0; i < episode.scenes.length; i++) {
          const scene = episode.scenes[i];
          const visualPrompt = scene.visualDesc || scene.narration || `Scene ${i + 1}`;
          const strategy = this.getSceneImageStrategy(scene as any);
          const currentTopic = (scene as any).assignedFormula || scene.type || 'explanation';
          const topicChanged = strategy !== 'narrative' && (currentTopic !== lastEduTopic || !eduRef);

          let imageResult;

          if (strategy === 'narrative') {
            imageResult = await ghibliService.generateSceneImage(
              visualPrompt,
              i,
              (config.orientation === 'landscape' ? '16:9' : '9:16'),
              {
                mood: config.mood || 'whimsical',
                timeOfDay: config.timeOfDay || 'day',
                characterDescription: config.characterDescription,
                imageMode: 'narrative'
              },
              episodeId
            );
          } else {
            const imageMode = strategy === 'formula' ? 'formula' : 'educational';
            imageResult = await ghibliService.generateSceneImage(
              visualPrompt,
              i,
              (config.orientation === 'landscape' ? '16:9' : '9:16'),
              {
                imageMode,
                forceGpt: topicChanged,
                educationalReference: eduRef
              },
              episodeId
            );
            if (topicChanged && imageResult.success && imageResult.imageBuffer) {
              eduRef = { data: imageResult.imageBuffer, mimeType: imageResult.mimeType || 'image/png' };
              lastEduTopic = currentTopic;
            }
          }

          if (imageResult.success && imageResult.imageBuffer) {
            const imagePath = path.default.join(outputDir, `scene_${i}.png`);
            await fs.default.writeFile(imagePath, imageResult.imageBuffer);

            // Scene 에셋 업데이트
            await neo4j.updateSceneAssets(scene.id, { imagePath: imagePath });

            results.push({
              sceneIndex: i,
              sceneId: scene.id,
              success: true,
              imagePath,
              generator: imageResult.generator
            });
          } else {
            results.push({
              sceneIndex: i,
              sceneId: scene.id,
              success: false,
              error: imageResult.error
            });
          }
        }

        // 첫 이미지를 masterImage로 저장
        const firstSuccess = results.find(r => r.success);
        if (firstSuccess) {
          await neo4j.updateEpisodeStatus(episodeId, episode.status, {
            masterImagePath: firstSuccess.imagePath
          });
        }

        const successCount = results.filter(r => r.success).length;
        logger.info({
          episodeId,
          total: results.length,
          success: successCount,
          failed: results.length - successCount
        }, '✅ Episode 이미지 생성 완료');

        res.json({
          success: successCount === results.length,
          episodeId,
          outputDir,
          total: results.length,
          successCount,
          failedCount: results.length - successCount,
          results
        });
      } catch (error) {
        logger.error({ error }, '❌ Failed to generate episode images');
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // ============================================
    // POST /api/books/generate-next-episode - 다음 대기 Episode 자동 생성
    // v3.4.0: generateEpisodeVideoPipeline() 공통 메서드 사용
    // ============================================
    this.router.post('/generate-next-episode', async (req: Request, res: Response) => {
      try {
        const { documentId, config = {} } = req.body;

        const neo4j = await this.getNeo4jService();

        // 1. 다음 처리할 Episode 조회
        const episode = await neo4j.getNextPendingEpisode(documentId as string | undefined);

        if (!episode) {
          return res.json({
            success: true,
            completed: true,
            message: documentId
              ? `No pending episodes for document: ${documentId}. All episodes are completed!`
              : 'No pending episodes. All episodes are completed!',
            episode: null
          });
        }

        const episodeWithScenes = await neo4j.getEpisodeWithScenes(episode.id);
        if (!episodeWithScenes) {
          return res.status(404).json({ success: false, error: `Episode not found: ${episode.id}` });
        }
        if (!episodeWithScenes.scenes || episodeWithScenes.scenes.length === 0) {
          return res.status(400).json({ success: false, error: `Episode has no scenes: ${episode.id}` });
        }

        logger.info({
          episodeId: episode.id, episodeNumber: episode.episodeNumber,
          documentId: episode.documentId, title: episode.title,
          sceneCount: episodeWithScenes.scenes.length, status: episode.status
        }, '🎬 다음 대기 Episode 비디오 생성 시작 (incremental mode)');

        await neo4j.updateEpisodeStatus(episode.id, 'producing');

        const result = await this.generateEpisodeVideoPipeline(episodeWithScenes, config, neo4j);

        if (!result.success) {
          return res.status(500).json({ success: false, error: result.error });
        }

        // 진행 상황 조회
        const nextPending = await neo4j.getNextPendingEpisode(documentId as string | undefined);
        const stats = await neo4j.getEpisodeStats();
        const completedCount = stats.byStatus['completed'] || 0;
        const pendingCount = stats.byStatus['draft'] || 0;
        const approvedCount = stats.byStatus['approved'] || 0;

        return res.json({
          success: true,
          completed: !nextPending,
          episodeId: episode.id,
          episodeNumber: episode.episodeNumber,
          documentId: episode.documentId,
          title: episode.title,
          videoId: result.videoResult.videoId,
          videoPath: result.videoResult.videoPath,
          gcsUrl: result.gcsUrl,
          publicUrl: result.publicUrl,
          duration: result.videoResult.duration,
          details: result.videoResult.details,
          progress: {
            totalEpisodes: stats.totalEpisodes,
            completedEpisodes: completedCount,
            remainingEpisodes: pendingCount + approvedCount,
            nextPendingEpisode: nextPending ? {
              id: nextPending.id,
              episodeNumber: nextPending.episodeNumber,
              title: nextPending.title
            } : null
          },
          message: nextPending
            ? `Episode ${episode.episodeNumber} completed. Next: Episode ${nextPending.episodeNumber}`
            : `Episode ${episode.episodeNumber} completed. All episodes done!`
        });
      } catch (error) {
        logger.error({ error }, '❌ Failed to generate next episode video');
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // ============================================
    // Document API (/:bookId 동적 라우트)
    // ============================================

    // PUT /api/books/:bookId/status - 상태 업데이트
    this.router.put('/:bookId/status', async (req: Request, res: Response) => {
      try {
        const { bookId } = req.params;
        const { status, planId, totalShorts } = req.body;

        const validStatuses = ['pending', 'analyzed', 'generating', 'completed', 'uploaded'];
        if (!status || !validStatuses.includes(status)) {
          return res.status(400).json({
            success: false,
            error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
          });
        }

        const neo4j = await this.getNeo4jService();
        const success = await neo4j.updateDocumentShortsStatus(bookId, status, { planId, totalShorts });

        if (!success) {
          return res.status(404).json({
            success: false,
            error: `Document not found: ${bookId}`
          });
        }

        res.json({
          success: true,
          bookId,
          status,
          message: `Document status updated to '${status}'`
        });
      } catch (error) {
        logger.error({ error }, '❌ Failed to update status');
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // GET /api/books/stats - 그래프 통계
    this.router.get('/stats', async (req: Request, res: Response) => {
      try {
        const neo4j = await this.getNeo4jService();
        const stats = await neo4j.getGraphStats();

        res.json({
          success: true,
          stats
        });
      } catch (error) {
        logger.error({ error }, '❌ Failed to get stats');
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // GET /api/books/test-korean-tts - 하드코딩된 한국어 TTS 테스트 (인코딩 검증용)
    this.router.get('/test-korean-tts', async (req: Request, res: Response) => {
      try {
        // 하드코딩된 한국어 텍스트 (API body parsing 우회)
        const koreanText = '안녕하세요. 테스트입니다.';

        logger.info({
          text: koreanText,
          textLength: koreanText.length,
          textBuffer: Buffer.from(koreanText, 'utf-8').toString('hex'),
        }, '🧪 한국어 TTS 직접 테스트 (하드코딩)');

        // GeminiTTS 직접 호출
        const { GeminiTTS } = await import('../../../YTB-tts/index.js');
        const { Config } = await import('../../../config.js');
        const config = new Config();

        const geminiTTS = new GeminiTTS({
          apiKey: config.googleGeminiApiKey,
          model: 'gemini-2.5-flash-preview-tts',
          defaultGender: 'female',
        });

        const result = await geminiTTS.generate(koreanText, 'Kore', { useNewsVoice: false });

        logger.info({
          audioSize: result.audio.byteLength,
          audioLength: result.audioLength,
          voice: result.voice,
        }, '✅ 한국어 TTS 성공');

        res.json({
          success: true,
          text: koreanText,
          audioSize: result.audio.byteLength,
          audioLength: result.audioLength,
          voice: result.voice,
        });
      } catch (error) {
        logger.error({ error }, '❌ 한국어 TTS 테스트 실패');
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // GET /api/books/connection - Neo4j 연결 테스트
    this.router.get('/connection', async (req: Request, res: Response) => {
      try {
        const neo4j = await this.getNeo4jService();
        const result = await neo4j.testConnection();

        res.json(result);
      } catch (error) {
        logger.error({ error }, '❌ Connection test failed');
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // GET /api/books/:bookId - 책 상세 (청크 포함)
    this.router.get('/:bookId', async (req: Request, res: Response) => {
      try {
        const { bookId } = req.params;
        const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;

        const neo4j = await this.getNeo4jService();

        // 책 목록에서 해당 책 찾기
        const books = await neo4j.getBooks();
        const book = books.find(b => b.id === bookId || b.title === bookId);

        if (!book) {
          return res.status(404).json({
            success: false,
            error: `Book not found: ${bookId}`
          });
        }

        // 청크 조회
        const chunks = await neo4j.getChunks(bookId, limit);

        res.json({
          success: true,
          book,
          chunks,
          chunkCount: chunks.length
        });
      } catch (error) {
        logger.error({ error }, '❌ Failed to get book detail');
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // GET /api/books/:bookId/chunks - 청크 목록
    this.router.get('/:bookId/chunks', async (req: Request, res: Response) => {
      try {
        const { bookId } = req.params;
        const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
        const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

        const neo4j = await this.getNeo4jService();
        const allChunks = await neo4j.getChunks(bookId);

        // 페이지네이션 적용
        const chunks = limit
          ? allChunks.slice(offset, offset + limit)
          : allChunks.slice(offset);

        res.json({
          success: true,
          bookId,
          total: allChunks.length,
          offset,
          limit,
          chunks
        });
      } catch (error) {
        logger.error({ error }, '❌ Failed to get chunks');
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // ============================================
    // 🆕 POST /api/books/:bookId/curriculum - 순차적 커리큘럼 기반 에피소드 생성 (v2.5.0)
    // 핵심: 전체 문서를 학습 순서대로 분석 → 연결된 에피소드 시리즈 생성
    // 특징:
    //   1. 에피소드 간 연결성 보장 (이전 내용 요약 + 다음 예고)
    //   2. 수학/기술 내용 상세 설명 필수
    //   3. 순차적 학습 커리큘럼 (기초 → 심화)
    //   4. 모든 내용 빠짐없이 커버
    // ============================================
    this.router.post('/:bookId/curriculum', async (req: Request, res: Response) => {
      try {
        const { bookId } = req.params;
        const {
          characterDescription,
          style = 'ghibli',
          audienceLevel = 'elementary',
          useELI5Style = true,
          forceRefresh = false,
          saveToNeo4j = true,
          maxScenesPerShort = 8
        } = req.body;

        logger.info({ bookId, style, audienceLevel }, '📚 Sequential curriculum planning started');

        // 캐시 확인
        const cacheKey = `curriculum_${bookId}_${style}`;
        if (!forceRefresh && this.plansCache.has(cacheKey)) {
          const cachedPlan = this.plansCache.get(cacheKey)!;
          logger.info({ bookId, cacheKey }, '📦 Returning cached curriculum plan');
          return res.json({
            success: true,
            cached: true,
            method: 'sequential-curriculum',
            plan: cachedPlan
          });
        }

        const neo4j = await this.getNeo4jService();

        // 1. 청크 조회
        const chunks = await neo4j.getChunks(bookId);
        if (!chunks || chunks.length === 0) {
          return res.status(404).json({
            success: false,
            error: `No chunks found for: ${bookId}`,
            hint: 'Upload the document to NEB first'
          });
        }

        logger.info({ bookId, chunkCount: chunks.length }, 'Chunks retrieved');

        // 2. 문서 분야(contentType) 결정: Neo4j 캐시 → AI 판별 → 저장
        let contentType: ContentType = 'auto';
        const savedType = await neo4j.getDocumentContentType(bookId);
        if (savedType && ['math_science', 'humanities', 'social_science'].includes(savedType)) {
          contentType = savedType as ContentType;
          logger.info({ bookId, contentType }, 'Content type loaded from Neo4j');
        } else {
          // AI로 분야 판별 (1회만, 이후 Neo4j에 캐시)
          const tempPlanner = this.getContentPlannerService();
          contentType = await tempPlanner.detectDocumentContentType(chunks);
          await neo4j.setDocumentContentType(bookId, contentType);
          logger.info({ bookId, contentType }, 'Content type detected by AI and saved to Neo4j');
        }

        // 3. ContentPlannerService로 순차적 커리큘럼 분석 (분야별 프롬프트 적용)
        const planner = this.getContentPlannerService({
          audienceLevel,
          useELI5Style,
          style,
          maxShortsPerBook: 20,
          maxScenesPerShort,
          contentType
        });

        // 🆕 순차적 커리큘럼 방식 사용
        const plan = await planner.analyzeAndPlanSequentialCurriculum(
          bookId,
          bookId.replace('.pdf', ''),
          chunks,
          characterDescription
        );

        // 캐시 저장
        this.plansCache.set(cacheKey, plan);

        logger.info({
          bookId,
          totalShorts: plan.totalShorts,
          totalScenes: plan.metadata?.totalScenes,
          totalDuration: plan.metadata?.estimatedTotalDuration
        }, '✅ Sequential curriculum planning completed');

        // 3. Neo4j에 Episode/Scene 자동 저장
        let savedEpisodes: any[] = [];
        if (saveToNeo4j && plan.shorts.length > 0) {
          logger.info({ bookId, episodeCount: plan.shorts.length }, '📝 Saving episodes to Neo4j');

          const lastEpisodeNumber = await neo4j.getLastEpisodeNumber(bookId);
          let previousEpisodeId: string | undefined;

          if (lastEpisodeNumber > 0) {
            const existingEpisodes = await neo4j.getDocumentEpisodes(bookId);
            const lastEpisode = existingEpisodes.find(e => e.episodeNumber === lastEpisodeNumber);
            previousEpisodeId = lastEpisode?.id;
          }

          for (let i = 0; i < plan.shorts.length; i++) {
            const short = plan.shorts[i];
            const episodeNumber = lastEpisodeNumber + i + 1;

            try {
              // 단일 트랜잭션으로 Episode + Scenes 생성
              const scenesInput = short.scenes.map((scene: any) => ({
                type: (scene.sceneType || 'explanation') as 'explanation',
                narration: scene.narrationText as string,
                onScreenText: scene.narrationText.substring(0, 50) as string,
                durationSec: (scene.durationHint || 7) as number,
                visualType: 'animation' as const,
                visualDesc: scene.visualPrompt as string,
                camera: 'static' as const,
                transition: 'cut' as const,
                sourceChunkIds: (scene.sourceChunkIds || []) as string[],
                assignedFormula: scene.assignedFormula || undefined,
                formulaName: scene.formulaName || undefined,
                formulaMetaphor: scene.formulaMetaphor || undefined,
              }));

              const episodeWithScenes = await neo4j.createEpisodeWithScenes(
                {
                  documentId: bookId,
                  episodeNumber,
                  title: short.title,
                  hook: short.hook || '',
                  cta: '다음 영상에서 계속!',
                  ctaAction: 'next_episode',
                  keywords: short.tags?.slice(0, 5) || [],
                  hashtags: short.tags?.map((t: string) => `#${t}`) || [],
                  previousEpisodeId
                },
                scenesInput
              );

              savedEpisodes.push({
                id: episodeWithScenes.id,
                episodeNumber,
                title: short.title,
                sceneCount: episodeWithScenes.scenes.length
              });

              // 이전 에피소드의 nextEpisodeId 업데이트 (직접 쿼리)
              if (previousEpisodeId) {
                await neo4j.linkEpisodes(previousEpisodeId, episodeWithScenes.id);
              }

              previousEpisodeId = episodeWithScenes.id;
              logger.info({ episodeId: episodeWithScenes.id, episodeNumber }, `✅ Episode ${episodeNumber} saved`);

            } catch (epError) {
              logger.error({ error: epError, episodeNumber }, '❌ Failed to save episode');
            }
          }
        }

        res.json({
          success: true,
          method: 'sequential-curriculum',
          bookId,
          contentType,
          totalEpisodes: plan.totalShorts,
          totalScenes: plan.metadata?.totalScenes,
          estimatedDuration: `${Math.round((plan.metadata?.estimatedTotalDuration || 0) / 60)}분`,
          savedToNeo4j: saveToNeo4j,
          savedEpisodes,
          plan
        });

      } catch (error) {
        logger.error({ error }, '❌ Curriculum planning failed');
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // POST /api/books/:bookId/entities - NEB 엔티티 기반 멀티 에피소드 분석 + 자동 저장
    // ⚠️ 참고: 순차적 연결이 필요하면 /curriculum 엔드포인트 사용 권장
    // 핵심: 하나의 논문 → 여러 개의 Shorts (엔티티 클러스터별 에피소드)
    // saveToNeo4j: true (기본) - Neo4j에 Episode/Scene 자동 저장
    this.router.post('/:bookId/entities', async (req: Request, res: Response) => {
      try {
        const { bookId } = req.params;
        const {
          characterDescription,
          style = 'ghibli',
          audienceLevel = 'elementary',  // 기본: 쉬운 설명
          useELI5Style = true,
          forceRefresh = false,
          saveToNeo4j = true  // 자동으로 Neo4j에 Episode/Scene 저장
        } = req.body;

        // 캐시 확인
        const cacheKey = `entity_${bookId}_${style}`;
        if (!forceRefresh && this.plansCache.has(cacheKey)) {
          const cachedPlan = this.plansCache.get(cacheKey)!;
          logger.info({ bookId, cacheKey }, '📦 Returning cached entity-based plan');
          return res.json({
            success: true,
            cached: true,
            method: 'entity-clusters',
            plan: cachedPlan
          });
        }

        const neo4j = await this.getNeo4jService();

        // 1. 엔티티 클러스터 조회 (NEB 데이터)
        logger.info({ bookId }, '🔍 NEB 엔티티 클러스터 조회 중');
        const clusters = await neo4j.getEntityClusters(bookId);

        if (!clusters || clusters.length === 0) {
          // 엔티티 없으면 기존 방식으로 폴백
          logger.warn({ bookId }, '⚠️ 엔티티 클러스터 없음, 기존 방식으로 폴백');
          return res.status(400).json({
            success: false,
            error: `No entity clusters found for: ${bookId}. Process with NEB (llm-graph-builder) first.`,
            hint: 'Upload the document to NEB frontend at http://34.47.112.49:8081 to extract entities.'
          });
        }

        logger.info({
          bookId,
          clusterCount: clusters.length,
          clusters: clusters.map(c => ({ name: c.clusterName, chunkCount: c.chunkIds.length }))
        }, '✅ 엔티티 클러스터 발견');

        // 2. ContentPlannerService로 엔티티 기반 분석
        const planner = this.getContentPlannerService({
          audienceLevel,
          useELI5Style,
          style,
          maxShortsPerBook: clusters.length,  // 클러스터 수만큼 Shorts
          maxScenesPerShort: 8  // 에피소드당 8씬
        });

        // 3. 각 클러스터별 에피소드 생성
        const shorts = [];

        for (let i = 0; i < clusters.length; i++) {
          const cluster = clusters[i];

          // 클러스터에 속한 청크 텍스트 조회
          const chunkTexts = await neo4j.getClusterChunkTexts(cluster.chunkIds);
          const combinedText = chunkTexts.join('\n\n');

          logger.info({
            clusterIndex: i,
            clusterName: cluster.clusterName,
            mainEntity: cluster.mainEntity,
            chunkCount: cluster.chunkIds.length,
            textLength: combinedText.length
          }, `📝 클러스터 ${i + 1}/${clusters.length} 분석 중`);

          // 청크를 BookChunk 형태로 변환
          const bookChunks = cluster.chunkIds.map((id, idx) => ({
            id,
            bookId,
            text: chunkTexts[idx] || '',
            chunkIndex: idx
          }));

          // 단일 클러스터에 대한 분석 (1 Short = 1 Episode)
          const clusterPlan = await planner.analyzeAndPlan(
            bookId,
            `${cluster.clusterName} - ${cluster.mainEntity}`,
            bookChunks,
            characterDescription
          );

          if (clusterPlan.shorts && clusterPlan.shorts.length > 0) {
            const short = clusterPlan.shorts[0];
            short.title = `${cluster.mainEntity}: ${short.title}`;
            short.theme = cluster.clusterName;
            shorts.push(short);
          }
        }

        // 4. 전체 Plan 구성
        const plan: ShortsPlan = {
          bookId,
          bookTitle: bookId,
          totalShorts: shorts.length,
          character: {
            description: characterDescription || 'A friendly anime character explaining complex topics simply',
            style
          },
          shorts,
          metadata: {
            analyzedAt: new Date().toISOString(),
            totalChunks: clusters.reduce((sum, c) => sum + c.chunkIds.length, 0),
            totalScenes: shorts.reduce((sum, s) => sum + s.scenes.length, 0),
            estimatedTotalDuration: shorts.reduce((sum, s) => sum + (s.totalDuration || 60), 0)
          }
        };

        // 캐시 저장 (두 가지 키로 저장 - entity용, episodes용)
        this.plansCache.set(cacheKey, plan);
        this.plansCache.set(`${bookId}_${style}_${clusters.length}_8`, plan);  // episodes에서도 찾을 수 있도록

        logger.info({
          bookId,
          totalShorts: plan.totalShorts,
          totalScenes: plan.metadata?.totalScenes,
          clusters: clusters.map(c => c.mainEntity)
        }, '✅ 엔티티 기반 멀티 에피소드 분석 완료');

        // 5. Neo4j에 Episode/Scene 자동 저장
        let savedEpisodes: any[] = [];
        if (saveToNeo4j && shorts.length > 0) {
          logger.info({ bookId, episodeCount: shorts.length }, '📝 Neo4j에 Episode/Scene 저장 시작');

          // 마지막 Episode 번호 조회
          const lastEpisodeNumber = await neo4j.getLastEpisodeNumber(bookId);
          let previousEpisodeId: string | undefined;

          if (lastEpisodeNumber > 0) {
            const existingEpisodes = await neo4j.getDocumentEpisodes(bookId);
            const lastEpisode = existingEpisodes.find(e => e.episodeNumber === lastEpisodeNumber);
            previousEpisodeId = lastEpisode?.id;
          }

          for (let i = 0; i < shorts.length; i++) {
            const short = shorts[i];
            const episodeNumber = lastEpisodeNumber + i + 1;

            // 단일 트랜잭션으로 Episode + Scenes 생성 (타이밍 이슈 해결)
            const scenesInput = short.scenes.map((scene: any) => ({
              type: (scene.sceneType || 'explanation') as 'explanation',
              narration: scene.narrationText as string,
              onScreenText: scene.narrationText.substring(0, 50) as string,
              durationSec: (scene.durationHint || 7) as number,
              visualType: 'animation' as const,
              visualDesc: scene.visualPrompt as string,
              camera: 'static' as const,
              transition: 'cut' as const,
              sourceChunkIds: (scene.sourceChunkIds || []) as string[],
              assignedFormula: scene.assignedFormula || undefined,
              formulaName: scene.formulaName || undefined,
              formulaMetaphor: scene.formulaMetaphor || undefined,
            }));

            const episodeWithScenes = await neo4j.createEpisodeWithScenes(
              {
                documentId: bookId,
                episodeNumber,
                title: short.title,
                hook: short.hook,
                cta: '다음 영상에서 계속!',
                ctaAction: 'next_episode',
                keywords: short.tags || [],
                hashtags: short.tags?.map((t: string) => `#${t}`) || [],
                previousEpisodeId
              },
              scenesInput
            );

            savedEpisodes.push(episodeWithScenes);
            previousEpisodeId = episodeWithScenes.id;
          }

          // Document 상태 업데이트
          await neo4j.updateDocumentShortsStatus(bookId, 'analyzed', {
            totalShorts: lastEpisodeNumber + savedEpisodes.length
          });

          logger.info({
            bookId,
            savedCount: savedEpisodes.length,
            episodeIds: savedEpisodes.map(e => e?.id)
          }, '✅ Neo4j Episode/Scene 저장 완료');
        }

        res.json({
          success: true,
          cached: false,
          method: 'entity-clusters',
          clusterInfo: clusters.map(c => ({
            name: c.clusterName,
            mainEntity: c.mainEntity,
            relatedEntities: c.relatedEntities,
            chunkCount: c.chunkIds.length
          })),
          plan,
          // 저장된 Episode 정보 추가
          savedToNeo4j: saveToNeo4j,
          episodes: savedEpisodes.length > 0 ? savedEpisodes : undefined
        });
      } catch (error) {
        logger.error({ error }, '❌ Failed to analyze with entities');
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // POST /api/books/:bookId/analyze - AI 분석 → Shorts 계획 생성
    this.router.post('/:bookId/analyze', async (req: Request, res: Response) => {
      try {
        const { bookId } = req.params;
        const {
          characterDescription,  // 캐릭터 설명 (선택)
          style = 'ghibli',      // 스타일 (ghibli, anime, realistic 등)
          maxShorts = 5,         // 최대 Shorts 수
          maxScenes = 6,         // Short당 최대 Scene 수
          forceRefresh = false,  // 캐시 무시하고 재분석
          // NEW: ELI5 쉬운 설명 옵션
          audienceLevel = 'general',  // 'elementary' | 'general' | 'professional'
          useELI5Style = true         // 쉬운 설명 모드 (기본 활성화)
        } = req.body;

        // 캐시 확인
        const cacheKey = `${bookId}_${style}_${maxShorts}_${maxScenes}`;
        if (!forceRefresh && this.plansCache.has(cacheKey)) {
          const cachedPlan = this.plansCache.get(cacheKey)!;
          logger.info({ bookId, cacheKey }, '📦 Returning cached plan');
          return res.json({
            success: true,
            cached: true,
            plan: cachedPlan
          });
        }

        const neo4j = await this.getNeo4jService();

        // 책 정보 조회
        const books = await neo4j.getBooks();
        const book = books.find(b => b.id === bookId || b.title === bookId);

        if (!book) {
          return res.status(404).json({
            success: false,
            error: `Book not found: ${bookId}`
          });
        }

        // 청크 조회
        const chunks = await neo4j.getChunks(bookId);

        if (chunks.length === 0) {
          return res.status(404).json({
            success: false,
            error: `No chunks found for book: ${bookId}`
          });
        }

        logger.info({
          bookId,
          bookTitle: book.title,
          chunkCount: chunks.length,
          style,
          maxShorts,
          maxScenes,
          audienceLevel,
          useELI5Style
        }, '🔍 Starting AI analysis');

        // 옵션에 맞는 ContentPlannerService 생성
        const planner = this.getContentPlannerService({
          audienceLevel,
          useELI5Style,
          style,
          maxShortsPerBook: maxShorts,
          maxScenesPerShort: maxScenes
        });

        // AI 분석 실행
        const plan = await planner.analyzeAndPlan(
          bookId,
          book.title,
          chunks,
          characterDescription
        );

        // 캐시 저장
        this.plansCache.set(cacheKey, plan);

        logger.info({
          bookId,
          totalShorts: plan.totalShorts,
          totalScenes: plan.metadata.totalScenes
        }, '✅ AI analysis completed');

        res.json({
          success: true,
          cached: false,
          plan
        });
      } catch (error) {
        logger.error({ error }, '❌ Failed to analyze book');
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // GET /api/books/:bookId/plan - 저장된 Shorts 계획 조회
    this.router.get('/:bookId/plan', async (req: Request, res: Response) => {
      try {
        const { bookId } = req.params;

        // 캐시에서 검색
        const matchingKeys = Array.from(this.plansCache.keys()).filter(k => k.startsWith(bookId));

        if (matchingKeys.length === 0) {
          return res.status(404).json({
            success: false,
            error: `No plan found for book: ${bookId}. Use POST /api/books/${bookId}/analyze first.`
          });
        }

        // 가장 최근 계획 반환
        const latestKey = matchingKeys[matchingKeys.length - 1];
        const plan = this.plansCache.get(latestKey);

        res.json({
          success: true,
          cacheKey: latestKey,
          plan
        });
      } catch (error) {
        logger.error({ error }, '❌ Failed to get plan');
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // POST /api/books/search - 유사 청크 검색
    this.router.post('/search', async (req: Request, res: Response) => {
      try {
        const { query, topK = 5 } = req.body;

        if (!query) {
          return res.status(400).json({
            success: false,
            error: 'query is required'
          });
        }

        const neo4j = await this.getNeo4jService();
        const results = await neo4j.searchSimilarChunks(query, topK);

        res.json({
          success: true,
          query,
          results
        });
      } catch (error) {
        logger.error({ error }, '❌ Failed to search chunks');
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // POST /api/books/:bookId/shorts - Shorts 생성 요청
    this.router.post('/:bookId/shorts', async (req: Request, res: Response) => {
      try {
        const { bookId } = req.params;
        const {
          chunkIndices,      // 특정 청크들만 사용 (선택)
          chunkLimit = 5,    // 청크 개수 제한
          config = {}        // Shorts 생성 설정
        } = req.body;

        const neo4j = await this.getNeo4jService();

        // 청크 조회
        const allChunks = await neo4j.getChunks(bookId);

        if (allChunks.length === 0) {
          return res.status(404).json({
            success: false,
            error: `No chunks found for book: ${bookId}`
          });
        }

        // 청크 선택
        let selectedChunks = allChunks;
        if (chunkIndices && Array.isArray(chunkIndices)) {
          selectedChunks = allChunks.filter((_, i) => chunkIndices.includes(i));
        } else {
          selectedChunks = allChunks.slice(0, chunkLimit);
        }

        // Shorts 생성을 위한 씬 데이터 생성
        const scenes = selectedChunks.map((chunk, index) => ({
          text: chunk.text.substring(0, 200), // 나레이션용 텍스트 (200자 제한)
          scenePrompt: `${chunk.text.substring(0, 100)}, Studio Ghibli anime style, detailed background, warm lighting`,
          chunkId: chunk.id,
          chunkIndex: chunk.chunkIndex
        }));

        // 응답 (실제 생성은 /api/video/consistent-shorts로 전달)
        res.json({
          success: true,
          message: 'Shorts generation data prepared',
          bookId,
          selectedChunks: selectedChunks.length,
          totalChunks: allChunks.length,
          scenes,
          // 바로 consistent-shorts API로 전달할 수 있는 형식
          shortsRequest: {
            character: {
              description: config.characterDescription || 'Anime character in Studio Ghibli style, expressive face, detailed clothing'
            },
            scenes: scenes.map(s => ({
              text: s.text,
              scenePrompt: s.scenePrompt
            })),
            config: {
              orientation: 'portrait',
              generateVideos: config.generateVideos ?? false,
              skipTTS: config.skipTTS ?? false,
              useGPTFirst: config.useGPTFirst ?? true,
              ...config
            }
          }
        });
      } catch (error) {
        logger.error({ error }, '❌ Failed to prepare shorts');
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // GET /api/books/:bookId/chunks/:chunkId/entities - 청크 엔티티 조회
    this.router.get('/:bookId/chunks/:chunkId/entities', async (req: Request, res: Response) => {
      try {
        const { chunkId } = req.params;

        const neo4j = await this.getNeo4jService();
        const entities = await neo4j.getChunkEntities(chunkId);

        res.json({
          success: true,
          chunkId,
          entities
        });
      } catch (error) {
        logger.error({ error }, '❌ Failed to get chunk entities');
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // POST /api/books/test-video - 이미지+TTS 비디오 생성 테스트
    this.router.post('/test-video', async (req: Request, res: Response) => {
      try {
        const { images, outputPath, config } = req.body;

        // 검증
        if (!images || !Array.isArray(images) || images.length === 0) {
          return res.status(400).json({
            success: false,
            error: 'images array is required. Format: [{ path?: string, url?: string, narration: string }, ...]'
          });
        }

        // 이미지 데이터 검증 및 URL 다운로드
        const fs = await import('fs-extra');
        const path = await import('path');
        const { Config } = await import('../../../config.js');
        const appConfig = new Config();

        const processedImages: Array<{ path: string; narration: string }> = [];
        const tempDir = path.default.join(appConfig.tempDirPath, `test_video_${Date.now()}`);
        await fs.default.ensureDir(tempDir);

        for (let i = 0; i < images.length; i++) {
          const img = images[i];

          if (!img.narration || img.narration.trim().length === 0) {
            return res.status(400).json({
              success: false,
              error: `images[${i}].narration is required`
            });
          }

          // path 또는 url 중 하나는 필수
          if (!img.path && !img.url) {
            return res.status(400).json({
              success: false,
              error: `images[${i}].path or images[${i}].url is required`
            });
          }

          let imagePath = img.path;

          // URL인 경우 다운로드
          if (img.url) {
            logger.info({ url: img.url, index: i }, '📥 이미지 URL 다운로드');
            try {
              const response = await fetch(img.url);
              if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
              }
              const buffer = Buffer.from(await response.arrayBuffer());
              // Content-Type에서 확장자 추출, 또는 기본값 png
              const contentType = response.headers.get('content-type') || '';
              let ext = 'png';
              if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = 'jpg';
              else if (contentType.includes('png')) ext = 'png';
              else if (contentType.includes('webp')) ext = 'webp';
              imagePath = path.default.join(tempDir, `image_${i}.${ext}`);
              await fs.default.writeFile(imagePath, buffer);
              logger.info({ path: imagePath, contentType }, '✅ 이미지 다운로드 완료');
            } catch (err) {
              return res.status(400).json({
                success: false,
                error: `Failed to download image from URL: ${img.url} - ${err}`
              });
            }
          }

          processedImages.push({
            path: imagePath,
            narration: img.narration
          });
        }

        logger.info({
          imageCount: processedImages.length,
          narrations: processedImages.map(img => img.narration.substring(0, 30) + '...'),
          config: config || {}
        }, '🎬 Books test-video 요청');

        const videoService = getBooksVideoService();
        const result = await videoService.testImageTTSCombination(processedImages, outputPath, config);

        // 임시 파일 정리
        try {
          await fs.default.remove(tempDir);
        } catch { /* ignore */ }

        if (result.success) {
          logger.info({
            videoId: result.videoId,
            videoPath: result.videoPath,
            duration: result.duration
          }, '✅ Books test-video 완료');
        } else {
          logger.error({ error: result.error }, '❌ Books test-video 실패');
        }

        res.json(result);
      } catch (error) {
        logger.error({ error }, '❌ Failed to create test video');
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // POST /api/books/:bookId/generate-video - 책 기반 비디오 생성
    this.router.post('/:bookId/generate-video', async (req: Request, res: Response) => {
      try {
        const { bookId } = req.params;
        const {
          shortIndex = 0,       // 생성할 Short 인덱스 (분석 결과에서)
          imagePaths,           // 이미지 경로 배열 (GPT-to-NanoBanana 결과)
          config                // 비디오 설정
        } = req.body;

        // 분석 결과 캐시에서 plan 가져오기
        const matchingKeys = Array.from(this.plansCache.keys()).filter(k => k.startsWith(bookId));
        if (matchingKeys.length === 0) {
          return res.status(404).json({
            success: false,
            error: `No plan found for book: ${bookId}. Use POST /api/books/${bookId}/analyze first.`
          });
        }

        const latestKey = matchingKeys[matchingKeys.length - 1];
        const plan = this.plansCache.get(latestKey);

        if (!plan || !plan.shorts || plan.shorts.length === 0) {
          return res.status(404).json({
            success: false,
            error: `No shorts in plan for book: ${bookId}`
          });
        }

        if (shortIndex >= plan.shorts.length) {
          return res.status(400).json({
            success: false,
            error: `Invalid shortIndex: ${shortIndex}. Plan has ${plan.shorts.length} shorts.`
          });
        }

        const shortPlan = plan.shorts[shortIndex];

        // 이미지 경로 검증
        if (!imagePaths || !Array.isArray(imagePaths) || imagePaths.length !== shortPlan.scenes.length) {
          return res.status(400).json({
            success: false,
            error: `imagePaths must be an array with ${shortPlan.scenes.length} elements (matching scene count)`
          });
        }

        logger.info({
          bookId,
          shortIndex,
          sceneCount: shortPlan.scenes.length,
          imageCount: imagePaths.length
        }, '🎬 Books generate-video 요청');

        const videoService = getBooksVideoService();
        const result = await videoService.createShortVideo({
          bookId,
          shortPlan,
          imagePaths,
          config
        });

        if (result.success) {
          logger.info({
            videoId: result.videoId,
            videoPath: result.videoPath,
            duration: result.duration
          }, '✅ Books generate-video 완료');
        } else {
          logger.error({ error: result.error }, '❌ Books generate-video 실패');
        }

        res.json(result);
      } catch (error) {
        logger.error({ error }, '❌ Failed to generate video');
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // GET /api/books/:bookId/series - 시리즈 전체 조회 (Episodes + Scenes)
    this.router.get('/:bookId/series', async (req: Request, res: Response) => {
      try {
        const { bookId } = req.params;
        const neo4j = await this.getNeo4jService();
        const series = await neo4j.getDocumentSeries(bookId);

        if (!series) {
          return res.status(404).json({
            success: false,
            error: `Document not found: ${bookId}`
          });
        }

        res.json({
          success: true,
          series
        });
      } catch (error) {
        logger.error({ error }, '❌ Failed to get series');
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // GET /api/books/:bookId/episodes - Episode 목록
    this.router.get('/:bookId/episodes', async (req: Request, res: Response) => {
      try {
        const { bookId } = req.params;
        const neo4j = await this.getNeo4jService();
        const episodes = await neo4j.getDocumentEpisodes(bookId);

        res.json({
          success: true,
          bookId,
          count: episodes.length,
          episodes
        });
      } catch (error) {
        logger.error({ error }, '❌ Failed to get episodes');
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // POST /api/books/:bookId/episodes - Episode 생성 (ShortsPlan에서 자동 생성)
    this.router.post('/:bookId/episodes', async (req: Request, res: Response) => {
      try {
        const { bookId } = req.params;
        const {
          fromPlan = true,     // ShortsPlan에서 자동 생성 (기본)
          shortIndex,          // 특정 Short만 생성 (선택)
          manual               // 수동 생성 데이터 (선택)
        } = req.body;

        const neo4j = await this.getNeo4jService();

        // 마지막 Episode 번호 조회 (시리즈 연속성)
        const lastEpisodeNumber = await neo4j.getLastEpisodeNumber(bookId);
        let previousEpisodeId: string | undefined;

        if (lastEpisodeNumber > 0) {
          const episodes = await neo4j.getDocumentEpisodes(bookId);
          const lastEpisode = episodes.find(e => e.episodeNumber === lastEpisodeNumber);
          previousEpisodeId = lastEpisode?.id;
        }

        // 수동 생성 - 단일 트랜잭션 사용
        if (manual) {
          const scenesInput = (manual.scenes || []).map((s: any) => ({
            type: (s.type || 'explanation') as 'explanation',
            narration: s.narration as string,
            onScreenText: s.onScreenText as string,
            durationSec: (s.durationSec || 7) as number,
            visualType: (s.visualType || 'animation') as 'animation',
            visualDesc: (s.visualDesc || s.narration) as string,
            camera: (s.camera || 'static') as 'static',
            transition: (s.transition || 'cut') as 'cut',
            sourceChunkIds: (s.sourceChunkIds || []) as string[]
          }));

          const episodeWithScenes = await neo4j.createEpisodeWithScenes(
            {
              documentId: bookId,
              episodeNumber: lastEpisodeNumber + 1,
              title: manual.title,
              hook: manual.hook,
              cta: manual.cta || '다음 영상에서 계속!',
              ctaAction: manual.ctaAction || 'next_episode',
              keywords: manual.keywords || [],
              hashtags: manual.hashtags || [],
              previousEpisodeId
            },
            scenesInput
          );

          return res.json({
            success: true,
            message: 'Episode created manually',
            episode: episodeWithScenes
          });
        }

        // ShortsPlan에서 자동 생성
        if (fromPlan) {
          // 캐시에서 plan 찾기
          const matchingKeys = Array.from(this.plansCache.keys()).filter(k => k.startsWith(bookId));
          if (matchingKeys.length === 0) {
            return res.status(404).json({
              success: false,
              error: `No plan found for book: ${bookId}. Use POST /api/books/${bookId}/analyze first.`
            });
          }

          const latestKey = matchingKeys[matchingKeys.length - 1];
          const plan = this.plansCache.get(latestKey);

          if (!plan || !plan.shorts || plan.shorts.length === 0) {
            return res.status(404).json({
              success: false,
              error: `No shorts in plan for book: ${bookId}`
            });
          }

          // 생성할 shorts 결정
          const shortsToCreate = shortIndex !== undefined
            ? [plan.shorts[shortIndex]]
            : plan.shorts;

          const createdEpisodes = [];
          let currentPreviousId = previousEpisodeId;

          for (let i = 0; i < shortsToCreate.length; i++) {
            const short = shortsToCreate[i];
            const episodeNumber = lastEpisodeNumber + i + 1;

            // 단일 트랜잭션으로 Episode + Scenes 생성 (타이밍 이슈 해결)
            const scenesInput = short.scenes.map((scene: any) => ({
              type: (scene.sceneType || 'explanation') as 'explanation',
              narration: scene.narrationText as string,
              onScreenText: scene.narrationText.substring(0, 50) as string,
              durationSec: (scene.durationHint || 7) as number,
              visualType: 'animation' as const,
              visualDesc: scene.visualPrompt as string,
              camera: 'static' as const,
              transition: 'cut' as const,
              sourceChunkIds: (scene.sourceChunkIds || []) as string[],
              assignedFormula: scene.assignedFormula || undefined,
              formulaName: scene.formulaName || undefined,
              formulaMetaphor: scene.formulaMetaphor || undefined,
            }));

            const episodeWithScenes = await neo4j.createEpisodeWithScenes(
              {
                documentId: bookId,
                episodeNumber,
                title: short.title,
                hook: short.hook,
                cta: '다음 영상에서 계속!',
                ctaAction: 'next_episode',
                keywords: short.tags || [],
                hashtags: short.tags?.map((t: string) => `#${t}`) || [],
                previousEpisodeId: currentPreviousId
              },
              scenesInput
            );

            createdEpisodes.push(episodeWithScenes);
            currentPreviousId = episodeWithScenes.id;
          }

          // Document 상태 업데이트
          await neo4j.updateDocumentShortsStatus(bookId, 'analyzed', {
            totalShorts: lastEpisodeNumber + createdEpisodes.length
          });

          logger.info({
            bookId,
            createdCount: createdEpisodes.length,
            totalEpisodes: lastEpisodeNumber + createdEpisodes.length
          }, '✅ Episodes created from plan');

          return res.json({
            success: true,
            message: `${createdEpisodes.length} episode(s) created from plan`,
            episodes: createdEpisodes
          });
        }

        return res.status(400).json({
          success: false,
          error: 'Either fromPlan=true or manual data is required'
        });
      } catch (error) {
        logger.error({ error }, '❌ Failed to create episodes');
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // ============================================
    // 기존 라우트
    // ============================================

    // GET /api/books/download/:videoId - 비디오 다운로드
    this.router.get('/download/:videoId', async (req: Request, res: Response) => {
      try {
        const { videoId } = req.params;
        const fs = await import('fs-extra');
        const path = await import('path');
        const { Config } = await import('../../../config.js');
        const appConfig = new Config();

        // Books 비디오 경로
        const videoPath = path.default.join(appConfig.videosDirPath, 'books', `${videoId}.mp4`);

        logger.info({ videoId, videoPath }, '📥 Books video download request');

        // 1. 로컬 파일 확인
        if (await fs.default.pathExists(videoPath)) {
          logger.info({ videoId, videoPath }, '✅ 로컬 파일 다운로드');
          return res.download(videoPath, `${videoId}.mp4`, (err) => {
            if (err) {
              logger.error({ error: err }, '[BooksRouter] 다운로드 실패');
            }
          });
        }

        // 2. GCS에서 다운로드 시도
        logger.info({ videoId }, '🔍 GCS에서 비디오 검색 중');
        try {
          const gcsService = new GoogleCloudStorageService(appConfig);
          const gcsFileName = `videos/${videoId}.mp4`;

          // GCS 파일 존재 확인 및 signed URL 생성
          const signedUrl = await gcsService.generateSignedUrl(gcsFileName, {
            action: 'read',
            expires: 60 * 60 * 1000 // 1시간
          });

          if (signedUrl) {
            logger.info({ videoId, gcsFileName }, '✅ GCS에서 비디오 발견, 리다이렉트');
            return res.redirect(signedUrl);
          }
        } catch (gcsError) {
          logger.warn({ error: gcsError, videoId }, '⚠️ GCS 다운로드 실패');
        }

        // 파일 없음
        logger.warn({ videoId, videoPath }, '❌ 비디오 파일 없음 (로컬 & GCS)');
        return res.status(404).json({
          success: false,
          error: `Video not found: ${videoId}`,
          path: videoPath,
          hint: 'Video may have been deleted or not uploaded to GCS'
        });
      } catch (error) {
        logger.error({ error }, '❌ Failed to download video');
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });
  }

  /**
   * 리소스 정리
   */
  async close() {
    if (this.neo4jService) {
      await this.neo4jService.close();
      this.neo4jService = null;
    }
  }
}

// 싱글톤 라우터 생성
export function createBooksRouter(): Router {
  const booksRouter = new BooksRouter();
  return booksRouter.router;
}
