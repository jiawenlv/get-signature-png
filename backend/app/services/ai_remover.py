"""AI 背景移除服务 — 基于 rembg + BiRefNet"""

from pathlib import Path
from collections.abc import Callable

# 延迟加载的 rembg session
_session = None


def get_session():
    """延迟初始化 rembg session，首次调用时加载模型并缓存。"""
    global _session
    if _session is not None:
        return _session

    from rembg import new_session

    # 优先使用 birefnet-general（边缘精度最优），失败则回退到 u2net
    try:
        _session = new_session("birefnet-general")
    except Exception:
        _session = new_session("u2net")

    return _session


def extract_by_ai(
    image_path: Path,
    output_path: Path,
    on_progress: Callable[[int], None] | None = None,
) -> Path:
    """使用 rembg AI 模型移除背景，生成透明 PNG。

    Args:
        image_path: 输入图片路径
        output_path: 输出 PNG 路径
        on_progress: 可选的进度回调，签名 (progress: int) -> None

    Returns:
        output_path
    """

    def _report(value: int) -> None:
        if on_progress is not None:
            on_progress(value)

    # 1. 开始读取
    _report(10)
    data = image_path.read_bytes()

    # 2. 开始 AI 推理
    _report(20)
    from rembg import remove

    result = remove(data, session=get_session())

    # 3. 保存结果
    _report(90)
    output_path.write_bytes(result)

    # 4. 完成
    _report(100)
    return output_path


def preload_model() -> None:
    """预加载模型，供 FastAPI lifespan 可选调用。"""
    get_session()
