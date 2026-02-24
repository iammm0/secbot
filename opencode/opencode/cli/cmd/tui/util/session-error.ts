/**
 * User-facing message when API/auth fails. Shown in toast and inline error box.
 */
export const AUTH_ERROR_MESSAGE =
  "API 认证失败，请使用 /models 重新配置 API Key。"

export function isSessionErrorAuthRelated(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const obj = error as { name?: string; data?: { message?: string; statusCode?: number } }
  if (obj.name === "ProviderAuthError") return true
  if (obj.name === "APIError" && obj.data?.statusCode === 401) return true
  const msg = obj.data?.message ?? ""
  if (typeof msg !== "string") return false
  return (
    msg.includes("401") ||
    msg.includes("authentication_error") ||
    /认证失败|invalid.*api.*key|Authentication Fails/i.test(msg)
  )
}

export function formatSessionErrorMessage(error: unknown): string {
  if (!error) return "An error occurred"
  if (typeof error !== "object") return String(error)
  if (isSessionErrorAuthRelated(error)) return AUTH_ERROR_MESSAGE
  const data = (error as { data?: { message?: string } }).data
  if (data && "message" in data && typeof data.message === "string") return data.message
  return String(error)
}
