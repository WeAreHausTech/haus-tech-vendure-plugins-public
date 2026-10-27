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
const SQLITE_SCHEMA_VERSION = '3.6.0-badge-promotion-link'

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
      promotionId
      unmatchedConditionCodes
      assetId
    }
  }
`

const UPDATE_BADGE = gql`
  mutation UpdateBadge($input: UpdateBadgeInput!) {
    updateBadge(input: $input) {
      id
      position
      text
      collectionId
      promotionId
      unmatchedConditionCodes
    }
  }
`

const CREATE_PRODUCT = gql`
  mutation CreateBadgeTestProduct($input: CreateProductInput!) {
    createProduct(input: $input) {
      id
    }
  }
`

const CREATE_VARIANTS = gql`
  mutation CreateBadgeTestVariants($input: [CreateProductVariantInput!]!) {
    createProductVariants(input: $input) {
      id
    }
  }
`

const CREATE_PROMOTION = gql`
  mutation CreateBadgeTestPromotion($input: CreatePromotionInput!) {
    createPromotion(input: $input) {
      ... on Promotion {
        id
      }
      ... on ErrorResult {
        message
      }
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

const GET_BADGES = gql`
  query GetBadges {
    badges {
      totalItems
      items {
        id
        collectionId
        assetId
      }
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
      assetId
      asset {
        id
      }
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
  let variantId: string
  let containsPromotionId: string
  let amountPromotionId: string

  async function createAsset(): Promise<string> {
    const ctx = await server.app.get(RequestContextService).create({ apiType: 'admin' })
    const asset = await server.app.get(AssetService).create(ctx, {
      file: {
        createReadStream: () => Readable.from(Buffer.from('badge-image')),
        filename: 'badge.png',
        mimetype: 'image/png',
        encoding: '7bit',
      },
    })
    return (asset as Asset).id as string
  }

  async function createCollectionId(slug: string): Promise<string> {
    const { createCollection } = await adminClient.query(CREATE_COLLECTION, {
      input: {
        translations: [{ languageCode: 'en', name: slug, slug, description: '' }],
        filters: [],
      },
    })
    return createCollection.id
  }

  async function createPromotion(name: string, conditions: unknown[]): Promise<string> {
    const { createPromotion } = await adminClient.query(CREATE_PROMOTION, {
      input: {
        enabled: true,
        conditions,
        actions: [
          { code: 'order_percentage_discount', arguments: [{ name: 'discount', value: '10' }] },
        ],
        translations: [{ languageCode: 'en', name, description: '' }],
      },
    })
    return createPromotion.id
  }

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

    const { createProduct } = await adminClient.query(CREATE_PRODUCT, {
      input: {
        translations: [
          { languageCode: 'en', name: 'Promo product', slug: 'promo-product', description: '' },
        ],
      },
    })
    const { createProductVariants } = await adminClient.query(CREATE_VARIANTS, {
      input: [
        {
          productId: createProduct.id,
          sku: 'PROMO-1',
          price: 1000,
          translations: [{ languageCode: 'en', name: 'Promo variant' }],
        },
      ],
    })
    variantId = createProductVariants[0].id

    containsPromotionId = await createPromotion('Contains', [
      {
        code: 'contains_products',
        arguments: [
          { name: 'minimum', value: '1' },
          { name: 'productVariantIds', value: JSON.stringify([variantId]) },
        ],
      },
    ])
    amountPromotionId = await createPromotion('Amount', [
      {
        code: 'minimum_order_amount',
        arguments: [
          { name: 'amount', value: '5000' },
          { name: 'taxInclusive', value: 'false' },
        ],
      },
    ])
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
    expect(createBadge.assetId).toBeTruthy()
    badgeId = createBadge.id
  })

  it('rejects createBadge when the asset does not exist', async () => {
    await expect(
      adminClient.query(CREATE_BADGE, {
        input: { assetId: '999999', position: 'top-left', collectionId },
      }),
    ).rejects.toThrow(/No asset with the id/i)
  })

  it('returns the created badge in the channel-filtered admin list', async () => {
    const { badges } = await adminClient.query(GET_BADGES)
    const found = badges.items.find((b: { id: string }) => b.id === badgeId)
    expect(found).toBeDefined()
    expect(found.assetId).toBeTruthy()
    expect(found.collectionId).toBe(collectionId)
  })

  it('exposes the badge to the shop API via its collection', async () => {
    const { getBadgeFromCollection } = await shopClient.query(GET_BADGE_FROM_COLLECTION, {
      collectionId,
    })
    expect(getBadgeFromCollection?.id).toBe(badgeId)
    expect(getBadgeFromCollection?.position).toBe('top-right')
    expect(getBadgeFromCollection?.text).toBe('New Arrival')
    // Regression: the assetId FK must survive a fresh read from the DB
    // (it was being nulled on create), and the eager asset relation must resolve.
    expect(getBadgeFromCollection?.assetId).toBeTruthy()
    expect(getBadgeFromCollection?.asset?.id).toBe(getBadgeFromCollection?.assetId)
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

  describe('promotion link', () => {
    it('creates a badge linked to a promotion', async () => {
      const { createBadge } = await adminClient.query(CREATE_BADGE, {
        input: { assetId: await createAsset(), promotionId: containsPromotionId },
      })
      expect(createBadge.promotionId).toBe(containsPromotionId)
      expect(createBadge.collectionId).toBeNull()
      expect(createBadge.unmatchedConditionCodes).toEqual([])
    })

    it('rejects a badge linked to both a collection and a promotion', async () => {
      await expect(
        adminClient.query(CREATE_BADGE, {
          input: {
            assetId: await createAsset(),
            collectionId: await createCollectionId('both-create'),
            promotionId: containsPromotionId,
          },
        }),
      ).rejects.toThrow(/collection or a promotion/i)
    })

    it('rejects a promotion that does not exist', async () => {
      await expect(
        adminClient.query(CREATE_BADGE, {
          input: { assetId: await createAsset(), promotionId: '999999' },
        }),
      ).rejects.toThrow(/No promotion with the id/i)
    })

    it('rejects adding a promotion to a collection badge, and allows switching', async () => {
      const { createBadge } = await adminClient.query(CREATE_BADGE, {
        input: { assetId: await createAsset(), collectionId: await createCollectionId('switch') },
      })
      await expect(
        adminClient.query(UPDATE_BADGE, {
          input: { id: createBadge.id, promotionId: containsPromotionId },
        }),
      ).rejects.toThrow(/collection or a promotion/i)
      const { updateBadge } = await adminClient.query(UPDATE_BADGE, {
        input: { id: createBadge.id, collectionId: null, promotionId: containsPromotionId },
      })
      expect(updateBadge.collectionId).toBeNull()
      expect(updateBadge.promotionId).toBe(containsPromotionId)
    })

    it('keeps promotionId null when a collection badge changes only its position', async () => {
      const { createBadge } = await adminClient.query(CREATE_BADGE, {
        input: { assetId: await createAsset(), collectionId: await createCollectionId('keep') },
      })
      const { updateBadge } = await adminClient.query(UPDATE_BADGE, {
        input: { id: createBadge.id, position: 'top-right' },
      })
      expect(updateBadge.position).toBe('top-right')
      expect(updateBadge.promotionId).toBeNull()
      expect(updateBadge.collectionId).toBe(createBadge.collectionId)
    })

    it('reports condition codes that cannot be checked per product', async () => {
      const { createBadge } = await adminClient.query(CREATE_BADGE, {
        input: { assetId: await createAsset(), promotionId: amountPromotionId },
      })
      expect(createBadge.unmatchedConditionCodes).toEqual(['minimum_order_amount'])
    })

    it('clears the promotion link with null', async () => {
      const { createBadge } = await adminClient.query(CREATE_BADGE, {
        input: { assetId: await createAsset(), promotionId: containsPromotionId },
      })
      const { updateBadge } = await adminClient.query(UPDATE_BADGE, {
        input: { id: createBadge.id, promotionId: null },
      })
      expect(updateBadge.promotionId).toBeNull()
      expect(updateBadge.unmatchedConditionCodes).toEqual([])
    })
  })
})
