import { DeepPartial, EntityId, ID, VendureEntity } from '@vendure/core'
import { Column, Entity, Index } from 'typeorm'

/**
 * @description
 * The second factor of one user. Secrets are stored encrypted, backup codes as SHA-256 hashes.
 *
 * @category Entities
 */
@Entity()
export class TwoFactorCredential extends VendureEntity {
  constructor(input?: DeepPartial<TwoFactorCredential>) {
    super(input)
  }

  @Index({ unique: true })
  @EntityId()
  userId: ID

  /** The active TOTP secret, encrypted. Null until enrolment is confirmed. */
  @Column({ type: 'text', nullable: true })
  secret: string | null

  /** A secret waiting for its first code, encrypted. */
  @Column({ type: 'text', nullable: true })
  pendingSecret: string | null

  @Column({ default: false })
  enabled: boolean

  @Column({ type: Date, nullable: true })
  enabledAt: Date | null

  /** The last accepted TOTP time step. Codes from this step or earlier are refused. */
  @Column({ type: 'int', nullable: true })
  lastUsedStep: number | null

  @Column('simple-json')
  backupCodeHashes: string[]

  @Column({ type: 'int', default: 0 })
  failedAttempts: number

  @Column({ type: Date, nullable: true })
  lockedUntil: Date | null
}
