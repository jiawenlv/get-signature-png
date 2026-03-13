# 印章提取工具

上传含有印章的图片，自动提取印章并生成透明背景 PNG。

## 功能特点

- **三种提取方法**：颜色提取（HSV 色彩空间）、AI 背景移除（rembg + BiRefNet）、自动模式（智能选择最佳方法）
- **多颜色支持**：红色、蓝色、紫色印章均可提取
- **图像增强**：可选的图像增强处理，提升提取效果
- **透明背景 PNG 输出**：提取结果为 RGBA 格式 PNG，背景完全透明

## 环境要求

- Python 3.12+
- Node.js 20+
- [uv](https://docs.astral.sh/uv/) — Python 包管理器
- libmagic — 文件类型检测
  - macOS: `brew install libmagic`
  - Ubuntu/Debian: `sudo apt install libmagic1`

## 快速开始

### 开发模式

前后端分别启动，前端通过 Vite 代理请求到后端。

```bash
# 启动后端（端口 8090）
cd backend
uv sync
uv run uvicorn app.main:app --host 0.0.0.0 --port 8090 --reload

# 另一个终端，启动前端（端口 5173）
cd frontend
npm install
npm run dev
```

访问 http://localhost:5173 使用应用。

### 生产模式

构建前端后，由后端统一提供服务。

```bash
# 构建前端
cd frontend
npm install
npm run build

# 启动后端
cd ../backend
uv sync
uv run uvicorn app.main:app --host 0.0.0.0 --port 8090
```

访问 http://localhost:8090 使用应用。

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React + TypeScript + TailwindCSS + Vite |
| 后端 | FastAPI + rembg + OpenCV |
| 包管理 | uv (Python) / npm (Node.js) |

## 项目结构

```
get-signature-png/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI 应用入口
│   │   ├── config.py        # 配置项
│   │   ├── routers/         # API 路由
│   │   ├── services/        # 业务逻辑（提取、任务管理）
│   │   ├── models/          # 数据模型
│   │   └── utils/           # 工具函数
│   ├── uploads/             # 上传文件临时目录
│   ├── outputs/             # 提取结果输出目录
│   └── pyproject.toml
├── frontend/
│   ├── src/                 # React 源码
│   ├── vite.config.ts
│   └── package.json
└── specs/                   # 设计文档与实施计划
```
