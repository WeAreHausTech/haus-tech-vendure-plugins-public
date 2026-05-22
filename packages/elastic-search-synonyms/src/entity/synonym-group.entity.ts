import {
  VendureEntity,
  DeepPartial,
  Channel,
  LanguageCode,
  ChannelAware,
  SoftDeletable,
} from '@vendure/core'
import { Column, Entity, Index, ManyToMany, JoinTable } from 'typeorm'

@Entity()
export class SynonymGroup extends VendureEntity implements ChannelAware, SoftDeletable {
  constructor(input?: DeepPartial<SynonymGroup>) {
    super(input)
  }

  @Column({ type: 'text' })
  @Index()
  synonyms: string

  @Index()
  @Column('varchar')
  languageCode: LanguageCode

  @ManyToMany(() => Channel)
  @JoinTable({
    name: 'synonym_channels',
    joinColumn: { name: 'synonymGroupId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'channelId', referencedColumnName: 'id' },
  })
  channels: Channel[]

  @Column({ type: Date, nullable: true })
  deletedAt: Date | null
}
