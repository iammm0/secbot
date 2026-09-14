export function unwrapData<T>(json: unknown): T {
  if (json && typeof json === 'object' && 'data' in json) {
    const data = (json as { data: T }).data
    if (data !== undefined) return data
  }
  return json as T
}

export async function readApi<T>(response: Response, fallbackMessage: string): Promise<T> {
  const json: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const wrapped = json && typeof json === 'object' ? (json as { message?: string; data?: { message?: string } }) : null
    const message = wrapped?.message || wrapped?.data?.message || fallbackMessage
    throw new Error(message)
  }
  return unwrapData<T>(json)
}
