# Hackbot 跨平台移动应用文档

## 概述

Hackbot 提供基于 React Native 的跨平台移动应用，支持 iOS、Android 和 Web 平台。应用通过 REST API 和 SSE 与后端服务通信，实现完整的聊天、防御系统、网络管理和数据库管理功能。

## 技术栈

- **框架**: React Native (Expo)
- **导航**: React Navigation (Bottom Tabs)
- **UI 组件**: Expo Vector Icons
- **API 通信**: Fetch API + SSE (Server-Sent Events)
- **构建**: Expo (eas build)

## 项目结构

```
app/
├── App.tsx                    # 应用入口 + Tab 导航
├── app.json                   # Expo 配置
├── package.json              # 依赖配置
├── index.ts                   # 入口文件
├── tsconfig.json             # TypeScript 配置
├── assets/                   # 静态资源
└── src/
    ├── api/                  # API 客户端
    │   ├── client.ts        # 统一 REST 请求封装
    │   ├── config.ts        # API 配置 (Base URL)
    │   ├── endpoints.ts     # API 端点调用方法
    │   └── sse.ts          # SSE 客户端 (流式聊天)
    ├── components/          # 复用组件
    ├── screens/             # 屏幕组件
    │   ├── ChatScreen.tsx      # 聊天界面
    │   ├── DashboardScreen.tsx # 仪表盘
    │   ├── DefenseScreen.tsx   # 防御系统
    │   ├── NetworkScreen.tsx   # 网络管理
    │   └── HistoryScreen.tsx  # 对话历史
    ├── hooks/               # 自定义 Hooks
    ├── theme/               # 主题配置
    └── types/               # TypeScript 类型定义
```

## 快速开发与调试

| 操作           | 命令 |
|----------------|------|
| 安装依赖       | `cd app && npm install` |
| 启动开发服务器 | `npx expo start`（默认 http://localhost:8081） |
| iOS 模拟器     | `npx expo start --ios` |
| Android 模拟器 | `npx expo start --android` |
| Web 版本       | `npx expo start --web` |

**一键启动**（需先启动后端 API）：

```bash
# 终端 1：启动 API
uvicorn router.main:app --reload --host 0.0.0.0 --port 8000

# 终端 2：启动 App
cd app && npm install && npx expo start
```

按 `i` 打开 iOS 模拟器，`a` 打开 Android 模拟器，`w` 在浏览器中打开。真机调试时请将 `src/api/config.ts` 中的 `BASE_URL` 改为本机局域网 IP。

---

## 安装与运行

### 前置要求

- Node.js 18+
- npm 或 yarn
- Expo CLI
- iOS: macOS + Xcode (真机调试)
- Android: Android Studio (真机调试)

### 安装依赖

```bash
cd app
npm install
# 或使用 yarn
# yarn install
```

### 运行开发服务器

```bash
# 启动开发服务器 (默认 localhost:8081)
npm start

# iOS 模拟器
npm run ios

# Android 模拟器
npm run android

# Web 版本
npm run web
```

### 真机调试

1. **iOS 真机**:
   - 需要 Apple Developer 账号
   - 使用 `eas build` 构建或通过 Expo Go

2. **Android 真机**:
   - 安装 Expo Go 应用
   - 确保手机和电脑在同一局域网
   - 修改 `src/api/config.ts` 中的 `BASE_URL` 为本机局域网 IP

### 配置说明

修改 `src/api/config.ts` 配置后端地址：

```typescript
const DEV_API_HOST =
  Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://localhost:8000';

// 真机调试时改为本机局域网 IP
// const DEV_API_HOST = 'http://192.168.1.100:8000';

export const BASE_URL = DEV_API_HOST;
```

## 功能模块

### 1. 聊天界面 (Chat)

- **流式聊天**: 使用 SSE 实时接收 AI 响应
- **模式切换**: ask (仅提问)、plan (规划)、agent (执行)
- **智能体选择**: hackbot、superhackbot
- **ReAct 过程展示**: 规划、推理、执行、报告

### 2. 仪表盘 (Dashboard)

- **系统信息**: OS、架构、Python 版本、主机名等
- **系统状态**: CPU、内存、磁盘使用情况
- **快速操作**: 常用功能入口

### 3. 防御系统 (Defense)

- **安全扫描**: 执行完整安全扫描
- **监控状态**: 查看监控和自动响应状态
- **封禁管理**: 列出/解封被封禁的 IP
- **报告生成**: 生成漏洞/攻击报告

### 4. 网络管理 (Network)

- **内网发现**: 扫描内网在线主机
- **目标列表**: 列出已发现的目标
- **授权管理**: 授权/撤销目标主机
- **SSH 连接**: 通过用户名密码或密钥连接

### 5. 对话历史 (History)

- **历史记录**: 查看历史对话
- **智能体筛选**: 按智能体类型筛选
- **清空历史**: 清空对话记录

## API 集成

### REST API

应用通过 `src/api/endpoints.ts` 中的方法调用后端 API：

```typescript
// 聊天
import { chatSync } from './api/endpoints';
const response = await chatSync({ message: '扫描内网', mode: 'agent' });

// 系统信息
import { getSystemInfo } from './api/endpoints';
const info = await getSystemInfo();

// 防御扫描
import { defenseScan } from './api/endpoints';
const result = await defenseScan();
```

### SSE 流式聊天

```typescript
import { connectSSE } from './api/sse';

const controller = connectSSE('/api/chat', {
  message: '扫描内网主机',
  mode: 'agent'
}, {
  onEvent: (event) => {
    switch (event.event) {
      case 'planning':
        console.log('规划:', event.data);
        break;
      case 'thought':
        console.log('推理:', event.data.content);
        break;
      case 'action_result':
        console.log('执行结果:', event.data.result);
        break;
      case 'response':
        console.log('最终响应:', event.data.content);
        break;
    }
  },
  onError: (error) => {
    console.error('错误:', error);
  },
  onDone: () => {
    console.log('完成');
  }
});

// 取消请求
// controller.abort();
```

## 构建发布版本

### 使用 EAS Build

```bash
# 安装 eas-cli
npm install -g eas-cli

# 登录 Expo 账号
eas login

# 配置构建
eas build:configure

# iOS 构建
eas build --platform ios

# Android 构建
eas build --platform android

# 同时构建
eas build --platform all
```

### 本地构建

**iOS (macOS)**:
```bash
cd app
npx expo export --platform ios
# 使用 Xcode 打开导出目录构建
```

**Android**:
```bash
cd app
npx expo export --platform android
# 使用 Android Studio 打开导出目录构建
```

## 主题配置

应用支持深色主题，配置在 `src/theme/` 目录：

```typescript
// src/theme/colors.ts
export const Colors = {
  primary: '#00D9FF',
  background: '#0D1117',
  surface: '#161B22',
  text: '#FFFFFF',
  textMuted: '#8B949E',
  border: '#30363D',
  accent: '#FF6B6B',
};
```

## 屏幕截图

| 聊天界面 | 仪表盘 | 防御系统 |
|---------|-------|---------|
| 流式响应展示 | 系统状态监控 | 安全扫描 |

## 注意事项

1. **后端服务**: 确保 Hackbot 后端服务已启动 (`hackbot-server`)
2. **网络配置**: 真机调试时需配置正确的局域网 IP
3. **权限**: Android 需要网络权限，iOS 需要 Info.plist 配置
4. **SSL**: 生产环境建议使用 HTTPS

## 部署到应用商店

### iOS App Store

1. 使用 EAS Build 或本地构建生成 .ipa
2. 通过 App Store Connect 提交审核
3. 遵守 Apple 审核指南

### Google Play

1. 使用 EAS Build 生成 .aab
2. 通过 Google Play Console 提交
3. 遵守 Google Play 政策

## 相关文档

- [API 接口文档](API.md)
- [部署指南](../docs/DEPLOYMENT.md)
- [安全警告](../docs/SECURITY_WARNING.md)

