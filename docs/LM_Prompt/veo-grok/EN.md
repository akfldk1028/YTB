# VEO 3.1 / Grok — Video Conversion Prompts (Copy-Paste)

> NotebookLM 슬라이드(PNG)를 VEO 3.1 또는 Grok으로 영상화할 때 사용

---

## VEO 3.1 Frame-to-Frame

### Owl Entrance (hook)

```
Frame to Frame
A cute owl with glasses slides up from below the frame, looking surprised, then settles into a neutral pose. Dark navy background with teal glow. No music.
```

### Owl Exit (conclusion)

```
Frame to Frame
The owl waves goodbye cheerfully, then a glowing teal question mark appears beside it. Dark navy background. No music.
```

### Formula Assembly

```
Frame to Frame
Geometric shapes and symbols smoothly assemble into the final equation layout. Variables glow in sequence: teal, then coral, then amber. No music.
```

### Diagram Transform

```
Frame to Frame
Scattered visual elements smoothly reorganize into a clear diagram. Connections form as glowing lines between nodes. No music.
```

### Concept Reveal

```
Frame to Frame
Abstract shapes gradually transform into a recognizable real-world object, revealing the concept's everyday application. No music.
```

### Character Emotion (manhwa)

```
Frame to Frame
The character's expression slowly shifts from contemplation to quiet determination. Warm amber lighting intensifies. No music.
```

---

## Ken Burns (단일 이미지 — FFmpeg)

### Zoom In (수식/디테일 강조)

```
Slow zoom into the center of the diagram, emphasizing the highlighted formula. No music.
```

### Zoom Out (전체 구도 공개)

```
Slow zoom out revealing the complete composition and all connected elements. No music.
```

### Pan Right (타임라인/순서)

```
Slow pan from left to right, following the progression of steps. No music.
```

### Pan Left (회고/역순)

```
Slow pan from right to left, retracing the sequence. No music.
```

### Tilt Up (스케일/성장)

```
Camera slowly tilts upward, revealing the scale of the concept. No music.
```

---

## Grok (xAI 마이크로 모션)

### Hook Scene

```
Animate with subtle micro-movements. Dramatic reveal with slight upward camera tilt. Particles or glow elements drift across the frame. Duration: 5 seconds. Smooth, cinematic.
```

### Explanation Scene

```
Animate with subtle micro-movements. Gentle zoom with parallax effect. Background layer moves slower than foreground elements. Duration: 5 seconds. Smooth, cinematic.
```

### Formula Scene

```
Animate with subtle micro-movements. Mathematical symbols pulse with subtle glow. Camera slowly pushes in toward the central equation. Duration: 5 seconds. Smooth, cinematic.
```

### Conclusion Scene

```
Animate with subtle micro-movements. Soft pull-back revealing the full composition. Warm lighting gradually increases. Duration: 5 seconds. Smooth, cinematic.
```

---

## Pipeline Reference

| Scene Type | 1st Choice | 2nd (fallback) | 3rd (fallback) |
|------------|-----------|----------------|-----------------|
| hook (owl) | Manim animation | VEO 3.1 F2F | Ken Burns |
| conclusion (owl) | Manim animation | VEO 3.1 F2F | Ken Burns |
| formula | Ken Burns + MathJax | VEO 3.1 F2F | Grok |
| explanation | Ken Burns | Grok | Static |

## Cost

| Method | $/scene | Quality | Speed |
|--------|---------|---------|-------|
| VEO 3.1 F2F | ~$0.15 | Best | ~30s |
| Grok (xAI) | ~$0.05 | Good | ~15s |
| Ken Burns (FFmpeg) | $0 | OK | ~3s |
| Manim (owl) | $0 | Good | ~3s |
