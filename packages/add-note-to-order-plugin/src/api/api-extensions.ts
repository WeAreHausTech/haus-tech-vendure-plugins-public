import { gql } from 'graphql-tag'

export const shopSchema = gql`
  input AddNoteToOrderInput {
    id: ID!
    note: String!
    fromCustomer: Boolean
  }

  extend type Mutation {
    addNoteToOrder(input: AddNoteToOrderInput!): Order!
  }

  input SetOrderNoteReadInput {
    id: ID!
    data: JSON!
    read: Boolean!
  }

  extend type Mutation {
    setOrderNoteRead(input: SetOrderNoteReadInput!): HistoryEntry!
  }
`
export const adminSchema = gql`
  input SetOrderNoteReadInput {
    id: ID!
    data: JSON!
    read: Boolean!
  }

  extend type Mutation {
    setOrderNoteRead(input: SetOrderNoteReadInput!): HistoryEntry!
  }

  type OrderHistoryEntry {
    id: ID!
    type: String!
    createdAt: DateTime!
    updatedAt: DateTime!
    data: JSON!
    order: Order!
    customFields: JSON
  }

  type OrderHistoryEntryList {
    items: [OrderHistoryEntry!]!
    totalItems: Int!
  }

  extend type Query {
    orderNoteHistoryEntries(options: HistoryEntryListOptions): OrderHistoryEntryList!
  }

  extend type Query {
    unreadMessages(options: HistoryEntryListOptions): OrderHistoryEntryList!
  }
`
