# YTB-video-animation

정적 이미지 → 애니메이션 비디오 변환 모듈 (n8n 노드 패턴)

## 아키텍처

```
Input: 배경이미지(NanoBanana) + 씬타입 + 수식(optional) + duration
                    ↓
    ┌───────────────┼───────────────┐
    ↓               ↓               ↓
 Manim          Grok/xAI       Ken Burns
(올빼미 캐릭터)  (micro-motion)  (zoom/pan)
  $0/씬         $0.05/초        $0/씬
    ↓               ↓               ↓
    └───────────────┼───────────────┘
                    ↓
Output: 애니메이션 MP4 (VideoAnimationResult)
```

## 씬 타입별 프로바이더 선택 (v5.1)

| 씬 타입 | 1순위 | 2순위 | 3순위 |
|---------|-------|-------|-------|
| hook/conclusion (캐릭터) | **Manim** | Grok | Ken Burns |
| formula (수식) | **Ken Burns + MathJax overlay** | Grok | - |
| explanation (교육) | **Ken Burns** | Grok | - |

- **Manim**: hook/conclusion 전용. 올빼미 캐릭터가 움직이는 애니메이션
- **수식 씬은 Manim 사용하지 않음** — MathJax(Node.js)가 LaTeX 렌더링 더 안정적

## 디렉토리 구조

```
src/YTB-video-animation/
├── providers/
│   ├── BaseVideoProvider.ts      # 공통 인터페이스
│   ├── ManimVideoProvider.ts     # Manim CE Python 브릿지
│   ├── GrokVideoProvider.ts      # xAI Grok Imagine Video API
│   └── index.ts
├── services/
│   └── VideoAnimationService.ts  # 프로바이더 선택 + graceful degradation
├── types/
│   └── index.ts                  # VideoAnimationRequest, ManimAnimationRequest
├── manim/                        # Python Manim 씬 + 캐릭터
│   ├── characters/               # 올빼미 PNG 5포즈 (AI 생성)
│   │   ├── owl_neutral.png
│   │   ├── owl_thinking.png
│   │   ├── owl_surprised.png
│   │   ├── owl_pointing.png
│   │   └── owl_happy.png
│   ├── scenes/
│   │   ├── formula_scene.py      # DynamicScene (씬타입별 분기)
│   │   └── owl_character.py      # OwlCreature (Group + ImageMobject)
│   └── scripts/
│       └── generate_owl_pngs.py  # Gemini API로 올빼미 PNG 생성
└── index.ts
```

## ManimVideoProvider

TypeScript ↔ Python 브릿지. `MANIM_SCENE_CONFIG` 환경변수로 JSON config 주입.

```
ManimAnimationRequest → JSON config → manim render DynamicScene → MP4
```

- venv 자동 탐지: `MANIM_PATH` env → `.venv-manim/Scripts/manim.exe` → system PATH
- 해상도: CLI `-r 1280,720` (9:16 portrait)
- 좌표계: `frame_width=9, frame_height=16` (Y: -8~+8)
- 품질: `-ql` (480p15, 개발) / `-qm` (720p30, 프로덕션)

## Manim 올빼미 캐릭터

PNG ImageMobject 기반 (SVG에서 전환 — AI 생성 PNG가 훨씬 고퀄)

| 포즈 | 용도 | 씬 |
|------|------|-----|
| surprised | 놀라는 표정 | hook |
| neutral | 기본 | hook→전환 |
| thinking | 생각 | - |
| pointing | 가리킴 | - |
| happy | 기쁨 | conclusion |

애니메이션: FadeIn, shift, scale, FadeTransform(표정전환), blink, bounce, wave, nod

## 로컬 개발 설정

```bash
# 1. Python venv (manim용)
cd short-video-maker
python -m venv .venv-manim
.venv-manim/Scripts/activate  # Windows
pip install manim

# 2. 올빼미 PNG 생성 (최초 1회)
cd src/YTB-video-animation/manim/scripts
python generate_owl_pngs.py  # GOOGLE_GEMINI_API_KEY 필요

# 3. 테스트 렌더
export MANIM_SCENE_CONFIG='{"duration":5,"scene_type":"hook","aspect_ratio":"9:16"}'
manim render ../scenes/formula_scene.py DynamicScene -ql -r 1280,720
```

## 비용 비교

| Provider | 비용/씬 | 비용/에피소드(7씬) | 렌더링 시간 |
|----------|---------|-------------------|------------|
| Manim | $0 | $0 | ~3초/씬 |
| Grok | ~$0.30 | ~$2.10 | ~30초/씬 |
| Ken Burns | $0 | $0 | <1초/씬 |
