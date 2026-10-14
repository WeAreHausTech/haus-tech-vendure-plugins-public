import { describe, expect, it } from 'vitest'
import { importProgressPercent } from './import-progress'

describe('importProgressPercent', () => {
  it('returns a whole number, because the job_record progress column is an integer', () => {
    // 1 of 9 products is 11.11...%, which Postgres rejects for an integer column.
    expect(importProgressPercent({ imported: 1, processed: 9 })).toBe(11)
    expect(importProgressPercent({ imported: 2, processed: 3 })).toBe(67)
  })

  it('returns 100 when every product is imported', () => {
    expect(importProgressPercent({ imported: 7, processed: 7 })).toBe(100)
  })

  it('returns 0 when nothing is imported or nothing is known yet', () => {
    expect(importProgressPercent({ imported: 0, processed: 0 })).toBe(0)
    expect(importProgressPercent({ imported: 0, processed: 5 })).toBe(0)
  })

  it('never goes above 100', () => {
    expect(importProgressPercent({ imported: 3, processed: 0 })).toBe(100)
  })
})
