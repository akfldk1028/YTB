/**
 * ManimVideoProvider
 * Manim Community Edition Python → MP4 렌더링 브릿지
 *
 * Input:  ManimAnimationRequest (배경이미지 + 수식 + 씬타입 + 올빼미 모드)
 * Output: VideoAnimationResult (MP4 파일 경로, 비용 $0)
 *
 * n8n 노드 패턴:
 * - 단일 책임: Python manim 프로세스 실행 + 결과 수집
 * - 교체 가능: GrokVideoProvider와 동일한 인터페이스 (VideoAnimationResult)
 * - 외부 의존: Python 3.10+, manim CE (pip install manim)
 *
 * 동작 흐름:
 * 1. ManimAnimationRequest → JSON config 생성
 * 2. 환경변수 MANIM_SCENE_CONFIG에 JSON 주입
 * 3. `manim render formula_scene.py DynamicScene -ql` 실행
 * 4. 렌더링 완료 대기 (타임아웃 120초)
 * 5. 출력 MP4 경로 반환
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs-extra';
import { logger } from '../../config';
import { BaseVideoProvider } from './BaseVideoProvider';
import { VideoAnimationProvider } from '../types';
import type { VideoAnimationRequest, VideoAnimationResult, ManimAnimationRequest } from '../types';

/** Manim 렌더링 품질 프리셋 */
type ManimQuality = 'l' | 'm' | 'h' | 'p';

const MANIM_TIMEOUT_MS = 120_000;  // 2분

/**
 * Manim 파일 경로 해결
 * dist/ (컴파일 후) 또는 src/ (개발) 양쪽 지원
 * Docker에서는 COPY로 dist/YTB-video-animation/manim/ 에 배치
 */
function resolveManimDir(): string {
  // 1. dist/ 기준 (프로덕션, Docker)
  const distDir = path.join(__dirname, '..', 'manim');
  if (fs.pathExistsSync(path.join(distDir, 'scenes', 'formula_scene.py'))) {
    return distDir;
  }
  // 2. src/ 기준 (로컬 개발 — __dirname이 dist/YTB-video-animation/providers)
  const srcDir = path.resolve(__dirname, '..', '..', '..', 'src', 'YTB-video-animation', 'manim');
  if (fs.pathExistsSync(path.join(srcDir, 'scenes', 'formula_scene.py'))) {
    return srcDir;
  }
  // 3. 패키지 루트 기준 fallback
  const packageDir = path.resolve(__dirname, '..', '..', '..', '..', 'src', 'YTB-video-animation', 'manim');
  return packageDir;
}

const MANIM_DIR = resolveManimDir();
const MANIM_SCENE_FILE = path.join(MANIM_DIR, 'scenes', 'formula_scene.py');

/**
 * Manim 실행 바이너리 자동 탐지
 * 순서: 환경변수 MANIM_PATH → 프로젝트 .venv-manim → 시스템 PATH
 */
function resolveManimBinary(): string {
  // 1. 환경변수 MANIM_PATH 명시 지정
  if (process.env.MANIM_PATH && fs.pathExistsSync(process.env.MANIM_PATH)) {
    return process.env.MANIM_PATH;
  }

  // 2. 프로젝트 루트의 .venv-manim (로컬 개발)
  const projectRoot = path.resolve(__dirname, '..', '..', '..');
  const candidates = [
    // 로컬 개발 (dist → src 역추적)
    path.resolve(projectRoot, '..', '.venv-manim', 'Scripts', 'manim.exe'),  // Windows
    path.resolve(projectRoot, '..', '.venv-manim', 'bin', 'manim'),          // Linux/Mac
    // Docker (프로젝트 루트에 venv)
    path.join(projectRoot, '.venv-manim', 'Scripts', 'manim.exe'),
    path.join(projectRoot, '.venv-manim', 'bin', 'manim'),
  ];

  for (const candidate of candidates) {
    if (fs.pathExistsSync(candidate)) {
      return candidate;
    }
  }

  // 3. 시스템 PATH fallback
  return 'manim';
}

export class ManimVideoProvider extends BaseVideoProvider {
  private tempDirPath: string;
  private quality: ManimQuality;
  private available: boolean = false;
  private manimBin: string;

  constructor(tempDirPath: string, quality: ManimQuality = 'l') {
    super('');  // API key 불필요 (로컬 렌더링)
    this.tempDirPath = tempDirPath;
    this.quality = quality;
    this.manimBin = resolveManimBinary();
  }

  /**
   * Manim 설치 확인
   * `manim --version` 실행하여 설치 여부 판단
   */
  async checkAvailability(): Promise<boolean> {
    try {
      const result = await this._execCommand(this.manimBin, ['--version'], 15_000);
      // stderr에도 버전이 출력될 수 있음 (pydub warning 등)
      const output = (result.stdout + result.stderr).trim();
      this.available = result.exitCode === 0;
      if (this.available) {
        logger.info({ version: output.split('\n').pop(), manimBin: this.manimBin }, '[Manim] manim available');
      }
      return this.available;
    } catch {
      logger.debug({ manimBin: this.manimBin }, '[Manim] manim not found');
      this.available = false;
      return false;
    }
  }

  /**
   * 외부 커맨드 실행 (manim, python3 등)
   */
  private async _execCommand(
    cmd: string,
    args: string[],
    timeout: number,
    extraEnv?: Record<string, string>
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const proc = spawn(cmd, args, {
        timeout,
        env: { ...process.env, ...extraEnv },
        shell: true,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => { stdout += data.toString(); });
      proc.stderr?.on('data', (data) => { stderr += data.toString(); });

      proc.on('close', (code) => {
        resolve({ exitCode: code ?? 1, stdout, stderr });
      });

      proc.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * 비디오 생성 (BaseVideoProvider 인터페이스)
   *
   * 일반 VideoAnimationRequest도 받을 수 있지만,
   * ManimAnimationRequest로 캐스팅하여 추가 필드 활용
   */
  async generateVideo(request: VideoAnimationRequest): Promise<VideoAnimationResult> {
    if (!this.available) {
      return {
        success: false,
        provider: VideoAnimationProvider.MANIM,
        error: 'Manim not available (not installed or check failed)',
      };
    }

    const manimRequest = request as ManimAnimationRequest;
    return this.generateManimVideo(manimRequest);
  }

  /**
   * Manim 전용 비디오 생성
   *
   * Input: ManimAnimationRequest
   * Output: VideoAnimationResult (videoPath = 렌더링된 MP4)
   */
  async generateManimVideo(request: ManimAnimationRequest): Promise<VideoAnimationResult> {
    if (!this.available) {
      return {
        success: false,
        provider: VideoAnimationProvider.MANIM,
        error: 'Manim not available',
      };
    }

    const startTime = Date.now();
    const outputDir = path.join(this.tempDirPath, `manim_${Date.now()}`);
    await fs.ensureDir(outputDir);

    try {
      // 1. 씬 config JSON 생성
      const sceneConfig = {
        bg_path: request.backgroundImagePath || request.imagePath,
        latex: request.latex || '',
        duration: request.duration,
        owl_mode: request.owlMode || this._inferOwlMode(request.sceneType),
        scene_type: request.sceneType || 'explanation',
        aspect_ratio: request.aspectRatio || '9:16',
        variable_colors: request.variableColors || {},
        formula_png_path: request.formulaPngPath || '',
      };

      // 2. 해상도 결정 (9:16 portrait / 16:9 landscape)
      const isPortrait = sceneConfig.aspect_ratio === '9:16';
      const resolution = isPortrait ? '1280,720' : '720,1280';

      // 3. manim render 실행
      const args = [
        'render',
        MANIM_SCENE_FILE,
        'DynamicScene',
        `-q${this.quality}`,
        '-r', resolution,
        '--media_dir', outputDir,
        '--format', 'mp4',
        '--disable_caching',
      ];

      logger.info({
        sceneType: sceneConfig.scene_type,
        owlMode: sceneConfig.owl_mode,
        hasLatex: !!sceneConfig.latex,
        duration: sceneConfig.duration,
        quality: this.quality,
      }, '[Manim] Rendering scene');

      const result = await this._execCommand(this.manimBin, args, MANIM_TIMEOUT_MS, {
        MANIM_SCENE_CONFIG: JSON.stringify(sceneConfig),
      });

      if (result.exitCode !== 0) {
        logger.warn({
          exitCode: result.exitCode,
          stderr: result.stderr.substring(0, 500),
        }, '[Manim] Render failed');
        return {
          success: false,
          provider: VideoAnimationProvider.MANIM,
          error: `Manim render failed (exit ${result.exitCode}): ${result.stderr.substring(0, 200)}`,
        };
      }

      // 3. 출력 MP4 찾기 (manim은 media/videos/ 하위에 저장)
      const mp4Path = await this._findOutputMp4(outputDir);
      if (!mp4Path) {
        return {
          success: false,
          provider: VideoAnimationProvider.MANIM,
          error: 'Manim render completed but no MP4 found',
        };
      }

      // 4. 최종 경로로 이동
      const finalPath = path.join(this.tempDirPath, `manim_owl_${Date.now()}.mp4`);
      await fs.move(mp4Path, finalPath, { overwrite: true });

      // 렌더링 디렉토리 정리
      await fs.remove(outputDir).catch(() => {});

      const elapsedMs = Date.now() - startTime;

      logger.info({
        outputPath: finalPath,
        elapsedMs,
        duration: request.duration,
      }, '[Manim] Scene rendered successfully');

      return {
        success: true,
        videoPath: finalPath,
        provider: VideoAnimationProvider.MANIM,
        durationSeconds: request.duration,
        costEstimate: 0,  // Manim은 무료 (오픈소스)
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, '[Manim] Unexpected error');

      // 정리
      await fs.remove(outputDir).catch(() => {});

      return {
        success: false,
        provider: VideoAnimationProvider.MANIM,
        error: errorMessage,
      };
    }
  }

  /**
   * Manim 출력 디렉토리에서 MP4 파일 찾기
   * manim은 media/videos/{scene_name}/{quality}/ 에 저장
   */
  private async _findOutputMp4(mediaDir: string): Promise<string | null> {
    const findMp4 = async (dir: string): Promise<string | null> => {
      if (!await fs.pathExists(dir)) return null;

      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isFile() && entry.name.endsWith('.mp4')) {
          return fullPath;
        }
        if (entry.isDirectory()) {
          const found = await findMp4(fullPath);
          if (found) return found;
        }
      }
      return null;
    };

    return findMp4(mediaDir);
  }

  /**
   * 씬 타입에서 올빼미 모드 자동 추론
   */
  private _inferOwlMode(sceneType: string): string {
    switch (sceneType) {
      case 'hook':
      case 'intro':
        return 'surprised';
      case 'explanation':
      case 'example':
      case 'data':
      case 'comparison':
        return 'neutral';
      case 'conclusion':
      case 'cta':
        return 'happy';
      default:
        // formula 등 수식 씬
        return 'thinking';
    }
  }

  isAvailable(): boolean {
    return this.available;
  }
}
