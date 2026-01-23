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
import { ContentPlannerService, createContentPlannerService, ShortsPlan } from '../services/ContentPlannerService';
import { getBooksVideoService } from '../services/BooksVideoService';
import { GhibliImageService } from '../services/GhibliImageService';
import { logger, Config } from '../../../config';

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

  private getContentPlannerService(): ContentPlannerService {
    if (!this.contentPlannerService) {
      this.contentPlannerService = createContentPlannerService();
    }
    return this.contentPlannerService;
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
    this.router.post('/episodes/:episodeId/generate-video', async (req: Request, res: Response) => {
      try {
        const { episodeId } = req.params;
        const {
          config = {}  // 설정 옵션 (orientation, ttsVoice, subtitleYPosition 등)
        } = req.body;

        const neo4j = await this.getNeo4jService();

        // 1. Episode + Scenes 조회
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
          title: episode.title,
          sceneCount: episode.scenes.length,
          status: episode.status
        }, '🎬 Episode 비디오 생성 시작');

        // 2. Episode 상태를 'producing'으로 업데이트
        await neo4j.updateEpisodeStatus(episodeId, 'producing');

        // 3. GhibliImageService로 Scene 이미지 생성
        const appConfig = new Config();
        const ghibliService = new GhibliImageService(
          appConfig.googleGeminiApiKey || '',
          appConfig.openaiApiKey || '',
          appConfig.tempDirPath
        );

        const fs = await import('fs-extra');
        const path = await import('path');
        const tempDir = path.default.join(appConfig.tempDirPath, `episode_${episodeId}`);
        await fs.default.ensureDir(tempDir);

        const imagePaths: string[] = [];

        logger.info({ sceneCount: episode.scenes.length }, '🖼️ Scene 이미지 생성 시작');

        for (let i = 0; i < episode.scenes.length; i++) {
          const scene = episode.scenes[i];
          const visualPrompt = scene.visualDesc || scene.narration || `Scene ${i + 1}`;

          logger.info({
            sceneIndex: i,
            sceneId: scene.id,
            visualPrompt: visualPrompt.substring(0, 50)
          }, `🎨 Scene ${i + 1}/${episode.scenes.length} 이미지 생성 중`);

          const imageResult = await ghibliService.generateSceneImage(
            visualPrompt,
            i,
            (config.orientation === 'landscape' ? '16:9' : '9:16'),
            {
              mood: config.mood || 'whimsical',
              timeOfDay: config.timeOfDay || 'day',
              characterDescription: config.characterDescription
            },
            episodeId
          );

          if (imageResult.success && imageResult.imageBuffer) {
            const imagePath = path.default.join(tempDir, `scene_${i}.png`);
            await fs.default.writeFile(imagePath, imageResult.imageBuffer);
            imagePaths.push(imagePath);

            // Scene 에셋 업데이트
            await neo4j.updateSceneAssets(scene.id, { imagePath: imagePath });

            logger.info({
              sceneIndex: i,
              generator: imageResult.generator,
              imageSize: imageResult.imageBuffer.length
            }, `✅ Scene ${i + 1} 이미지 생성 완료`);
          } else {
            logger.error({
              sceneIndex: i,
              error: imageResult.error
            }, `❌ Scene ${i + 1} 이미지 생성 실패`);

            // 이미지 생성 실패 시 상태 롤백
            await neo4j.updateEpisodeStatus(episodeId, 'approved');
            await fs.default.remove(tempDir);

            return res.status(500).json({
              success: false,
              error: `Failed to generate image for scene ${i + 1}: ${imageResult.error}`
            });
          }
        }

        // 첫 이미지를 masterImage로 저장
        const masterImagePath = imagePaths[0];
        await neo4j.updateEpisodeStatus(episodeId, 'producing', { masterImagePath });

        // 4. BooksVideoService로 비디오 생성
        logger.info({ imageCount: imagePaths.length }, '📹 비디오 생성 시작');

        const videoService = getBooksVideoService();

        // Scene type 변환 함수 (Episode Scene type → ShortPlan scene type)
        const mapSceneType = (type: string): 'hook' | 'intro' | 'problem' | 'solution' | 'explanation' | 'example' | 'data' | 'comparison' | 'conclusion' | 'cta' => {
          const validTypes = ['hook', 'intro', 'problem', 'solution', 'explanation', 'example', 'data', 'comparison', 'conclusion', 'cta'] as const;
          if (validTypes.includes(type as any)) {
            return type as typeof validTypes[number];
          }
          // 매핑: climax → conclusion, 기타 → explanation
          if (type === 'climax') return 'conclusion';
          return 'explanation';
        };

        // Episode를 ShortPlan 형태로 변환
        const shortPlan = {
          shortIndex: episode.episodeNumber - 1,
          title: episode.title,
          hook: episode.hook || '',
          theme: 'book',
          scenes: episode.scenes.map((s, i) => ({
            sceneIndex: i,
            sceneType: mapSceneType(s.type),
            narrationText: s.narration || '',
            visualPrompt: s.visualDesc || '',
            durationHint: s.durationSec || 7,
            sourceChunkIds: s.sourceChunkIds || []
          })),
          totalDuration: episode.scenes.reduce((sum, s) => sum + (s.durationSec || 7), 0),
          tags: episode.hashtags || []
        };

        const videoResult = await videoService.createShortVideo({
          bookId: episode.documentId,
          shortPlan,
          imagePaths,
          config: {
            orientation: config.orientation || 'portrait',
            ttsVoice: config.ttsVoice,
            ttsGender: config.ttsGender,
            subtitleYPosition: config.subtitleYPosition || 'h*0.75'
          }
        });

        // 임시 이미지 폴더 정리
        await fs.default.remove(tempDir);

        if (videoResult.success) {
          // 5. Episode 상태를 'completed'로 업데이트
          await neo4j.updateEpisodeStatus(episodeId, 'completed', {
            videoPath: videoResult.videoPath
          });

          logger.info({
            episodeId,
            videoId: videoResult.videoId,
            videoPath: videoResult.videoPath,
            duration: videoResult.duration
          }, '✅ Episode 비디오 생성 완료');

          return res.json({
            success: true,
            episodeId,
            videoId: videoResult.videoId,
            videoPath: videoResult.videoPath,
            duration: videoResult.duration,
            details: videoResult.details,
            message: 'Episode video generated successfully'
          });
        } else {
          // 비디오 생성 실패
          await neo4j.updateEpisodeStatus(episodeId, 'approved');

          return res.status(500).json({
            success: false,
            error: `Video generation failed: ${videoResult.error}`
          });
        }
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

        for (let i = 0; i < episode.scenes.length; i++) {
          const scene = episode.scenes[i];
          const visualPrompt = scene.visualDesc || scene.narration || `Scene ${i + 1}`;

          const imageResult = await ghibliService.generateSceneImage(
            visualPrompt,
            i,
            (config.orientation === 'landscape' ? '16:9' : '9:16'),
            {
              mood: config.mood || 'whimsical',
              timeOfDay: config.timeOfDay || 'day',
              characterDescription: config.characterDescription
            },
            episodeId
          );

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

    // POST /api/books/:bookId/analyze - AI 분석 → Shorts 계획 생성
    this.router.post('/:bookId/analyze', async (req: Request, res: Response) => {
      try {
        const { bookId } = req.params;
        const {
          characterDescription,  // 캐릭터 설명 (선택)
          style = 'ghibli',      // 스타일 (ghibli, anime, realistic 등)
          maxShorts = 5,         // 최대 Shorts 수
          maxScenes = 6,         // Short당 최대 Scene 수
          forceRefresh = false   // 캐시 무시하고 재분석
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
        const planner = this.getContentPlannerService();

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
          maxScenes
        }, '🔍 Starting AI analysis');

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

        // 수동 생성
        if (manual) {
          const episode = await neo4j.createEpisode({
            documentId: bookId,
            episodeNumber: lastEpisodeNumber + 1,
            title: manual.title,
            hook: manual.hook,
            cta: manual.cta || '다음 영상에서 계속!',
            ctaAction: manual.ctaAction || 'next_episode',
            keywords: manual.keywords || [],
            hashtags: manual.hashtags || [],
            previousEpisodeId
          });

          // Scenes 생성
          if (manual.scenes && Array.isArray(manual.scenes)) {
            for (let i = 0; i < manual.scenes.length; i++) {
              const s = manual.scenes[i];
              await neo4j.createScene({
                episodeId: episode.id,
                sceneNumber: i + 1,
                type: s.type || 'explanation',
                narration: s.narration,
                onScreenText: s.onScreenText,
                durationSec: s.durationSec || 7,
                visualType: s.visualType || 'animation',
                visualDesc: s.visualDesc || s.narration,
                camera: s.camera || 'static',
                transition: s.transition || 'cut',
                sourceChunkIds: s.sourceChunkIds || []
              });
            }
          }

          const episodeWithScenes = await neo4j.getEpisodeWithScenes(episode.id);
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

            // Episode 생성
            const episode = await neo4j.createEpisode({
              documentId: bookId,
              episodeNumber,
              title: short.title,
              hook: short.hook,
              cta: '다음 영상에서 계속!',
              ctaAction: 'next_episode',
              keywords: short.tags || [],
              hashtags: short.tags?.map((t: string) => `#${t}`) || [],
              previousEpisodeId: currentPreviousId
            });

            // Scenes 생성
            for (let j = 0; j < short.scenes.length; j++) {
              const scene = short.scenes[j];
              await neo4j.createScene({
                episodeId: episode.id,
                sceneNumber: j + 1,
                type: scene.sceneType || 'explanation',
                narration: scene.narrationText,
                onScreenText: scene.narrationText.substring(0, 50),
                durationSec: scene.durationHint || 7,
                visualType: 'animation',
                visualDesc: scene.visualPrompt,
                camera: 'static',
                transition: 'cut',
                sourceChunkIds: scene.sourceChunkIds || []
              });
            }

            const episodeWithScenes = await neo4j.getEpisodeWithScenes(episode.id);
            createdEpisodes.push(episodeWithScenes);
            currentPreviousId = episode.id;
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

        // 로컬 파일 확인
        if (await fs.default.pathExists(videoPath)) {
          logger.info({ videoId, videoPath }, '✅ 로컬 파일 다운로드');
          return res.download(videoPath, `${videoId}.mp4`, (err) => {
            if (err) {
              logger.error({ error: err }, '[BooksRouter] 다운로드 실패');
            }
          });
        }

        // 파일 없음
        logger.warn({ videoId, videoPath }, '❌ 비디오 파일 없음');
        return res.status(404).json({
          success: false,
          error: `Video not found: ${videoId}`,
          path: videoPath
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
