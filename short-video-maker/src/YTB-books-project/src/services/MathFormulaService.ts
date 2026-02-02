/**
 * MathFormulaService
 *
 * 수학 수식을 감지하고 MathJax로 PNG 렌더링
 *
 * 기능:
 * 1. 텍스트에서 수학 수식 패턴 감지
 * 2. 자연어 수식을 LaTeX로 변환 (Gemini AI 사용)
 * 3. MathJax v4 → SVG → sharp PNG 렌더링 (v3.2.0)
 * 4. drawtext fallback 유지
 *
 * v3.2.0: MathJax PNG 렌더링 추가 (FFmpeg drawtext 수식 깨짐 해결)
 * v3.1.3: CodeCogs PNG 렌더링 제거 → FFmpeg drawtext 방식으로 전환
 *
 * @version 3.2.0
 */

import { GoogleGenAI } from '@google/genai';
import { logger, Config } from '../../../config';
import type { BookChunk } from '../types';
import sharp from 'sharp';
import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js';
import path from 'path';
import fs from 'fs-extra';

// v3.1.0: 수식 + 주변 컨텍스트
export interface FormulaWithContext {
  latex: string;       // 원본 LaTeX
  name: string;        // 수식 이름 (예: "Reconstruction Loss")
  context: string;     // 수식 앞뒤 설명 텍스트
  variables: string[]; // 주요 변수 목록 (예: ["M̂", "M", "V_lips"])
}

// 수식 타입 정의
export interface MathFormula {
  id: string;
  originalText: string;       // 원본 텍스트 (예: "E equals mc squared")
  latex: string;              // LaTeX 코드 (예: "E = mc^2")
  description: string;        // 쉬운 설명 (예: "에너지는 질량 곱하기 빛의 속도 제곱")
  displayText?: string;       // v3.1.3: 화면 표시용 텍스트 (유니코드, drawtext용)
  position?: 'center' | 'top' | 'bottom';  // 화면 위치
  pngPath?: string;           // v3.2.0: 렌더링된 수식 PNG 경로
  pngWidth?: number;          // v3.2.0: PNG 너비(px)
  pngHeight?: number;         // v3.2.0: PNG 높이(px)
}

export interface MathDetectionResult {
  hasMath: boolean;
  formulas: MathFormula[];
  cleanedText: string;        // 수식이 제거된 텍스트 (TTS용)
}

/** v3.2.0: MathJax PNG 렌더링 결과 */
export interface MathPngResult {
  pngPath: string;
  width: number;
  height: number;
  latex: string;
}

export class MathFormulaService {
  private ai: GoogleGenAI;
  private modelName: string;

  // v3.2.0: MathJax lazy singleton
  private static mathjaxDocument: any = null;
  private static mathjaxAdaptor: any = null;

  constructor(apiKey?: string) {
    const config = new Config();
    this.ai = new GoogleGenAI({ apiKey: apiKey || config.googleGeminiApiKey || '' });
    this.modelName = 'gemini-2.0-flash';
  }

  /**
   * v3.2.0: MathJax 초기화 (lazy singleton)
   */
  private static initMathJax(): void {
    if (MathFormulaService.mathjaxDocument) return;
    const adaptor = liteAdaptor();
    RegisterHTMLHandler(adaptor);
    MathFormulaService.mathjaxAdaptor = adaptor;
    MathFormulaService.mathjaxDocument = mathjax.document('', {
      InputJax: new TeX({ packages: AllPackages }),
      OutputJax: new SVG({ fontCache: 'none' }),
    });
  }

  /**
   * v3.2.0: LaTeX → MathJax SVG → sharp PNG
   * 흰색 텍스트, 반투명 검정 배경 박스 (rgba(0,0,0,0.6), border-radius: 16px)
   * maxWidth: 900px (1080px 화면에 여유)
   */
  async renderLatexToPng(
    latex: string,
    outputDir: string,
    options?: { maxWidth?: number; fontSize?: number }
  ): Promise<MathPngResult> {
    MathFormulaService.initMathJax();

    const maxWidth = options?.maxWidth || 900;
    const doc = MathFormulaService.mathjaxDocument;
    const adaptor = MathFormulaService.mathjaxAdaptor;

    // LaTeX → SVG
    const node = doc.convert(latex, { display: true });
    let svgString = adaptor.outerHTML(node);

    // SVG에서 width/height 추출
    const widthMatch = svgString.match(/width="([^"]+)"/);
    const heightMatch = svgString.match(/height="([^"]+)"/);

    // ex 단위를 px로 변환 (1ex ≈ 8px at default font)
    const exToPx = 10;
    let svgWidth = widthMatch ? parseFloat(widthMatch[1]) * exToPx : 200;
    let svgHeight = heightMatch ? parseFloat(heightMatch[1]) * exToPx : 60;

    // 스케일링: maxWidth 초과 시 비율 유지
    let scale = 1;
    if (svgWidth > maxWidth) {
      scale = maxWidth / svgWidth;
      svgWidth = maxWidth;
      svgHeight = svgHeight * scale;
    }

    // SVG에 흰색 fill 추가 + viewBox 설정
    svgString = svgString
      .replace(/<svg/, `<svg xmlns="http://www.w3.org/2000/svg"`)
      .replace(/style="/, `style="color: white; `)
      .replace(/<g /, '<g fill="white" stroke="white" ');

    // width/height를 px 단위로 교체
    const density = 300;
    const renderWidth = Math.ceil(svgWidth * 2);
    const renderHeight = Math.ceil(svgHeight * 2);

    svgString = svgString
      .replace(/width="[^"]*"/, `width="${renderWidth}"`)
      .replace(/height="[^"]*"/, `height="${renderHeight}"`);

    // SVG → PNG (sharp)
    const svgBuffer = Buffer.from(svgString);
    const formulaPng = await sharp(svgBuffer, { density })
      .png()
      .toBuffer();

    const formulaMeta = await sharp(formulaPng).metadata();
    const fWidth = formulaMeta.width || renderWidth;
    const fHeight = formulaMeta.height || renderHeight;

    // 반투명 검정 배경 박스 합성 (padding 추가)
    const padding = 24;
    const borderRadius = 16;
    const bgWidth = fWidth + padding * 2;
    const bgHeight = fHeight + padding * 2;

    // 배경 SVG (반투명 검정, 둥근 모서리)
    const bgSvg = Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" width="${bgWidth}" height="${bgHeight}">
        <rect x="0" y="0" width="${bgWidth}" height="${bgHeight}"
              rx="${borderRadius}" ry="${borderRadius}"
              fill="rgba(0,0,0,0.6)" />
      </svg>
    `);

    // 배경 + 수식 합성
    const finalPng = await sharp(bgSvg)
      .composite([{
        input: formulaPng,
        left: padding,
        top: padding,
      }])
      .png()
      .toBuffer();

    // 파일 저장
    const fileName = `formula_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.png`;
    const pngPath = path.join(outputDir, fileName);
    await fs.writeFile(pngPath, finalPng);

    logger.info({
      latex: latex.substring(0, 50),
      width: bgWidth,
      height: bgHeight,
      pngPath,
    }, '📐 MathJax PNG 렌더링 완료 (v3.2.0)');

    return {
      pngPath,
      width: bgWidth,
      height: bgHeight,
      latex,
    };
  }

  /**
   * v3.2.0: Scene의 모든 수식을 MathJax PNG로 렌더링
   * 실패 시 기존 convertLatexToDisplayText() fallback 유지
   */
  async renderFormulasForScene(
    formulas: MathFormula[],
    outputDir: string
  ): Promise<MathFormula[]> {
    await fs.ensureDir(outputDir);
    const result: MathFormula[] = [];

    for (const formula of formulas) {
      try {
        const pngResult = await this.renderLatexToPng(formula.latex, outputDir);
        result.push({
          ...formula,
          pngPath: pngResult.pngPath,
          pngWidth: pngResult.width,
          pngHeight: pngResult.height,
        });

        logger.debug({
          latex: formula.latex.substring(0, 40),
          pngPath: pngResult.pngPath,
        }, '수식 PNG 렌더링 성공');
      } catch (error) {
        // fallback: drawtext용 displayText
        logger.warn({ error, latex: formula.latex.substring(0, 40) }, '수식 PNG 렌더링 실패 - drawtext fallback');
        const displayText = formula.displayText || this.convertLatexToDisplayText(formula.latex);
        result.push({
          ...formula,
          displayText,
        });
      }
    }

    logger.info({
      formulaCount: formulas.length,
      withPng: result.filter(f => f.pngPath).length,
      withDisplayText: result.filter(f => !f.pngPath && f.displayText).length,
    }, 'Scene 수식 렌더링 완료 (v3.2.0)');

    return result;
  }

  /**
   * 텍스트에서 수학 수식 감지
   * 패턴: 숫자+변수, 그리스 문자, 수학 키워드 등
   */
  detectMathPatterns(text: string): boolean {
    const mathPatterns = [
      // 수학 연산자
      /[=+\-*/^].*\d/,
      /\d.*[=+\-*/^]/,
      // 그리스 문자 (영어로 작성된 경우)
      /\b(alpha|beta|gamma|delta|epsilon|theta|lambda|mu|sigma|pi|omega)\b/i,
      // 수학 함수
      /\b(sin|cos|tan|log|ln|exp|sqrt|sum|integral|derivative|limit)\b/i,
      // 분수, 제곱 등
      /\b(squared|cubed|divided by|multiplied by|over|fraction)\b/i,
      // 한국어 수학 용어
      /\b(제곱|세제곱|나누기|곱하기|더하기|빼기|분수|적분|미분|시그마|루트)\b/,
      // 수식 패턴 (예: x^2, a_n)
      /[a-zA-Z][\^_]\d/,
      /[a-zA-Z]\([a-zA-Z]\)/,
      // 괄호 안 수식
      /\([^)]*[+\-*/=][^)]*\)/,
      // 등호를 포함한 수식
      /[A-Za-z]\s*=\s*[A-Za-z0-9]/,
    ];

    return mathPatterns.some(pattern => pattern.test(text));
  }

  /**
   * AI를 사용해 텍스트에서 수학 수식 추출 및 LaTeX 변환
   */
  async extractAndConvertToLatex(text: string): Promise<MathDetectionResult> {
    // 먼저 간단한 패턴 검사
    if (!this.detectMathPatterns(text)) {
      return {
        hasMath: false,
        formulas: [],
        cleanedText: text
      };
    }

    try {
      const prompt = `당신은 수학 수식 전문가입니다. 다음 텍스트에서 수학적 내용을 분석해주세요.

텍스트: "${text}"

다음 JSON 형식으로 응답해주세요 (JSON만 출력, 다른 설명 없이):
{
  "hasMath": true/false,
  "formulas": [
    {
      "originalText": "원본 수식 텍스트",
      "latex": "LaTeX 코드 (예: E = mc^2)",
      "displayText": "화면에 표시할 유니코드 텍스트 (예: E = mc²)",
      "description": "초등학생도 이해할 수 있는 쉬운 설명",
      "position": "center"
    }
  ],
  "cleanedText": "수식을 제거하고 설명만 남긴 텍스트 (TTS 읽기용)"
}

규칙:
1. LaTeX는 간단하게 작성 (기본 수식만, 복잡한 패키지 사용 안 함)
2. displayText는 FFmpeg drawtext용 짧은 ASCII 텍스트 (최대 20자!):
   - 유니코드 결합문자 절대 금지 (M̂, ã 등 → FFmpeg에서 깨짐)
   - \\hat{M} → M', \\sum → Sum, \\alpha → a, x^2 → x^2
   - L_{rec} → L_rec, \\frac{a}{b} → (a/b)
   - 핵심 변수와 등호만 남기고 최대한 짧게 (예: "L = L_rec + L_VQ")
   - 20자 초과하면 잘리므로 반드시 20자 이내로!
3. description은 비유나 예시를 사용해 쉽게 설명
4. cleanedText는 수식을 제거하고 의미만 한글로 풀어서 남김 (예: "오차를 최소화하는 계산")
5. 수학적 내용이 없으면 hasMath: false, formulas: []

예시:
- "E equals mc squared" → latex: "E = mc^2", displayText: "E = mc^2", description: "에너지는 질량에 빛의 속도를 두 번 곱한 것"
- "손실 함수 L은 reconstruction loss와 VQ loss의 합" → latex: "L = L_{rec} + L_{VQ}", displayText: "L = L_rec + L_VQ", description: "총 손실은 복원 손실과 양자화 손실을 더한 것"
- "\\hat{M}" → displayText: "M'"
- "\\sum_{i=1}^{n}" → displayText: "Sum(i=1..n)"`;

      const result = await this.ai.models.generateContent({
        model: this.modelName,
        contents: prompt,
        config: {
          maxOutputTokens: 2048,
          temperature: 0.3,
        }
      });
      const responseText = result.text || '';

      // JSON 추출
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.warn({ text, response: responseText }, '수식 추출 실패: JSON 파싱 불가');
        return {
          hasMath: false,
          formulas: [],
          cleanedText: text
        };
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // v3.2.0: AI JSON 응답 검증
      if (typeof parsed.hasMath !== 'boolean') parsed.hasMath = parsed.formulas?.length > 0;
      if (!Array.isArray(parsed.formulas)) parsed.formulas = [];
      parsed.formulas = parsed.formulas.filter((f: any) => f?.latex?.length > 0);
      if (typeof parsed.cleanedText !== 'string') parsed.cleanedText = text;

      // ID 추가
      if (parsed.formulas) {
        parsed.formulas = parsed.formulas.map((f: any, i: number) => ({
          ...f,
          id: `math_${Date.now()}_${i}`
        }));
      }

      logger.info({
        text: text.substring(0, 50),
        hasMath: parsed.hasMath,
        formulaCount: parsed.formulas?.length || 0
      }, '수식 감지 완료');

      return parsed as MathDetectionResult;

    } catch (error) {
      logger.error({ error, text }, '수식 추출 중 오류');
      return {
        hasMath: false,
        formulas: [],
        cleanedText: text
      };
    }
  }

  /**
   * v3.1.3: LaTeX를 displayText (유니코드)로 변환
   * drawtext fallback용으로 유지
   */
  convertLatexToDisplayText(latex: string): string {
    let text = latex;

    // v3.1.4: 결합 문자(combining characters) 사용 금지 — FFmpeg drawtext가 깨짐
    text = text.replace(/\\hat\{([^}]+)\}/g, "$1'");
    text = text.replace(/\\tilde\{([^}]+)\}/g, '$1~');
    text = text.replace(/\\bar\{([^}]+)\}/g, '$1');
    text = text.replace(/\\dot\{([^}]+)\}/g, '$1');
    text = text.replace(/\\vec\{([^}]+)\}/g, '$1');

    // \text{...}, \mathrm{...} 등 먼저 처리 (내부 텍스트 보존)
    text = text.replace(/\\(?:text|mathrm|mathbf|mathit|boldsymbol|operatorname)\{([^}]+)\}/g, '$1');

    // 분수, 제곱근 (중괄호 중첩 전에 처리)
    text = text.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1/$2)');
    text = text.replace(/\\sqrt\{([^}]+)\}/g, 'sqrt($1)');

    // 그리스 문자 — 단순 ASCII 대체 (FFmpeg 폰트 호환성)
    const greekMap: Record<string, string> = {
      '\\alpha': 'a', '\\beta': 'b', '\\gamma': 'g', '\\delta': 'd',
      '\\epsilon': 'e', '\\zeta': 'z', '\\eta': 'n', '\\theta': 'th',
      '\\lambda': 'l', '\\mu': 'u', '\\nu': 'v', '\\pi': 'pi',
      '\\rho': 'r', '\\sigma': 's', '\\tau': 't', '\\phi': 'ph',
      '\\omega': 'w', '\\Sigma': 'Sum', '\\Pi': 'Prod', '\\Omega': 'W',
      '\\Delta': 'D', '\\Gamma': 'G', '\\Lambda': 'L', '\\Theta': 'Th',
    };
    for (const [latex_sym, ascii] of Object.entries(greekMap)) {
      text = text.replace(new RegExp(latex_sym.replace(/\\/g, '\\\\'), 'g'), ascii);
    }

    // 수학 기호 — ASCII 안전 대체
    text = text.replace(/\\sum/g, 'Sum');
    text = text.replace(/\\prod/g, 'Prod');
    text = text.replace(/\\int/g, 'Int');
    text = text.replace(/\\infty/g, 'inf');
    text = text.replace(/\\partial/g, 'd');
    text = text.replace(/\\nabla/g, 'del');
    text = text.replace(/\\approx/g, '~=');
    text = text.replace(/\\neq/g, '!=');
    text = text.replace(/\\leq/g, '<=');
    text = text.replace(/\\geq/g, '>=');
    text = text.replace(/\\times/g, 'x');
    text = text.replace(/\\cdot/g, '*');
    text = text.replace(/\\rightarrow/g, '->');
    text = text.replace(/\\leftarrow/g, '<-');

    // 위첨자/아래첨자 단순화
    text = text.replace(/\^2/g, '^2');
    text = text.replace(/\^3/g, '^3');
    text = text.replace(/\^\{([^}]+)\}/g, '^$1');
    text = text.replace(/_\{([^}]+)\}/g, '_$1');

    // 남은 백슬래시 명령 제거
    text = text.replace(/\\[a-zA-Z]+/g, '');

    // 중괄호 제거
    text = text.replace(/[{}]/g, '');

    // 연속 공백, 파이프 정리
    text = text.replace(/\s{2,}/g, ' ').trim();

    // v3.1.4: 최대 25자 제한 — 화면 밖 잘림 방지
    if (text.length > 25) {
      text = text.substring(0, 25);
    }

    return text;
  }

  /**
   * 나레이션과 관련된 수식만 필터링 (AI 기반, 엄격 모드)
   * 나레이션이 직접 설명하는 수식만 선택. 관련 없으면 빈 배열 반환.
   */
  async filterRelevantFormulas(
    narrationText: string,
    latexFormulas: string[],
    maxFormulas: number = 2,
    visualPrompt?: string
  ): Promise<string[]> {
    // 수식이 적어도 항상 필터링 (매칭 안 되면 0개 반환해야 하므로)
    try {
      const formulaList = latexFormulas.map((f, i) => `[${i}] ${f}`).join('\n');

      const visualContext = visualPrompt ? `\n이미지 설명: "${visualPrompt}"` : '';

      const prompt = `이 Scene의 주제와 가장 관련 있는 수식 1개를 선택하세요.
나레이션이 수식을 직접 설명하지 않더라도, Scene의 주제/개념과 가장 잘 맞는 수식을 선택합니다.
(나레이션은 이후에 수식을 설명하도록 재생성됩니다.)

나레이션 (Scene 주제 파악용): "${narrationText}"${visualContext}

수식 목록:
${formulaList}

JSON 형식으로 응답 (JSON만 출력):
{"selectedIndices": [0], "reason": "선택 이유"}

규칙:
1. Scene의 주제/개념과 가장 관련 있는 수식 1개를 선택 (최대 ${maxFormulas}개)
2. 나레이션이 다루는 개념(예: 인코더, 양자화, 손실 함수 등)에 해당하는 수식 우선
3. hook/결론처럼 일반적인 Scene이고, 수식이 전혀 관련 없으면 빈 배열: {"selectedIndices": []}
4. 같은 주제의 수식이 여러 개면 가장 핵심적인 것 1개만

예시:
- 나레이션 "트랜스포머 인코더로 표정을 분석해요" → 인코더 관련 수식 선택 (없으면 가장 가까운 것)
- 나레이션 "다중 스케일 VQ 오토인코더" → VQ/양자화 관련 수식 선택
- 나레이션 "안녕 친구들! 오늘은~" (hook) → 수식 없음 {"selectedIndices": []}`;

      const result = await this.ai.models.generateContent({
        model: this.modelName,
        contents: prompt,
        config: {
          maxOutputTokens: 256,
          temperature: 0.1,
        }
      });
      const responseText = result.text || '';

      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.warn('수식 필터링 JSON 파싱 실패 - 처음 2개 사용');
        return latexFormulas.slice(0, maxFormulas);
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const indices: number[] = (parsed.selectedIndices || [])
        .filter((i: number) => i >= 0 && i < latexFormulas.length)
        .slice(0, maxFormulas);

      if (indices.length === 0) {
        logger.info({ narration: narrationText.substring(0, 40) }, '관련 수식 없음 - 수식 오버레이 스킵');
        return [];
      }

      const selected = indices.map(i => latexFormulas[i]);
      logger.info({
        total: latexFormulas.length,
        selected: selected.length,
        indices,
        narration: narrationText.substring(0, 40)
      }, '수식 필터링 완료');

      return selected;

    } catch (error) {
      logger.warn({ error }, '수식 필터링 실패 - 빈 배열 반환');
      return [];
    }
  }

  /**
   * 수식에 맞는 나레이션 생성
   * 원래 나레이션의 맥락을 유지하면서, 선택된 수식을 직접 설명하는 나레이션으로 교체
   */
  async generateFormulaAwareNarration(
    originalNarration: string,
    selectedFormulas: string[],
    sceneType: string
  ): Promise<string> {
    if (selectedFormulas.length === 0) {
      return originalNarration;
    }

    try {
      const formulaList = selectedFormulas.map((f, i) => `수식 ${i + 1}: ${f}`).join('\n');

      const prompt = `유튜브 숏츠 나레이션을 작성해주세요.

★★★ 핵심: 화면의 수식을 고등학생이 이해하도록 직접 설명하세요! ★★★
수식의 각 변수가 뭘 뜻하는지, 전체적으로 뭘 계산하는 건지 쉽게 풀어주세요.

씬 타입: ${sceneType}
원래 맥락: "${originalNarration}"

화면에 표시될 수식:
${formulaList}

작성 규칙:
1. 수식이 뭘 하는지 핵심만 설명 (각 변수/기호의 의미)
2. 원래 맥락과 자연스럽게 연결
3. "수식을 보세요", "화면에 보이는" 등 화면 참조 금지
4. 수식 기호(\\, ^, _, {})나 LaTeX 코드 절대 포함 금지
5. 영어 전문용어 그대로 OK (예: "Reconstruction Loss")
6. 1-2문장, 20-24자 이내, "~거예요/~이죠/~해요" 말투
7. ★ 반드시 24자 이내! 초과하면 안 됨 ★

예시 (수식: L_{rec} = ||x - \\hat{x}||_2^2):
○ "원본과 복원 차이를 재는 게 Reconstruction Loss예요."  (22자)

JSON으로 응답:
{"narration": "나레이션 텍스트"}`;

      const result = await this.ai.models.generateContent({
        model: this.modelName,
        contents: prompt,
        config: {
          maxOutputTokens: 512,
          temperature: 0.5,
        }
      });
      const responseText = result.text || '';

      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.warn('수식 나레이션 생성 실패 - 원본 유지');
        return originalNarration;
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const newNarration = parsed.narration || originalNarration;

      logger.info({
        original: originalNarration.substring(0, 30),
        new: newNarration.substring(0, 30),
        formulas: selectedFormulas.length
      }, '수식 기반 나레이션 재생성');

      return newNarration;

    } catch (error) {
      logger.warn({ error }, '수식 나레이션 생성 실패 - 원본 유지');
      return originalNarration;
    }
  }

  /**
   * v3.1.0: 청크 텍스트에서 수식과 주변 컨텍스트를 함께 추출
   * 커리큘럼 생성 시 AI에게 수식+맥락을 전달하기 위함
   */
  extractFormulasWithContext(chunks: BookChunk[]): FormulaWithContext[] {
    const results: FormulaWithContext[] = [];
    const seen = new Set<string>();

    for (const chunk of chunks) {
      // 1. 청크의 latexFormulas 필드 사용 (Neo4j에서 가져온 것)
      const formulas = chunk.latexFormulas || [];

      // 2. 텍스트에서 $$...$$ 패턴 추가 추출
      const inlineMatches = chunk.text.match(/\$\$([^$]+)\$\$/g) || [];
      const extractedFormulas = inlineMatches.map(m => m.replace(/^\$\$|\$\$$/g, '').trim());

      const allFormulas = [...new Set([...formulas, ...extractedFormulas])];
      if (allFormulas.length === 0) continue;

      const sentences = chunk.text.split(/(?<=[.!?])\s+/);

      for (const formula of allFormulas) {
        // 중복 제거
        const formulaKey = formula.substring(0, 50);
        if (seen.has(formulaKey)) continue;
        seen.add(formulaKey);

        // 수식이 포함된 문장 + 앞뒤 문장 추출
        const idx = sentences.findIndex(s => s.includes(formula.substring(0, 20)));
        const start = Math.max(0, idx - 1);
        const end = Math.min(sentences.length, idx + 2);
        const context = idx >= 0
          ? sentences.slice(start, end).join(' ')
          : (chunk.sectionTitle || chunk.text.substring(0, 200));

        // 섹션 제목에서 name 추출
        const name = chunk.sectionTitle || 'Formula';

        // LaTeX에서 주요 변수 심볼 추출
        const variables = this.extractVariablesFromLatex(formula);

        results.push({ latex: formula, name, context, variables });
      }
    }

    logger.info({ totalFormulas: results.length }, 'Extracted formulas with context from chunks');
    return results;
  }

  /**
   * LaTeX 문자열에서 주요 변수 심볼 추출
   */
  private extractVariablesFromLatex(latex: string): string[] {
    const vars = new Set<string>();

    // \\hat{X} 패턴
    const hatMatches = latex.match(/\\hat\{([^}]+)\}/g) || [];
    hatMatches.forEach(m => vars.add(m.replace(/\\hat\{|\}/g, '') + '̂'));

    // X_{subscript} 패턴
    const subMatches = latex.match(/([A-Za-z])_\{([^}]+)\}/g) || [];
    subMatches.forEach(m => vars.add(m.replace(/[\\{}]/g, '')));

    // X_subscript (단일 문자) 패턴
    const subSingleMatches = latex.match(/([A-Za-z])_([A-Za-z0-9])/g) || [];
    subSingleMatches.forEach(m => vars.add(m));

    // L, M, V 등 단독 대문자 변수
    const upperMatches = latex.match(/(?<![a-zA-Z\\])[A-Z](?![a-zA-Z{])/g) || [];
    upperMatches.forEach(m => vars.add(m));

    return [...vars].slice(0, 8); // 최대 8개
  }

  /**
   * v3.1.3: Scene의 모든 수식에 displayText 생성
   * @deprecated v3.2.0에서 renderFormulasForScene()으로 대체. drawtext fallback으로만 유지
   */
  generateDisplayTextsForScene(
    formulas: MathFormula[]
  ): MathFormula[] {
    const result: MathFormula[] = [];

    for (const formula of formulas) {
      // AI가 생성한 displayText가 이미 있으면 그대로 사용
      const displayText = formula.displayText || this.convertLatexToDisplayText(formula.latex);

      result.push({
        ...formula,
        displayText,
      });

      logger.debug({
        latex: formula.latex,
        displayText,
      }, '수식 displayText 생성');
    }

    logger.info({
      formulaCount: formulas.length,
      withDisplayText: result.filter(f => f.displayText).length,
    }, 'Scene 수식 displayText 생성 완료');

    return result;
  }

  /**
   * v3.1.3: 전체 Episode의 수식 처리
   * - 각 Scene 나레이션에서 수식 감지
   * - LaTeX 변환
   * - displayText 생성 (PNG 렌더링 제거)
   */
  async processEpisodeMath(
    _episodeId: string,
    scenes: Array<{ id: string; narration: string; visualDesc?: string }>
  ): Promise<Map<string, MathDetectionResult>> {
    const results = new Map<string, MathDetectionResult>();

    for (const scene of scenes) {
      const textToAnalyze = `${scene.narration} ${scene.visualDesc || ''}`;
      const detection = await this.extractAndConvertToLatex(textToAnalyze);

      if (detection.hasMath && detection.formulas.length > 0) {
        // displayText 생성 (PNG 대신)
        detection.formulas = this.generateDisplayTextsForScene(detection.formulas);

        logger.info({
          sceneId: scene.id,
          formulaCount: detection.formulas.length,
          withDisplayText: detection.formulas.filter(f => f.displayText).length
        }, 'Scene 수식 처리 완료 (drawtext)');
      }

      results.set(scene.id, detection);
    }

    return results;
  }
}

// 싱글톤 인스턴스
let mathFormulaServiceInstance: MathFormulaService | null = null;

export function getMathFormulaService(): MathFormulaService {
  if (!mathFormulaServiceInstance) {
    mathFormulaServiceInstance = new MathFormulaService();
  }
  return mathFormulaServiceInstance;
}

export function createMathFormulaService(apiKey?: string): MathFormulaService {
  return new MathFormulaService(apiKey);
}
