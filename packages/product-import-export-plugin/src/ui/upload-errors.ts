// Mirrors src/dashboard/upload-errors.ts: the Angular extension compiles only the ui folder, so it cannot import from dashboard.

/** The `errors` a rejected upload answers with (HTTP 400, `{ errors: string[] }`), else none. */
export async function readUploadErrors(res: Response): Promise<string[]> {
  if (res.status !== 400) {
    return []
  }
  try {
    const body = (await res.json()) as { errors?: unknown }
    return Array.isArray(body.errors) ? body.errors.map(String) : []
  } catch {
    return []
  }
}
