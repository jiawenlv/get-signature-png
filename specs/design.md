# 印章提取 Web 应用 — 设计方案

## 1. 项目概述

一个本地运行的 Web 应用，用户上传含印章的图片，系统自动提取印章并生成透明背景的 PNG 图片。

**部署环境**: M3 MacBook Pro 本地运行，局域网内用户通过浏览器访问。

## 2. 技术栈

| 层级 | 技术选型 | 说明 |
|------|---------|------|
| 前端 | React 19 + TypeScript + TailwindCSS 4 + Vite | SPA 单页应用 |
| 后端 | Python + FastAPI | 异步 API 服务 |
| 图像处理 | rembg (BiRefNet) + OpenCV + Pillow | 印章提取核心引擎 |
| 图像增强 | Real-ESRGAN (可选) | 超分辨率增强 |

> **简化说明**: 由于是本地单机部署、局域网少量用户使用，不需要 Celery/Redis/PostgreSQL/S3 等分布式组件。直接使用内存任务管理 + 本地文件存储即可。

## 3. 项目结构

```
get-signature-png/
├── specs/                      # 需求与设计文档
│   ├── requirement-analysis.md
│   └── design.md
├── frontend/                   # 前端项目 (Vite + React)
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── index.html
│   ├── tailwind.config.ts
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── api/                # API 请求封装
│       │   └── client.ts
│       ├── components/         # UI 组件
│       │   ├── UploadZone.tsx      # 拖拽/点击上传区域
│       │   ├── ImagePreview.tsx    # 原图预览
│       │   ├── ResultView.tsx      # 结果展示 + 下载
│       │   ├── ProcessingStatus.tsx # 处理进度指示
│       │   └── SettingsPanel.tsx   # 处理参数设置
│       ├── hooks/
│       │   └── useStampExtract.ts  # 上传+轮询封装
│       └── types/
│           └── index.ts
├── backend/                    # 后端项目
│   ├── pyproject.toml          # 项目依赖 (uv)
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py             # FastAPI 入口, CORS 配置
│   │   ├── config.py           # 配置项
│   │   ├── routers/
│   │   │   └── stamp.py        # 印章处理路由
│   │   ├── services/
│   │   │   ├── extractor.py    # 印章提取服务 (调度颜色/AI)
│   │   │   ├── color_filter.py # HSV 颜色空间提取
│   │   │   ├── ai_remover.py   # rembg AI 背景移除
│   │   │   └── enhancer.py     # 图像增强 (可选)
│   │   ├── models/
│   │   │   └── schemas.py      # Pydantic 请求/响应模型
│   │   └── utils/
│   │       ├── file_utils.py   # 文件校验、路径管理
│   │       └── image_utils.py  # 图像格式转换工具
│   ├── uploads/                # 上传文件临时存储 (gitignore)
│   └── outputs/                # 处理结果存储 (gitignore)
└── README.md
```

## 4. 核心流程

```
用户上传图片 → 后端接收 → 印章提取处理 → 返回透明 PNG

详细流程:
┌─────────┐    POST /api/stamp/extract     ┌──────────┐
│  前端    │ ──────────────────────────────→ │  后端    │
│ (React) │    multipart/form-data          │(FastAPI) │
└────┬────┘                                 └────┬─────┘
     │                                           │
     │                                    ┌──────▼──────┐
     │                                    │ 文件校验     │
     │                                    │ (格式/大小)  │
     │                                    └──────┬──────┘
     │                                           │
     │                                    ┌──────▼──────┐
     │                                    │ 印章提取引擎 │
     │                                    │ (同步处理)   │
     │                                    └──────┬──────┘
     │                                           │
     │     返回 task_id (202 Accepted)           │ 耗时任务 →
     │ ←─────────────────────────────────────────┘ 后台线程处理
     │
     │    GET /api/stamp/status/{task_id}
     │ ──────────────────────────────────────→ 轮询任务状态
     │ ←──── { status: "completed", url: "..." }
     │
     │    GET /api/stamp/download/{task_id}
     │ ──────────────────────────────────────→ 下载结果 PNG
     │ ←──── 透明背景 PNG 文件流
```

## 5. API 设计

### 5.1 上传并提取印章

```
POST /api/stamp/extract
Content-Type: multipart/form-data

参数:
  - file: 图片文件 (必填, 支持 jpg/png/bmp/tiff, 最大 20MB)
  - method: 提取方法 (可选, "auto" | "color" | "ai", 默认 "auto")
  - color: 目标印章颜色 (可选, "red" | "blue" | "purple", 默认 "red")
  - enhance: 是否启用增强 (可选, bool, 默认 false)

响应 202:
{
  "task_id": "uuid-string",
  "status": "processing",
  "message": "任务已提交"
}
```

### 5.2 查询任务状态

```
GET /api/stamp/status/{task_id}

响应 200:
{
  "task_id": "uuid-string",
  "status": "processing" | "completed" | "failed",
  "progress": 60,           // 进度百分比 (0-100)
  "result_url": "/api/stamp/download/{task_id}",  // 完成时返回
  "error": null              // 失败时返回错误信息
}
```

### 5.3 下载结果

```
GET /api/stamp/download/{task_id}

响应 200:
Content-Type: image/png
Content-Disposition: attachment; filename="stamp_{task_id}.png"
(PNG 文件流)
```

### 5.4 预览结果 (内联展示)

```
GET /api/stamp/preview/{task_id}

响应 200:
Content-Type: image/png
(PNG 文件流, 无 Content-Disposition, 供 <img> 标签使用)
```

## 6. 印章提取引擎设计

采用**分层策略**，根据用户选择或自动判断使用不同方法：

### 6.1 方法一：HSV 颜色空间提取 (method="color")

适用于背景干净、印章颜色鲜明的场景。速度快，无需 GPU。

```
输入图片 → BGR 转 HSV → 颜色阈值过滤 → 生成掩码
→ 形态学操作 (开/闭运算去噪) → 掩码应用到 Alpha 通道
→ 边缘高斯模糊 (软掩码) → 输出透明 PNG
```

**红色印章的 HSV 范围** (OpenCV H: 0-179):
- 低色相区: H=0~10, S=70~255, V=50~255
- 高色相区: H=170~179, S=70~255, V=50~255
- 两组掩码 Bitwise OR 合并

### 6.2 方法二：AI 背景移除 (method="ai")

适用于复杂背景、印章与背景颜色相近的场景。精度高，速度较慢。

```
输入图片 → rembg (BiRefNet 模型) → Alpha Matting 边缘优化
→ 输出透明 PNG
```

- 模型选择: `birefnet-general` (边缘精度最优)
- 启动时预加载 session，避免重复初始化
- M3 芯片通过 ONNX Runtime 的 CoreML EP 加速推理

### 6.3 方法三：自动模式 (method="auto", 默认)

```
输入图片 → 先尝试颜色提取 → 评估提取质量
  → 质量达标 → 返回颜色提取结果
  → 质量不足 → 回退到 AI 方法
```

质量评估指标：
- 提取区域面积占比 (过大或过小则不合理)
- 提取区域连通性 (印章通常是单一连通区域)
- 边缘完整性评分

### 6.4 图像增强 (enhance=true, 可选)

当用户启用增强时，在提取完成后额外处理：
- CLAHE 对比度增强 → 锐化掩码 → Real-ESRGAN 2x 超分辨率
- 注意: Real-ESRGAN 模型较大 (~60MB)，首次使用需下载

## 7. 后台任务管理

由于是单机部署，使用 **Python asyncio + 内存字典** 管理任务，无需引入 Celery/Redis：

```python
# 内存任务存储
tasks: dict[str, TaskInfo] = {}

@dataclass
class TaskInfo:
    task_id: str
    status: str          # "processing" | "completed" | "failed"
    progress: int        # 0-100
    created_at: datetime
    result_path: str | None
    error: str | None
```

- 图像处理在 `asyncio.to_thread()` 中执行，不阻塞 API 响应
- 定时清理超过 1 小时的任务和文件，防止磁盘堆积
- 服务重启后任务丢失可接受 (局域网工具场景)

## 8. 前端设计

### 8.1 页面布局

单页应用，一个页面完成全部操作：

```
┌─────────────────────────────────────────────┐
│  🔏 印章提取工具            [⚙ 设置]        │
├─────────────────────────────────────────────┤
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │                                     │    │
│  │    拖拽上传图片 或 点击选择文件      │    │
│  │    支持 JPG / PNG / BMP / TIFF      │    │
│  │                                     │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌──── 原图 ─────┐  ┌──── 结果 ─────┐     │
│  │               │  │               │      │
│  │   原始图片    │  │  提取的印章    │      │
│  │   预览        │  │  (棋盘格背景)  │      │
│  │               │  │               │      │
│  └───────────────┘  └───────────────┘      │
│                                             │
│  ──────── 处理进度条 ────────                │
│                                             │
│         [ 📥 下载 PNG ]                     │
│                                             │
├─────────────────────────────────────────────┤
│  设置面板 (折叠):                            │
│  - 提取方法: [自动] [颜色] [AI]             │
│  - 印章颜色: [红色] [蓝色] [紫色]          │
│  - 启用增强: [开关]                         │
└─────────────────────────────────────────────┘
```

### 8.2 交互流程

1. **上传**: 拖拽或点击上传，使用 `URL.createObjectURL()` 即时本地预览
2. **处理中**: 显示进度条，每 500ms 轮询 `/api/stamp/status/{task_id}`
3. **完成**: 右侧展示结果 (棋盘格透明背景)，提供下载按钮
4. **失败**: 显示错误信息，提供重试按钮

### 8.3 关键组件

| 组件 | 职责 |
|------|------|
| `UploadZone` | 拖拽/点击上传，文件类型和大小前端校验 |
| `ImagePreview` | 原图预览，支持缩放 |
| `ResultView` | 结果展示，棋盘格透明背景，图片缩放 |
| `ProcessingStatus` | 进度条 + 状态文字 |
| `SettingsPanel` | 提取方法、颜色、增强选项 |

## 9. 启动与运行

### 9.1 后端启动

```bash
cd backend
uv sync                          # 安装依赖
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

绑定 `0.0.0.0` 使局域网设备可访问。

### 9.2 前端启动 (开发模式)

```bash
cd frontend
npm install
npm run dev -- --host             # Vite dev server, 局域网可访问
```

### 9.3 前端构建 (生产模式)

```bash
cd frontend
npm run build                     # 构建到 dist/
```

生产模式下，由 FastAPI 直接 serve 前端静态文件：

```python
# backend/app/main.py
app.mount("/", StaticFiles(directory="../frontend/dist", html=True))
```

这样只需启动后端一个服务即可同时提供前后端。

## 10. 依赖清单

### 后端 Python 依赖

```toml
[project]
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.34",
    "python-multipart>=0.0.18",    # FastAPI 文件上传
    "rembg[cpu]>=2.0",             # AI 背景移除 (CPU 版本)
    "onnxruntime>=1.20",           # ONNX 推理引擎
    "opencv-python-headless>=4.10", # 图像处理 (无 GUI)
    "Pillow>=11.0",                # 图像格式转换
    "python-magic>=0.4",           # 文件类型检测
]

[project.optional-dependencies]
enhance = [
    "realesrgan>=0.3",             # 超分辨率增强
    "torch>=2.5",                  # PyTorch (Real-ESRGAN 依赖)
]
```

### 前端 npm 依赖

```json
{
  "dependencies": {
    "react": "^19",
    "react-dom": "^19"
  },
  "devDependencies": {
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "typescript": "^5.7",
    "@vitejs/plugin-react": "^4",
    "vite": "^6",
    "tailwindcss": "^4",
    "@tailwindcss/vite": "^4"
  }
}
```

## 11. CORS 配置

开发模式下前端 (Vite :5173) 和后端 (:8000) 端口不同，需配置 CORS：

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 局域网场景，允许所有来源
    allow_methods=["*"],
    allow_headers=["*"],
)
```

## 12. M3 芯片优化考量

- **ONNX Runtime**: 使用 CoreML Execution Provider 可利用 M3 的 Neural Engine 加速推理
- **OpenCV**: `opencv-python-headless` 在 ARM64 macOS 上已有原生优化
- **内存**: BiRefNet 模型加载约需 1-2GB 内存，M3 MacBook Pro 完全足够
- **首次启动**: rembg 会自动下载模型文件 (~400MB)，后续从缓存加载

## 13. 安全性

- 文件类型检测: 使用 `python-magic` 校验文件魔数，拒绝伪装文件
- 文件大小限制: 上传最大 20MB
- 文件名清理: 不使用用户原始文件名存储，使用 UUID
- 临时文件清理: 定期清理过期任务的上传和输出文件
- 无用户认证: 局域网可信环境，不设计登录系统
