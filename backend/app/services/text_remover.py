"""去除黑色文字预处理 — 检测黑色文字并用 inpaint 修复"""

from pathlib import Path
from collections.abc import Callable

import cv2
import numpy as np


def remove_black_text(
    image_path: Path,
    output_path: Path,
    on_progress: Callable[[int], None] | None = None,
) -> Path:
    """检测图片中的黑色文字并用周围像素填充修复。

    Args:
        image_path: 输入图片路径
        output_path: 输出图片路径
        on_progress: 可选的进度回调 (0~100)

    Returns:
        output_path
    """

    def _report(value: int) -> None:
        if on_progress is not None:
            on_progress(value)

    _report(0)

    # 1. 读取图片并转换到 HSV
    img = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError(f"无法读取图片: {image_path}")

    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    _report(30)

    # 2. 检测黑色像素：低饱和度 + 暗亮度 = 黑色文字
    #    收紧范围避免误伤深色印章：S<=30, V<=80
    lower_black = np.array([0, 0, 0])
    upper_black = np.array([179, 30, 80])
    black_mask = cv2.inRange(hsv, lower_black, upper_black)

    # 3. 红色保护掩码：排除红色像素（印章常见色）
    #    红色在 HSV 中分布在 H 两端：0-12 和 168-179
    red_mask1 = cv2.inRange(hsv, np.array([0, 40, 40]), np.array([12, 255, 255]))
    red_mask2 = cv2.inRange(hsv, np.array([168, 40, 40]), np.array([179, 255, 255]))
    red_mask = red_mask1 | red_mask2

    mask = black_mask & ~red_mask
    _report(50)

    # 4. 膨胀 mask 2px 覆盖抗锯齿边缘
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    mask = cv2.dilate(mask, kernel, iterations=1)
    _report(60)

    # 5. inpaint 用周围像素填充黑色文字区域（半径 2 减少模糊）
    result = cv2.inpaint(img, mask, inpaintRadius=2, flags=cv2.INPAINT_TELEA)
    _report(90)

    # 6. 保存结果
    cv2.imwrite(str(output_path), result)
    _report(100)

    return output_path
