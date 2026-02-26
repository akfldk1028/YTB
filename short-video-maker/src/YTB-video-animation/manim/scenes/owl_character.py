"""
OwlCreature — AI 생성 PNG 기반 귀여운 올빼미 캐릭터 (Manim CE)

Input: mode (neutral/thinking/surprised/pointing/happy)
Output: Group Mobject (PNG ImageMobject — FadeIn, shift, scale, rotate 가능)

PNG 우선, SVG fallback:
- characters/owl_{mode}.png → ImageMobject (고퀄 AI 생성)
- characters/owl_{mode}.svg → SVGMobject (레거시 fallback)

Usage:
    owl = OwlCreature(mode="neutral")
    self.play(FadeIn(owl))
    owl.blink(self)
    owl.change_mode(self, "thinking")
"""

from __future__ import annotations

import os
from pathlib import Path
from manim import *

# 캐릭터 이미지 디렉토리
CHARACTERS_DIR = Path(__file__).parent.parent / "characters"

# 올빼미 표정 모드
OWL_MODES = ("neutral", "thinking", "surprised", "pointing", "happy")


class OwlCreature(Group):
    """PNG 기반 귀여운 올빼미 교수 캐릭터

    ImageMobject(PNG) 사용 → 고퀄리티 AI 생성 이미지
    Group(not VGroup) → ImageMobject 호환

    지원 애니메이션:
    - FadeIn / FadeOut (shift 옵션 포함)
    - .animate.shift() / .animate.scale() / .animate.rotate()
    - FadeTransform (표정 전환)
    - blink (y축 스케일 there_and_back)
    """

    def __init__(self, mode: str = "neutral", **kwargs):
        super().__init__(**kwargs)
        self.mode = mode if mode in OWL_MODES else "neutral"
        self._use_png = False
        self._build()

    def _build(self):
        """PNG 우선 로드, SVG fallback"""
        png_path = CHARACTERS_DIR / f"owl_{self.mode}.png"
        svg_path = CHARACTERS_DIR / f"owl_{self.mode}.svg"
        fallback_png = CHARACTERS_DIR / "owl_neutral.png"
        fallback_svg = CHARACTERS_DIR / "owl_neutral.svg"

        if png_path.exists():
            self.body = ImageMobject(str(png_path))
            self.body.set(width=2.5)
            self._use_png = True
        elif fallback_png.exists():
            self.body = ImageMobject(str(fallback_png))
            self.body.set(width=2.5)
            self._use_png = True
        elif svg_path.exists():
            self.body = SVGMobject(str(svg_path))
            self.body.set(width=2.5)
        elif fallback_svg.exists():
            self.body = SVGMobject(str(fallback_svg))
            self.body.set(width=2.5)
        else:
            # 최후 fallback: 빈 원
            self.body = Circle(radius=1, color=BROWN, fill_opacity=0.8)

        self.add(self.body)

    def blink(self, scene: Scene, duration: float = 0.15):
        """눈 깜빡임 애니메이션 (y축 스케일 there_and_back)"""
        scene.play(
            self.body.animate.stretch(0.85, dim=1),
            run_time=duration,
            rate_func=there_and_back,
        )

    def look_at(self, target) -> Animation:
        """타겟 방향으로 살짝 기울이기"""
        if isinstance(target, Mobject):
            direction = target.get_center() - self.get_center()
        else:
            direction = np.array(target) - self.get_center()

        angle = np.arctan2(direction[1], direction[0])
        tilt = np.clip(angle, -PI / 18, PI / 18)
        return self.animate.rotate(tilt, about_point=self.get_bottom())

    def change_mode(self, scene: Scene, new_mode: str, duration: float = 0.3):
        """표정 변경 (FadeTransform 트랜지션)

        새 PNG 로드 → 위치/크기 맞춤 → FadeTransform
        """
        if new_mode == self.mode:
            return

        new_owl = OwlCreature(mode=new_mode)
        new_owl.match_width(self)
        new_owl.move_to(self)

        scene.play(
            FadeTransform(self.body, new_owl.body),
            run_time=duration,
        )

        # 내부 상태 교체
        self.remove(self.body)
        self.body = new_owl.body
        self.add(self.body)
        self.mode = new_mode

    def wave(self, scene: Scene, duration: float = 0.5):
        """날개 흔들기 인사 애니메이션"""
        scene.play(
            Wiggle(self, scale_value=1.05, rotation_angle=0.05 * TAU),
            run_time=duration,
        )

    def nod(self, scene: Scene, duration: float = 0.3):
        """고개 끄덕임"""
        scene.play(
            self.animate.shift(DOWN * 0.1),
            run_time=duration / 2,
            rate_func=there_and_back,
        )

    def bounce(self, scene: Scene, height: float = 0.2, duration: float = 0.3):
        """통통 튀는 애니메이션"""
        scene.play(
            self.animate.shift(UP * height),
            run_time=duration / 2,
            rate_func=there_and_back,
        )
