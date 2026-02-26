"""
올빼미 캐릭터 PNG 생성 스크립트
Gemini 2.5 Flash Image API → 5가지 표정 올빼미 PNG (투명 배경)

Usage:
    python generate_owl_pngs.py

Output: ../characters/owl_{mode}.png (5개)
"""

import os
import sys
import json
import base64
import time
from pathlib import Path

import requests
from PIL import Image
from io import BytesIO

# 경로 설정
SCRIPT_DIR = Path(__file__).parent
CHARACTERS_DIR = SCRIPT_DIR.parent / "characters"
CHARACTERS_DIR.mkdir(parents=True, exist_ok=True)

# API 설정
BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
MODEL_ID = "gemini-2.5-flash-image"  # NanoBanana과 동일 모델


def load_api_key() -> str:
    env_path = SCRIPT_DIR.parent.parent.parent.parent / ".env"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            if line.startswith("GOOGLE_GEMINI_API_KEY="):
                return line.split("=", 1)[1].strip()
    key = os.environ.get("GOOGLE_GEMINI_API_KEY", "")
    if not key:
        raise ValueError("GOOGLE_GEMINI_API_KEY not found in .env or environment")
    return key


# 기본 캐릭터 설명 (일관성 유지)
BASE_CHARACTER = (
    "A cute chibi cartoon owl professor character. "
    "Brown feathers with lighter tan/cream belly. "
    "VERY BIG round amber/golden eyes with large black pupils and white reflections. "
    "Round black-framed glasses. Small orange triangular beak. "
    "Short pointed ear tufts on top of head. Small brown wings. "
    "Kawaii chibi proportions (big head, small body). "
    "Clean digital illustration style, no outlines, soft shading."
)

# 표정별 프롬프트
OWL_PROMPTS = {
    "neutral": (
        f"Generate an image of: {BASE_CHARACTER} "
        "Calm neutral expression, beak closed, wings relaxed at sides. "
        "Looking straight at viewer. Sitting position. "
        "Centered on pure solid black background (#000000). "
        "Full body visible. No text, no other objects, no ground, no shadows on background."
    ),
    "thinking": (
        f"Generate an image of: {BASE_CHARACTER} "
        "Thoughtful thinking expression, eyes looking up and to the left. "
        "One wing raised to chin as if pondering. Beak slightly open. "
        "Centered on pure solid black background (#000000). "
        "Full body visible. No text, no other objects, no ground, no shadows on background."
    ),
    "surprised": (
        f"Generate an image of: {BASE_CHARACTER} "
        "Surprised shocked expression, eyes very wide open, pupils small. "
        "Beak wide open in amazement. Both wings spread out to sides. "
        "Ear tufts standing up tall. "
        "Centered on pure solid black background (#000000). "
        "Full body visible. No text, no other objects, no ground, no shadows on background."
    ),
    "pointing": (
        f"Generate an image of: {BASE_CHARACTER} "
        "Confident teaching expression, looking to the upper right. "
        "Right wing extended upward pointing to the upper right. Left wing at side. "
        "Slight confident smile on beak. "
        "Centered on pure solid black background (#000000). "
        "Full body visible. No text, no other objects, no ground, no shadows on background."
    ),
    "happy": (
        f"Generate an image of: {BASE_CHARACTER} "
        "Very happy joyful expression, eyes curved into happy ^^ shape. "
        "Beak open in a big cheerful smile. Both wings spread wide up in celebration. "
        "Radiating happiness and joy. "
        "Centered on pure solid black background (#000000). "
        "Full body visible. No text, no other objects, no ground, no shadows on background."
    ),
}


def generate_image(api_key: str, prompt: str, mode: str) -> bytes | None:
    """Gemini 2.5 Flash Image로 이미지 생성 (NanoBanana과 동일 방식)"""
    url = f"{BASE_URL}/models/{MODEL_ID}:generateContent"

    payload = {
        "contents": [
            {
                "parts": [{"text": prompt}]
            }
        ],
        "generationConfig": {
            "temperature": 0.7,
            "topK": 40,
            "topP": 0.95,
            "maxOutputTokens": 8192,
        }
    }

    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": api_key,
    }

    print(f"  [{mode}] Calling Gemini 2.5 Flash Image...")
    resp = requests.post(url, json=payload, headers=headers, timeout=120)

    if resp.status_code != 200:
        print(f"  [{mode}] API failed ({resp.status_code}): {resp.text[:300]}")
        return None

    data = resp.json()
    candidates = data.get("candidates", [])
    if not candidates:
        print(f"  [{mode}] No candidates returned")
        return None

    parts = candidates[0].get("content", {}).get("parts", [])
    for part in parts:
        if "inlineData" in part:
            b64_data = part["inlineData"].get("data")
            mime = part["inlineData"].get("mimeType", "image/png")
            if b64_data:
                print(f"  [{mode}] Image received ({mime})")
                return base64.b64decode(b64_data)

    # 텍스트만 반환된 경우
    for part in parts:
        if "text" in part:
            print(f"  [{mode}] Got text instead of image: {part['text'][:100]}")
    return None


def remove_dark_background(img_bytes: bytes, threshold: int = 40) -> Image.Image:
    """어두운 배경을 투명으로 변환

    Args:
        img_bytes: 원본 이미지 바이트
        threshold: 검정 판정 임계값 (R, G, B 각각 < threshold → 투명)
    """
    img = Image.open(BytesIO(img_bytes)).convert("RGBA")
    pixels = img.load()
    w, h = img.size

    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if r < threshold and g < threshold and b < threshold:
                pixels[x, y] = (0, 0, 0, 0)

    return img


def crop_to_content(img: Image.Image, padding: int = 10) -> Image.Image:
    """투명이 아닌 영역만 크롭"""
    bbox = img.getbbox()
    if bbox is None:
        return img

    x1, y1, x2, y2 = bbox
    x1 = max(0, x1 - padding)
    y1 = max(0, y1 - padding)
    x2 = min(img.width, x2 + padding)
    y2 = min(img.height, y2 + padding)

    return img.crop((x1, y1, x2, y2))


def main():
    api_key = load_api_key()
    print(f"API key: {api_key[:10]}...")
    print(f"Model: {MODEL_ID}")
    print(f"Output: {CHARACTERS_DIR}")
    print()

    results = {}

    for mode, prompt in OWL_PROMPTS.items():
        print(f"[{mode}] Generating...")

        # 1. 이미지 생성
        img_bytes = generate_image(api_key, prompt, mode)
        if img_bytes is None:
            print(f"  [{mode}] FAILED")
            results[mode] = False
            time.sleep(2)
            continue

        # 2. 원본 저장 (디버그)
        raw_path = CHARACTERS_DIR / f"owl_{mode}_raw.png"
        with open(raw_path, "wb") as f:
            f.write(img_bytes)
        raw_size = len(img_bytes) // 1024
        print(f"  [{mode}] Raw: {raw_path.name} ({raw_size}KB)")

        # 3. 배경 제거 → 투명
        try:
            transparent = remove_dark_background(img_bytes, threshold=40)
            cropped = crop_to_content(transparent, padding=8)

            final_path = CHARACTERS_DIR / f"owl_{mode}.png"
            cropped.save(str(final_path), "PNG")
            final_size = final_path.stat().st_size // 1024
            print(f"  [{mode}] Final: {final_path.name} ({cropped.size[0]}x{cropped.size[1]}, {final_size}KB)")
            results[mode] = True
        except Exception as e:
            print(f"  [{mode}] Post-process error: {e}")
            # 원본 그대로 사용
            final_path = CHARACTERS_DIR / f"owl_{mode}.png"
            with open(final_path, "wb") as f:
                f.write(img_bytes)
            results[mode] = True

        time.sleep(3)  # rate limit

    print()
    print("=== Results ===")
    for mode, success in results.items():
        print(f"  owl_{mode}.png: {'OK' if success else 'FAILED'}")

    ok = sum(1 for v in results.values() if v)
    print(f"\n{ok}/{len(OWL_PROMPTS)} generated")


if __name__ == "__main__":
    main()
