# 印章提取 Web 应用 — 实施计划

## 阶段总览

| 阶段 | 内容 | 产出 |
|------|------|------|
| P1 | 项目脚手架搭建 | 前后端项目初始化，可启动运行 |
| P2 | 后端核心 API | 文件上传、任务管理、下载接口 |
| P3 | HSV 颜色提取 | 基于颜色空间的印章提取能力 |
| P4 | AI 背景移除 | rembg + BiRefNet 集成 |
| P5 | 前端界面 | 上传、预览、结果展示、下载 |
| P6 | 自动模式与增强 | 智能方法选择、图像增强 |
| P7 | 联调与收尾 | 生产构建、整体测试、文档 |

---

## P1: 项目脚手架搭建

### P1.1 仓库初始化

- 初始化 git 仓库
- 创建 `.gitignore` (Python、Node、uploads/outputs 目录)

### P1.2 后端项目初始化

- 创建 `backend/pyproject.toml`，配置 uv 项目元数据和依赖
- 创建 `backend/app/__init__.py`
- 创建 `backend/app/main.py`，包含:
  - FastAPI app 实例
  - CORS 中间件配置
  - 健康检查端点 `GET /api/health`
  - 静态文件挂载 (为生产模式预留)
- 创建 `backend/app/config.py`，定义配置项:
  - `UPLOAD_DIR`、`OUTPUT_DIR` 路径
  - `MAX_FILE_SIZE` (20MB)
  - `ALLOWED_EXTENSIONS`
  - `TASK_EXPIRE_SECONDS` (3600)
- 创建 `backend/uploads/` 和 `backend/outputs/` 目录，添加 `.gitkeep`

验证:
```bash
cd backend && uv sync && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
# 访问 http://localhost:8000/api/health 返回 {"status": "ok"}
# 访问 http://localhost:8000/docs 查看 Swagger 文档
```

### P1.3 前端项目初始化

- 使用 Vite 创建 React + TypeScript 项目到 `frontend/`
- 安装并配置 TailwindCSS 4 (`@tailwindcss/vite`)
- 配置 `vite.config.ts`:
  - `server.proxy`: 将 `/api` 代理到 `http://localhost:8000`
  - `server.host: true` 局域网可访问
- 清理 Vite 默认模板文件，创建空白 App 框架
- 创建 `src/types/index.ts` 定义基础类型

验证:
```bash
cd frontend && npm install && npm run dev
# 浏览器访问 http://localhost:5173 看到空白页面
# 访问 http://localhost:5173/api/health 被代理到后端
```

---

## P2: 后端核心 API

### P2.1 Pydantic 模型定义

`backend/app/models/schemas.py`:

- `ExtractRequest`: method (auto/color/ai)、color (red/blue/purple)、enhance (bool)
- `TaskResponse`: task_id、status、progress、result_url、error、message
- `TaskStatus` 枚举: processing / completed / failed

### P2.2 任务管理器

`backend/app/services/task_manager.py`:

- 内存字典 `tasks: dict[str, TaskInfo]` 存储任务状态
- `create_task() -> str`: 创建任务，返回 task_id (UUID)
- `update_task(task_id, status, progress, result_path, error)`: 更新状态
- `get_task(task_id) -> TaskInfo | None`: 查询任务
- 后台清理: 使用 FastAPI 的 `lifespan` 事件启动定时清理协程，每 10 分钟扫描过期任务，删除关联文件

### P2.3 文件工具

`backend/app/utils/file_utils.py`:

- `validate_file(file: UploadFile) -> bool`: 校验文件大小和 MIME 类型 (python-magic)
- `save_upload(file: UploadFile) -> Path`: 以 UUID 命名保存到 uploads/，返回路径

### P2.4 印章处理路由

`backend/app/routers/stamp.py`:

- `POST /api/stamp/extract`:
  - 接收文件和参数
  - 校验文件合法性
  - 创建任务
  - 使用 `asyncio.to_thread()` 在后台线程启动处理 (此阶段先用占位函数，sleep 模拟)
  - 立即返回 202 + task_id
- `GET /api/stamp/status/{task_id}`:
  - 查询任务状态，返回 TaskResponse
  - 任务不存在返回 404
- `GET /api/stamp/download/{task_id}`:
  - 校验任务已完成
  - 返回 `FileResponse`，设置 Content-Disposition
- `GET /api/stamp/preview/{task_id}`:
  - 同 download 但不设 Content-Disposition (用于 `<img>` 标签)

验证:
```bash
# 上传测试图片
curl -X POST http://localhost:8000/api/stamp/extract -F "file=@test.jpg"
# 返回 {"task_id": "xxx", "status": "processing"}

# 轮询状态
curl http://localhost:8000/api/stamp/status/xxx
# 几秒后返回 {"status": "completed", "result_url": "..."}
```

---

## P3: HSV 颜色提取

### P3.1 颜色过滤服务

`backend/app/services/color_filter.py`:

- `extract_by_color(image_path: Path, color: str, output_path: Path) -> Path`
- 实现步骤:
  1. `cv2.imread()` 读取图片
  2. `cv2.cvtColor(img, cv2.COLOR_BGR2HSV)` 转换颜色空间
  3. 根据 color 参数选取 HSV 阈值范围:
     - red: 低区 H=0~10 + 高区 H=170~179, S=70~255, V=50~255
     - blue: H=100~130, S=70~255, V=50~255
     - purple: H=125~155, S=40~255, V=50~255
  4. `cv2.inRange()` 生成掩码，红色两区域做 `bitwise_or`
  5. 形态学操作: 开运算去噪 → 闭运算填孔
  6. 高斯模糊掩码边缘，生成软掩码
  7. `cv2.cvtColor(img, cv2.COLOR_BGR2BGRA)` 扩展为 4 通道
  8. 将软掩码应用到 Alpha 通道
  9. `cv2.imwrite()` 保存为 PNG

### P3.2 集成到提取服务

`backend/app/services/extractor.py`:

- `extract_stamp(image_path, method, color, enhance, output_path, on_progress)` 调度函数
- method="color" 时调用 `color_filter.extract_by_color()`
- `on_progress` 回调用于更新任务进度

### P3.3 接入路由

- 将 P2.4 中的占位函数替换为真实的 `extract_stamp()` 调用
- 处理过程中通过回调更新任务进度

验证:
```bash
# 上传一张含红色印章的图片
curl -X POST http://localhost:8000/api/stamp/extract \
  -F "file=@stamp_test.jpg" -F "method=color" -F "color=red"
# 等待完成后下载结果，确认印章已提取、背景透明
```

---

## P4: AI 背景移除

### P4.1 rembg 服务

`backend/app/services/ai_remover.py`:

- 应用启动时 (lifespan) 预加载 rembg session:
  ```python
  session = new_session("birefnet-general")
  ```
- `extract_by_ai(image_path: Path, output_path: Path) -> Path`
- 实现步骤:
  1. 读取图片二进制数据
  2. 调用 `rembg.remove(data, session=session, alpha_matting=True)`
  3. 保存结果到 output_path

### P4.2 集成到提取服务

- `extractor.py` 中 method="ai" 时调用 `ai_remover.extract_by_ai()`
- 更新进度: 读取图片 20% → AI 推理 80% → 保存 100%

验证:
```bash
curl -X POST http://localhost:8000/api/stamp/extract \
  -F "file=@complex_stamp.jpg" -F "method=ai"
# 确认复杂背景下印章提取效果
```

> 注意: 首次运行 rembg 会自动下载 BiRefNet 模型 (~400MB)，需等待。

---

## P5: 前端界面

### P5.1 API 客户端

`frontend/src/api/client.ts`:

- `extractStamp(file: File, options): Promise<TaskResponse>` — POST 上传
- `getTaskStatus(taskId: string): Promise<TaskResponse>` — GET 轮询
- `getPreviewUrl(taskId: string): string` — 拼接预览 URL
- `getDownloadUrl(taskId: string): string` — 拼接下载 URL

### P5.2 核心 Hook

`frontend/src/hooks/useStampExtract.ts`:

- 封装完整的上传 → 轮询 → 完成/失败流程
- 状态: `idle` | `uploading` | `processing` | `completed` | `failed`
- 返回: `{ status, progress, previewUrl, downloadUrl, error, upload, reset }`
- 轮询逻辑: 每 500ms 调用 `getTaskStatus`，completed/failed 时停止

### P5.3 上传区域组件

`frontend/src/components/UploadZone.tsx`:

- 拖拽上传 (onDragOver/onDrop)
- 点击选择文件 (hidden input + label)
- 前端校验: 文件类型 (image/jpeg, image/png, image/bmp, image/tiff)、大小 (<20MB)
- 上传后使用 `URL.createObjectURL()` 生成本地预览

### P5.4 图片预览组件

`frontend/src/components/ImagePreview.tsx`:

- 展示原图预览
- 支持图片适应容器 (object-contain)

### P5.5 结果展示组件

`frontend/src/components/ResultView.tsx`:

- 棋盘格 CSS 背景 (表示透明)
- 展示提取后的印章图片
- 下载按钮，触发 `<a download>` 下载

### P5.6 处理状态组件

`frontend/src/components/ProcessingStatus.tsx`:

- 进度条 (TailwindCSS 样式)
- 状态文字: "上传中..." / "处理中 60%" / "提取完成" / "处理失败"

### P5.7 设置面板组件

`frontend/src/components/SettingsPanel.tsx`:

- 可折叠面板
- 提取方法选择: 自动 / 颜色 / AI (radio group)
- 印章颜色: 红 / 蓝 / 紫 (radio group, 仅 method=color/auto 时可选)
- 增强开关 (toggle)

### P5.8 页面组装

`frontend/src/App.tsx`:

- 组合以上组件，管理整体状态流转
- 布局: 顶部标题栏 → 上传区 → 左右对比 (原图 / 结果) → 进度条 → 下载按钮 → 设置面板

验证:
- 拖拽图片上传，原图即时预览
- 处理进度条实时更新
- 完成后结果区显示棋盘格背景上的印章
- 点击下载获得 PNG 文件

---

## P6: 自动模式与增强

### P6.1 质量评估

`backend/app/services/extractor.py` 中添加评估逻辑:

- `evaluate_extraction(mask: ndarray) -> float` 返回 0~1 的质量分数
- 评估指标:
  - 面积占比: 提取区域占图片面积的 0.5%~30% 为合理
  - 连通性: 最大连通区域面积占总提取面积的比例
  - 组合为加权评分

### P6.2 自动模式实现

- method="auto" 时:
  1. 先执行颜色提取，计算质量分数
  2. 分数 >= 0.6 → 使用颜色提取结果
  3. 分数 < 0.6 → 回退到 AI 方法
- 更新进度: 颜色提取 0~40% → 评估 40~50% → (可能的) AI 提取 50~95% → 完成 100%

### P6.3 图像增强服务

`backend/app/services/enhancer.py`:

- `enhance_image(image_path: Path, output_path: Path) -> Path`
- 步骤:
  1. CLAHE 对比度增强
  2. 锐化掩码 (Unsharp Masking)
  3. (可选) Real-ESRGAN 2x 超分辨率 — 仅在安装 enhance 依赖组时可用
- 如果 Real-ESRGAN 未安装，仅执行前两步传统增强

验证:
```bash
# 自动模式测试
curl -X POST http://localhost:8000/api/stamp/extract \
  -F "file=@stamp.jpg" -F "method=auto"

# 增强模式测试
curl -X POST http://localhost:8000/api/stamp/extract \
  -F "file=@stamp.jpg" -F "enhance=true"
```

---

## P7: 联调与收尾

### P7.1 前端生产构建

- `npm run build` 构建到 `frontend/dist/`
- 后端 `main.py` 添加静态文件挂载:
  ```python
  app.mount("/", StaticFiles(directory="../frontend/dist", html=True))
  ```
- 确保 API 路由优先于静态文件 (路由注册顺序)

### P7.2 一键启动脚本

项目根目录创建启动方式:

```bash
# 开发模式 (前后端分别启动)
cd backend && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
cd frontend && npm run dev

# 生产模式 (仅启动后端)
cd frontend && npm run build
cd backend && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### P7.3 整体测试

- 准备多张测试图片:
  - 白底红色圆章
  - 白底蓝色印章
  - 带复杂文字背景的红色印章
  - 低清晰度扫描件印章
- 分别测试三种方法 (color / ai / auto) 的提取效果
- 测试增强开关的效果
- 测试局域网其他设备访问

### P7.4 README

- 项目简介
- 环境要求 (Python 3.12+、Node 20+、uv)
- 安装与启动步骤
- 使用说明
