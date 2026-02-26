/**
 * GeminiVideoAnalyzerService (Node 2)
 * MP4 영상 → StyleDNA 분석 (Gemini File API + gemini-2.0-flash)
 *
 * Input:  GeminiVideoAnalysisRequest { videoPath, contentType? }
 * Output: GeminiVideoAnalysisResult { success, styleDNA?, rawAnalysis?, error? }
 *
 * 흐름:
 *   1. fileManager.uploadFile() → fileUri
 *   2. Poll until ACTIVE
 *   3. model.generateContent(fileData + analysis prompt)
 *   4. JSON 파싱 → StyleDNA
 *   5. fileManager.deleteFile() 클린업
 */

import { GoogleGenAI } from '@google/genai';
import fs from 'fs-extra';
import { logger } from '../../config';
import { VIDEO_STYLE_ANALYSIS_PROMPT, VIDEO_FULL_ANALYSIS_PROMPT } from '../utils/PromptTemplates';
import type {
  GeminiVideoAnalysisRequest,
  GeminiVideoAnalysisResult,
  FullVideoAnalysisResult,
  ContentExtractionRequest,
  StyleDNA,
  ContentDNA,
} from '../types';

const MODEL = 'gemini-2.0-flash';
const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 120_000; // 2분
const ANALYSIS_COST_ESTIMATE = 0.08; // 추정

export class GeminiVideoAnalyzerService {
  private ai: GoogleGenAI;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async analyze(request: GeminiVideoAnalysisRequest): Promise<GeminiVideoAnalysisResult> {
    // 파일 존재 확인
    if (!await fs.pathExists(request.videoPath)) {
      return { success: false, error: `Video file not found: ${request.videoPath}` };
    }

    let uploadedFileName: string | undefined;

    try {
      // 1. 파일 업로드
      logger.info({ videoPath: request.videoPath }, '[VideoAnalyzer] Uploading video to Gemini File API');

      const uploadResult = await this.ai.files.upload({
        file: request.videoPath,
        config: { mimeType: 'video/mp4' },
      });

      uploadedFileName = uploadResult.name;

      if (!uploadResult.uri) {
        return { success: false, error: 'File upload returned no URI' };
      }

      logger.info({ fileName: uploadedFileName, uri: uploadResult.uri }, '[VideoAnalyzer] File uploaded');

      // 2. ACTIVE 상태 대기
      let fileState = uploadResult.state;
      const pollStart = Date.now();

      while (fileState === 'PROCESSING') {
        if (Date.now() - pollStart > POLL_TIMEOUT_MS) {
          throw new Error('File processing timeout');
        }
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

        const fileInfo = await this.ai.files.get({ name: uploadedFileName! });
        fileState = fileInfo.state;
        logger.debug({ state: fileState, elapsed: Math.round((Date.now() - pollStart) / 1000) }, '[VideoAnalyzer] Polling file state');
      }

      if (fileState !== 'ACTIVE') {
        return { success: false, error: `File processing failed, state: ${fileState}` };
      }

      // 3. 분석 요청
      logger.info({ model: MODEL }, '[VideoAnalyzer] Requesting style analysis');

      const response = await this.ai.models.generateContent({
        model: MODEL,
        contents: [
          {
            role: 'user',
            parts: [
              { fileData: { fileUri: uploadResult.uri, mimeType: 'video/mp4' } },
              { text: VIDEO_STYLE_ANALYSIS_PROMPT },
            ],
          },
        ],
      });

      const rawText = response.text || '';

      // 4. JSON 파싱
      const styleDNA = this.parseStyleDNA(rawText);

      if (!styleDNA) {
        return {
          success: false,
          rawAnalysis: rawText,
          error: 'Failed to parse StyleDNA from Gemini response',
        };
      }

      logger.info({
        colorPalette: styleDNA.visualStyle.colorPalette,
        pace: styleDNA.motionProfile.pace,
        narratorGender: styleDNA.audioProfile.narratorGender,
      }, '[VideoAnalyzer] Analysis complete');

      return {
        success: true,
        styleDNA,
        rawAnalysis: rawText,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error({ error: msg }, '[VideoAnalyzer] Analysis failed');
      return { success: false, error: msg };
    } finally {
      // 5. 클린업
      if (uploadedFileName) {
        try {
          await this.ai.files.delete({ name: uploadedFileName });
          logger.debug({ fileName: uploadedFileName }, '[VideoAnalyzer] Uploaded file deleted');
        } catch {
          // 클린업 실패는 무시
        }
      }
    }
  }

  private parseStyleDNA(rawText: string): StyleDNA | null {
    try {
      // markdown code fence 제거
      let jsonStr = rawText;
      const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) {
        jsonStr = fenceMatch[1].trim();
      }

      const parsed = JSON.parse(jsonStr);

      // 필수 필드 존재 확인
      if (!parsed.visualStyle || !parsed.motionProfile || !parsed.educationalPattern ||
          !parsed.audioProfile || !parsed.technicalSpecs) {
        return null;
      }

      return parsed as StyleDNA;
    } catch {
      return null;
    }
  }

  /**
   * StyleDNA + ContentDNA 동시 추출 (1회 API 호출 → 비용 절반)
   * v2.0 신규: 콘텐츠 구조까지 분석
   */
  async analyzeWithContent(request: ContentExtractionRequest): Promise<FullVideoAnalysisResult> {
    if (!await fs.pathExists(request.videoPath)) {
      return { success: false, error: `Video file not found: ${request.videoPath}` };
    }

    let uploadedFileName: string | undefined;

    try {
      logger.info({ videoPath: request.videoPath }, '[VideoAnalyzer] Uploading for full analysis (Style + Content)');

      const uploadResult = await this.ai.files.upload({
        file: request.videoPath,
        config: { mimeType: 'video/mp4' },
      });

      uploadedFileName = uploadResult.name;
      if (!uploadResult.uri) {
        return { success: false, error: 'File upload returned no URI' };
      }

      // ACTIVE 상태 대기
      let fileState = uploadResult.state;
      const pollStart = Date.now();

      while (fileState === 'PROCESSING') {
        if (Date.now() - pollStart > POLL_TIMEOUT_MS) {
          throw new Error('File processing timeout');
        }
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
        const fileInfo = await this.ai.files.get({ name: uploadedFileName! });
        fileState = fileInfo.state;
      }

      if (fileState !== 'ACTIVE') {
        return { success: false, error: `File processing failed, state: ${fileState}` };
      }

      // 통합 프롬프트로 1회 분석
      logger.info({ model: MODEL }, '[VideoAnalyzer] Requesting full analysis (StyleDNA + ContentDNA)');

      const response = await this.ai.models.generateContent({
        model: MODEL,
        contents: [
          {
            role: 'user',
            parts: [
              { fileData: { fileUri: uploadResult.uri, mimeType: 'video/mp4' } },
              { text: VIDEO_FULL_ANALYSIS_PROMPT },
            ],
          },
        ],
      });

      const rawText = response.text || '';
      const parsed = this.parseFullAnalysis(rawText);

      if (!parsed) {
        return {
          success: false,
          rawAnalysis: rawText,
          error: 'Failed to parse full analysis from Gemini response',
        };
      }

      logger.info({
        topic: parsed.contentDNA?.topic,
        hookType: parsed.contentDNA?.hook?.type,
        transcriptLength: parsed.contentDNA?.fullTranscript?.length,
      }, '[VideoAnalyzer] Full analysis complete');

      return {
        success: true,
        styleDNA: parsed.styleDNA,
        contentDNA: parsed.contentDNA,
        rawAnalysis: rawText,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error({ error: msg }, '[VideoAnalyzer] Full analysis failed');
      return { success: false, error: msg };
    } finally {
      if (uploadedFileName) {
        try {
          await this.ai.files.delete({ name: uploadedFileName });
        } catch {
          // 클린업 실패 무시
        }
      }
    }
  }

  private parseFullAnalysis(rawText: string): { styleDNA: StyleDNA; contentDNA: ContentDNA } | null {
    try {
      let jsonStr = rawText;
      const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) jsonStr = fenceMatch[1].trim();

      const parsed = JSON.parse(jsonStr);

      if (!parsed.styleDNA || !parsed.contentDNA) return null;
      if (!parsed.styleDNA.visualStyle || !parsed.styleDNA.motionProfile) return null;
      if (!parsed.contentDNA.topic || !parsed.contentDNA.hook) return null;

      return {
        styleDNA: parsed.styleDNA as StyleDNA,
        contentDNA: parsed.contentDNA as ContentDNA,
      };
    } catch {
      return null;
    }
  }

  /** 분석 비용 추정 (USD) */
  getCostEstimate(): number {
    return ANALYSIS_COST_ESTIMATE;
  }
}
