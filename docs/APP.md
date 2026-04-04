# Secbot 移动应用文档

`app/` 目录是基于 **Expo + React Native** 的移动端工程，同时支持 iOS、Android 与 Web 调试。它通过 REST + SSE 调用 NestJS 后端。

## 技术栈

- React Native `0.81`
- Expo `54`
- React Navigation `7`
- TypeScript
- 自定义 SSE 客户端

## 当前目录结构

```text
app/
├── App.tsx
├── package.json
├── index.ts
└── src/
    ├── api/
    │   ├── client.ts
    │   ├── config.ts
    │   ├── endpoints.ts
    │   └── sse.ts
    ├── components/
    │   ├── BlockRenderer.tsx
    │   ├── RootPermissionModal.tsx
    │   ├── MessageBubble.tsx
    │   └── ...
    ├── hooks/
    ├── screens/
    │   ├── ChatScreen.tsx
    │   ├── DashboardScreen.tsx
    │   ├── DefenseScreen.tsx
    │   ├── NetworkScreen.tsx
    │   └── HistoryScreen.tsx
    ├── theme/
    └── types/
```

## 功能概览

### 1. 聊天页

`ChatScreen.tsx` 目前支持：

- `ask` / `agent` 两种模式
- `secbot-cli` / `superhackbot` 两种智能体选择
- 模型偏好切换
- SSE 流式渲染规划、推理、执行、报告、最终响应
- 收到 `root_required` 时弹出 `RootPermissionModal`

### 2. 仪表盘页

展示：

- `GET /api/system/info`
- `GET /api/system/status`

### 3. 防御页

调用：

- `POST /api/defense/scan`
- `GET /api/defense/status`
- `GET /api/defense/blocked`
- `POST /api/defense/unblock`
- `GET /api/defense/report`

### 4. 网络页

调用：

- `POST /api/network/discover`
- `GET /api/network/targets`
- `GET /api/network/authorizations`
- `POST /api/network/authorize`
- `DELETE /api/network/authorize/{target_ip}`

### 5. 历史页

调用：

- `GET /api/db/history`
- `DELETE /api/db/history`

## 启动开发环境

### 1. 先启动后端

```bash
# 安装依赖（仅首次）
npm install

# 开发模式启动 NestJS 后端
npm run dev

# 或生产模式
npm start
```

后端默认监听端口 `8000`，可通过环境变量 `PORT` 修改。

### 2. 启动 Expo

```bash
cd app
npm install
npm start
```

常用命令：

```bash
npm run ios
npm run android
npm run web
```

## 后端地址配置

文件：

`app/src/api/config.ts`

当前默认逻辑：

- Android 模拟器：`http://10.0.2.2:8000`
- iOS 模拟器 / Web：`http://localhost:8000`

真机调试时，请把地址改成开发机局域网 IP，例如：

```ts
const DEV_API_HOST = "http://192.168.1.100:8000";
```

同时确保后端监听在对外可访问的地址上。

## API 使用方式

### REST 请求

统一封装在：

- `app/src/api/client.ts`
- `app/src/api/endpoints.ts`

示例：

```ts
import { getSystemInfo, defenseScan } from "./src/api/endpoints";

const info = await getSystemInfo();
const report = await defenseScan();
```

### SSE 流式聊天

`ChatScreen.tsx` 会向 `POST /api/chat` 发送请求，并消费以下事件：

- `planning`
- `thought_start`
- `thought_chunk`
- `thought`
- `action_start`
- `action_result`
- `content`
- `report`
- `phase`
- `root_required`
- `response`
- `done`

如果用户在设备上确认 root 权限动作，则会调用：

```text
POST /api/chat/root-response
```

## 构建与发布

### 开发阶段

优先使用：

```bash
npm start
```

### EAS Build

如需云端构建：

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform ios
eas build --platform android
```

## 维护建议

- 如果后端 SSE 事件结构有变动，优先同步 `app/src/types/index.ts` 和 `ChatScreen.tsx`
- 如果新增 API 接口，优先补到 `app/src/api/endpoints.ts`
- 如果要调试真机网络问题，先用浏览器或 `curl` 验证后端地址是否可达
