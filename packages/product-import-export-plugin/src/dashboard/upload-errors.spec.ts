import { describe, expect, it } from 'vitest'
import { readUploadErrors, summarizeErrors } from './upload-errors'

describe('readUploadErrors', () => {
  it('returns the errors of a 400 answer', async () => {
    const res = new Response(JSON.stringify({ errors: ['Row 2: no variant with SKU X'] }), {
      status: 400,
    })
    expect(await readUploadErrors(res)).toEqual(['Row 2: no variant with SKU X'])
  })

  it('returns none for other statuses or a body that is not the error shape', async () => {
    expect(await readUploadErrors(new Response('boom', { status: 500 }))).toEqual([])
    expect(await readUploadErrors(new Response('not json', { status: 400 }))).toEqual([])
    expect(await readUploadErrors(new Response('{}', { status: 400 }))).toEqual([])
  })
})

describe('summarizeErrors', () => {
  it('lists up to ten errors, one per line', () => {
    expect(summarizeErrors(['a', 'b'])).toBe('a\nb')
  })

  it('says how many more there are past ten', () => {
    const errors = Array.from({ length: 12 }, (_, i) => `e${i}`)
    expect(summarizeErrors(errors).split('\n')).toEqual([...errors.slice(0, 10), '…and 2 more'])
  })
})
