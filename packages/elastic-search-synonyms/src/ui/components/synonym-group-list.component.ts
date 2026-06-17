import { ChangeDetectionStrategy, Component } from '@angular/core'
import {
  SharedModule,
  DataService,
  TypedBaseListComponent,
  DataModule,
  LanguageCode,
} from '@vendure/admin-ui/core'
import { RouterModule, Router } from '@angular/router'
import { FormsModule } from '@angular/forms'
import { TypedDocumentNode } from '@graphql-typed-document-node/core'
import { gql } from 'graphql-tag'
import { graphql } from '../gql'

export interface SynonymGroupItem {
  id: string
  synonyms: string[]
  languageCode: LanguageCode
  createdAt: string
  updatedAt: string
}

export interface GetSynonymGroupListQuery {
  synonymGroups: {
    items: SynonymGroupItem[]
    totalItems: number
  }
}

export type GetSynonymGroupListQueryVariables = {
  options: {
    skip?: number
    take?: number
    filter: any
    sort: any
  }
}

const getSynonymGroupListDocument = graphql(`
  query SynonymGroups($options: SynonymGroupListOptions) {
    synonymGroups(options: $options) {
      items {
        id
        synonyms
        languageCode
        createdAt
        updatedAt
      }
      totalItems
    }
  }
`)

@Component({
  selector: 'synonym-group-list',
  templateUrl: './synonym-group-list.component.html',
  standalone: true,
  imports: [SharedModule, RouterModule, FormsModule, DataModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SynonymGroupListComponent extends TypedBaseListComponent<
  typeof getSynonymGroupListDocument,
  'synonymGroups'
> {
  initialLimit = 3
  displayLimit: Record<string, number> = {}

  readonly dataTableListId = 'synonym-group-list'

  readonly sorts = this.createSortCollection()
    .defaultSort('updatedAt', 'DESC')
    .addSort({ name: 'id' })
    .addSort({ name: 'createdAt' })
    .addSort({ name: 'updatedAt' })

  constructor(protected router: Router, protected dataService: DataService) {
    super()
    super.configure({
      document: getSynonymGroupListDocument,
      getItems: (result) => result.synonymGroups,
      setVariables: (skip, take) => ({
        options: {
          skip,
          take,
          filter: {},
          sort: this.sorts.createSortInput(),
        },
      }),
      refreshListOnChanges: [this.sorts.valueChanges],
    })
  }

  toggleDisplayLimit(group: SynonymGroupItem) {
    if (this.displayLimit[group.id] === group.synonyms.length) {
      this.displayLimit[group.id] = this.initialLimit
    } else {
      this.displayLimit[group.id] = group.synonyms.length
    }
  }
}
