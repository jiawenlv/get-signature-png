"""HSV 颜色空间印章提取服务"""

from pathlib import Path
from collections.abc import Callable

import cv2
import numpy as np

# 宽松 HSV 阈值 — 用于 AI 提取后的颜色精炼（AI 已约束区域，可降低饱和度门槛）
HSV_RANGES_RELAXED = {
    "red": {
        "ranges": [
            {"lower": np.array([0, 40, 40]), "upper": np.array([12, 255, 255])},
            {"lower": np.array([168, 40, 40]), "upper": np.array([179, 255, 255])},
        ],
    },
    "blue": {
        "ranges": [
            {"lower": np.array([95, 40, 40]), "upper": np.array([135, 255, 255])},
        ],
    },
    "purple": {
        "ranges": [
            {"lower": np.array([120, 30, 40]), "upper": np.array([160, 255, 255])},
        ],
    },
}

# HSV 阈值配置（OpenCV 中 H: 0-179, S: 0-255, V: 0-255）
HSV_RANGES = {
    "red": {
        "ranges": [
            # 低色相区
            {"lower": np.array([0, 70, 50]), "upper": np.array([10, 255, 255])},
            # 高色相区
            {"lower": np.array([170, 70, 50]), "upper": np.array([179, 255, 255])},
        ],
    },
    "blue": {
        "ranges": [
            {"lower": np.array([100, 70, 50]), "upper": np.array([130, 255, 255])},
        ],
    },
    "purple": {
        "ranges": [
            {"lower": np.array([125, 40, 50]), "upper": np.array([155, 255, 255])},
        ],
    },
}


def _extract_by_color_with_mask(
    image_path: Path,
    color: str,
    output_path: Path,
    on_progress: Callable[[int], None] | None = None,
) -> tuple[Path, np.ndarray]:
    """基于 HSV 颜色空间提取指定颜色的印章区域，返回输出路径和二值掩码。

    Args:
        image_path: 输入图片路径
        color: 目标颜色 ("red" / "blue" / "purple")
        output_path: 输出 PNG 路径
        on_progress: 可选的进度回调，签名 (progress: int) -> None

    Returns:
        (output_path, mask) — mask 是形态学处理后的二值掩码
    """

    def _report(value: int) -> None:
        if on_progress is not None:
            on_progress(value)

    # 1. 读取图片
    _report(10)
    img = cv2.imread(str(image_path))
    if img is None:
        raise ValueError(f"无法读取图片: {image_path}")

    # 2. 转换到 HSV 颜色空间
    _report(20)
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)

    # 3. 根据颜色参数生成掩码
    _report(30)
    if color not in HSV_RANGES:
        raise ValueError(f"不支持的颜色: {color}，支持: {list(HSV_RANGES.keys())}")

    color_config = HSV_RANGES[color]
    mask = None
    for r in color_config["ranges"]:
        partial_mask = cv2.inRange(hsv, r["lower"], r["upper"])
        if mask is None:
            mask = partial_mask
        else:
            mask = cv2.bitwise_or(mask, partial_mask)

    # 4. 形态学操作：开运算去噪 + 闭运算填孔
    _report(50)
    kernel_open = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel_open)

    kernel_close = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel_close)

    # 5. 扩展为 4 通道（BGRA），直接用二值 mask 作为 alpha
    _report(80)
    bgra = cv2.cvtColor(img, cv2.COLOR_BGR2BGRA)
    bgra[:, :, 3] = mask

    # 8. 保存为 PNG
    _report(90)
    cv2.imwrite(str(output_path), bgra)

    _report(100)
    return output_path, mask


def refine_by_color(
    original_path: Path,
    ai_result_path: Path,
    color: str,
    output_path: Path,
    saturation_threshold: int = 40,
) -> Path:
    """AI 提取后颜色精炼：用 AI 的 alpha 约束区域，在原图上做 HSV 颜色过滤只保留墨水像素。

    Args:
        original_path: 原始输入图片路径（未经 AI 处理）
        ai_result_path: AI 提取结果 RGBA PNG 路径
        color: 目标颜色 ("red" / "blue" / "purple")
        output_path: 输出 PNG 路径

    Returns:
        output_path
    """
    # 1. 读取 AI 结果的 alpha 通道作为前景 mask
    ai_img = cv2.imread(str(ai_result_path), cv2.IMREAD_UNCHANGED)
    if ai_img is None or ai_img.shape[2] != 4:
        return output_path  # 无法精炼，保持原样
    ai_alpha = ai_img[:, :, 3]

    # 2. 读取原图做 HSV 颜色过滤（原图颜色未被 AI 改变）
    original = cv2.imread(str(original_path))
    if original is None:
        return output_path

    # 确保尺寸一致
    if original.shape[:2] != ai_alpha.shape[:2]:
        ai_alpha = cv2.resize(ai_alpha, (original.shape[1], original.shape[0]))

    hsv = cv2.cvtColor(original, cv2.COLOR_BGR2HSV)

    # 3. 用宽松阈值生成颜色掩码，饱和度下限受 saturation_threshold 控制
    if color not in HSV_RANGES_RELAXED:
        return output_path

    color_config = HSV_RANGES_RELAXED[color]
    color_mask = None
    for r in color_config["ranges"]:
        lower = r["lower"].copy()
        lower[1] = min(lower[1], saturation_threshold)
        partial = cv2.inRange(hsv, lower, r["upper"])
        if color_mask is None:
            color_mask = partial
        else:
            color_mask = cv2.bitwise_or(color_mask, partial)

    # 4. 交集：AI 前景区域 AND 颜色匹配
    ai_binary = (ai_alpha > 128).astype(np.uint8) * 255
    new_alpha = cv2.bitwise_and(ai_binary, color_mask)

    # 5. 安全回退：如果精炼后像素保留率低于 10%，说明颜色过滤太严格，跳过精炼
    ai_pixel_count = int(np.count_nonzero(ai_binary))
    refined_pixel_count = int(np.count_nonzero(new_alpha))
    if ai_pixel_count > 0 and refined_pixel_count / ai_pixel_count < 0.10:
        return output_path  # 保留 AI 原始结果

    # 6. 闭运算(5x5)填充墨水内部小孔
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    new_alpha = cv2.morphologyEx(new_alpha, cv2.MORPH_CLOSE, kernel)

    # 7. 用原图 BGR + new_alpha 写出 BGRA PNG（二值 alpha，无半透明）
    bgra = cv2.cvtColor(original, cv2.COLOR_BGR2BGRA)
    bgra[:, :, 3] = new_alpha
    cv2.imwrite(str(output_path), bgra)

    return output_path


def extract_by_color(
    image_path: Path,
    color: str,
    output_path: Path,
    on_progress: Callable[[int], None] | None = None,
) -> Path:
    """基于 HSV 颜色空间提取指定颜色的印章区域，生成透明背景 PNG。

    Args:
        image_path: 输入图片路径
        color: 目标颜色 ("red" / "blue" / "purple")
        output_path: 输出 PNG 路径
        on_progress: 可选的进度回调，签名 (progress: int) -> None

    Returns:
        output_path
    """
    path, _ = _extract_by_color_with_mask(image_path, color, output_path, on_progress)
    return path
