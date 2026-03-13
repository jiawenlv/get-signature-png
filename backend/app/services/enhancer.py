"""图像增强服务 — CLAHE 对比度增强 + 锐化"""

from pathlib import Path

import cv2
import numpy as np


def preprocess_for_extraction(image_path: Path, output_path: Path) -> Path:
    """提取前预处理：增强对比度 + 饱和度 + 锐化，拉大墨水与纸张的差距。

    与 enhance_image 不同：
    - CLAHE clipLimit 更高 (3.0)，更激进地拉开对比度
    - 额外增强 HSV 饱和度，让墨水颜色更鲜艳、纸张更灰
    - 输入/输出均为 BGR（无 alpha）

    Args:
        image_path: 输入 BGR 图片路径
        output_path: 输出图片路径

    Returns:
        output_path
    """
    img = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError(f"无法读取图片: {image_path}")

    # 1. CLAHE 对比度增强（LAB L 通道，clipLimit=3.0）
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l_ch, a_ch, b_ch = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    l_ch = clahe.apply(l_ch)
    img = cv2.cvtColor(cv2.merge([l_ch, a_ch, b_ch]), cv2.COLOR_LAB2BGR)

    # 2. 饱和度增强（HSV S 通道 ×1.5）
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    h, s, v = cv2.split(hsv)
    s = np.clip(s.astype(np.float32) * 1.5, 0, 255).astype(np.uint8)
    img = cv2.cvtColor(cv2.merge([h, s, v]), cv2.COLOR_HSV2BGR)

    # 3. Unsharp Masking 锐化
    gaussian = cv2.GaussianBlur(img, (0, 0), 3)
    sharpened = cv2.addWeighted(img, 1.3, gaussian, -0.3, 0)

    cv2.imwrite(str(output_path), sharpened)
    return output_path


def enhance_image(image_path: Path, output_path: Path) -> Path:
    """对提取后的印章图片进行增强处理。

    步骤:
    1. CLAHE 对比度增强（LAB 颜色空间 L 通道）
    2. Unsharp Masking 锐化

    Args:
        image_path: 输入图片路径（支持带 Alpha 通道的 PNG）
        output_path: 输出图片路径

    Returns:
        output_path
    """
    # 1. 读取图片（含 Alpha 通道）
    img = cv2.imread(str(image_path), cv2.IMREAD_UNCHANGED)
    if img is None:
        raise ValueError(f"无法读取图片: {image_path}")

    # 2. 分离 Alpha 通道（如果有的话）
    has_alpha = img.shape[2] == 4 if len(img.shape) == 3 else False
    if has_alpha:
        bgr = img[:, :, :3]
        alpha = img[:, :, 3]
    else:
        bgr = img
        alpha = None

    # 3. CLAHE 对比度增强（仅对非透明像素）
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB)
    l_channel, a_channel, b_channel = cv2.split(lab)

    if has_alpha:
        # 只对 alpha>0 的像素做 CLAHE，避免透明区域黑色像素拉偏直方图
        mask = alpha > 0
        if np.any(mask):
            # 提取非透明像素的 L 值，单独做 CLAHE
            opaque_l = l_channel[mask]
            # 将一维数组重塑为伪二维图以便 CLAHE 处理
            side = int(np.ceil(np.sqrt(len(opaque_l))))
            padded = np.zeros(side * side, dtype=np.uint8)
            padded[:len(opaque_l)] = opaque_l
            padded_2d = padded.reshape(side, side)

            clahe = cv2.createCLAHE(clipLimit=1.5, tileGridSize=(8, 8))
            enhanced_2d = clahe.apply(padded_2d)

            l_channel[mask] = enhanced_2d.ravel()[:len(opaque_l)]
    else:
        clahe = cv2.createCLAHE(clipLimit=1.5, tileGridSize=(8, 8))
        l_channel = clahe.apply(l_channel)

    lab_enhanced = cv2.merge([l_channel, a_channel, b_channel])
    bgr_enhanced = cv2.cvtColor(lab_enhanced, cv2.COLOR_LAB2BGR)

    # 4. 锐化掩码 (Unsharp Masking)
    gaussian = cv2.GaussianBlur(bgr_enhanced, (0, 0), 3)
    sharpened = cv2.addWeighted(bgr_enhanced, 1.3, gaussian, -0.3, 0)

    # 5. 重新合并 Alpha 通道
    if has_alpha:
        result = cv2.merge([sharpened[:, :, 0], sharpened[:, :, 1], sharpened[:, :, 2], alpha])
    else:
        result = sharpened

    # 6. 保存
    cv2.imwrite(str(output_path), result)

    return output_path
