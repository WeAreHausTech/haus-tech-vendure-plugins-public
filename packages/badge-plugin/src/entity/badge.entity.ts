import { DeepPartial } from '@vendure/common/lib/shared-types'
import {
  VendureEntity,
  Collection,
  EntityId,
  ID,
  Asset,
  ChannelAware,
  Channel,
} from '@vendure/core'
import { Column, Entity, OneToOne, JoinColumn, ManyToMany, JoinTable } from 'typeorm'

/**
 * @description
 * A product badge: an image {@link Asset} rendered at a fixed `position`, optionally
 * attached to a {@link Collection} so every product in that collection inherits it.
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

  @Column({ nullable: true })
  text: string

  @OneToOne(() => Asset, {
    cascade: true,
    eager: true,
  })
  @JoinColumn({
    name: 'assetId',
    referencedColumnName: 'id',
  })
  asset: Asset

  @EntityId({ nullable: true })
  assetId: ID

  @OneToOne(() => Collection, { nullable: true, eager: true })
  @JoinColumn({
    name: 'collectionId',
    referencedColumnName: 'id',
  })
  collection: Collection | null

  @EntityId({ nullable: true })
  collectionId: ID | null
}
