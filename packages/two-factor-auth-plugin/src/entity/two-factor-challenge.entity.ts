import { DeepPartial, EntityId, ID, VendureEntity } from '@vendure/core'
import { Column, Entity, Index } from 'typeorm'

export type TwoFactorChallengePurpose = 'login' | 'enrolment'

/**
 * @description
 * A short-lived, single-use ticket issued after a correct password, and redeemed with the
 * second factor. Only the SHA-256 hash of the token is stored.
 *
 * @category Entities
 */
@Entity()
export class TwoFactorChallenge extends VendureEntity {
  constructor(input?: DeepPartial<TwoFactorChallenge>) {
    super(input)
    // Class fields are re-initialised after super() when emitted as ES2022 fields.
    if (input) {
      Object.assign(this, input)
    }
  }

  @Index({ unique: true })
  @Column()
  tokenHash: string

  @Index()
  @EntityId()
  userId: ID

  @Column({ type: 'varchar', length: 16 })
  purpose: TwoFactorChallengePurpose

  @Column({ type: Date })
  expiresAt: Date

  @Column({ type: 'int', default: 0 })
  attempts: number

  /** For enrolment during sign-in: the new secret, encrypted, until the first code confirms it. */
  @Column({ type: 'text', nullable: true })
  pendingSecret: string | null

  /** For enrolment during sign-in: set once the first code has confirmed the new secret. */
  @Column({ default: false })
  verified: boolean
}
