/* eslint-disable */
import * as types from './graphql';
import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';

/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 */
const documents = {
    "\n  query GetBadges($options: BadgeListOptions) {\n    badges(options: $options) {\n      items {\n        id\n        createdAt\n        updatedAt\n        collection {\n          id\n        }\n        collectionId\n        position\n        asset {\n          id\n          name\n          type\n          mimeType\n          width\n          height\n          fileSize\n          source\n          preview\n        }\n      }\n      totalItems\n    }\n  }\n": types.GetBadgesDocument,
    "\n  mutation CreateBadge($input: CreateBadgeInput!) {\n    createBadge(input: $input) {\n      id\n    }\n  }\n": types.CreateBadgeDocument,
    "\n  mutation DeleteBadge($ids: [ID!]!) {\n    deleteBadge(ids: $ids) {\n      result\n      message\n    }\n  }\n": types.DeleteBadgeDocument,
    "\n  query GetBadgePluginConfig {\n    getBadgePluginConfig {\n      availablePositions\n    }\n  }\n": types.GetBadgePluginConfigDocument,
    "\n  mutation UpdateBadge($input: UpdateBadgeInput!) {\n    updateBadge(input: $input) {\n      id\n    }\n  }\n": types.UpdateBadgeDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 *
 *
 * @example
 * ```ts
 * const query = graphql(`query GetUser($id: ID!) { user(id: $id) { name } }`);
 * ```
 *
 * The query argument is unknown!
 * Please regenerate the types.
 */
export function graphql(source: string): unknown;

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query GetBadges($options: BadgeListOptions) {\n    badges(options: $options) {\n      items {\n        id\n        createdAt\n        updatedAt\n        collection {\n          id\n        }\n        collectionId\n        position\n        asset {\n          id\n          name\n          type\n          mimeType\n          width\n          height\n          fileSize\n          source\n          preview\n        }\n      }\n      totalItems\n    }\n  }\n"): (typeof documents)["\n  query GetBadges($options: BadgeListOptions) {\n    badges(options: $options) {\n      items {\n        id\n        createdAt\n        updatedAt\n        collection {\n          id\n        }\n        collectionId\n        position\n        asset {\n          id\n          name\n          type\n          mimeType\n          width\n          height\n          fileSize\n          source\n          preview\n        }\n      }\n      totalItems\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation CreateBadge($input: CreateBadgeInput!) {\n    createBadge(input: $input) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation CreateBadge($input: CreateBadgeInput!) {\n    createBadge(input: $input) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation DeleteBadge($ids: [ID!]!) {\n    deleteBadge(ids: $ids) {\n      result\n      message\n    }\n  }\n"): (typeof documents)["\n  mutation DeleteBadge($ids: [ID!]!) {\n    deleteBadge(ids: $ids) {\n      result\n      message\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query GetBadgePluginConfig {\n    getBadgePluginConfig {\n      availablePositions\n    }\n  }\n"): (typeof documents)["\n  query GetBadgePluginConfig {\n    getBadgePluginConfig {\n      availablePositions\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateBadge($input: UpdateBadgeInput!) {\n    updateBadge(input: $input) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation UpdateBadge($input: UpdateBadgeInput!) {\n    updateBadge(input: $input) {\n      id\n    }\n  }\n"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;