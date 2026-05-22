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
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
    "\n  query SynonymGroup($id: ID!) {\n    synonymGroup(id: $id) {\n      id\n      synonyms\n      createdAt\n      updatedAt\n      languageCode\n    }\n  }\n": typeof types.SynonymGroupDocument,
    "\n  mutation CreateSynonymGroup($input: CreateSynonymGroupInput!) {\n    createSynonymGroup(input: $input) {\n      id\n    }\n  }\n": typeof types.CreateSynonymGroupDocument,
    "\n  mutation UpdateSynonymGroup($input: UpdateSynonymGroupInput!) {\n    updateSynonymGroup(input: $input) {\n      id\n    }\n  }\n": typeof types.UpdateSynonymGroupDocument,
    "\n  mutation DeleteSynonymGroup($id: ID!) {\n    deleteSynonymGroup(id: $id) {\n      result\n      message\n    }\n  }\n": typeof types.DeleteSynonymGroupDocument,
    "\n  query SynonymGroups($options: SynonymGroupListOptions) {\n    synonymGroups(options: $options) {\n      items {\n        id\n        synonyms\n        languageCode\n        createdAt\n        updatedAt\n      }\n      totalItems\n    }\n  }\n": typeof types.SynonymGroupsDocument,
    "\n  mutation DeleteSynonymGroupBulk($id: ID!) {\n    deleteSynonymGroup(id: $id) {\n      result\n      message\n    }\n  }\n": typeof types.DeleteSynonymGroupBulkDocument,
};
const documents: Documents = {
    "\n  query SynonymGroup($id: ID!) {\n    synonymGroup(id: $id) {\n      id\n      synonyms\n      createdAt\n      updatedAt\n      languageCode\n    }\n  }\n": types.SynonymGroupDocument,
    "\n  mutation CreateSynonymGroup($input: CreateSynonymGroupInput!) {\n    createSynonymGroup(input: $input) {\n      id\n    }\n  }\n": types.CreateSynonymGroupDocument,
    "\n  mutation UpdateSynonymGroup($input: UpdateSynonymGroupInput!) {\n    updateSynonymGroup(input: $input) {\n      id\n    }\n  }\n": types.UpdateSynonymGroupDocument,
    "\n  mutation DeleteSynonymGroup($id: ID!) {\n    deleteSynonymGroup(id: $id) {\n      result\n      message\n    }\n  }\n": types.DeleteSynonymGroupDocument,
    "\n  query SynonymGroups($options: SynonymGroupListOptions) {\n    synonymGroups(options: $options) {\n      items {\n        id\n        synonyms\n        languageCode\n        createdAt\n        updatedAt\n      }\n      totalItems\n    }\n  }\n": types.SynonymGroupsDocument,
    "\n  mutation DeleteSynonymGroupBulk($id: ID!) {\n    deleteSynonymGroup(id: $id) {\n      result\n      message\n    }\n  }\n": types.DeleteSynonymGroupBulkDocument,
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
export function graphql(source: "\n  query SynonymGroup($id: ID!) {\n    synonymGroup(id: $id) {\n      id\n      synonyms\n      createdAt\n      updatedAt\n      languageCode\n    }\n  }\n"): (typeof documents)["\n  query SynonymGroup($id: ID!) {\n    synonymGroup(id: $id) {\n      id\n      synonyms\n      createdAt\n      updatedAt\n      languageCode\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation CreateSynonymGroup($input: CreateSynonymGroupInput!) {\n    createSynonymGroup(input: $input) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation CreateSynonymGroup($input: CreateSynonymGroupInput!) {\n    createSynonymGroup(input: $input) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateSynonymGroup($input: UpdateSynonymGroupInput!) {\n    updateSynonymGroup(input: $input) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation UpdateSynonymGroup($input: UpdateSynonymGroupInput!) {\n    updateSynonymGroup(input: $input) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation DeleteSynonymGroup($id: ID!) {\n    deleteSynonymGroup(id: $id) {\n      result\n      message\n    }\n  }\n"): (typeof documents)["\n  mutation DeleteSynonymGroup($id: ID!) {\n    deleteSynonymGroup(id: $id) {\n      result\n      message\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query SynonymGroups($options: SynonymGroupListOptions) {\n    synonymGroups(options: $options) {\n      items {\n        id\n        synonyms\n        languageCode\n        createdAt\n        updatedAt\n      }\n      totalItems\n    }\n  }\n"): (typeof documents)["\n  query SynonymGroups($options: SynonymGroupListOptions) {\n    synonymGroups(options: $options) {\n      items {\n        id\n        synonyms\n        languageCode\n        createdAt\n        updatedAt\n      }\n      totalItems\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation DeleteSynonymGroupBulk($id: ID!) {\n    deleteSynonymGroup(id: $id) {\n      result\n      message\n    }\n  }\n"): (typeof documents)["\n  mutation DeleteSynonymGroupBulk($id: ID!) {\n    deleteSynonymGroup(id: $id) {\n      result\n      message\n    }\n  }\n"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;