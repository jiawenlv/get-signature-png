import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.routers import enhance, stamp
from app.services.task_manager import start_cleanup_loop


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时：开启任务清理循环
    cleanup_task = asyncio.create_task(start_cleanup_loop())
    yield
    # 关闭时：取消清理任务
    cleanup_task.cancel()


app = FastAPI(title="小吕的图像工作室", lifespan=lifespan)

# CORS 中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(stamp.router)
app.include_router(enhance.router)

@app.get("/api/health")
async def health_check():
    return {"status": "ok"}


# 生产模式：serve 前端静态文件
frontend_dist = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if frontend_dist.is_dir():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")
