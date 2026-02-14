# NotebookLM Prompt Library

## Folder Structure
```
LM_Prompt/
├── neb-education/     ← NEB 교육/수학 (3B1B 스타일)
│   ├── EN.md          ← English prompts (copy-paste)
│   └── KR.md          ← 한국어 프롬프트 (복붙)
├── lifestyle/         ← 멘탈훈련소 / 직장인공감 / 고양이
│   ├── EN.md
│   └── KR.md
├── community/         ← 커뮤니티 베스트 프롬프트
│   └── EN.md
└── veo-grok/          ← VEO 3.1 / Grok 영상 변환
    └── EN.md
```

## How to Use
1. NotebookLM에 에피소드 MD 파일을 "Copied Text"로 입력
2. Studio → Slide Deck → Customize
3. Format: **Detailed Deck**, Language: **한국어**, Length: **Default**
4. **"Describe the slide deck"** 필드에 아래 프롬프트 복붙:
   - 비주얼: `EN.md`에서 복사 (영어가 잘 먹힘)
   - 내용 방향: `KR.md`에서 복사 (한국어)
   - 둘 다 합쳐서 넣어도 됨

## Pipeline
```
에피소드 MD → NotebookLM (프롬프트 복붙) → 슬라이드 PNG
  → VEO 3.1 (veo-grok/EN.md 프롬프트) → 영상 클립
  → FFmpeg (TTS + 자막) → YouTube Shorts
```

## References
- [NotebookLM Video Overview 공식](https://support.google.com/notebooklm/answer/16454555)
- [awesome-notebookLM-prompts](https://github.com/serenakeyitan/awesome-notebookLM-prompts)
- [sabrina.dev viral powerpoints](https://www.sabrina.dev/p/viral-powerpoints-slides-free-notebooklm)
- [Google 8 Tips for Slide Decks](https://blog.google/innovation-and-ai/models-and-research/google-labs/8-ways-to-make-the-most-out-of-slide-decks-in-notebooklm/)
- [NotebookLM System Prompt 분석](https://baoyu.io/blog/notebooklm-slide-deck-system-prompt)
