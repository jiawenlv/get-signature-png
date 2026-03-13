import asyncio
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.config import OUTPUT_DIR
from app.models.schemas import TaskResponse
from app.services.extractor import extract_stamp as do_extract_stamp
from app.services.task_manager import task_manager
from app.utils.file_utils import save_upload, validate_file

router = APIRouter(prefix="/api/stamp", tags=["stamp"])


async def _process_stamp(
    task_id: str,
    input_path: Path,
    color: str,
    remove_text: bool = False,
    saturation_threshold: int = 80,
    mode: str = "original",
    brightness_threshold: int = 128,
    output_size: int = 512,
    custom_color: str = "",
) -> None:
    """在后台线程中执行印章提取。"""
    try:
        output_path = OUTPUT_DIR / f"{task_id}.png"

        def on_progress(progress: int) -> None:
            task_manager.update_task(task_id, progress=progress)

        await asyncio.to_thread(
            do_extract_stamp,
            input_path,
            color,
            output_path,
            on_progress,
            remove_text,
            saturation_threshold,
            mode,
            brightness_threshold,
            output_size,
            custom_color,
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


@router.post("/extract", status_code=202, response_model=TaskResponse)
async def extract_stamp(
    file: UploadFile = File(...),
    color: str = Form("red"),
    mode: str = Form("original"),
    remove_text: bool = Form(False),
    saturation_threshold: int = Form(80),
    brightness_threshold: int = Form(128),
    output_size: int = Form(512),
    custom_color: str = Form(""),
):
    valid, error_msg = await validate_file(file)
    if not valid:
        raise HTTPException(status_code=400, detail=error_msg)

    content = await file.read()
    suffix = Path(file.filename).suffix if file.filename else ".jpg"
    input_path = save_upload(content, suffix)

    task_id = task_manager.create_task()

    asyncio.get_event_loop().create_task(
        _process_stamp(
            task_id, input_path, color, remove_text,
            saturation_threshold, mode, brightness_threshold, output_size, custom_color,
        )
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
        result_url = f"/api/stamp/download/{task_id}"

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

    return FileResponse(
        path=task.result_path,
        media_type="image/png",
        filename=f"stamp_{task_id}.png",
    )


@router.get("/preview/{task_id}")
async def preview_result(task_id: str):
    task = task_manager.get_task(task_id)
    if task is None or task.status != "completed" or task.result_path is None:
        raise HTTPException(status_code=404, detail="任务不存在或尚未完成")

    if not task.result_path.exists():
        raise HTTPException(status_code=404, detail="结果文件不存在")

    return FileResponse(
        path=task.result_path,
        media_type="image/png",
    )
