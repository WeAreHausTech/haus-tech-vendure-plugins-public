import { ID, RequestContext, VendureEvent } from '@vendure/core'

export type TwoFactorEventType =
  | 'enabled'
  | 'disabled'
  | 'reset'
  | 'backup-codes-regenerated'
  | 'backup-code-used'
  | 'verification-failed'
  | 'locked'

/**
 * @description
 * Published when an administrator's second factor changes or is used in a way worth recording:
 * enrolment, disabling, a reset by another administrator, a backup code being spent, a wrong
 * code, or a lockout. Subscribe to it to write history entries or send alerts.
 *
 * @category Events
 */
export class TwoFactorEvent extends VendureEvent {
  constructor(
    public ctx: RequestContext,
    public userId: ID,
    public type: TwoFactorEventType,
    /** For `reset`: the user who reset it, when the reset came from the API. */
    public resetByUserId?: ID,
  ) {
    super()
  }
}
