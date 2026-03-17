"""图像去模糊服务：使用 NAFNet 去模糊模型，降级到 OpenCV 管线。"""

import logging
import math
from pathlib import Path
from typing import Callable, Optional

import cv2
import numpy as np

logger = logging.getLogger(__name__)

MAX_INPUT_SIZE = 2048

# ── NAFNet 网络定义 ──────────────────────────────────────────────

try:
    import torch
    import torch.nn as nn
    import torch.nn.functional as F

    _torch_available = True

    class LayerNorm2d(nn.Module):
        def __init__(self, channels: int, eps: float = 1e-6):
            super().__init__()
            self.weight = nn.Parameter(torch.ones(channels))
            self.bias = nn.Parameter(torch.zeros(channels))
            self.eps = eps

        def forward(self, x):
            u = x.mean(1, keepdim=True)
            s = (x - u).pow(2).mean(1, keepdim=True)
            x = (x - u) / torch.sqrt(s + self.eps)
            return self.weight[:, None, None] * x + self.bias[:, None, None]

    class SimpleGate(nn.Module):
        def forward(self, x):
            x1, x2 = x.chunk(2, dim=1)
            return x1 * x2

    class NAFBlock(nn.Module):
        def __init__(self, c: int, dw_expand: int = 2, ffn_expand: int = 2):
            super().__init__()
            dw_c = c * dw_expand

            self.conv1 = nn.Conv2d(c, dw_c, 1)
            self.conv2 = nn.Conv2d(dw_c, dw_c, 3, 1, 1, groups=dw_c)
            self.conv3 = nn.Conv2d(dw_c // 2, c, 1)

            # Simplified Channel Attention
            self.sca = nn.Sequential(
                nn.AdaptiveAvgPool2d(1),
                nn.Conv2d(dw_c // 2, dw_c // 2, 1),
            )

            self.sg = SimpleGate()
            self.norm1 = LayerNorm2d(c)

            ffn_c = c * ffn_expand
            self.conv4 = nn.Conv2d(c, ffn_c, 1)
            self.conv5 = nn.Conv2d(ffn_c // 2, c, 1)
            self.norm2 = LayerNorm2d(c)
            self.sg2 = SimpleGate()

            self.beta = nn.Parameter(torch.zeros(1, c, 1, 1))
            self.gamma = nn.Parameter(torch.zeros(1, c, 1, 1))

        def forward(self, x):
            inp = x
            x = self.norm1(x)
            x = self.conv1(x)
            x = self.conv2(x)
            x = self.sg(x)
            x = x * self.sca(x)
            x = self.conv3(x)
            y = inp + x * self.beta

            x = self.norm2(y)
            x = self.conv4(x)
            x = self.sg2(x)
            x = self.conv5(x)
            return y + x * self.gamma

    class NAFNet(nn.Module):
        def __init__(
            self,
            img_channel: int = 3,
            width: int = 64,
            middle_blk_num: int = 12,
            enc_blk_nums: list = [2, 2, 4, 8],
            dec_blk_nums: list = [2, 2, 2, 2],
        ):
            super().__init__()
            self.intro = nn.Conv2d(img_channel, width, 3, 1, 1)
            self.ending = nn.Conv2d(width, img_channel, 3, 1, 1)

            self.encoders = nn.ModuleList()
            self.decoders = nn.ModuleList()
            self.middle_blks = nn.ModuleList()
            self.ups = nn.ModuleList()
            self.downs = nn.ModuleList()

            chan = width
            for num in enc_blk_nums:
                self.encoders.append(nn.Sequential(*[NAFBlock(chan) for _ in range(num)]))
                self.downs.append(nn.Conv2d(chan, chan * 2, 2, 2))
                chan *= 2

            self.middle_blks = nn.Sequential(*[NAFBlock(chan) for _ in range(middle_blk_num)])

            for num in dec_blk_nums:
                self.ups.append(nn.Sequential(
                    nn.Conv2d(chan, chan * 2, 1, bias=False),
                    nn.PixelShuffle(2),
                ))
                chan //= 2
                self.decoders.append(nn.Sequential(*[NAFBlock(chan) for _ in range(num)]))

            self.padder_size = 2 ** len(enc_blk_nums)

        def forward(self, x):
            B, C, H, W = x.shape
            x = self._check_image_size(x)

            inp = x
            x = self.intro(x)

            encs = []
            for encoder, down in zip(self.encoders, self.downs):
                x = encoder(x)
                encs.append(x)
                x = down(x)

            x = self.middle_blks(x)

            for decoder, up, enc_skip in zip(self.decoders, self.ups, encs[::-1]):
                x = up(x)
                x = x + enc_skip
                x = decoder(x)

            x = self.ending(x)
            x = x + inp

            return x[:, :, :H, :W]

        def _check_image_size(self, x):
            _, _, h, w = x.shape
            mod = self.padder_size
            pad_h = (mod - h % mod) % mod
            pad_w = (mod - w % mod) % mod
            x = F.pad(x, (0, pad_w, 0, pad_h))
            return x

except ImportError:
    _torch_available = False


# ── 模型加载 ─────────────────────────────────────────────────────

_model = None
_model_loaded: Optional[bool] = None


def _get_model():
    """懒加载 NAFNet 模型单例。"""
    global _model, _model_loaded

    if not _torch_available or _model_loaded is False:
        return None

    if _model is not None:
        return _model

    try:
        from app.config import WEIGHTS_DIR

        model_path = WEIGHTS_DIR / "NAFNet-REDS-width64.pth"
        if not model_path.exists():
            _model_loaded = False
            logger.info("模型文件不存在: %s", model_path)
            return None

        device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")

        net = NAFNet(
            img_channel=3,
            width=64,
            middle_blk_num=1,
            enc_blk_nums=[1, 1, 1, 28],
            dec_blk_nums=[1, 1, 1, 1],
        )

        state_dict = torch.load(str(model_path), map_location=device, weights_only=True)
        if "params" in state_dict:
            state_dict = state_dict["params"]
        elif "state_dict" in state_dict:
            state_dict = state_dict["state_dict"]

        net.load_state_dict(state_dict, strict=True)
        net.eval().to(device)

        _model = net
        _model_loaded = True
        logger.info("NAFNet 去模糊模型加载成功 (device=%s)", device)
        return _model
    except Exception as e:
        _model_loaded = False
        logger.warning("NAFNet 模型加载失败: %s", e)
        return None


# ── 分块推理 ─────────────────────────────────────────────────────

def _tile_inference(
    img: np.ndarray,
    model: "torch.nn.Module",
    tile_size: int = 256,
    tile_pad: int = 16,
) -> np.ndarray:
    """分块推理，控制显存/内存占用。输出与输入同尺寸。"""
    device = next(model.parameters()).device

    # BGR → RGB, uint8 → float32 [0,1], HWC → BCHW
    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    tensor = torch.from_numpy(img_rgb).permute(2, 0, 1).unsqueeze(0).to(device)

    _, _, h, w = tensor.shape
    output = torch.empty((1, 3, h, w), device=device)

    tiles_y = math.ceil(h / tile_size)
    tiles_x = math.ceil(w / tile_size)

    for ty in range(tiles_y):
        for tx in range(tiles_x):
            x_start = tx * tile_size
            y_start = ty * tile_size
            x_end = min(x_start + tile_size, w)
            y_end = min(y_start + tile_size, h)

            x_start_pad = max(x_start - tile_pad, 0)
            y_start_pad = max(y_start - tile_pad, 0)
            x_end_pad = min(x_end + tile_pad, w)
            y_end_pad = min(y_end + tile_pad, h)

            tile_input = tensor[:, :, y_start_pad:y_end_pad, x_start_pad:x_end_pad]

            with torch.no_grad():
                tile_output = model(tile_input)

            # 去掉 padding 对应的输出区域
            out_x_start = x_start - x_start_pad
            out_y_start = y_start - y_start_pad
            out_x_end = out_x_start + (x_end - x_start)
            out_y_end = out_y_start + (y_end - y_start)

            output[
                :, :,
                y_start:y_end,
                x_start:x_end,
            ] = tile_output[:, :, out_y_start:out_y_end, out_x_start:out_x_end]

    # BCHW → HWC, float32 → uint8, RGB → BGR
    result = output.squeeze(0).permute(1, 2, 0).clamp(0, 1).cpu().numpy()
    result = (result * 255).round().astype(np.uint8)
    return cv2.cvtColor(result, cv2.COLOR_RGB2BGR)


def _nafnet_deblur(img: np.ndarray, model) -> np.ndarray:
    """使用 NAFNet 去模糊。"""
    return _tile_inference(img, model, tile_size=256, tile_pad=16)


# ── OpenCV 降级管线 ───────────────────────────────────────────────

def _opencv_deblur(
    img: np.ndarray,
    denoise_strength: float,
    on_progress: Callable[[int], None],
) -> np.ndarray:
    """bilateral filter 去噪 → CLAHE 增强 → unsharp masking 锐化"""

    on_progress(30)
    d = max(5, int(denoise_strength * 15))
    sigma = 25 + denoise_strength * 50
    denoised = cv2.bilateralFilter(img, d, sigma, sigma)

    on_progress(50)
    lab = cv2.cvtColor(denoised, cv2.COLOR_BGR2LAB)
    l_channel, a_channel, b_channel = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l_channel = clahe.apply(l_channel)
    enhanced = cv2.merge([l_channel, a_channel, b_channel])
    enhanced = cv2.cvtColor(enhanced, cv2.COLOR_LAB2BGR)

    on_progress(75)
    gaussian = cv2.GaussianBlur(enhanced, (0, 0), 3)
    sharpened = cv2.addWeighted(enhanced, 1.5, gaussian, -0.5, 0)

    return sharpened


# ── 主函数 ────────────────────────────────────────────────────────

def deblur_image(
    input_path: Path,
    output_path: Path,
    denoise_strength: float = 0.5,
    on_progress: Optional[Callable[[int], None]] = None,
) -> None:
    """去模糊图像：NAFNet 去模糊，降级到 OpenCV 锐化管线。"""

    if on_progress is None:
        on_progress = lambda _: None

    on_progress(10)

    img = cv2.imread(str(input_path), cv2.IMREAD_UNCHANGED)
    if img is None:
        raise ValueError("无法读取图片文件")

    on_progress(20)

    h, w = img.shape[:2]
    if max(h, w) > MAX_INPUT_SIZE:
        ratio = MAX_INPUT_SIZE / max(h, w)
        img = cv2.resize(
            img,
            (int(w * ratio), int(h * ratio)),
            interpolation=cv2.INTER_AREA,
        )

    model = _get_model()
    if model is not None:
        try:
            on_progress(30)
            output = _nafnet_deblur(img, model)
            on_progress(90)
        except Exception as e:
            logger.warning("NAFNet 推理失败，降级到 OpenCV: %s", e)
            output = _opencv_deblur(img, denoise_strength, on_progress)
    else:
        output = _opencv_deblur(img, denoise_strength, on_progress)

    on_progress(95)

    suffix = output_path.suffix.lower()
    if suffix in (".jpg", ".jpeg"):
        cv2.imwrite(str(output_path), output, [cv2.IMWRITE_JPEG_QUALITY, 95])
    else:
        cv2.imwrite(str(output_path), output)

    on_progress(100)
