import { readApi } from '@/lib/api'

export interface RuntimeToolStatus {
  id: string
  description: string
  installed: boolean
}

export interface RuntimeEnvironmentReport {
  tools: RuntimeToolStatus[]
  missing: string[]
  ready: boolean
}

export interface RuntimeInstallResult {
  success: boolean
  error?: string
  result?: { message?: string; status?: string } | null
}

export function fetchRuntimeEnvironment(): Promise<RuntimeEnvironmentReport> {
  return fetch('/api/system/runtime').then((response) => readApi(response, '环境检测失败'))
}

export function installRuntimeTool(tool: string): Promise<RuntimeInstallResult> {
  return fetch('/api/system/runtime/install', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool }),
  }).then((response) => readApi(response, `安装 ${tool} 失败`))
}
