/** How many problems the import toast lists before it says how many more there are. */
const MAX_LISTED_ERRORS = 10

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

export function summarizeErrors(errors: string[]): string {
  const listed = errors.slice(0, MAX_LISTED_ERRORS)
  const hidden = errors.length - listed.length
  return hidden > 0 ? [...listed, `…and ${hidden} more`].join('\n') : listed.join('\n')
}
