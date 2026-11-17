import { DeepPartial } from '@vendure/common/lib/shared-types'
import {
  VendureEntity,
  Collection,
  EntityId,
  ID,
  Asset,
  ChannelAware,
  Channel,
  Promotion,
} from '@vendure/core'
import { Column, Entity, OneToOne, ManyToOne, JoinColumn, ManyToMany, JoinTable } from 'typeorm'

/**
 * @description
 * A product badge: a text, an image {@link Asset} or both, rendered at a fixed `position`,
 * optionally attached to a {@link Collection} so every product in that collection inherits it.
 * A badge always has a text or an image.
 * Channel-aware, so each channel sees only its own badges.
 *
 * @category Entities
 */
@Entity()
export class Badge extends VendureEntity implements ChannelAware {
  constructor(input?: DeepPartial<Badge>) {
    super(input)
    if (input) {
      Object.assign(this, input)
    }
  }

  @ManyToMany(() => Channel)
  @JoinTable()
  channels: Channel[]

  @Column({ default: 'top-left' })
  position: string

  @Column({ default: 0 })
  order: number

  @Column({ type: 'varchar', nullable: true })
  text: string | null

  @OneToOne(() => Asset, {
    cascade: true,
    eager: true,
  })
  @JoinColumn({
    name: 'assetId',
    referencedColumnName: 'id',
  })
  asset: Asset | null

  @EntityId({ nullable: true })
  assetId: ID | null

  @OneToOne(() => Collection, { nullable: true, eager: true })
  @JoinColumn({
    name: 'collectionId',
    referencedColumnName: 'id',
  })
  collection: Collection | null

  @EntityId({ nullable: true })
  collectionId: ID | null

  @ManyToOne(() => Promotion, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'promotionId' })
  promotion: Promotion | null

  @EntityId({ nullable: true })
  promotionId: ID | null
}
