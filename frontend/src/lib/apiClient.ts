// Lightweight fetch wrapper that can be pointed to your API gateway
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export const apiBaseUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim().replace(/\/$/, '') ?? ''

export function resolveApiPath(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  if (!apiBaseUrl) return path
  return `${apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`
}

export async function apiFetch<T>(path: string, options: { method?: HttpMethod; body?: any; token?: string } = {}): Promise<T> {
  const { method = 'GET', body, token } = options
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(resolveApiPath(path), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API ${method} ${path} failed: ${res.status} ${text}`)
  }
  return (await res.json()) as T
}
