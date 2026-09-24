import { describe, expect, it } from 'vitest'

import { APPLIED_DEFAULTS_KEY as serverKey } from './constants'
import { APPLIED_DEFAULTS_KEY as dashboardKey } from './dashboard/constants'

describe('APPLIED_DEFAULTS_KEY', () => {
  it('is the same on the server and in the Dashboard extension', () => {
    expect(dashboardKey).toBe(serverKey)
  })
})
