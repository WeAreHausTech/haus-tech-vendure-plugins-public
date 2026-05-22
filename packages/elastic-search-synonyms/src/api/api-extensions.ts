import { gql } from 'graphql-tag'

export const synonymAdminSchema = gql`
  type SynonymGroup implements Node {
    id: ID!
    synonyms: [String!]!
    languageCode: LanguageCode!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  input CreateSynonymGroupInput {
    synonyms: [String!]!
  }

  input UpdateSynonymGroupInput {
    id: ID!
    synonyms: [String!]!
  }

  type SynonymGroupList implements PaginatedList {
    items: [SynonymGroup!]!
    totalItems: Int!
  }

  input SynonymGroupFilterParameter {
    _and: [SynonymGroupFilterParameter!]
    _or: [SynonymGroupFilterParameter!]
    id: IDOperators
    createdAt: DateOperators
    updatedAt: DateOperators
    languageCode: StringOperators
    synonyms: StringOperators
  }

  input SynonymGroupSortParameter {
    id: SortOrder
    createdAt: SortOrder
    updatedAt: SortOrder
  }

  input SynonymGroupListOptions {
    skip: Int
    take: Int
    sort: SynonymGroupSortParameter
    filter: SynonymGroupFilterParameter
    filterOperator: LogicalOperator
  }

  extend type Query {
    synonymGroup(id: ID!): SynonymGroup
    synonymGroups(options: SynonymGroupListOptions): SynonymGroupList!
  }

  extend type Mutation {
    createSynonymGroup(input: CreateSynonymGroupInput!): SynonymGroup!
    updateSynonymGroup(input: UpdateSynonymGroupInput!): SynonymGroup!
    deleteSynonymGroup(id: ID!): DeletionResponse!
  }
`
