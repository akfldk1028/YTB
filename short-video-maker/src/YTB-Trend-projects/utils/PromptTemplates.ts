/**
 * Gemini Video Analysis Prompt Templates
 * YouTube 영상 스타일 분석용 프롬프트
 */

export const VIDEO_STYLE_ANALYSIS_PROMPT = `You are a professional video production analyst. Analyze this video and extract its visual style, motion profile, educational structure, and audio characteristics.

Return your analysis as a JSON object with this exact structure:

{
  "visualStyle": {
    "colorPalette": ["list of 3-5 dominant colors as CSS color names or hex"],
    "composition": "description of typical shot composition (e.g., 'centered subject with dark background', 'split-screen with diagrams')",
    "backgroundType": "description (e.g., 'dark navy/black', 'animated gradient', 'real footage', 'whiteboard')",
    "characterPresence": "description (e.g., 'animated mascot character', 'real person face-cam', 'no character - diagrams only', 'voiceover with graphics')",
    "transitionStyle": "description (e.g., 'smooth fade', 'hard cut', 'slide transition', 'zoom transition')"
  },
  "motionProfile": {
    "cameraMovement": "description (e.g., 'static with zoom', 'slow pan', 'dynamic tracking', 'Ken Burns on stills')",
    "pace": "slow | medium | fast",
    "cutFrequency": "description (e.g., 'every 3-5 seconds', 'every 8-10 seconds', 'continuous single shot')"
  },
  "educationalPattern": {
    "hookStyle": "description of how the video opens (e.g., 'provocative question', 'surprising fact', 'visual demonstration')",
    "explanationApproach": "description (e.g., 'step-by-step with diagrams', 'analogy-driven', 'visual metaphor', 'data visualization')",
    "conclusionStyle": "description (e.g., 'summary recap', 'call to action', 'open question', 'key takeaway')"
  },
  "audioProfile": {
    "narratorGender": "male | female",
    "narratorTone": "description (e.g., 'enthusiastic and curious', 'calm and authoritative', 'casual and friendly')",
    "backgroundMusicStyle": "description or null (e.g., 'upbeat electronic', 'soft piano', 'no music')"
  },
  "technicalSpecs": {
    "averageShotDuration": 5,
    "aspectRatio": "16:9 or 9:16",
    "typicalSceneDuration": 6
  }
}

IMPORTANT:
- Be specific and descriptive, not generic
- Focus on what makes this video's style UNIQUE and reproducible
- If the video is a YouTube Short (vertical), note that in aspectRatio
- averageShotDuration and typicalSceneDuration should be in seconds (numbers)
- Return ONLY the JSON object, no markdown fences or extra text`;

export const SCENE_PLANNING_PROMPT = (
  styleDNA: string,
  content: { title: string; hook: string; mainPoints: string[]; conclusion: string },
  sceneCount: number,
  sceneDuration: number
) => `You are a video content planner. Based on the reference video's style analysis, plan ${sceneCount} scenes for a new educational video.

Reference Video Style:
${styleDNA}

New Video Content:
- Title: ${content.title}
- Hook: ${content.hook}
- Main Points: ${content.mainPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}
- Conclusion: ${content.conclusion}

Create a scene plan as a JSON array. Each scene should be approximately ${sceneDuration} seconds.

Return JSON array:
[
  {
    "index": 0,
    "type": "hook",
    "narration": "Korean narration text for this scene (40-60 characters)",
    "visualPrompt": "English image generation prompt matching the reference style",
    "duration": ${sceneDuration}
  }
]

Rules:
- First scene MUST be type "hook"
- Last scene MUST be type "conclusion"
- Middle scenes are type "explanation"
- narration should be in Korean, 40-60 characters per scene
- visualPrompt should be in English, detailed enough for image generation
- Match the reference video's visual style (colors, composition, character presence)
- Total scenes: ${sceneCount}
- Return ONLY the JSON array, no markdown fences`;

/**
 * ContentDNA + StyleDNA 동시 추출 프롬프트
 * 영상 1회 업로드로 두 분석 동시 수행 → API 비용 절반
 */
export const VIDEO_FULL_ANALYSIS_PROMPT = `You are a professional video analyst. Analyze this video and extract TWO things:

1. **Style DNA**: Visual style, motion, audio, and technical characteristics
2. **Content DNA**: Full transcript, content structure, and viral elements

Return a JSON object with this EXACT structure:

{
  "styleDNA": {
    "visualStyle": {
      "colorPalette": ["3-5 dominant CSS color names or hex"],
      "composition": "typical shot composition description",
      "backgroundType": "background description",
      "characterPresence": "character/presenter description",
      "transitionStyle": "transition description"
    },
    "motionProfile": {
      "cameraMovement": "movement description",
      "pace": "slow | medium | fast",
      "cutFrequency": "cut frequency description"
    },
    "educationalPattern": {
      "hookStyle": "how the video opens",
      "explanationApproach": "how content is explained",
      "conclusionStyle": "how the video ends"
    },
    "audioProfile": {
      "narratorGender": "male | female",
      "narratorTone": "tone description",
      "backgroundMusicStyle": "music description or null"
    },
    "technicalSpecs": {
      "averageShotDuration": 5,
      "aspectRatio": "16:9 or 9:16",
      "typicalSceneDuration": 6
    }
  },
  "contentDNA": {
    "topic": "main topic of the video",
    "niche": "content niche (e.g., education, tech, science, entertainment)",
    "language": "original language of the video (e.g., en, ko, zh)",
    "hook": {
      "type": "hook type (provocative_question, surprising_fact, controversy, direct_promise, visual_demonstration)",
      "content": "exact hook content/words",
      "technique": "why this hook works"
    },
    "mainPoints": [
      {
        "point": "key point",
        "explanation": "how it's explained",
        "visualApproach": "what visuals accompany this point"
      }
    ],
    "conclusion": {
      "type": "CTA | summary | cliffhanger | key_takeaway",
      "content": "conclusion content"
    },
    "fullTranscript": "Complete narration transcript of the entire video",
    "viralElements": ["list of elements that make this video engaging/viral"],
    "targetAudience": "who this video targets",
    "seoKeywords": ["5-10 SEO keywords for this content"],
    "estimatedDuration": 60
  }
}

IMPORTANT:
- Transcribe ALL spoken narration accurately in fullTranscript
- Be specific about viral elements (pattern interrupts, curiosity gaps, emotional triggers)
- seoKeywords should be in the video's original language
- estimatedDuration is in seconds
- Return ONLY the JSON object, no markdown fences`;

/**
 * 콘텐츠 재작성 프롬프트
 * ContentDNA → 새로운 VideoCloneContent 생성
 */
export const CONTENT_REWRITE_PROMPT = (
  contentDNA: string,
  targetLanguage: string = 'ko'
) => `You are a viral short-form video scriptwriter. Using the content structure analysis below as REFERENCE ONLY, create a completely NEW educational video script.

REFERENCE Content Structure (DO NOT copy directly):
${contentDNA}

RULES:
1. KEEP the same viral structure (hook type → explanation flow → conclusion style)
2. Use a DIFFERENT angle, perspective, or approach to the same topic
3. Use DIFFERENT examples, analogies, and metaphors
4. DO NOT translate or paraphrase the original — create ORIGINAL content
5. Target language: ${targetLanguage === 'ko' ? 'Korean (한국어)' : targetLanguage}
6. Target audience: Korean general public interested in education/science
7. Keep it concise for short-form video (45-60 seconds when read aloud)

Return JSON:
{
  "title": "Catchy video title in ${targetLanguage === 'ko' ? 'Korean' : targetLanguage}",
  "hook": "Opening hook text (3-5 seconds when read aloud)",
  "mainPoints": ["Point 1 explanation", "Point 2 explanation", "Point 3 explanation"],
  "conclusion": "Closing statement with CTA"
}

IMPORTANT:
- hook should create curiosity or surprise
- Each mainPoint should be 1-2 sentences, standalone
- conclusion should leave a lasting impression or call to action
- Total script when read aloud: 45-60 seconds
- Return ONLY JSON, no markdown fences`;

/**
 * 키워드 클러스터링 프롬프트
 * 여러 플랫폼의 키워드 → 유사어 병합 + 니치 분류
 */
export const KEYWORD_CLUSTERING_PROMPT = (keywords: string[]) =>
  `You are a trend analyst. Given these trending keywords from multiple platforms, cluster similar/related keywords together and classify each cluster's niche.

Keywords:
${keywords.map((k, i) => `${i + 1}. ${k}`).join('\n')}

Return JSON array:
[
  {
    "representative": "the best keyword to represent this cluster",
    "variants": ["all keywords that belong to this cluster"],
    "niche": "education | tech | science | entertainment | news | lifestyle | finance | health | other"
  }
]

Rules:
- Merge keywords that refer to the same topic (different languages, abbreviations, etc.)
- A keyword should appear in exactly one cluster
- representative should be the most search-friendly version
- Return ONLY JSON, no markdown fences`;
