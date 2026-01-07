# PoliticsProject - YouTube to Shorts Converter

YouTube 영상을 자동으로 Shorts 3개로 변환하는 시스템.

## 기능

- YouTube URL 입력 → Shorts 3개 자동 생성
- AI 기반 하이라이트 구간 선택 (30~60초)
- 세로 영상 (9:16) 자동 변환
- 자막 자동 합성

## 사용법

```bash
# API 호출
POST /api/video/youtube-to-shorts
{
  "youtubeUrl": "https://youtube.com/watch?v=VIDEO_ID"
}
```

## 파이프라인

```
YouTube URL → 다운로드 → 자막 파싱 → AI 분석 → 크롭 → 자막 합성 → Shorts 완성
```

## 폴더 구조

```
politics-project/
├── src/
│   ├── core/           # 핵심 모듈
│   │   ├── downloader/ # YouTube 다운로드
│   │   ├── parser/     # 자막 파싱
│   │   ├── analyzer/   # AI 하이라이트 분석
│   │   └── processor/  # 영상 처리
│   ├── workflow/       # 파이프라인
│   ├── api/            # API 엔드포인트
│   ├── config/         # 설정
│   ├── utils/          # 유틸리티
│   └── types/          # 공통 타입
├── docs/               # 문서
├── output/             # 다운로드 파일 (git 제외)
└── shorts_final/       # 완성된 Shorts (git 제외)
```

## 필수 도구

- `yt-dlp`: YouTube 영상 다운로드
- `ffmpeg`: 영상 편집

## 문서

- [아키텍처](docs/ARCHITECTURE.md)
- [API 문서](docs/API.md)
- [n8n 연동](docs/N8N.md)
