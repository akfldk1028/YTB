/**
 * VideoStyleProfile
 * 노드 간 공유 스타일 계약 (Strategy Pattern)
 *
 * 모든 파이프라인 노드(ImageGenerator, MathRenderer, ContentPlanner, VideoAssembler)가
 * 이 인터페이스를 통해 스타일 config를 받아 동작을 결정한다.
 *
 * 새 스타일 추가: 이 인터페이스를 구현하는 프로파일 1개 + registry 등록 → 기존 코드 수정 0
 */

export interface VideoStyleProfile {
  /** 고유 ID (registry key) */
  id: string;
  /** 표시 이름 */
  displayName: string;

  // ── ImageGenerator Node input ──

  /** narrative 씬(hook/intro/conclusion) 이미지 프리픽스 */
  narrativeStylePrefix: string;
  /** educational 씬(explanation/example) 이미지 프리픽스 */
  educationalStylePrefix: string;
  /** formula 씬(수식 비유) 이미지 프리픽스 */
  formulaConceptPrefix: string;
  /** diagram 씬 이미지 프리픽스 */
  diagramStylePrefix: string;
  /** 이미지 프롬프트 공통 suffix (텍스트 금지 등) */
  imagePromptSuffix: string;
  /** 무드별 설명 */
  moods: Record<string, string>;
  /** 씬별 구도 변화 배열 (NanoBanana 다양성) */
  compositions: string[];

  // ── MathRenderer Node input ──

  /** 수식 SVG fill 색상 (CSS color) */
  mathSvgFillColor: string;
  /** 변수별 색상 코딩 활성화 */
  useColorCodedVariables: boolean;
  /** 변수→색상 매핑 (순환 팔레트) */
  variableColors?: Record<string, string>;
  /** 수식 기본 위치 */
  defaultFormulaPosition: 'center' | 'top' | 'bottom';

  // ── ContentPlanner Node input ──

  /** ContentPlannerService.style 파라미터 */
  contentPlannerStyleHint: string;
  /** AI 프롬프트에 주입할 비주얼 가이드 */
  visualPromptGuide: string;

  // ── VideoAssembler Node input (TTS) ──

  /** Gemini TTS voice name */
  ttsVoice: string;
  /** TTS gender */
  ttsGender: 'female' | 'male';
  /** TTS 스타일 프롬프트 (톤, 속도 지시) */
  ttsStylePrompt: string;

  /** 스타일별 인게이지먼트 가이드 — 미설정 시 기본 getViralEngagementGuide() 사용 */
  engagementGuide?: string;

  /** v11.0: VEO 모션 프롬프트 힌트 (스타일별 카메라 워크) */
  veoMotionHint?: string;

  /** v12.0: 후크 텍스트 오버레이 설정 (굵은 한국어 텍스트) */
  hookTextOverlay?: {
    enabled: boolean;
    position: 'top' | 'top-center' | 'center' | 'bottom';
    fontSize: number;
    fontColor: string;
    strokeColor: string;
    strokeWidth: number;
    backgroundColor?: string;
    paddingX?: number;
    paddingY?: number;
  };
}
