import asyncio
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.config import OUTPUT_DIR
from app.models.schemas import TaskResponse
from app.services.super_resolution import deblur_image
from app.services.task_manager import task_manager
from app.utils.file_utils import save_upload, validate_file

router = APIRouter(prefix="/api/enhance", tags=["enhance"])

# 输出格式映射
_MIME_MAP = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".bmp": "image/bmp",
    ".tiff": "image/tiff",
    ".tif": "image/tiff",
}


def _output_suffix(original_suffix: str) -> str:
    """保持原格式，默认 PNG。"""
    s = original_suffix.lower()
    return s if s in _MIME_MAP else ".png"


async def _process_enhance(
    task_id: str,
    input_path: Path,
    output_suffix: str,
    denoise_strength: float,
) -> None:
    try:
        output_path = OUTPUT_DIR / f"{task_id}{output_suffix}"

        def on_progress(progress: int) -> None:
            task_manager.update_task(task_id, progress=progress)

        await asyncio.to_thread(
            deblur_image,
            input_path,
            output_path,
            denoise_strength,
            on_progress,
        )

        task_manager.update_task(
            task_id,
            status="completed",
            progress=100,
            result_path=output_path,
        )
    except Exception as e:
        task_manager.update_task(
            task_id,
            status="failed",
            error=str(e),
        )


@router.post("/submit", status_code=202, response_model=TaskResponse)
async def submit_enhance(
    file: UploadFile = File(...),
    denoise_strength: float = Form(0.5),
):
    valid, error_msg = await validate_file(file)
    if not valid:
        raise HTTPException(status_code=400, detail=error_msg)

    content = await file.read()
    suffix = Path(file.filename).suffix if file.filename else ".jpg"
    input_path = save_upload(content, suffix)
    output_suffix = _output_suffix(suffix)

    task_id = task_manager.create_task()

    asyncio.get_event_loop().create_task(
        _process_enhance(task_id, input_path, output_suffix, denoise_strength)
    )

    return TaskResponse(
        task_id=task_id,
        status="processing",
        progress=0,
        message="任务已提交",
    )


@router.get("/status/{task_id}", response_model=TaskResponse)
async def get_status(task_id: str):
    task = task_manager.get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="任务不存在")

    result_url = None
    if task.status == "completed":
        result_url = f"/api/enhance/download/{task_id}"

    return TaskResponse(
        task_id=task.task_id,
        status=task.status,
        progress=task.progress,
        result_url=result_url,
        error=task.error,
    )


@router.head("/download/{task_id}")
@router.get("/download/{task_id}")
async def download_result(task_id: str):
    task = task_manager.get_task(task_id)
    if task is None or task.status != "completed" or task.result_path is None:
        raise HTTPException(status_code=404, detail="任务不存在或尚未完成")

    if not task.result_path.exists():
        raise HTTPException(status_code=404, detail="结果文件不存在")

    suffix = task.result_path.suffix.lower()
    media_type = _MIME_MAP.get(suffix, "image/png")

    return FileResponse(
        path=task.result_path,
        media_type=media_type,
        filename=f"enhanced_{task_id}{suffix}",
    )


@router.get("/preview/{task_id}")
async def preview_result(task_id: str):
    task = task_manager.get_task(task_id)
    if task is None or task.status != "completed" or task.result_path is None:
        raise HTTPException(status_code=404, detail="任务不存在或尚未完成")

    if not task.result_path.exists():
        raise HTTPException(status_code=404, detail="结果文件不存在")

    suffix = task.result_path.suffix.lower()
    media_type = _MIME_MAP.get(suffix, "image/png")

    return FileResponse(
        path=task.result_path,
        media_type=media_type,
    )
