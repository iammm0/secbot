// ===================================================================
// API 配置 — 调试时修改此处使真机/模拟器连上后端
// ===================================================================

import { Platform } from 'react-native';

/**
 * 后端 Base URL。后端需以 uvicorn --host 0.0.0.0 启动才能被真机访问。
 * - iOS 模拟器 / Web: localhost 即可
 * - Android 模拟器: 10.0.2.2
 * - 真机: 改为本机局域网 IP，如 'http://192.168.1.100:8000'（ifconfig / ipconfig 查看）
 */
const DEV_API_HOST =
  Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://localhost:8000';

export const BASE_URL = DEV_API_HOST;
