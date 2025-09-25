/**
 * Raw 데이터 파서 - 어떤 형태든 받아서 비디오 API 형식으로 변환
 */

import type { 
  N8NRawData,
  N8NTimelineRawData,
  N8NStoryboardRawData, 
  N8NTimelineData,
  N8NStoryboardData, 
  N8NTimelineConfig,
  N8NStoryboardConfig,
  N8NScene,
  N8NStoryboardShot,
  N8NElement,
  ParsedVideoData,
  ParsedScene,
  ParsedConfig
} from './N8NInterfaces';

export class RawDataParser {
  /**
   * Raw 데이터를 비디오 API 형식으로 변환
   */
  static parseRawData(rawData: any): ParsedVideoData | any {
    // 1. N8N 타임라인 데이터
    if (this.isN8NTimeline(rawData)) {
      return this.parseN8NTimelineData(rawData);
    }

    // 2. N8N 스토리보드 데이터
    if (this.isN8NStoryboard(rawData)) {
      return this.parseN8NStoryboardData(rawData);
    }

    // 3. 이미 올바른 형식
    if (this.isValidAPIFormat(rawData)) {
      return rawData;
    }

    // 4. 그 외는 에러
    throw new Error('Unsupported data format');
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
}