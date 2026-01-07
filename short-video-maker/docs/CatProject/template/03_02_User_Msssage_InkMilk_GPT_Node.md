Create an episode for: **{{ $json.series_name }}**

---

## Series Info
- **Mood**: {{ $json.series_mood }}
- **Description**: {{ $json.series_description }}

## Pick ONE Theme
{{ $json.series_themes.join(", ") }}

---

## REMINDER: Story Must Have Conflict!

**Structure**: Setup → Small Conflict → Funny Resolution

**Character Roles**:
- **Kami**: Lazy/forgetful husband who means well
- **Dalgi**: Nagging but loving wife who sighs at Kami

**NO perfect happy stories. Make it relatable!**

---

## Characters (MUST use these exact descriptions in scenePrompt)

**kami** (ID: "kami")
{{ $json.characterDescriptions.kami }}

**dalgi** (ID: "dalgi")
{{ $json.characterDescriptions.dalgi }}

---

## Available SFX Presets

| Preset | Use For |
|--------|---------|
| CAT_MEOW | Surprise, reaction |
| CAT_PURR | Relaxation, happy |
| CAT_HISS | Anger, fear |
| WHOOSH | Fast movement |
| POP | Appearance, idea |
| MAGIC | Sparkle moment |
| SUCCESS | Happy ending |
| FAIL | Mistake |
| LAUGH | Comedy peak |
| GASP | Shock |
| AWW | Cute moment |
| DOOR | Door sound |
| FOOTSTEPS | Sneaking |
| CLOCK | Tension |

---

## Requirements Checklist
- 3-5 scenes following proper story structure (Setup → Build-up → Punchline)
- **ALWAYS 8 seconds per scene** (VEO 3.1 Frame Interpolation requirement)
- Total duration: 24-40 seconds (3-5 scenes × 8s)
- scenePrompt: Include character clothes, action, expression, background, "3D Pixar animation style"
- SFX: Place at impact moments (Scene 1: ~2s, Scene 2: ~10s, Scene 3: ~18s)
- text & textEnglish: Same short English subtitle (3-8 words)

---

Generate the JSON now. Output ONLY valid JSON, no explanation.
