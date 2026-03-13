import uuid
from pathlib import Path

import magic
from fastapi import UploadFile

from app.config import ALLOWED_MIME_TYPES, MAX_FILE_SIZE, UPLOAD_DIR


async def validate_file(file: UploadFile) -> tuple[bool, str]:
    """校验上传文件的大小和 MIME 类型。

    返回 (是否合法, 错误信息)。
    """
    content = await file.read()
    await file.seek(0)

    # 校验文件大小
    if len(content) > MAX_FILE_SIZE:
        return False, f"文件大小超过限制 ({MAX_FILE_SIZE // (1024 * 1024)}MB)"

    # 校验 MIME 类型
    mime_type = magic.from_buffer(content, mime=True)
    if mime_type not in ALLOWED_MIME_TYPES:
        return False, f"不支持的文件类型: {mime_type}"

    return True, ""


def save_upload(content: bytes, suffix: str) -> Path:
    """以 UUID + 原始后缀保存上传文件到 UPLOAD_DIR，返回保存路径。"""
    filename = f"{uuid.uuid4().hex}{suffix}"
    path = UPLOAD_DIR / filename
    path.write_bytes(content)
    return path
