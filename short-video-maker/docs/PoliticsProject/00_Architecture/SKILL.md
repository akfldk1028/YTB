# /shorts

유튜브 URL을 입력받아 쇼츠 영상 3개를 만드는 스킬입니다.

## 사용법

```
/shorts https://youtube.com/watch?v=영상ID
```

## 실행 순서

1. **영상 다운로드**: yt-dlp를 사용하여 `output/` 폴더에 영상 다운로드
2. **자막 생성**: yt-dlp로 자막도 함께 다운로드 (없으면 whisper 사용)
3. **하이라이트 분석**: `video_analyzer.md` 서브에이전트를 호출하여 쇼츠로 만들기 좋은 구간 3개 선택
4. **세로 영상 추출**: FFmpeg로 9:16 비율(1080x1920) 클립 추출
5. **자막 합성**: 클립에 자막 오버레이

## 사용 도구

- `yt-dlp`: 유튜브 영상 및 자막 다운로드
- `ffmpeg`: 영상 편집, 크롭, 자막 합성

## 자막 스타일

- **제목**: 상단 배치, 노란색(#FFFF00), 100pt, 굵게
- **본문 자막**: 하단 배치, 흰색(#FFFFFF), 74pt

## 작업 단계별 명령어

### 1. 영상 다운로드
```bash
yt-dlp -f "bestvideo[height<=1080]+bestaudio/best[height<=1080]" \
  --merge-output-format mp4 \
  --write-auto-sub --sub-lang ko,en \
  --convert-subs srt \
  -o "output/%(title)s.%(ext)s" \
  "유튜브URL"
```

### 2. 자막 파일 확인
- `output/` 폴더에서 `.srt` 파일 확인
- 자막이 없으면 whisper로 생성 가능

### 3. 서브에이전트 호출
`video_analyzer.md` 에이전트에게 자막 파일을 전달하여 하이라이트 3개 선택

### 4. 세로 영상 클립 추출
```bash
ffmpeg -i "input.mp4" -ss 시작시간 -t 길이 \
  -vf "crop=ih*9/16:ih,scale=1080:1920" \
  -c:v libx264 -c:a aac \
  "output_clip.mp4"
```

### 5. 자막 합성
```bash
ffmpeg -i "clip.mp4" \
  -vf "subtitles=subtitle.srt:force_style='FontSize=74,PrimaryColour=&HFFFFFF,Alignment=2,MarginV=100'" \
  -c:v libx264 -c:a copy \
  "shorts_final/short_1.mp4"
```

## 결과물

`shorts_final/` 폴더에 3개의 쇼츠 영상 저장:
- `short_1.mp4`
- `short_2.mp4`
- `short_3.mp4`

## 주의사항

- 영상 길이는 30~60초로 제한
- 세로 화면에서 중요한 부분이 잘리지 않도록 확인
- 자막은 가독성 있게 배치
