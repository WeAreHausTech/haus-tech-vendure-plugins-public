import { graphql } from '@/gql'

export const getBadgeListDocument = graphql(`
  query GetBadges($options: BadgeListOptions) {
    badges(options: $options) {
      items {
        id
        createdAt
        updatedAt
        collection {
          id
          name
        }
        collectionId
        position
        asset {
          id
          name
          type
          mimeType
          width
          height
          fileSize
          source
          preview
        }
      }
      totalItems
    }
  }
`)

export const getBadgeDetailDocument = graphql(`
  query GetBadgeDetail($id: ID!) {
    badge(id: $id) {
      id
      createdAt
      updatedAt
      collection {
        id
        name
      }
      collectionId
      position
      text
      assetId
      asset {
        id
        name
        type
        mimeType
        width
        height
        fileSize
        source
        preview
      }
    }
  }
`)

export const createBadgeDocument = graphql(`
  mutation CreateBadge($input: CreateBadgeInput!) {
    createBadge(input: $input) {
      id
    }
  }
`)

export const updateBadgeDocument = graphql(`
  mutation UpdateBadge($input: UpdateBadgeInput!) {
    updateBadge(input: $input) {
      id
    }
  }
`)

export const deleteBadgeDocument = graphql(`
  mutation DeleteBadge($id: ID!) {
    deleteBadge(ids: [$id]) {
      result
      message
    }
  }
`)

export const getBadgePluginConfigDocument = graphql(`
  query GetBadgePluginConfig {
    getBadgePluginConfig {
      availablePositions
    }
  }
`)

export const getCollectionsDocument = graphql(`
  query GetCollections($options: CollectionListOptions) {
    collections(options: $options) {
      items {
        id
        name
        slug
      }
      totalItems
    }
  }
`)

export const createAssetsDocument = graphql(`
  mutation CreateAssets($input: [CreateAssetInput!]!) {
    createAssets(input: $input) {
      ... on Asset {
        id
        name
        source
        preview
      }
      ... on MimeTypeError {
        message
      }
    }
  }
`)
