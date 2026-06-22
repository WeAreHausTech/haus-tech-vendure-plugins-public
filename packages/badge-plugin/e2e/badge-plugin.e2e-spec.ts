import path from 'path'
import { Readable } from 'node:stream'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { Asset, AssetService, mergeConfig, RequestContextService } from '@vendure/core'
import {
  createTestEnvironment,
  registerInitializer,
  SqljsInitializer,
  testConfig,
} from '@vendure/testing'
import gql from 'graphql-tag'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { BadgePlugin } from '../src/badge.plugin'
import { initialData } from './fixtures/initial-data'

const sqliteDataDir = path.join(__dirname, '__data__')
/** Bump when Vendure upgrades change the sqljs schema (invalidates cached e2e DB). */
const SQLITE_SCHEMA_VERSION = '3.6.0-badge-text'

async function ensureFreshE2eDatabase(): Promise<void> {
  const versionFile = path.join(sqliteDataDir, '.schema-version')
  let storedVersion: string | undefined
  try {
    storedVersion = (await readFile(versionFile, 'utf8')).trim()
  } catch {
    // no version file yet
  }
  if (storedVersion !== SQLITE_SCHEMA_VERSION) {
    await rm(sqliteDataDir, { recursive: true, force: true })
    await mkdir(sqliteDataDir, { recursive: true })
    await writeFile(versionFile, SQLITE_SCHEMA_VERSION, 'utf8')
  }
}

registerInitializer('sqljs', new SqljsInitializer(sqliteDataDir))

const CREATE_COLLECTION = gql`
  mutation CreateBadgeTestCollection($input: CreateCollectionInput!) {
    createCollection(input: $input) {
      id
      name
    }
  }
`

const CREATE_BADGE = gql`
  mutation CreateBadge($input: CreateBadgeInput!) {
    createBadge(input: $input) {
      id
      position
      text
      collectionId
    }
  }
`

const UPDATE_BADGE = gql`
  mutation UpdateBadge($input: UpdateBadgeInput!) {
    updateBadge(input: $input) {
      id
      position
      text
    }
  }
`

const DELETE_BADGE = gql`
  mutation DeleteBadge($ids: [ID!]!) {
    deleteBadge(ids: $ids) {
      result
    }
  }
`

const GET_BADGE_FROM_COLLECTION = gql`
  query GetBadgeFromCollection($collectionId: ID!) {
    getBadgeFromCollection(collectionId: $collectionId) {
      id
      position
      text
      collectionId
    }
  }
`

describe('BadgePlugin e2e', () => {
  const { server, adminClient, shopClient } = createTestEnvironment(
    mergeConfig(testConfig, {
      apiOptions: { port: 3061 },
      plugins: [BadgePlugin.init({ availablePositions: ['top-left', 'top-right'] })],
    }),
  )

  let collectionId: string
  let assetId: string
  let badgeId: string

  beforeAll(async () => {
    await ensureFreshE2eDatabase()
    await server.init({ initialData })
    await adminClient.asSuperAdmin()

    const { createCollection } = await adminClient.query(CREATE_COLLECTION, {
      input: {
        translations: [{ languageCode: 'en', name: 'Featured', slug: 'featured', description: '' }],
        filters: [],
      },
    })
    collectionId = createCollection.id

    // Create a real asset so the badge's assetId FK is satisfiable.
    const ctx = await server.app.get(RequestContextService).create({ apiType: 'admin' })
    const asset = await server.app.get(AssetService).create(ctx, {
      file: {
        createReadStream: () => Readable.from(Buffer.from('badge-image')),
        filename: 'badge.png',
        mimetype: 'image/png',
        encoding: '7bit',
      },
    })
    assetId = (asset as Asset).id as string
  }, 120_000)

  afterAll(async () => {
    await server.destroy()
  })

  it('rejects createBadge without the required permission', async () => {
    await adminClient.asAnonymousUser()
    await expect(
      adminClient.query(CREATE_BADGE, {
        input: { assetId: '1', position: 'top-left', collectionId },
      }),
    ).rejects.toThrow(/not currently authorized/i)
    await adminClient.asSuperAdmin()
  })

  it('rejects a position that is not in availablePositions', async () => {
    await expect(
      adminClient.query(CREATE_BADGE, {
        input: { assetId: '1', position: 'middle', collectionId },
      }),
    ).rejects.toThrow(/Invalid badge position/i)
  })

  it('creates a badge with a valid position and text', async () => {
    const { createBadge } = await adminClient.query(CREATE_BADGE, {
      input: { assetId, position: 'top-right', text: 'New Arrival', collectionId },
    })
    expect(createBadge.position).toBe('top-right')
    expect(createBadge.text).toBe('New Arrival')
    expect(createBadge.collectionId).toBe(collectionId)
    badgeId = createBadge.id
  })

  it('exposes the badge to the shop API via its collection', async () => {
    const { getBadgeFromCollection } = await shopClient.query(GET_BADGE_FROM_COLLECTION, {
      collectionId,
    })
    expect(getBadgeFromCollection?.id).toBe(badgeId)
    expect(getBadgeFromCollection?.position).toBe('top-right')
    expect(getBadgeFromCollection?.text).toBe('New Arrival')
  })

  it('updates the position and text of an existing badge', async () => {
    const { updateBadge } = await adminClient.query(UPDATE_BADGE, {
      input: { id: badgeId, position: 'top-left', text: 'Best Seller' },
    })
    expect(updateBadge.position).toBe('top-left')
    expect(updateBadge.text).toBe('Best Seller')
  })

  it('preserves text when updating only the position', async () => {
    const { updateBadge } = await adminClient.query(UPDATE_BADGE, {
      input: { id: badgeId, position: 'top-right' },
    })
    expect(updateBadge.position).toBe('top-right')
    expect(updateBadge.text).toBe('Best Seller')
  })

  it('deletes a badge', async () => {
    const { deleteBadge } = await adminClient.query(DELETE_BADGE, { ids: [badgeId] })
    expect(deleteBadge.result).toBe('DELETED')

    const { getBadgeFromCollection } = await shopClient.query(GET_BADGE_FROM_COLLECTION, {
      collectionId,
    })
    expect(getBadgeFromCollection).toBeNull()
  })
})
