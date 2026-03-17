from pathlib import Path

# 项目目录
BASE_DIR = Path(__file__).resolve().parent.parent
UPLOAD_DIR = BASE_DIR / "uploads"
OUTPUT_DIR = BASE_DIR / "outputs"

# 文件上传限制
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20MB
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/bmp", "image/tiff"}

# 任务过期时间
TASK_EXPIRE_SECONDS = 3600

# 模型权重目录
WEIGHTS_DIR = BASE_DIR / "weights"

# 启动时自动创建目录
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)
