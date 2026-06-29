import { gql } from 'graphql-tag'

export const adminApiExtensions = gql`
  type Badge implements Node {
    id: ID!
    createdAt: DateTime!
    updatedAt: DateTime!
    collection: Collection
    collectionId: ID
    position: String!
    text: String
    asset: Asset!
    assetId: ID!
  }

  type BadgeList implements PaginatedList {
    items: [Badge!]!
    totalItems: Int!
  }

  # Generated at run-time by Vendure
  input BadgeListOptions

  extend type Query {
    badges(options: BadgeListOptions): BadgeList!
    badge(id: ID!): Badge
  }

  input CreateBadgeInput {
    assetId: ID!
    position: String
    text: String
    collectionId: ID
  }

  extend type Mutation {
    createBadge(input: CreateBadgeInput!): Badge!
  }

  extend type Mutation {
    deleteBadge(ids: [ID!]!): DeletionResponse!
  }

  input UpdateBadgeInput {
    id: ID!
    collectionId: ID
    position: String
    text: String
    assetId: ID
  }

  extend type Mutation {
    updateBadge(input: UpdateBadgeInput!): Badge!
  }

  type BadgePluginConfig {
    availablePositions: [String]
  }

  extend type Query {
    getBadgePluginConfig: BadgePluginConfig!
  }
`

export const shopApiExtensions = gql`
  type Badge implements Node {
    id: ID!
    createdAt: DateTime!
    updatedAt: DateTime!
    collection: Collection
    collectionId: ID
    position: String!
    text: String
    asset: Asset!
    assetId: ID!
  }

  type BadgeList implements PaginatedList {
    items: [Badge!]!
    totalItems: Int!
  }

  # Generated at run-time by Vendure
  input BadgeListOptions

  extend type Query {
    badges(options: BadgeListOptions): BadgeList!
  }

  extend type Query {
    getBadgeFromCollection(collectionId: ID!): Badge
  }

  extend type Query {
    getBadgesFromCollections(collectionIds: [ID!]!): [Badge!]!
  }

  extend type Product {
    badges: [Badge!]!
  }

  extend type SearchResult {
    badges: [Badge!]!
  }

  extend type ProductVariant {
    badges: [Badge!]!
  }
`
