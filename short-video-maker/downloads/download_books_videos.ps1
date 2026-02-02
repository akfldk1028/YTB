$baseUrl = "https://short-video-maker-550996044521.us-central1.run.app/api/books/download"
$downloadDir = "D:\Data\00_Personal\YTB\short-video-maker\downloads\books"

# Completed episodes video IDs (extracted from API response)
$videos = @(
    @{id="book_AR_TALK.pdf_short_0_lh006jb"; name="01_episode1_avatar_realtime"},
    @{id="book_AR_TALK.pdf_short_1_nf006yw"; name="02_episode2_facediffuser"},
    @{id="book_AR_TALK.pdf_short_2_iv006uz"; name="03_episode3_motion"},
    @{id="book_AR_TALK.pdf_short_5_jz00658"; name="06_episode6_facediffuser"},
    @{id="book_AR_TALK.pdf_short_6_nr006ie"; name="07_episode7_motion"},
    @{id="book_AR_TALK.pdf_short_15_8e0067m"; name="16_episode16_facediffuser"},
    @{id="book_AR_TALK.pdf_short_16_950060k"; name="17_episode17_3d_face"},
    @{id="book_AR_TALK.pdf_short_17_xa006ex"; name="18_episode18_motion_predict"},
    @{id="book_AR_TALK.pdf_short_18_6w206jn"; name="19_episode19_ai_face"}
)

Write-Host "Downloading $($videos.Count) videos to $downloadDir" -ForegroundColor Cyan

foreach ($video in $videos) {
    $url = "$baseUrl/$($video.id)"
    $outputFile = Join-Path $downloadDir "$($video.name).mp4"

    Write-Host "Downloading: $($video.name)..." -ForegroundColor Yellow

    try {
        Invoke-WebRequest -Uri $url -OutFile $outputFile -UseBasicParsing
        $size = (Get-Item $outputFile).Length / 1MB
        Write-Host "  OK: $([math]::Round($size, 2)) MB" -ForegroundColor Green
    } catch {
        Write-Host "  FAILED: $_" -ForegroundColor Red
    }
}

Write-Host "`nDownload complete! Check: $downloadDir" -ForegroundColor Cyan
