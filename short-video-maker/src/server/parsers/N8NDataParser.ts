/**
 * Raw 데이터 파서 - 어떤 형태든 받아서 비디오 API 형식으로 변환
 */

import type { 
  N8NRawData,
  N8NTimelineRawData,
  N8NStoryboardRawData,
  N8NNewRawData,
  N8NTimelineData,
  N8NStoryboardData, 
  N8NTimelineConfig,
  N8NStoryboardConfig,
  N8NScene,
  N8NStoryboardShot,
  N8NElement,
  N8NNewTimelineScene,
  N8NNewStoryboardShot,
  ParsedVideoData,
  ParsedScene,
  ParsedConfig
} from './N8NInterfaces';

export class RawDataParser {
  /**
   * Raw 데이터를 비디오 API 형식으로 변환
   */
  static parseRawData(rawData: any): ParsedVideoData | any {
    console.log('🔍 RawDataParser DEBUG - Received data:', JSON.stringify(rawData, null, 2));
    
    // 1. 새로운 N8N RAW 형식 (format_type 포함)
    if (this.isNewN8NRawFormat(rawData)) {
      console.log('✅ Detected new N8N format, parsing...');
      return this.parseNewN8NRawData(rawData);
    }

    // 2. N8N 타임라인 데이터 (기존)
    if (this.isN8NTimeline(rawData)) {
      return this.parseN8NTimelineData(rawData);
    }

    // 3. 간단한 스토리보드 형식 (scenes 배열 포함)
    if (this.isSimpleStoryboardFormat(rawData)) {
      console.log('✅ Detected simple storyboard format, parsing...');
      return this.parseSimpleStoryboardData(rawData);
    }

    // 4. Shot 기반 형식 (shot, audio.narration, image_prompt 포함)
    if (this.isShotBasedFormat(rawData)) {
      console.log('✅ Detected shot-based format, parsing...');
      return this.parseShotBasedData(rawData);
    }

    // 5. N8N 스토리보드 데이터 (기존)
    if (this.isN8NStoryboard(rawData)) {
      return this.parseN8NStoryboardData(rawData);
    }

    // 6. 간단한 API 형식 (text, imagePrompt, voiceId 포함)
    if (this.isSimpleAPIFormat(rawData)) {
      console.log('✅ Detected simple API format, parsing...');
      return this.parseSimpleAPIData(rawData);
    }

    // 7. 이미 올바른 형식
    if (this.isValidAPIFormat(rawData)) {
      return rawData;
    }

    // 8. 그 외는 에러
    throw new Error('Unsupported data format');
  }

  /**
   * 새로운 N8N RAW 형식인지 확인 (format_type 포함)
   */
  private static isNewN8NRawFormat(data: any): data is N8NNewRawData | N8NNewRawData[] {
    const target = Array.isArray(data) ? data[0] : data;
    
    const hasFormatType = target && typeof target === 'object' && 'format_type' in target;
    const hasContent = 'timeline' in target || 'time_context' in target || 'storyboard' in target;
    const hasTitle = 'title' in target;
    const hasVideoConfig = 'video_config' in target;
    const hasElevenLabsConfig = 'elevenlabs_config' in target;
    
    console.log('🔍 Format detection:', {
      hasFormatType,
      hasContent,
      hasTitle,
      hasVideoConfig,
      hasElevenLabsConfig,
      formatType: target?.format_type,
      isArray: Array.isArray(data)
    });
    
    return target && 
           typeof target === 'object' && 
           hasFormatType &&
           hasContent &&
           hasTitle &&
           hasVideoConfig &&
           hasElevenLabsConfig;
  }

  /**
   * 새로운 N8N RAW 데이터 파싱
   */
  private static parseNewN8NRawData(rawData: N8NNewRawData | N8NNewRawData[]): ParsedVideoData {
    const data: N8NNewRawData = Array.isArray(rawData) ? rawData[0] : rawData;
    
    let scenes: ParsedScene[] = [];
    
    // VEO3 우선순위 처리: veo3_priority가 true이고 storyboard가 있으면 format_type 무시하고 storyboard 사용
    if (data.channel_config?.veo3_priority && data.storyboard && data.storyboard.length > 0) {
      // VEO3 + NANO BANANA 워크플로우 - Storyboard 우선 사용
      scenes = data.storyboard.map((shot: N8NNewStoryboardShot): ParsedScene => ({
        text: shot.audio?.narration || '',
        searchTerms: shot.search_keywords || [],
        duration: shot.duration,
        voiceConfig: {
          voice: data.channel_config?.voice_preference || "af_heart"
        },
        videoPrompt: shot.image_prompt,
        imagePrompt: shot.image_prompt, // For VEO2/3 motion prompt
        needsImageGeneration: true, // VEO3 우선순위이므로 이미지 생성 필요
        imageData: {
          prompt: shot.image_prompt || '',
          style: shot.visual_style || 'cinematic',
          mood: shot.mood || 'dynamic',
          generateMultiple: shot.generate_multiple,
          useConsistency: shot.use_consistency,
          count: shot.image_count,
          numberOfImages: shot.image_count
        }
      }));
    } else if (data.format_type === 'timeline' && (data.timeline?.scenes || data.time_context?.scenes)) {
      // Timeline 형식 처리 (timeline 또는 time_context에서 scenes 추출)
      const timelineData = data.timeline || data.time_context;
      scenes = timelineData!.scenes.map((scene: N8NNewTimelineScene): ParsedScene => ({
        text: scene.text,
        searchTerms: scene.search_keywords || [],
        duration: scene.duration,
        voiceConfig: {
          voice: data.channel_config?.voice_preference || "af_heart"
        },
        // VEO3 우선순위 처리: image_prompt 필드가 있으면 VEO3 사용
        needsImageGeneration: !!(scene.image_prompt && scene.image_prompt.length > 0),
        videoPrompt: scene.image_prompt || this.extractVeo3Prompt(scene.text),
        imagePrompt: scene.image_prompt, // For VEO2/3 motion prompt
        imageData: scene.image_prompt ? {
          prompt: scene.image_prompt,
          style: scene.visual_style || 'cinematic',
          mood: scene.mood || 'dynamic',
          generateMultiple: scene.generate_multiple,
          useConsistency: scene.use_consistency,
          count: scene.image_count,
          numberOfImages: scene.image_count
        } : undefined
      }));
    } else if (data.format_type === 'storyboard' && data.storyboard) {
      // Storyboard 형식 처리 - VEO3 지원
      scenes = data.storyboard.map((shot: N8NNewStoryboardShot): ParsedScene => ({
        text: shot.audio?.narration || '',
        searchTerms: shot.search_keywords || [],
        duration: shot.duration,
        voiceConfig: {
          voice: data.channel_config?.voice_preference || "af_heart"
        },
        videoPrompt: shot.image_prompt,
        // VEO3 사용시 NANO BANANA로 이미지 생성 필요 표시
        needsImageGeneration: !!(shot.image_prompt && shot.image_prompt.length > 0),
        imageData: shot.image_prompt ? {
          prompt: shot.image_prompt,
          style: shot.visual_style || 'cinematic',
          mood: shot.mood || 'dynamic',
          generateMultiple: shot.generate_multiple,
          useConsistency: shot.use_consistency,
          count: shot.image_count,
          numberOfImages: shot.image_count
        } : undefined
      }));
    }

    // Config 설정
    const config: ParsedConfig = {
      orientation: data.video_config?.orientation || 'portrait',
      musicTag: this.mapMusicVolume(data.video_config?.musicVolume),
      quality: data.video_config?.quality || 'high',
      subtitlePosition: data.video_config?.subtitlePosition || 'center',
      // ElevenLabs TTS 설정
      elevenlabs: {
        model_id: data.elevenlabs_config?.model_id || 'eleven_multilingual_v2',
        voice_settings: data.elevenlabs_config?.voice_settings || {
          stability: 0.7,
          similarity_boost: 0.8,
          speed: 1.0,
          style: 'narration'
        },
        output_format: data.elevenlabs_config?.output_format || 'mp3'
      },
      // VEO3 우선순위 설정
      useVeo3: data.channel_config?.veo3_priority || false
    };

    return {
      scenes,
      config,
      metadata: {
        title: data.title,
        category: data.topic_category,
        language: data.target_language,
        channel_type: data.channel_config?.channel_type,
        viral_potential: data.viral_potential,
        format_type: data.format_type,
        totalDuration: scenes.reduce((sum, scene) => sum + (scene.duration || 0), 0),
        sceneCount: scenes.length,
        youtubeUpload: data.youtube_upload
      }
    };
  }

  /**
   * Music volume을 tag로 매핑
   */
  private static mapMusicVolume(volume?: string): string {
    const volumeMap: Record<string, string> = {
      'low': 'calm',
      'medium': 'happy', 
      'high': 'upbeat'
    };
    return volumeMap[volume || 'medium'] || 'happy';
  }

  /**
   * Timeline text에서 VEO3 프롬프트가 있는지 확인
   */
  private static hasVeo3Prompt(text: string): boolean {
    return text.includes('이미지 프롬프트(VEO3용):') || 
           text.includes('비주얼:') ||
           text.includes('extreme close-up') ||
           text.includes('tracking shot') ||
           text.includes('cinematic');
  }

  /**
   * Timeline text에서 VEO3 프롬프트 추출
   */
  private static extractVeo3Prompt(text: string): string {
    // "이미지 프롬프트(VEO3용):" 이후의 텍스트 추출
    const veo3Match = text.match(/이미지 프롬프트\(VEO3용\):\s*["""]([^"""]+)["""]/);
    if (veo3Match) {
      return veo3Match[1].trim();
    }

    // "비주얼:" 이후에서 "감정 트리거" 이전까지 추출
    const visualMatch = text.match(/비주얼:\s*([^.]*(?:extreme close-up|tracking shot|cinematic)[^.]*)/i);
    if (visualMatch) {
      return visualMatch[1].trim();
    }

    // 기본적으로 cinematic 키워드가 포함된 부분 추출
    const cinematicMatch = text.match(/([^.]*(?:extreme close-up|tracking shot|shallow depth of field|cinematic)[^.]*)/i);
    if (cinematicMatch) {
      return cinematicMatch[1].trim();
    }

    return text.substring(0, 200); // fallback
  }

  /**
   * Timeline text에서 visual style 추출
   */
  private static extractVisualStyle(text: string): string {
    const styleKeywords = [
      'extreme close-up', 'close-up', 'wide shot', 'tracking shot', 
      'drone overhead', 'macro', 'medium shot', 'dutch angle'
    ];
    
    for (const keyword of styleKeywords) {
      if (text.toLowerCase().includes(keyword.toLowerCase())) {
        return keyword;
      }
    }
    
    return 'close-up'; // default
  }

  /**
   * Timeline text에서 mood 추출
   */
  private static extractMood(text: string): string {
    const moodKeywords = [
      'urgent', 'dramatic', 'professional', 'cinematic', 'warm', 
      'friendly', 'inspiring', 'confident', 'energetic', 'calming'
    ];
    
    for (const keyword of moodKeywords) {
      if (text.toLowerCase().includes(keyword.toLowerCase())) {
        return keyword;
      }
    }
    
    // 감정 트리거에서 추출
    const emotionMatch = text.match(/감정 트리거[:\s]*['""]?([^'"".]*)['""]?/);
    if (emotionMatch) {
      return emotionMatch[1].trim();
    }
    
    return 'professional'; // default
  }

  /**
   * N8N 타임라인 데이터인지 확인
   */
  private static isN8NTimeline(data: any): data is N8NTimelineRawData[] | N8NTimelineRawData {
    // 배열이면 첫 번째 요소 확인
    const target = Array.isArray(data) ? data[0] : data;
    
    return target && 
           typeof target === 'object' && 
           'timeline_json' in target && 
           typeof target.timeline_json === 'string' &&
           'timeline_title' in target &&
           typeof target.timeline_title === 'string';
  }

  /**
   * N8N 스토리보드 데이터인지 확인
   */
  private static isN8NStoryboard(data: any): data is N8NStoryboardRawData[] | N8NStoryboardRawData {
    // 배열이면 첫 번째 요소 확인
    const target = Array.isArray(data) ? data[0] : data;
    
    return target && 
           typeof target === 'object' && 
           'storyboard_json' in target && 
           typeof target.storyboard_json === 'string' &&
           'storyboard_title' in target &&
           typeof target.storyboard_title === 'string';
  }

  /**
   * 간단한 API 형식인지 확인 (단일 씬, text/imagePrompt/voiceId)
   */
  private static isSimpleAPIFormat(data: any): boolean {
    return data &&
           typeof data === 'object' &&
           'text' in data &&
           !Array.isArray(data) &&
           !('scenes' in data) &&
           !('timeline_json' in data) &&
           !('storyboard_json' in data) &&
           !('format_type' in data);
  }

  /**
   * 간단한 API 데이터 파싱 (text, imagePrompt, voiceId → ParsedVideoData)
   */
  private static parseSimpleAPIData(rawData: any): ParsedVideoData {
    const scene: ParsedScene = {
      text: rawData.text || '',
      searchTerms: rawData.searchTerms || rawData.query?.split(' ') || [],
      duration: rawData.duration || 5,
      voiceConfig: {
        voice: rawData.voiceId || rawData.voice || "af_heart"
      },
      videoPrompt: rawData.imagePrompt || rawData.videoPrompt || rawData.prompt,
      needsImageGeneration: !!(rawData.imagePrompt || rawData.videoPrompt || rawData.prompt),
      imageData: (rawData.imagePrompt || rawData.videoPrompt || rawData.prompt) ? {
        prompt: rawData.imagePrompt || rawData.videoPrompt || rawData.prompt,
        style: rawData.style || 'cinematic',
        mood: rawData.mood || 'dynamic'
      } : undefined
    };

    const config: ParsedConfig = {
      orientation: rawData.orientation || 'portrait',
      musicTag: rawData.musicTag || 'happy'
    };

    return {
      scenes: [scene],
      config,
      metadata: {
        title: rawData.title || 'Simple API Video',
        totalDuration: scene.duration || 5,
        sceneCount: 1
      }
    };
  }

  /**
   * 이미 올바른 API 형식인지 확인
   */
  private static isValidAPIFormat(data: any): boolean {
    return data &&
           typeof data === 'object' &&
           'scenes' in data &&
           Array.isArray(data.scenes) &&
           'config' in data;
  }

  /**
   * N8N 타임라인 데이터 파싱 - 전체 구조를 보존하여 파싱
   */
  private static parseN8NTimelineData(rawData: N8NTimelineRawData[] | N8NTimelineRawData): ParsedVideoData {
    const data: N8NTimelineRawData = Array.isArray(rawData) ? rawData[0] : rawData;
    
    // JSON 문자열 파싱
    const timelineData: N8NTimelineData = JSON.parse(data.timeline_json);
    const configData: N8NTimelineConfig = data.timeline_config ? 
      JSON.parse(data.timeline_config) : 
      { timeline: { orientation: 'portrait' } };

    // 장면별로 상세 정보 추출
    const scenes: ParsedScene[] = timelineData.timeline.scenes.map((scene: N8NScene) => {
      const narrationElements = scene.elements.filter((el): el is Extract<N8NElement, { type: 'narration' }> => 
        el.type === 'narration'
      );
      
      const videoElements = scene.elements.filter((el): el is Extract<N8NElement, { type: 'video' }> => 
        el.type === 'video'
      );
      
      const textOverlayElements = scene.elements.filter((el): el is Extract<N8NElement, { type: 'text_overlay' }> => 
        el.type === 'text_overlay'
      );

      // 내레이션 텍스트 결합
      const narrationTexts = narrationElements.map(el => el.text);
      const combinedText = narrationTexts.join(' ');
      
      // 음성 설정 (첫 번째 내레이션의 voice 사용)
      const voiceConfig = {
        voice: narrationElements[0]?.voice || "af_heart"
      };

      // 비디오 검색어 및 프롬프트
      const allSearchTerms: string[] = [];
      let videoPrompt = '';
      
      videoElements.forEach(videoEl => {
        if (videoEl.searchTerms) {
          allSearchTerms.push(...videoEl.searchTerms);
        }
        if (videoEl.prompt && !videoPrompt) {
          videoPrompt = videoEl.prompt; // 첫 번째 프롬프트 사용
        }
      });

      // 텍스트 오버레이
      const textOverlays = textOverlayElements.map(overlay => ({
        content: overlay.content,
        style: overlay.style,
        position: overlay.position,
        timing: overlay.timing
      }));

      return {
        text: combinedText,
        searchTerms: [...new Set(allSearchTerms)],
        voiceConfig,
        duration: scene.duration,
        videoPrompt: videoPrompt || undefined,
        textOverlays: textOverlays.length > 0 ? textOverlays : undefined
      };
    });

    // 설정 파싱
    const config: ParsedConfig = {
      orientation: configData.timeline.orientation || 'portrait',
      musicTag: this.mapMusicToTag(timelineData.timeline.soundtrack?.music),
      quality: configData.timeline.quality,
      style: configData.timeline.style,
      soundtrack: timelineData.timeline.soundtrack ? {
        music: timelineData.timeline.soundtrack.music,
        volume: timelineData.timeline.soundtrack.volume,
        fade: timelineData.timeline.soundtrack.fade
      } : undefined
    };

    // 메타데이터
    const totalDuration = timelineData.timeline.scenes.reduce((sum, scene) => sum + scene.duration, 0);
    
    return {
      scenes,
      config,
      metadata: {
        title: data.timeline_title,
        totalDuration,
        sceneCount: scenes.length,
        originalStyle: configData.timeline.style
      }
    };
  }

  /**
   * N8N 스토리보드 데이터 파싱 - 샷별로 파싱하여 장면으로 변환
   */
  private static parseN8NStoryboardData(rawData: N8NStoryboardRawData[] | N8NStoryboardRawData): ParsedVideoData {
    const data: N8NStoryboardRawData = Array.isArray(rawData) ? rawData[0] : rawData;
    
    // JSON 문자열 파싱
    const storyboardData: N8NStoryboardData = JSON.parse(data.storyboard_json);
    const configData: N8NStoryboardConfig = data.storyboard_config ? 
      JSON.parse(data.storyboard_config) : 
      { storyboard: { orientation: 'portrait' } };

    // 각 샷을 장면으로 변환
    const scenes: ParsedScene[] = storyboardData.storyboard.map((shot: N8NStoryboardShot) => {
      // 내레이션 텍스트
      const text = shot.audio.narration;
      
      // 음성 설정 (기본값 사용)
      const voiceConfig = {
        voice: "af_heart" // 스토리보드에는 voice 정보가 없으므로 기본값 사용
      };

      // 비디오 프롬프트에서 검색어 추출
      // 프롬프트에서 핵심 키워드를 추출하거나, 기본 검색어 생성
      const searchTerms = this.extractSearchTermsFromPrompt(shot.video.prompt);

      // 텍스트 오버레이 정보
      const textOverlays = [{
        content: shot.text.title,
        style: shot.text.animation || 'fade_in',
        position: shot.text.position,
        timing: { start: 0, end: shot.duration / 2 }
      }];

      // 부제목이 있으면 추가
      if (shot.text.subtitle) {
        textOverlays.push({
          content: shot.text.subtitle,
          style: shot.text.animation || 'fade_in',
          position: shot.text.position,
          timing: { start: shot.duration / 3, end: shot.duration }
        });
      }

      return {
        text,
        searchTerms,
        voiceConfig,
        duration: shot.duration,
        videoPrompt: shot.video.prompt,
        textOverlays
      };
    });

    // 설정 파싱
    const config: ParsedConfig = {
      orientation: configData.storyboard.orientation || 'portrait',
      musicTag: this.mapBackgroundMusicToTag(storyboardData.storyboard[0]?.audio.background_music),
      quality: configData.storyboard.quality,
      style: configData.storyboard.style
    };

    // 메타데이터
    const totalDuration = storyboardData.storyboard.reduce((sum, shot) => sum + shot.duration, 0);
    
    return {
      scenes,
      config,
      metadata: {
        title: data.storyboard_title,
        totalDuration,
        sceneCount: scenes.length,
        originalStyle: configData.storyboard.style
      }
    };
  }

  /**
   * 비디오 프롬프트에서 검색어 추출
   */
  private static extractSearchTermsFromPrompt(prompt: string): string[] {
    // 간단한 키워드 추출 로직
    // 실제로는 더 정교한 NLP나 키워드 추출 로직을 사용할 수 있음
    const keywords: string[] = [];
    
    // 한국어/영어 키워드 패턴 추출
    const koreanMatches = prompt.match(/[가-힣]+/g) || [];
    const englishMatches = prompt.match(/[a-zA-Z]{3,}/g) || [];
    
    // 상위 몇 개 키워드만 선택
    keywords.push(...koreanMatches.slice(0, 2));
    keywords.push(...englishMatches.slice(0, 3));
    
    // 기본 키워드가 없으면 장르별 기본값
    if (keywords.length === 0) {
      return ['cinematic', 'lifestyle', 'modern'];
    }
    
    return keywords.slice(0, 5); // 최대 5개로 제한
  }

  /**
   * N8N 사운드트랙을 우리 musicTag로 매핑
   */
  private static mapMusicToTag(music?: string): string {
    if (!music) return "happy";
    
    const musicMap: Record<string, string> = {
      'ambient_nostalgia': 'calm',
      'upbeat': 'happy',
      'dramatic': 'epic',
      'soft': 'calm',
      'energetic': 'upbeat'
    };
    
    return musicMap[music] || "happy";
  }

  /**
   * 스토리보드 배경음악을 musicTag로 매핑
   */
  private static mapBackgroundMusicToTag(backgroundMusic?: string): string {
    if (!backgroundMusic) return "happy";
    
    const musicMap: Record<string, string> = {
      'intense': 'epic',
      'suspense': 'epic',
      'uplifting': 'happy',
      'dramatic': 'epic',
      'calm': 'calm',
      'energetic': 'upbeat'
    };
    
    return musicMap[backgroundMusic] || "happy";
  }

  /**
   * 간단한 스토리보드 형식인지 확인 (scenes 배열 포함)
   */
  private static isSimpleStoryboardFormat(data: any): boolean {
    return data && 
           typeof data === 'object' && 
           'scenes' in data && 
           Array.isArray(data.scenes) &&
           data.scenes.length > 0 &&
           // Check if it's not other formats
           !('timeline_id' in data) &&
           !Array.isArray(data);
  }

  /**
   * 간단한 스토리보드 데이터 파싱
   */
  private static parseSimpleStoryboardData(rawData: any): ParsedVideoData {
    const scenes: ParsedScene[] = rawData.scenes.map((scene: any): ParsedScene => ({
      text: scene.text || scene.voiceoverScript || scene.voiceover_script || '',
      searchTerms: scene.searchTerms || scene.search_tags || [],
      duration: scene.duration || 3,
      voiceConfig: {
        voice: rawData.channel_config?.voice_preference || "af_heart"
      },
      videoPrompt: scene.videoPrompt || scene.image_prompt,
      needsImageGeneration: !!(scene.imageData?.prompt || scene.image_prompt || scene.imageDescription),
      imageData: scene.imageData ? {
        prompt: scene.imageData.prompt || scene.image_prompt || scene.imageDescription,
        style: scene.imageData.style || scene.visual_style || 'cinematic',
        mood: scene.imageData.mood || scene.mood || 'dynamic',
        generateMultiple: scene.imageData.generateMultiple || scene.imageData.useConsistency || rawData.useConsistency,
        useConsistency: scene.imageData.useConsistency || scene.imageData.generateMultiple || rawData.useConsistency,
        count: scene.imageData.count || scene.imageData.numberOfImages || 4,
        numberOfImages: scene.imageData.numberOfImages || scene.imageData.count || 4
      } : (scene.image_prompt || scene.imageDescription) ? {
        prompt: scene.image_prompt || scene.imageDescription,
        style: scene.visual_style || 'cinematic',
        mood: scene.mood || 'dynamic'
      } : undefined
    }));

    const config: ParsedConfig = {
      orientation: rawData.orientation || 'portrait',
      musicTag: rawData.music ? 'happy' : 'calm'
    };

    const metadata = {
      title: rawData.title || `Simple Storyboard - ${rawData.scenes.length} scenes`,
      totalDuration: rawData.scenes.reduce((sum: number, scene: any) => sum + (scene.duration || 3), 0),
      sceneCount: rawData.scenes.length,
      format_type: rawData.format_type,
      channel_config: rawData.channel_config,
      useConsistency: rawData.useConsistency
    };

    return {
      scenes,
      config,
      metadata
    };
  }

  /**
   * Shot 기반 형식인지 확인 (shot, audio.narration, image_prompt 포함)
   */
  private static isShotBasedFormat(data: any): boolean {
    if (!Array.isArray(data) || data.length === 0) {
      return false;
    }
    
    const firstShot = data[0];
    return firstShot &&
           typeof firstShot === 'object' &&
           ('shot' in firstShot || 'duration' in firstShot) &&
           'audio' in firstShot &&
           firstShot.audio &&
           'narration' in firstShot.audio &&
           'image_prompt' in firstShot;
  }

  /**
   * Shot 기반 데이터 파싱
   */
  private static parseShotBasedData(rawData: any[]): ParsedVideoData {
    const scenes: ParsedScene[] = rawData.map((shot: any): ParsedScene => ({
      text: shot.audio?.narration || '',
      searchTerms: shot.search_keywords || [],
      duration: shot.duration || 3,
      voiceConfig: {
        voice: "af_heart" // 기본값
      },
      videoPrompt: shot.image_prompt,
      needsImageGeneration: !!shot.image_prompt,
      imageData: shot.image_prompt ? {
        prompt: shot.image_prompt,
        style: shot.visual_style || 'cinematic',
        mood: shot.mood || 'dynamic'
      } : undefined
    }));

    const config: ParsedConfig = {
      orientation: 'portrait', // 기본값
      musicTag: 'happy' // 기본값
    };

    const metadata = {
      title: `Shot-based Video - ${rawData.length} shots`,
      totalDuration: rawData.reduce((sum: number, shot: any) => sum + (shot.duration || 3), 0),
      sceneCount: rawData.length
    };

    return {
      scenes,
      config,
      metadata
    };
  }
}