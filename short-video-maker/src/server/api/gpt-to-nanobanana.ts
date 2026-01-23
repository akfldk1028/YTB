/**
 * GPT-to-NanoBanana API Router
 * GPT로 첫 이미지 생성 (지브리 스타일) → NanoBanana로 동일성 유지 이미지 생성
 *
 * POST /api/gpt-to-nanobanana/generate
 * GET  /api/gpt-to-nanobanana/:testId
 */
import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { Config, logger } from '../../config';
import { GPTImageService } from '../../image-generation/services/GPTImageService';
import { NanoBananaService } from '../../image-generation/services/NanoBananaService';

interface GenerateRequest {
  character: {
    description: string;
  };
  scenes: Array<{ text: string }>;
  config?: {
    aspectRatio?: '9:16' | '16:9' | '1:1';
  };
}

interface ImageResult {
  scene: number;
  path: string;
  method: 'gpt' | 'nanoBanana';
  timeMs: number;
  success: boolean;
  error?: string;
}

export class GPTToNanoBananaRouter {
  public router: Router;
  private config: Config;
  private outputBaseDir: string;

  constructor(config: Config) {
    this.config = config;
    this.router = Router();
    this.outputBaseDir = path.join(config.tempDirPath, 'gpt-to-nanobanana');

    if (!fs.existsSync(this.outputBaseDir)) {
      fs.mkdirSync(this.outputBaseDir, { recursive: true });
    }

    this.setupRoutes();
  }

  private setupRoutes() {
    // POST /api/gpt-to-nanobanana/generate
    this.router.post('/generate', async (req: Request, res: Response) => {
      await this.handleGenerate(req, res);
    });

    // GET /api/gpt-to-nanobanana/:testId - 결과 이미지 확인
    this.router.get('/:testId', (req: Request, res: Response) => {
      this.handleGetResult(req, res);
    });
  }

  private async handleGenerate(req: Request, res: Response) {
    const startTime = Date.now();
    const testId = `gpt2nano_${Date.now()}`;
    const outputDir = path.join(this.outputBaseDir, testId);

    try {
      const body = req.body as GenerateRequest;

      // 입력 검증
      if (!body.character?.description) {
        return res.status(400).json({
          success: false,
          error: 'character.description is required'
        });
      }

      if (!body.scenes || body.scenes.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'At least one scene is required'
        });
      }

      // API 키 확인
      const openaiKey = this.config.openaiApiKey;
      const geminiKey = this.config.googleGeminiApiKey;

      if (!openaiKey) {
        return res.status(500).json({
          success: false,
          error: 'OPENAI_API_KEY not configured'
        });
      }

      if (!geminiKey) {
        return res.status(500).json({
          success: false,
          error: 'GOOGLE_GEMINI_API_KEY not configured (for NanoBanana)'
        });
      }

      // 출력 디렉토리 생성
      fs.mkdirSync(outputDir, { recursive: true });

      const aspectRatio = body.config?.aspectRatio || '9:16';
      const characterDesc = body.character.description;
      const scenes = body.scenes;
      const results: ImageResult[] = [];

      logger.info({
        testId,
        characterDesc: characterDesc.substring(0, 50),
        sceneCount: scenes.length,
        aspectRatio
      }, '🎨 GPT-to-NanoBanana: Starting image generation');

      // 서비스 초기화
      const gptService = new GPTImageService(openaiKey, outputDir);
      const nanoService = new NanoBananaService(geminiKey, outputDir);

      let gptImageBase64: string | null = null;

      // Scene 0: GPT로 첫 이미지 생성 (지브리 스타일)
      const scene0Start = Date.now();
      logger.info({ testId, scene: 0 }, '📍 [1/N] GPT-4o 이미지 생성 중 (지브리 스타일)...');

      const gptResult = await gptService.generateGhibliImage(
        `${characterDesc}. ${scenes[0].text}`,
        aspectRatio,
        testId,
        0
      );

      const scene0Time = Date.now() - scene0Start;

      if (gptResult.success && gptResult.images?.[0]) {
        const imagePath = path.join(outputDir, `scene_1_gpt.png`);
        fs.writeFileSync(imagePath, gptResult.images[0].data);
        gptImageBase64 = gptResult.images[0].data.toString('base64');

        results.push({
          scene: 0,
          path: imagePath,
          method: 'gpt',
          timeMs: scene0Time,
          success: true
        });

        logger.info({
          testId,
          scene: 0,
          timeMs: scene0Time,
          path: imagePath
        }, '✅ GPT 이미지 생성 완료');
      } else {
        results.push({
          scene: 0,
          path: '',
          method: 'gpt',
          timeMs: scene0Time,
          success: false,
          error: gptResult.error || 'Unknown GPT error'
        });

        logger.error({ testId, error: gptResult.error }, '❌ GPT 이미지 생성 실패');

        return res.status(500).json({
          success: false,
          error: `GPT image generation failed: ${gptResult.error}`,
          testId,
          outputDir,
          results,
          totalTimeMs: Date.now() - startTime
        });
      }

      // Scene 1~N: NanoBanana로 생성 (GPT 이미지 레퍼런스)
      for (let i = 1; i < scenes.length; i++) {
        const sceneStart = Date.now();
        logger.info({ testId, scene: i }, `📍 [${i + 1}/${scenes.length}] NanoBanana 이미지 생성 중...`);

        // GPT 이미지를 레퍼런스로 변환
        const referenceImages = gptImageBase64 ? [{
          data: Buffer.from(gptImageBase64, 'base64'),
          mimeType: 'image/png'
        }] : undefined;

        const nanoResult = await nanoService.generateImages(
          {
            prompt: `${characterDesc}. ${scenes[i].text}`,
            aspectRatio,
            numberOfImages: 1,
            referenceImages
          },
          testId,
          i
        );

        const sceneTime = Date.now() - sceneStart;

        if (nanoResult.success && nanoResult.images?.[0]) {
          const imagePath = path.join(outputDir, `scene_${i + 1}_nano.png`);
          fs.writeFileSync(imagePath, nanoResult.images[0].data);

          results.push({
            scene: i,
            path: imagePath,
            method: 'nanoBanana',
            timeMs: sceneTime,
            success: true
          });

          logger.info({
            testId,
            scene: i,
            timeMs: sceneTime
          }, '✅ NanoBanana 이미지 생성 완료');
        } else {
          results.push({
            scene: i,
            path: '',
            method: 'nanoBanana',
            timeMs: sceneTime,
            success: false,
            error: nanoResult.error || 'Unknown NanoBanana error'
          });

          logger.error({
            testId,
            scene: i,
            error: nanoResult.error
          }, '❌ NanoBanana 이미지 생성 실패');
        }
      }

      const totalTime = Date.now() - startTime;
      const successCount = results.filter(r => r.success).length;

      logger.info({
        testId,
        totalTimeMs: totalTime,
        successCount,
        totalScenes: scenes.length
      }, '🎉 GPT-to-NanoBanana 완료');

      return res.json({
        success: successCount === scenes.length,
        testId,
        outputDir,
        images: results,
        summary: {
          total: scenes.length,
          success: successCount,
          failed: scenes.length - successCount
        },
        totalTimeMs: totalTime
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ testId, error: errorMessage }, '❌ GPT-to-NanoBanana 실패');

      return res.status(500).json({
        success: false,
        error: errorMessage,
        testId,
        totalTimeMs: Date.now() - startTime
      });
    }
  }

  private handleGetResult(req: Request, res: Response) {
    const { testId } = req.params;
    const testDir = path.join(this.outputBaseDir, testId);

    if (!fs.existsSync(testDir)) {
      return res.status(404).json({
        success: false,
        error: `Result not found: ${testId}`
      });
    }

    const files = fs.readdirSync(testDir).filter(f => f.endsWith('.png'));
    const images = files.map(f => ({
      filename: f,
      path: path.join(testDir, f)
    }));

    return res.json({
      success: true,
      testId,
      outputDir: testDir,
      images
    });
  }
}
