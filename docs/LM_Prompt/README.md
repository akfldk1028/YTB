# NotebookLM Prompt Library

## 핵심: 소스 vs 프롬프트 (절대 헷갈리지 마)

| 구분 | 파일 | NotebookLM 어디에 넣나 | 역할 |
|------|------|----------------------|------|
| **소스 (콘텐츠)** | `veo_episodes/EP01~.md` | **Copied Text** (소스 추가) | Neo4j에서 파싱한 에피소드 내용 (나레이션 + 비주얼 + VEO 키프레임) |
| **프롬프트 (스타일)** | 이 폴더 `LM_Prompt/` | **"Describe the slide deck" 필드** | 슬라이드를 어떤 스타일/구조로 만들지 지시 |

```
[소스] EP01.md ──→ NotebookLM "Copied Text" (Sources 탭)
                        │
[프롬프트] EN.md ──→ "Describe the slide deck" 필드
                        │
                        ▼
                  슬라이드 PNG 생성
                        │
                        ▼
             VEO 3.1 / Grok / Ken Burns
                        │
                        ▼
              FFmpeg (TTS + 자막)
                        │
                        ▼
               YouTube Shorts 완성
```

## 소스 파일 위치
```
short-video-maker/downloads/books/veo_episodes/
├── EP01_전쟁_게임_고수가_알려주는_최소_비용_작전.md
├── EP02_...md
└── EP10_...md

생성 방법: PDF → Neo4j → AI 커리큘럼 → tmp_split_episodes.py → EP별 MD
```

## 프롬프트 파일 구조
```
LM_Prompt/
├── neb-education/     ← NEB 교육/수학 (3B1B 스타일)
│   ├── EN.md          ← "Describe" 필드에 복붙 (영어 = 잘 먹힘)
│   └── KR.md          ← 내용 방향 보충용 (한국어)
├── lifestyle/         ← 멘탈훈련소 / 직장인공감 / 고양이
│   ├── EN.md
│   └── KR.md
├── community/         ← 커뮤니티 베스트 프롬프트 모음
│   └── EN.md
└── veo-grok/          ← 슬라이드 PNG → VEO/Grok 영상 변환
    └── EN.md
```

## Step by Step

### 1. 소스 넣기
`veo_episodes/EP01_xxx.md` 파일을 NotebookLM에 **Copied Text**로 추가

### 2. 슬라이드 생성
Studio → Slide Deck → Customize:
- Format: **Detailed Deck**
- Language: **한국어**
- Length: **Default**
- "Describe": `neb-education/EN.md` 에서 원하는 프롬프트 복붙

### 3. 슬라이드 → 영상
생성된 PNG에 `veo-grok/EN.md` 프롬프트로 VEO 3.1 영상 생성

### 4. 최종 합성
FFmpeg로 TTS + 자막 + 후크 텍스트 합성 → YouTube Shorts

## References
- [NotebookLM Video Overview 공식](https://support.google.com/notebooklm/answer/16454555)
- [awesome-notebookLM-prompts](https://github.com/serenakeyitan/awesome-notebookLM-prompts)
- [sabrina.dev viral powerpoints](https://www.sabrina.dev/p/viral-powerpoints-slides-free-notebooklm)
- [Google 8 Tips for Slide Decks](https://blog.google/innovation-and-ai/models-and-research/google-labs/8-ways-to-make-the-most-out-of-slide-decks-in-notebooklm/)
- [NotebookLM System Prompt 분석](https://baoyu.io/blog/notebooklm-slide-deck-system-prompt)
