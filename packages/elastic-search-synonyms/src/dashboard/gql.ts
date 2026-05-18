import { graphql } from '@/gql'

export const getSynonymGroupList = graphql(`
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

export const getSynonymGroupDetailDocument = graphql(`
  query SynonymGroup($id: ID!) {
    synonymGroup(id: $id) {
      id
      synonyms
      createdAt
      updatedAt
      languageCode
    }
  }
`)

export const createSynonymGroupDocument = graphql(`
  mutation CreateSynonymGroup($input: CreateSynonymGroupInput!) {
    createSynonymGroup(input: $input) {
      id
    }
  }
`)

export const updateSynonymGroupDocument = graphql(`
  mutation UpdateSynonymGroup($input: UpdateSynonymGroupInput!) {
    updateSynonymGroup(input: $input) {
      id
    }
  }
`)

export const deleteSynonymGroupDocument = graphql(`
  mutation DeleteSynonymGroup($id: ID!) {
    deleteSynonymGroup(id: $id) {
      result
      message
    }
  }
`)
