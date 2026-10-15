export async function request<T>(path: string, body?: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    })
  } catch {
    throw new Error('Could not reach Barrow. Check your connection and try again.')
  }
  const data: any = await response.json().catch(() => null)
  if (!response.ok || data?.error) {
    const detail = typeof data?.error?.message === 'string' ? data.error.message : `The request failed (${response.status}). Please try again.`
    throw new Error(detail)
  }
  if (data === null) throw new Error('Barrow returned an unreadable response. Please try again.')
  return data as T
}

export const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'The request could not be completed.'
