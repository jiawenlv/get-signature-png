"""印章提取服务 — 基于 AI 背景移除，支持保留原色和统一着色两种模式"""

import shutil
import tempfile
from pathlib import Path
from collections.abc import Callable

import cv2
import numpy as np

from app.services.color_filter import refine_by_color
from app.services.ai_remover import extract_by_ai

# 印章颜色 BGR 映射（用于统一着色模式，偏亮以匹配真实印泥色）
STAMP_COLORS_BGR = {
    "red": (50, 50, 240),
    "blue": (200, 100, 30),
    "purple": (160, 40, 150),
}


def _restore_original_colors(original_path: Path, result_path: Path) -> None:
    """将提取结果的 BGR 通道替换为原图（预处理前）的颜色，保留 alpha 不变。"""
    result = cv2.imread(str(result_path), cv2.IMREAD_UNCHANGED)
    if result is None or len(result.shape) < 3 or result.shape[2] != 4:
        return

    original = cv2.imread(str(original_path), cv2.IMREAD_COLOR)
    if original is None:
        return

    if original.shape[:2] != result.shape[:2]:
        original = cv2.resize(original, (result.shape[1], result.shape[0]))

    result[:, :, :3] = original
    cv2.imwrite(str(result_path), result)


def _binarize_alpha(image_path: Path, saturation_threshold: int = 80) -> None:
    """模式一最终兜底：alpha 二值化 + 饱和度过滤。"""
    img = cv2.imread(str(image_path), cv2.IMREAD_UNCHANGED)
    if img is None or len(img.shape) < 3 or img.shape[2] != 4:
        return

    alpha = img[:, :, 3]
    binary_alpha = np.where(alpha >= 128, np.uint8(255), np.uint8(0))

    bgr = img[:, :, :3]
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    saturation = hsv[:, :, 1]
    value = hsv[:, :, 2]
    high_thresh = min(saturation_threshold + 30, 255)
    not_ink = (saturation < saturation_threshold) | ((saturation < high_thresh) & (value > 180))
    binary_alpha[not_ink] = 0

    img[:, :, 3] = binary_alpha
    cv2.imwrite(str(image_path), img)


def _sample_stamp_color(bgr: np.ndarray, alpha: np.ndarray) -> tuple[int, int, int]:
    """从前景区域采样印章的真实颜色（高饱和度像素的中位色）。"""
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    foreground = alpha > 128
    sat = hsv[:, :, 1]

    # 取前景中饱和度 top 30% 的像素 — 这些最能代表墨水颜色
    fg_sat = sat[foreground]
    if len(fg_sat) == 0:
        return STAMP_COLORS_BGR["red"]

    sat_threshold = np.percentile(fg_sat, 70)
    ink_mask = foreground & (sat >= sat_threshold)

    if np.count_nonzero(ink_mask) < 10:
        return STAMP_COLORS_BGR["red"]

    # 取这些像素的 BGR 中位值
    b_med = int(np.median(bgr[:, :, 0][ink_mask]))
    g_med = int(np.median(bgr[:, :, 1][ink_mask]))
    r_med = int(np.median(bgr[:, :, 2][ink_mask]))

    return (b_med, g_med, r_med)


def _hex_to_bgr(hex_color: str) -> tuple[int, int, int]:
    """将 hex 颜色（如 '#e04040'）转换为 BGR 元组。支持 3/6 位，容错多余字符。"""
    h = hex_color.lstrip("#").strip()
    # 只保留合法 hex 字符
    h = "".join(c for c in h if c in "0123456789abcdefABCDEF")
    if len(h) >= 6:
        h = h[:6]
    elif len(h) == 3:
        h = h[0] * 2 + h[1] * 2 + h[2] * 2
    else:
        raise ValueError(f"无效的 hex 颜色: {hex_color}")
    r = int(h[0:2], 16)
    g = int(h[2:4], 16)
    b = int(h[4:6], 16)
    return (b, g, r)


def _recolor_stamp(
    image_path: Path, color: str, brightness_threshold: int = 128, custom_color: str = ""
) -> None:
    """模式二：灰度二值化 + 统一着色。

    优先使用用户指定的 custom_color（hex），否则从前景自动采样。
    """
    img = cv2.imread(str(image_path), cv2.IMREAD_UNCHANGED)
    if img is None or len(img.shape) < 3 or img.shape[2] != 4:
        return

    alpha = img[:, :, 3]
    bgr = img[:, :, :3]

    # 确定填充颜色：优先用户指定，否则自动采样
    if custom_color:
        try:
            target_bgr = _hex_to_bgr(custom_color)
        except ValueError:
            target_bgr = _sample_stamp_color(bgr, alpha)
    else:
        target_bgr = _sample_stamp_color(bgr, alpha)

    # 转灰度 + HSV
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    saturation = hsv[:, :, 1]

    # 在前景区域中，灰度 < 阈值 且 饱和度 > 30 的为印章墨水
    # 饱和度过滤排除黑色文字（低饱和度的暗色像素）
    foreground = alpha > 0
    is_ink = foreground & (gray < brightness_threshold) & (saturation > 30)

    # 新 alpha：只有墨水像素不透明
    new_alpha = np.zeros_like(alpha)
    new_alpha[is_ink] = 255

    # 直接用目标颜色填充所有墨水像素
    new_bgr = np.zeros_like(bgr)
    for c in range(3):
        new_bgr[:, :, c][is_ink] = target_bgr[c]

    result = cv2.merge([new_bgr[:, :, 0], new_bgr[:, :, 1], new_bgr[:, :, 2], new_alpha])
    cv2.imwrite(str(image_path), result)


def _resize_to_max(image_path: Path, max_side: int) -> None:
    """等比缩放图片，使最大边长等于 max_side。"""
    img = cv2.imread(str(image_path), cv2.IMREAD_UNCHANGED)
    if img is None:
        return

    h, w = img.shape[:2]
    if max(h, w) == max_side:
        return

    scale = max_side / max(h, w)
    new_w = round(w * scale)
    new_h = round(h * scale)
    interp = cv2.INTER_AREA if scale < 1 else cv2.INTER_LANCZOS4
    resized = cv2.resize(img, (new_w, new_h), interpolation=interp)
    cv2.imwrite(str(image_path), resized)


def _auto_crop_and_clean_alpha(image_path: Path, padding: int = 10) -> None:
    """后处理：硬化 alpha 边缘 + 自动裁剪到印章区域。"""
    img = cv2.imread(str(image_path), cv2.IMREAD_UNCHANGED)
    if img is None or img.shape[2] != 4:
        return

    alpha = img[:, :, 3]
    new_alpha = np.where(alpha >= 128, np.uint8(255), np.uint8(0))
    img[:, :, 3] = new_alpha

    coords = cv2.findNonZero(new_alpha)
    if coords is None:
        return

    x, y, w, h = cv2.boundingRect(coords)
    rows, cols = img.shape[:2]

    x1 = max(0, x - padding)
    y1 = max(0, y - padding)
    x2 = min(cols, x + w + padding)
    y2 = min(rows, y + h + padding)

    cropped = img[y1:y2, x1:x2]
    cv2.imwrite(str(image_path), cropped)


def extract_stamp(
    image_path: Path,
    color: str,
    output_path: Path,
    on_progress: Callable[[int], None] | None = None,
    remove_text: bool = False,
    saturation_threshold: int = 80,
    mode: str = "original",
    brightness_threshold: int = 128,
    output_size: int = 512,
    custom_color: str = "",
) -> Path:
    """印章提取入口。"""

    def _report(value: int) -> None:
        if on_progress is not None:
            on_progress(value)

    # --- 预处理：去除黑色文字 ---
    actual_image_path = image_path
    tmp_preprocess_dir = None

    if remove_text:
        from app.services.text_remover import remove_black_text

        tmp_preprocess_dir = tempfile.mkdtemp()
        tmp_preprocess_path = Path(tmp_preprocess_dir) / "preprocessed.png"

        def _preprocess_progress(pct: int) -> None:
            _report(int(pct * 10 / 100))

        remove_black_text(image_path, tmp_preprocess_path, on_progress=_preprocess_progress)
        actual_image_path = tmp_preprocess_path
        _report(10)

    # --- 预处理：对比度增强 + 饱和度增强 + 锐化 ---
    from app.services.enhancer import preprocess_for_extraction

    source_for_pixels = actual_image_path

    if tmp_preprocess_dir is None:
        tmp_preprocess_dir = tempfile.mkdtemp()
    enhanced_path = Path(tmp_preprocess_dir) / "enhanced_preprocess.png"
    preprocess_for_extraction(actual_image_path, enhanced_path)
    actual_image_path = enhanced_path
    preprocess_offset = 15
    _report(preprocess_offset)

    try:
        def _scaled_progress(pct: int) -> None:
            _report(preprocess_offset + int(pct * (95 - preprocess_offset) / 100))

        # --- AI 提取 ---
        extract_by_ai(
            actual_image_path, output_path,
            on_progress=_scaled_progress,
        )

        # --- 恢复原图颜色 ---
        _restore_original_colors(source_for_pixels, output_path)

        if mode == "recolor":
            # --- 模式二：灰度二值化 + 统一着色 ---
            _recolor_stamp(output_path, color, brightness_threshold, custom_color)
        else:
            # --- 模式一：颜色精炼 + 饱和度过滤 ---
            refine_by_color(source_for_pixels, output_path, color, output_path, saturation_threshold)

        # --- 裁剪 ---
        _auto_crop_and_clean_alpha(output_path)

        # --- 最终兜底 ---
        if mode == "original":
            _binarize_alpha(output_path, saturation_threshold)

        # --- 导出分辨率缩放 ---
        if output_size > 0:
            _resize_to_max(output_path, output_size)

        _report(100)
        return output_path
    finally:
        if tmp_preprocess_dir:
            shutil.rmtree(tmp_preprocess_dir, ignore_errors=True)
