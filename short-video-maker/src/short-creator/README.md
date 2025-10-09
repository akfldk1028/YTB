# ShortCreator Refactored Architecture

이 디렉토리는 기존의 1600줄 거대한 `ShortCreator.ts` 파일을 유지보수 가능한 모듈화된 구조로 리팩토링한 결과입니다.

## 🏗️ 폴더 구조

```
src/short-creator/
├── ShortCreator.ts              # 기존 레거시 클래스 (호환성 유지)
├── ShortCreatorRefactored.ts    # 새로운 모듈화된 구현
├── index.ts                     # 통합 export
├── queue/                       # 비디오 처리 큐 관리
│   ├── VideoQueue.ts
│   └── QueueItem.ts
├── video-sources/               # 비디오 소스별 처리
│   ├── BaseVideoSource.ts
│   ├── PexelsVideoSource.ts
│   ├── VeoVideoSource.ts
│   ├── LeonardoVideoSource.ts
│   └── NanoBananaVideoSource.ts
├── workflows/                   # 씬 처리 워크플로우
│   ├── BaseWorkflow.ts
│   ├── SingleSceneWorkflow.ts
│   ├── MultiSceneWorkflow.ts
│   └── NanoBananaStaticWorkflow.ts
├── processors/                  # 오디오/비디오 처리
│   ├── AudioProcessor.ts
│   └── VideoProcessor.ts
├── managers/                    # 상태/파일/콜백 관리
│   ├── StatusManager.ts
│   ├── CallbackManager.ts
│   └── FileManager.ts
├── utils/                       # 유틸리티
│   ├── Constants.ts
│   └── ErrorHandler.ts
└── libraries/                   # 기존 라이브러리 (변경 없음)
```

## 🎯 리팩토링 목적

### 문제점
- **거대한 단일 파일**: 1664줄의 ShortCreator.ts
- **단일 책임 원칙 위반**: 큐 관리, 비디오 생성, 오디오 처리, 파일 관리 등 모든 것이 한 클래스에
- **테스트 어려움**: 모듈이 분리되지 않아 유닛 테스트 작성 곤란
- **확장성 부족**: 새로운 비디오 소스 추가 시 전체 클래스 수정 필요

### 해결책
- **모듈화**: 기능별로 독립된 모듈 분리
- **단일 책임**: 각 클래스가 하나의 명확한 책임만 담당
- **의존성 주입**: 생성자를 통한 의존성 관리
- **인터페이스 추상화**: 구현체 교체 가능한 설계

## 🔧 사용법

### 기존 코드 (호환성 유지)
```typescript
import { ShortCreator } from './short-creator';
// 기존 코드 그대로 사용 가능
```

### 새로운 모듈화된 버전
```typescript
import { ShortCreatorRefactored } from './short-creator';
// 동일한 API, 내부 구조만 모듈화됨
```

### 개별 모듈 사용
```typescript
import { 
  VideoQueue, 
  PexelsVideoSource, 
  SingleSceneWorkflow,
  StatusManager 
} from './short-creator';

// 필요한 모듈만 선택적으로 사용
```

## 📋 주요 개선사항

### 1. 비디오 소스 추상화
- `BaseVideoSource` 추상 클래스
- 각 소스별 독립된 구현체 (Pexels, Veo, Leonardo, NanoBanana)
- 새로운 소스 추가 시 기존 코드 변경 없음

### 2. 워크플로우 분리
- `BaseWorkflow` 추상 클래스
- 단일 씬, 멀티 씬, NANO BANANA 정적 워크플로우 분리
- 각 워크플로우별 최적화된 처리 로직

### 3. 프로세서 모듈화
- `AudioProcessor`: TTS, Whisper, 자막 생성
- `VideoProcessor`: FFmpeg 처리, 씬 결합, 자막 추가

### 4. 관리자 모듈화
- `StatusManager`: 비디오 상태 관리
- `CallbackManager`: N8N 콜백 처리
- `FileManager`: 파일 다운로드, 정리

### 5. 유틸리티 분리
- `Constants`: 상수 정의
- `ErrorHandler`: 에러 분류 및 처리

## 🧪 테스트 전략

각 모듈이 독립적으로 테스트 가능:

```typescript
// 비디오 소스 테스트
const pexelsSource = new PexelsVideoSource(mockPexelsApi);
await pexelsSource.findVideo(testParams);

// 워크플로우 테스트
const workflow = new SingleSceneWorkflow(mockVideoProcessor);
await workflow.process(testScenes, testContext);

// 프로세서 테스트
const audioProcessor = new AudioProcessor(mockTTS, mockWhisper, mockFFmpeg);
await audioProcessor.generateTTSAudio(testText);
```

## 🚀 마이그레이션 가이드

### 1단계: 병렬 운영
- 기존 `ShortCreator`와 새로운 `ShortCreatorRefactored` 동시 지원
- 점진적으로 새 버전으로 전환

### 2단계: 기능 검증
- 모든 기존 테스트가 새 버전에서 통과하는지 확인
- 성능 및 메모리 사용량 비교

### 3단계: 완전 전환
- 모든 코드가 새 버전 사용으로 전환된 후 레거시 제거

## 🎉 기대 효과

1. **유지보수성 향상**: 각 모듈의 역할이 명확하여 수정/확장 용이
2. **테스트 가능성**: 각 모듈을 독립적으로 테스트 가능
3. **확장성**: 새로운 비디오 소스나 워크플로우 추가 간단
4. **재사용성**: 개별 모듈을 다른 프로젝트에서 재사용 가능
5. **코드 가독성**: 각 파일의 크기가 작아져 이해하기 쉬움

## 📝 주의사항

- 기존 API 호환성 유지
- 모든 기존 기능 동일하게 작동
- 점진적 마이그레이션으로 위험 최소화
- 충분한 테스트 후 전환 권장