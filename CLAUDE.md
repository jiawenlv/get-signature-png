# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

印章提取工具（Stamp Extractor）— 从图片中提取印章并输出透明背景 PNG。前后端分离的 Web 应用。

## Development Commands

### Backend (FastAPI + Python 3.12+, uv)

```bash
cd backend
uv sync                    # 安装依赖
uv run uvicorn app.main:app --host 0.0.0.0 --port 8090 --reload  # 开发模式
```

macOS 需要 `brew install libmagic`（python-magic 依赖）。

### Frontend (React 19 + Vite + TypeScript + TailwindCSS)

```bash
cd frontend
npm install
npm run dev      # 开发服务器，自动代理 /api 到后端 :8090
npm run build    # 生产构建
npm run lint     # ESLint 检查
```

### HTTPS 开发模式

Vite 已配置自动检测 `frontend/` 目录下的 mkcert 证书，检测到时自动启用 HTTPS（局域网访问、EyeDropper / showSaveFilePicker 等安全上下文 API 需要 HTTPS）。

**生成本地证书（仅首次）：**

```bash
brew install mkcert
mkcert -install
cd frontend
mkcert localhost 127.0.0.1 ::1 <你的局域网IP>   # 生成 localhost+N.pem / localhost+N-key.pem
```

**启动前后端：**

```bash
# 终端 1 — 后端
cd backend
uv run uvicorn app.main:app --host 0.0.0.0 --port 8090 --reload

# 终端 2 — 前端（检测到证书后自动 HTTPS）
cd frontend
npm run dev
# → https://localhost:5173/
```

### Health Check

```bash
curl http://localhost:8090/api/health
```

## Architecture

**异步任务模式：** 前端上传图片 → 后端返回 task_id (202) → 前端 500ms 轮询状态 → 完成后下载 PNG。

**后端核心流程：**
上传图片 → 魔数验证 → rembg AI 背景移除 (BiRefNet, 懒加载) → 模式分支处理 → 自动裁剪 → 输出缩放 → PNG

**两种提取模式：**
- `original`：保留原色，通过 Alpha 二值化 + 饱和度过滤去除非印章内容
- `recolor`：灰度二值化识别墨水像素，填充指定颜色（支持自动从原图采样）

**任务管理：** 纯内存字典（无数据库），1 小时过期自动清理任务及关联文件。

**开发时代理：** Vite 将 `/api/*` 代理到 `localhost:8090`，无需处理 CORS。

## API Endpoints

所有端点挂载在 `/api/stamp/` 前缀下：

- `POST /api/stamp/extract` — 提交提取任务（FormData: file + 参数），返回 202 + task_id
- `GET /api/stamp/status/{task_id}` — 轮询任务进度（status/progress/error）
- `GET /api/stamp/download/{task_id}` — 下载结果 PNG（attachment）
- `GET /api/stamp/preview/{task_id}` — 预览结果 PNG（inline）

## Key Configuration (backend/app/config.py)

- 上传限制：20MB，支持 JPEG/PNG/BMP/TIFF
- 文件目录：`backend/uploads/`（临时）、`backend/outputs/`（结果）
- 任务过期：3600 秒，每 10 分钟清理

## Design Docs

详细设计文档在 `specs/` 目录：需求分析、架构设计、实施计划。
