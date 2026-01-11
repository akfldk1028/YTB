/**
 * Whisper STT Provider
 *
 * Whisper.cpp를 사용한 음성 인식 (Speech-to-Text)
 * ISTTProvider 인터페이스 구현
 */

import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import {
  downloadWhisperModel,
  installWhisperCpp,
} from "@remotion/install-whisper-cpp";
import { ISTTProvider, STTOptions, STTResult, STTSegment } from '../../interfaces';

export interface WhisperConfig {
  /** whisper.cpp 설치 경로 */
  installPath: string;
  /** 모델 이름 (base, small, medium, large) */
  model?: string;
  /** whisper.cpp 버전 */
  version?: string;
  /** 상세 출력 */
  verbose?: boolean;
}

export class WhisperSTT implements ISTTProvider {
  readonly name = 'whisper';
  private installPath: string;
  private model: string;

  constructor(options: WhisperConfig) {
    this.installPath = options.installPath;
    this.model = options.model || 'base';
  }

  /**
   * 사용 가능 여부 확인
   */
  async isAvailable(): Promise<boolean> {
    const executablePath = path.join(this.installPath, 'main');
    const modelPath = path.join(this.installPath, 'models', `ggml-${this.model}.bin`);

    return fs.existsSync(executablePath) && fs.existsSync(modelPath);
  }

  /**
   * 지원하는 언어 목록
   */
  getSupportedLanguages(): string[] {
    return ['auto', 'ko', 'en', 'ja', 'zh', 'es', 'fr', 'de', 'it', 'pt', 'ru'];
  }

  /**
   * 오디오 파일을 텍스트로 변환
   */
  async transcribe(audioPath: string, options?: STTOptions): Promise<STTResult> {
    const startTime = Date.now();

    console.log(`[WhisperSTT] Transcribing: ${audioPath}`);

    const executablePath = path.join(this.installPath, 'main');
    const modelPath = path.join(this.installPath, 'models', `ggml-${options?.model || this.model}.bin`);
    const outputJsonPath = audioPath.replace(/\.[^.]+$/, '_whisper_output.json');

    try {
      // whisper 명령 인자
      const args = [
        '-m', modelPath,
        '-l', options?.language || 'auto',
        '-oj',  // JSON 출력
        '-of', outputJsonPath.replace('.json', ''),
        audioPath,
      ];

      // 단어별 타임스탬프 옵션
      if (options?.wordTimestamps) {
        args.push('--max-len', '1');
      }

      console.log(`[WhisperSTT] Executing: ${executablePath} ${args.join(' ')}`);

      // whisper.cpp 실행
      await this.runWhisperAsync(executablePath, args, options?.maxDuration ? options.maxDuration * 1000 : 300000);

      // JSON 결과 파일 읽기
      if (!fs.existsSync(outputJsonPath)) {
        throw new Error(`Whisper output file not found: ${outputJsonPath}`);
      }

      const whisperResult = JSON.parse(fs.readFileSync(outputJsonPath, 'utf8'));

      // 결과 변환
      const segments: STTSegment[] = [];
      let fullText = '';

      if (whisperResult.transcription) {
        for (const segment of whisperResult.transcription) {
          if (segment.text && segment.text.trim() !== '') {
            const text = segment.text.trim();
            fullText += text + ' ';

            // 단어별 분리
            if (options?.wordTimestamps) {
              const words = text.split(/\s+/);
              const segmentDuration = segment.offsets.to - segment.offsets.from;
              const wordDuration = segmentDuration / words.length;

              const segmentWords = words.map((word: string, index: number) => ({
                word,
                start: (segment.offsets.from + index * wordDuration) / 1000,
                end: (segment.offsets.from + (index + 1) * wordDuration) / 1000,
              }));

              segments.push({
                text,
                start: segment.offsets.from / 1000,
                end: segment.offsets.to / 1000,
                words: segmentWords,
              });
            } else {
              segments.push({
                text,
                start: segment.offsets.from / 1000,
                end: segment.offsets.to / 1000,
              });
            }
          }
        }
      }

      // 출력 파일 정리
      try {
        fs.unlinkSync(outputJsonPath);
      } catch {
        // 정리 실패 무시
      }

      // 오디오 길이 계산
      const duration = segments.length > 0 ? segments[segments.length - 1].end : 0;

      console.log(`[WhisperSTT] Transcribed ${segments.length} segments (${duration.toFixed(1)}s)`);

      return {
        text: fullText.trim(),
        segments,
        language: options?.language || 'auto',
        duration,
      };
    } catch (error) {
      console.error('[WhisperSTT] Transcription failed:', error);
      throw new Error(`Whisper transcription failed: ${error}`);
    }
  }

  /**
   * 비동기 whisper 실행
   */
  private runWhisperAsync(executable: string, args: string[], timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let killed = false;

      const process = spawn(executable, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const timer = setTimeout(() => {
        killed = true;
        process.kill('SIGKILL');
        reject(new Error(`Whisper process timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      process.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        clearTimeout(timer);
        if (killed) return;

        if (code === 0) {
          resolve(stdout);
        } else {
          console.error('[WhisperSTT] Process failed:', { code, stderr, stdout });
          reject(new Error(`Whisper process exited with code ${code}: ${stderr}`));
        }
      });

      process.on('error', (error) => {
        clearTimeout(timer);
        console.error('[WhisperSTT] Spawn error:', error);
        reject(new Error(`Failed to spawn whisper process: ${error.message}`));
      });
    });
  }
}

// ============================================================================
// Backward Compatibility Methods
// ============================================================================
// 기존 Whisper 클래스와의 호환성을 위한 메서드들

/**
 * Caption 타입 (기존 호환용)
 */
export interface Caption {
  text: string;
  startMs: number;
  endMs: number;
}

/**
 * 기존 Config 인터페이스 (호환용)
 */
interface LegacyConfig {
  whisperInstallPath: string;
  whisperModel?: string;
  whisperVersion?: string;
  whisperVerbose?: boolean;
  runningInDocker?: boolean;
}

/** Whisper 모델 타입 (remotion 호환) */
type WhisperModel = "medium" | "tiny" | "tiny.en" | "base" | "base.en" | "small" | "small.en" | "medium.en" | "large-v1" | "large-v2" | "large-v3" | "large-v3-turbo";

/**
 * 정적 팩토리 메서드 (기존 Whisper.init() 호환)
 * @param config - 기존 Config 객체
 * @returns WhisperSTT 인스턴스
 */
WhisperSTT.init = async function(config: LegacyConfig): Promise<WhisperSTT> {
  // Docker 환경이 아니면 whisper.cpp 설치 및 모델 다운로드 필요
  if (!config.runningInDocker) {
    const version = config.whisperVersion || '1.5.4';
    const model = (config.whisperModel || 'base') as WhisperModel;

    console.log("[WhisperSTT] Installing WhisperCpp...");
    await installWhisperCpp({
      to: config.whisperInstallPath,
      version: version,
      printOutput: true,
    });
    console.log("[WhisperSTT] WhisperCpp installed");

    console.log("[WhisperSTT] Downloading Whisper model...");
    await downloadWhisperModel({
      model: model,
      folder: path.join(config.whisperInstallPath, "models"),
      printOutput: config.whisperVerbose,
      onProgress: (downloadedBytes, totalBytes) => {
        const progress = `${Math.round((downloadedBytes / totalBytes) * 100)}%`;
        console.log(`[WhisperSTT] Downloading model: ${progress}`);
      },
    });
    console.log("[WhisperSTT] Whisper model downloaded");
  }

  return new WhisperSTT({
    installPath: config.whisperInstallPath,
    model: config.whisperModel,
    version: config.whisperVersion,
    verbose: config.whisperVerbose,
  });
};

/**
 * 기존 Whisper.CreateCaption() 호환 메서드
 * @param audioPath - 오디오 파일 경로
 * @returns Caption[] 형태의 캡션 배열
 */
WhisperSTT.prototype.CreateCaption = async function(audioPath: string): Promise<Caption[]> {
  // 새 인터페이스로 transcribe 호출
  const result = await this.transcribe(audioPath, {
    language: 'auto',
    wordTimestamps: true,
  });

  // STTResult를 Caption[] 형태로 변환
  const captions: Caption[] = [];

  for (const segment of result.segments) {
    if (segment.words && segment.words.length > 0) {
      // 단어별 캡션
      for (const word of segment.words) {
        captions.push({
          text: word.word,
          startMs: Math.round(word.start * 1000),
          endMs: Math.round(word.end * 1000),
        });
      }
    } else {
      // 세그먼트 단위로 단어 분할
      const words = segment.text.split(/\s+/);
      const segmentDuration = (segment.end - segment.start) * 1000;
      const wordDuration = segmentDuration / words.length;

      words.forEach((word, index) => {
        const startMs = segment.start * 1000 + index * wordDuration;
        const endMs = segment.start * 1000 + (index + 1) * wordDuration;

        captions.push({
          text: word,
          startMs: Math.round(startMs),
          endMs: Math.round(endMs),
        });
      });
    }
  }

  return captions;
};

// 정적 메서드 타입 선언
declare module './WhisperSTT' {
  namespace WhisperSTT {
    function init(config: LegacyConfig): Promise<WhisperSTT>;
  }
  interface WhisperSTT {
    CreateCaption(audioPath: string): Promise<Caption[]>;
  }
}

export default WhisperSTT;
