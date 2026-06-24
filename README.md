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

### 局域网共享（一键启动）

把前端服务共享给同一局域网内的同伴使用，直接运行根目录脚本：

```bash
./start-lan.sh
```

脚本会自动完成：

- 探测本机当前局域网 IP（VPN 环境下自动回退到 `en0`/`en1`）
- 若 mkcert 证书缺失或不含当前 IP，则自动重新签发（HTTPS 安全上下文需要，取色 / 另存为等 API 依赖它）
- 按需安装前后端依赖（`node_modules` / `.venv`）
- 启动后端（FastAPI :8090）与前端（Vite :5173），并打印发给同伴的访问地址
- 按 `Ctrl+C` 同时停止前后端

启动后把打印出的地址（形如 `https://192.168.110.23:5173/`）发给同伴即可。注意事项：

- 同伴需与本机处于**同一局域网 / WiFi**
- 后端无需对外暴露，前端会在本机把 `/api` 代理到后端
- 同伴首次打开会提示「连接不是私密连接」——因其设备不信任本机 mkcert 根证书，属正常，点「高级」→「继续访问」即可，功能不受影响
- 首次安装 mkcert：`brew install mkcert && mkcert -install`

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
