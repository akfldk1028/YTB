/**
 * Image Generation Interface
 * 모든 이미지 생성 모델이 구현해야 하는 인터페이스
 */

export interface ImageGenerationOptions {
  prompt: string;
  style?: string;
  mood?: string;
  numberOfImages?: number;
  size?: '256x256' | '512x512' | '1024x1024' | '1024x1536' | '1536x1024' | '4096x4096';
  quality?: 'standard' | 'hd' | 'low' | 'medium' | 'high' | 'auto';
}

export interface ImageGenerationResult {
  success: boolean;
  imagePath?: string; // DEPRECATED: 하위 호환성을 위해 유지
  buffer?: Buffer; // NEW: 이미지 Buffer (메모리 효율적)
  imageUrl?: string;
  base64?: string;
  error?: string;
  model: string;
  timestamp: number;
}

/**
 * 이미지 생성 모델 인터페이스
 */
export interface IImageGenerator {
  /**
   * 모델 이름
   */
  readonly modelName: string;

  /**
   * 이미지 생성
   */
  generateImage(options: ImageGenerationOptions): Promise<ImageGenerationResult>;

  /**
   * 여러 이미지 생성
   */
  generateImages(options: ImageGenerationOptions): Promise<ImageGenerationResult[]>;

  /**
   * 모델 상태 확인
   */
  isAvailable(): Promise<boolean>;
}
