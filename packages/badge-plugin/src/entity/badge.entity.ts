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
import {
  Column,
  Entity,
  OneToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
  ManyToOne,
  ManyToMany,
  JoinTable,
} from 'typeorm'

@Entity()
export class Badge extends VendureEntity implements ChannelAware {
  constructor(input?: DeepPartial<Badge>) {
    super(input)

    //TODO - this is a workaround for the issue with the assetId decorator
    if (input) {
      Object.assign(this, input)
    }
  }

  @ManyToMany((type) => Channel)
  @JoinTable()
  channels: Channel[]

  @Column({ default: 'top-left' })
  position: string

  @Column({ default: 0 })
  order: number

  @Column({ nullable: true })
  text: string

  @OneToOne((type) => Asset, {
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

  @OneToOne((type) => Collection, { nullable: true, eager: true })
  @JoinColumn({
    name: 'collectionId',
    referencedColumnName: 'id',
  })
  collection: Collection | null

  @EntityId({ nullable: true })
  collectionId: ID | null
}
