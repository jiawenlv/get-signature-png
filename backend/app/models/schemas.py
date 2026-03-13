from typing import Literal, Optional

from pydantic import BaseModel

StampColor = Literal["red", "blue", "purple"]
TaskStatus = Literal["processing", "completed", "failed"]


class TaskResponse(BaseModel):
    task_id: str
    status: TaskStatus
    progress: int = 0  # 0-100
    result_url: Optional[str] = None
    error: Optional[str] = None
    message: Optional[str] = None
