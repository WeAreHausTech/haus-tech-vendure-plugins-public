import gql from 'graphql-tag'
import type { TypedDocumentNode } from '@graphql-typed-document-node/core'

type AnyDoc = TypedDocumentNode<any, any>

const getBadgesDocument = gql(`
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
`) as AnyDoc

const deleteBadgeDocument = gql(`
  mutation DeleteBadge($id: ID!) {
    deleteBadge(ids: [$id]) {
      result
      message
    }
  }
`) as AnyDoc

const getBadgeDetailDocument = gql(`
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
`) as AnyDoc

const createBadgeDocument = gql(`
  mutation CreateBadge($input: CreateBadgeInput!) {
    createBadge(input: $input) {
      id
    }
  }
`) as AnyDoc

const updateBadgeDocument = gql(`
  mutation UpdateBadge($input: UpdateBadgeInput!) {
    updateBadge(input: $input) {
      id
    }
  }
`) as AnyDoc

const getBadgePluginConfigDocument = gql(`
  query GetBadgePluginConfig {
    getBadgePluginConfig {
      availablePositions
    }
  }
`) as AnyDoc

const getCollectionsDocument = gql(`
  query GetCollections {
    collections {
      items {
        id
        name
        slug
      }
    }
  }
`) as AnyDoc

const createAssetsDocument = gql(`
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
`) as AnyDoc

function normalize(source: string): string {
  return source.replace(/\s+/g, ' ').trim()
}

const documents = new Map<string, AnyDoc>([
  [normalize(getBadgesDocument.loc?.source.body ?? ''), getBadgesDocument],
  [normalize(deleteBadgeDocument.loc?.source.body ?? ''), deleteBadgeDocument],
  [normalize(getBadgeDetailDocument.loc?.source.body ?? ''), getBadgeDetailDocument],
  [normalize(createBadgeDocument.loc?.source.body ?? ''), createBadgeDocument],
  [normalize(updateBadgeDocument.loc?.source.body ?? ''), updateBadgeDocument],
  [normalize(getBadgePluginConfigDocument.loc?.source.body ?? ''), getBadgePluginConfigDocument],
  [normalize(getCollectionsDocument.loc?.source.body ?? ''), getCollectionsDocument],
  [normalize(createAssetsDocument.loc?.source.body ?? ''), createAssetsDocument],
])

export function graphql(source: string): AnyDoc {
  const document = documents.get(normalize(source))
  if (!document) {
    throw new Error('Unknown dashboard GraphQL operation in badge-plugin')
  }
  return document
}
