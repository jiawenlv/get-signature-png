import asyncio
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Optional

from app.config import OUTPUT_DIR, TASK_EXPIRE_SECONDS, UPLOAD_DIR


@dataclass
class TaskInfo:
    task_id: str
    status: str = "processing"
    progress: int = 0
    created_at: datetime = field(default_factory=datetime.now)
    result_path: Optional[Path] = None
    error: Optional[str] = None


class TaskManager:
    def __init__(self) -> None:
        self.tasks: dict[str, TaskInfo] = {}

    def create_task(self) -> str:
        task_id = uuid.uuid4().hex
        self.tasks[task_id] = TaskInfo(task_id=task_id)
        return task_id

    def update_task(self, task_id: str, **kwargs) -> None:
        task = self.tasks.get(task_id)
        if task is None:
            return
        for key, value in kwargs.items():
            if hasattr(task, key):
                setattr(task, key, value)

    def get_task(self, task_id: str) -> Optional[TaskInfo]:
        return self.tasks.get(task_id)

    def cleanup_expired(self) -> None:
        now = datetime.now()
        expired_ids = [
            tid
            for tid, task in self.tasks.items()
            if (now - task.created_at).total_seconds() > TASK_EXPIRE_SECONDS
        ]
        for tid in expired_ids:
            task = self.tasks.pop(tid)
            # 删除关联的上传和输出文件
            if task.result_path and task.result_path.exists():
                task.result_path.unlink(missing_ok=True)
            # 清理 uploads 中以 task_id 前缀命名的文件不太可行，
            # 因为上传文件是用独立 UUID 命名的。
            # 这里遍历 uploads 和 outputs 删除相关文件
            for directory in (UPLOAD_DIR, OUTPUT_DIR):
                for f in directory.iterdir():
                    if f.is_file() and tid in f.name:
                        f.unlink(missing_ok=True)


# 模块级单例
task_manager = TaskManager()


async def start_cleanup_loop() -> None:
    """每 10 分钟清理过期任务，用于 FastAPI lifespan"""
    while True:
        await asyncio.sleep(600)
        task_manager.cleanup_expired()
