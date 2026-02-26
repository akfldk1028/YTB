"""
FormulaScene — 수식 + 올빼미 = 3B1B 스타일 교육 씬 (Manim CE)

Input (환경변수 MANIM_SCENE_CONFIG JSON):
    bg_path: 배경 이미지 경로 (NanoBanana 결과)
    latex: LaTeX 수식 문자열
    formula_png_path: MathFormulaService가 렌더링한 수식 PNG 경로 (우선)
    duration: 목표 길이 (초)
    owl_mode: 올빼미 초기 표정 (neutral/thinking/surprised/pointing/happy)
    scene_type: 씬 타입 (hook/explanation/formula/conclusion)
    aspect_ratio: 화면비 (9:16 = portrait, 16:9 = landscape)

Output: MP4 비디오 (올빼미 + 수식 애니메이션)

9:16 좌표계:
    frame_width=9, frame_height=16
    X: -4.5 ~ 4.5
    Y: -8 ~ 8
    올빼미 width=2.5 기준, scale 1.5 = 3.75 units (≈42% 프레임 너비)

수식 렌더링 우선순위:
    1. formula_png_path (MathFormulaService MathJax → PNG) — ImageMobject
    2. MathTex (로컬 LaTeX 설치 필요) — Write 애니메이션
    3. Text fallback (평문) — FadeIn
"""

from __future__ import annotations

import sys
import json
import os
from pathlib import Path

from manim import *

# owl_character.py 임포트 (같은 디렉토리)
sys.path.insert(0, str(Path(__file__).parent))
from owl_character import OwlCreature


def parse_config() -> dict:
    """환경변수에서 씬 설정 파싱"""
    config_json = os.environ.get("MANIM_SCENE_CONFIG", "{}")
    try:
        return json.loads(config_json)
    except json.JSONDecodeError:
        return {}


class DynamicScene(Scene):
    """동적 씬 — ManimVideoProvider에서 config를 주입받아 실행

    씬 타입별 분기:
    - formula: 수식 + 올빼미 pointing (올빼미 하단, 수식 상단)
    - hook: 올빼미 surprised → neutral (중앙에서 크게)
    - explanation: 올빼미 neutral + 텍스트 (하단 좌측)
    - conclusion: 올빼미 happy + wave (중앙에서 크게)
    """

    def construct(self):
        cfg = parse_config()

        bg_path = cfg.get("bg_path")
        latex = cfg.get("latex", "")
        formula_png_path = cfg.get("formula_png_path", "")
        duration = float(cfg.get("duration", 6))
        owl_mode = cfg.get("owl_mode", "neutral")
        scene_type = cfg.get("scene_type", "explanation")
        aspect_ratio = cfg.get("aspect_ratio", "9:16")

        # 프레임 좌표계 설정 (해상도는 CLI -r로 전달)
        if aspect_ratio == "9:16":
            config.frame_width = 9
            config.frame_height = 16
        else:
            config.frame_width = 16
            config.frame_height = 9

        # 1. 배경 이미지 로드
        if bg_path and os.path.exists(bg_path):
            bg = ImageMobject(bg_path)
            bg.height = config.frame_height
            bg.width = config.frame_width
            self.add(bg)
        else:
            # 기본 어두운 배경 (math_character 스타일)
            bg_rect = Rectangle(
                width=config.frame_width + 1,
                height=config.frame_height + 1,
                fill_color="#0D1B2A",
                fill_opacity=1,
                stroke_width=0,
            )
            self.add(bg_rect)

        # 2. 씬 타입별 애니메이션
        if scene_type == "formula" and (latex or formula_png_path):
            self._build_formula_scene(latex, formula_png_path, owl_mode, duration)
        elif scene_type in ("hook", "intro"):
            self._build_hook_scene(owl_mode, duration)
        elif scene_type == "conclusion":
            self._build_conclusion_scene(duration)
        else:
            self._build_explanation_scene(owl_mode, duration, latex, formula_png_path)

    def _load_formula(self, latex: str, formula_png_path: str, max_width_ratio: float = 0.85) -> Mobject:
        """수식 Mobject 로드 (PNG 우선 → MathTex → Text fallback)

        Returns: (formula_mobject, is_vmobject)
            is_vmobject=True면 Write 애니메이션 가능
        """
        max_w = config.frame_width * max_width_ratio

        # 1. MathFormulaService PNG (최우선 — MathJax 고퀄 렌더링)
        if formula_png_path and os.path.exists(formula_png_path):
            formula = ImageMobject(formula_png_path)
            # 수식 PNG를 프레임 너비의 60-85%로 스케일
            if formula.width > max_w:
                formula.set(width=max_w)
            elif formula.width < max_w * 0.4:
                # 너무 작은 수식은 적당히 키움
                formula.set(width=max_w * 0.5)
            return formula, False

        # 2. MathTex (로컬 LaTeX 설치 필요)
        if latex:
            try:
                formula = MathTex(latex, color=TEAL)
                formula.scale(2.5)
                if formula.width > max_w:
                    formula.set(width=max_w)
                return formula, True
            except Exception:
                pass

            # 3. Text fallback
            formula = Text(latex, color=TEAL, font_size=72)
            if formula.width > max_w:
                formula.set(width=max_w)
            return formula, True

        # 아무것도 없으면 빈 객체
        return VGroup(), True

    def _build_formula_scene(self, latex: str, formula_png_path: str, owl_mode: str, duration: float):
        """수식 + 올빼미 pointing

        레이아웃 (9:16):
        - 수식: 상단 1/3 (Y ≈ +3)
        - 올빼미: 하단 (Y ≈ -3.5), 좌측에 배치, scale 1.2
        """
        owl = OwlCreature(mode="thinking")
        owl.scale(1.2)
        owl.move_to(LEFT * 1.5 + DOWN * 3.5)

        # 올빼미 등장 (아래에서 슬라이드 업)
        owl.shift(DOWN * 3)
        self.play(
            owl.animate.shift(UP * 3),
            run_time=0.5,
            rate_func=smooth,
        )

        # 수식 로드 + 애니메이션
        formula, is_vmobject = self._load_formula(latex, formula_png_path)
        formula.move_to(UP * 2.5)

        if is_vmobject:
            self.play(Write(formula), run_time=1.5)
        else:
            # PNG는 Write 불가 → GrowFromCenter로 등장
            self.play(
                FadeIn(formula, shift=UP * 0.3, scale=0.8),
                run_time=0.8,
            )

        # 올빼미가 수식을 가리킴
        owl.change_mode(self, "pointing", duration=0.3)

        # 유지 시간
        anim_time = 0.5 + (1.5 if is_vmobject else 0.8) + 0.3
        remaining = max(duration - anim_time, 0.5)

        # 눈 깜빡임 + 대기
        if remaining > 1.5:
            self.wait(remaining * 0.4)
            owl.blink(self)
            self.wait(remaining * 0.4)
            owl.blink(self)
            self.wait(remaining * 0.2)
        else:
            self.wait(remaining)

    def _build_hook_scene(self, owl_mode: str, duration: float):
        """hook/intro — 놀라는 올빼미 등장

        레이아웃: 올빼미가 중앙~하단에 크게 (scale 1.8)
        아래에서 튀어 올라옴
        """
        owl = OwlCreature(mode="surprised")
        owl.scale(1.8)
        target_pos = DOWN * 2

        # 화면 아래에서 시작
        owl.move_to(target_pos + DOWN * 8)
        self.play(
            owl.animate.move_to(target_pos),
            run_time=0.6,
            rate_func=rush_from,
        )

        # surprised → neutral 전환
        self.wait(0.3)
        owl.change_mode(self, "neutral", duration=0.4)

        remaining = max(duration - 1.3, 0.5)

        # 통통 튀기 + 깜빡임
        if remaining > 2.0:
            self.wait(remaining * 0.3)
            owl.bounce(self, height=0.4)
            self.wait(remaining * 0.2)
            owl.blink(self)
            self.wait(remaining * 0.3)
            owl.blink(self)
            self.wait(remaining * 0.2)
        else:
            self.wait(remaining * 0.5)
            owl.blink(self)
            self.wait(remaining * 0.5)

    def _build_conclusion_scene(self, duration: float):
        """결론 — 행복한 올빼미 인사

        레이아웃: 중앙에 크게 (scale 1.8), 기쁨 표정
        """
        owl = OwlCreature(mode="happy")
        owl.scale(1.8)
        owl.move_to(DOWN * 1.5)

        self.play(FadeIn(owl, shift=UP * 0.5), run_time=0.5)

        # 흔들기 인사
        owl.wave(self, duration=0.5)

        remaining = max(duration - 1.0, 0.5)

        if remaining > 1.5:
            self.wait(remaining * 0.3)
            owl.bounce(self, height=0.3)
            self.wait(remaining * 0.3)
            owl.nod(self)
            self.wait(remaining * 0.4)
        else:
            self.wait(remaining * 0.6)
            owl.nod(self)
            self.wait(remaining * 0.4)

    def _build_explanation_scene(self, owl_mode: str, duration: float, latex: str = "", formula_png_path: str = ""):
        """설명 씬 — 올빼미 + 옵션 수식

        레이아웃:
        - 수식 있으면: 수식 상단 + 올빼미 하단 좌측 (formula_scene과 유사)
        - 수식 없으면: 올빼미 하단 중앙, 좀 더 크게
        """
        has_formula = bool(latex) or (bool(formula_png_path) and os.path.exists(formula_png_path or ""))

        if has_formula:
            owl = OwlCreature(mode=owl_mode)
            owl.scale(1.0)
            owl.move_to(LEFT * 1.5 + DOWN * 3.5)
        else:
            owl = OwlCreature(mode=owl_mode)
            owl.scale(1.5)
            owl.move_to(DOWN * 2.5)

        self.play(FadeIn(owl, shift=UP * 0.5), run_time=0.4)

        formula_time = 0
        # 수식이 있으면 표시
        if has_formula:
            formula, is_vmobject = self._load_formula(latex, formula_png_path)
            formula.move_to(UP * 2.5)
            if is_vmobject:
                self.play(Write(formula), run_time=1.0)
                formula_time = 1.0
            else:
                self.play(FadeIn(formula, shift=UP * 0.3, scale=0.8), run_time=0.5)
                formula_time = 0.5

        remaining = max(duration - 0.4 - formula_time, 0.5)

        # 자연스러운 대기 + 깜빡임
        intervals = max(int(remaining / 2), 1)
        per_interval = remaining / intervals
        for i in range(intervals):
            self.wait(per_interval * 0.7)
            owl.blink(self)
            if i == 0 and not has_formula:
                # 첫 번째 구간에 살짝 고개 끄덕
                owl.nod(self)
            self.wait(per_interval * 0.3)
