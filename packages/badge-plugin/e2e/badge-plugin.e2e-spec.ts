import path from 'path'
import { Readable } from 'node:stream'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import {
  Asset,
  AssetService,
  DefaultSearchPlugin,
  defaultPromotionConditions,
  mergeConfig,
  PromotionCondition,
  PromotionService,
  RequestContextService,
} from '@vendure/core'
import { LanguageCode } from '@vendure/common/lib/generated-types'
import {
  createTestEnvironment,
  registerInitializer,
  SqljsInitializer,
  testConfig,
} from '@vendure/testing'
import gql from 'graphql-tag'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { BadgePlugin } from '../src/badge.plugin'
import { BadgeService } from '../src/service/badge.service'
import { initialData } from './fixtures/initial-data'

const E2E_DEFAULT_CHANNEL_TOKEN = 'e2e-default-channel'
const sqliteDataDir = path.join(__dirname, '__data__')
/** Bump when Vendure upgrades change the sqljs schema (invalidates cached e2e DB). */
const SQLITE_SCHEMA_VERSION = '3.6.0-badge-promotion-link-search'

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

const testAlwaysCondition = new PromotionCondition({
  code: 'test_always',
  description: [{ languageCode: LanguageCode.en, value: 'Always' }],
  args: {},
  check: () => true,
})

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

const UPDATE_PROMOTION = gql`
  mutation UpdateBadgeTestPromotion($input: UpdatePromotionInput!) {
    updatePromotion(input: $input) {
      ... on Promotion {
        id
      }
      ... on ErrorResult {
        message
      }
    }
  }
`

const DELETE_PROMOTION = gql`
  mutation DeleteBadgeTestPromotion($id: ID!) {
    deletePromotion(id: $id) {
      result
    }
  }
`

const REINDEX = gql`
  mutation BadgeTestReindex {
    reindex {
      id
    }
  }
`

const CREATE_CHANNEL = gql`
  mutation BadgeTestCreateChannel($input: CreateChannelInput!) {
    createChannel(input: $input) {
      ... on Channel {
        id
        token
      }
      ... on ErrorResult {
        message
      }
    }
  }
`

const GET_ZONES = gql`
  query BadgeTestZones {
    zones {
      items {
        id
      }
    }
  }
`

const ASSIGN_PRODUCTS_TO_CHANNEL = gql`
  mutation BadgeTestAssignProducts($input: AssignProductsToChannelInput!) {
    assignProductsToChannel(input: $input) {
      id
    }
  }
`

const ASSIGN_PROMOTIONS_TO_CHANNEL = gql`
  mutation BadgeTestAssignPromotions($input: AssignPromotionsToChannelInput!) {
    assignPromotionsToChannel(input: $input) {
      id
    }
  }
`

const SHOP_PRODUCT_BADGES = gql`
  query ShopProductBadges($id: ID!) {
    product(id: $id) {
      badges {
        id
        text
      }
      variants {
        badges {
          id
          text
        }
      }
    }
  }
`

const SHOP_SEARCH_BADGES = gql`
  query ShopSearchBadges {
    search(input: { groupByProduct: true, take: 100 }) {
      items {
        productId
        badges {
          id
          text
        }
      }
    }
  }
`

const GET_BADGES_FROM_COLLECTIONS = gql`
  query GetBadgesFromCollections($collectionIds: [ID!]!) {
    getBadgesFromCollections(collectionIds: $collectionIds) {
      id
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

const GET_BADGES = gql`
  query GetBadges {
    badges {
      totalItems
      items {
        id
        collectionId
        promotionId
        promotion {
          id
          name
        }
        unmatchedConditionCodes
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

/** The test client returns encoded ids (T_1), services take the raw ones. */
function rawId(id: string): number {
  return Number(id.replace('T_', ''))
}

describe('BadgePlugin e2e', () => {
  const { server, adminClient, shopClient } = createTestEnvironment(
    mergeConfig(testConfig, {
      apiOptions: { port: 3071 },
      promotionOptions: {
        promotionConditions: [...defaultPromotionConditions, testAlwaysCondition],
      },
      plugins: [
        DefaultSearchPlugin.init({ bufferUpdates: false }),
        BadgePlugin.init({
          availablePositions: ['top-left', 'top-right'],
          promotionProductChecks: [{ code: 'test_always', matches: () => true }],
        }),
      ],
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

  describe('promotion badges in the shop api', () => {
    let productAId: string
    let productBId: string
    let promotionId: string
    let badgeText: string
    let channelToken: string
    let channelId: string

    async function createProductWithVariant(
      slug: string,
    ): Promise<{ productId: string; variantId: string }> {
      const { createProduct } = await adminClient.query(CREATE_PRODUCT, {
        input: {
          enabled: true,
          translations: [{ languageCode: 'en', name: slug, slug, description: '' }],
        },
      })
      const { createProductVariants } = await adminClient.query(CREATE_VARIANTS, {
        input: [
          {
            productId: createProduct.id,
            sku: slug.toUpperCase(),
            price: 1000,
            translations: [{ languageCode: 'en', name: slug }],
          },
        ],
      })
      return { productId: createProduct.id, variantId: createProductVariants[0].id }
    }

    async function reindex(): Promise<void> {
      await adminClient.query(REINDEX)
      for (let i = 0; i < 50; i++) {
        const { search } = await shopClient.query(SHOP_SEARCH_BADGES)
        const ids = search.items.map((item: { productId: string }) => item.productId)
        if (ids.includes(productAId) && ids.includes(productBId)) return
        await new Promise((resolve) => setTimeout(resolve, 200))
      }
      throw new Error('search index was not built in time')
    }

    /** The badge texts shown for a product in all three shop fields. */
    async function shownFor(productId: string): Promise<{
      product: string[]
      variants: string[]
      search: string[]
    }> {
      const texts = (badges: { text: string }[]) => badges.map((b) => b.text)
      const { product } = await shopClient.query(SHOP_PRODUCT_BADGES, { id: productId })
      const { search } = await shopClient.query(SHOP_SEARCH_BADGES)
      const item = search.items.find((i: { productId: string }) => i.productId === productId)
      return {
        product: texts(product.badges),
        variants: product.variants.flatMap((v: { badges: { text: string }[] }) => texts(v.badges)),
        search: texts(item.badges),
      }
    }

    async function expectShownOnly(productId: string, shown: boolean) {
      const result = await shownFor(productId)
      const expected = shown ? [badgeText] : []
      expect(result).toEqual({ product: expected, variants: expected, search: expected })
    }

    async function updatePromotion(input: Record<string, unknown>) {
      await adminClient.query(UPDATE_PROMOTION, { input: { id: promotionId, ...input } })
    }

    async function createPromotionBadge(text: string, promotion: string): Promise<string> {
      const { createBadge } = await adminClient.query(CREATE_BADGE, {
        input: { assetId: await createAsset(), text, promotionId: promotion },
      })
      return createBadge.id
    }

    beforeAll(async () => {
      const a = await createProductWithVariant('badge-promo-a')
      const b = await createProductWithVariant('badge-promo-b')
      productAId = a.productId
      productBId = b.productId
      promotionId = await createPromotion('Shop contains', [
        {
          code: 'contains_products',
          arguments: [
            { name: 'minimum', value: '1' },
            { name: 'productVariantIds', value: JSON.stringify([a.variantId]) },
          ],
        },
      ])
      badgeText = 'Promo badge'
      await createPromotionBadge(badgeText, promotionId)
      await reindex()
    }, 60_000)

    it('shows the badge on a product in the promotion, in all three fields, and not on another', async () => {
      await expectShownOnly(productAId, true)
      await expectShownOnly(productBId, false)
    })

    it('hides the badge when the promotion is disabled, not started, ended or needs a coupon', async () => {
      const day = 24 * 60 * 60 * 1000
      const cases: Record<string, unknown>[] = [
        { enabled: false },
        { startsAt: new Date(Date.now() + day).toISOString() },
        { endsAt: new Date(Date.now() - day).toISOString() },
        { couponCode: 'SECRET' },
      ]
      for (const change of cases) {
        await updatePromotion(change)
        await expectShownOnly(productAId, false)
        await updatePromotion({ enabled: true, startsAt: null, endsAt: null, couponCode: null })
        await expectShownOnly(productAId, true)
      }
    })

    it('hides the badge in a channel the promotion is not assigned to', async () => {
      const { zones } = await adminClient.query(GET_ZONES)
      channelToken = 'badge-second-channel'
      const { createChannel } = await adminClient.query(CREATE_CHANNEL, {
        input: {
          code: 'badge-second-channel',
          token: channelToken,
          defaultLanguageCode: 'en',
          pricesIncludeTax: false,
          currencyCode: 'USD',
          defaultCurrencyCode: 'USD',
          defaultTaxZoneId: zones.items[0].id,
          defaultShippingZoneId: zones.items[0].id,
        },
      })
      channelId = createChannel.id
      await adminClient.query(ASSIGN_PRODUCTS_TO_CHANNEL, {
        input: { productIds: [productAId], channelId },
      })
      const { badges } = await adminClient.query(GET_BADGES)
      const badge = badges.items.find((b: { promotionId: string }) => b.promotionId === promotionId)
      const ctx = await server.app.get(RequestContextService).create({ apiType: 'admin' })
      await server.app.get(BadgeService).assignToChannel(ctx, {
        badgeIds: [rawId(badge.id)],
        channelId: rawId(channelId),
      })

      shopClient.setChannelToken(channelToken)
      try {
        const { product } = await shopClient.query(SHOP_PRODUCT_BADGES, { id: productAId })
        expect(product.badges).toEqual([])
        expect(product.variants[0].badges).toEqual([])

        await adminClient.query(ASSIGN_PROMOTIONS_TO_CHANNEL, {
          input: { promotionIds: [promotionId], channelId },
        })
        const after = await shopClient.query(SHOP_PRODUCT_BADGES, { id: productAId })
        expect(after.product.badges.map((b: { text: string }) => b.text)).toEqual([badgeText])
      } finally {
        shopClient.setChannelToken(E2E_DEFAULT_CHANNEL_TOKEN)
      }
    })

    it('shows a minimum order amount promotion badge on no product', async () => {
      await createPromotionBadge('Amount badge', amountPromotionId)
      for (const productId of [productAId, productBId]) {
        const result = await shownFor(productId)
        expect(result.product).not.toContain('Amount badge')
        expect(result.variants).not.toContain('Amount badge')
        expect(result.search).not.toContain('Amount badge')
      }
    })

    it('uses a custom product check registered through the plugin options', async () => {
      const customPromotionId = await createPromotion('Custom', [
        { code: 'test_always', arguments: [] },
      ])
      await createPromotionBadge('Custom badge', customPromotionId)
      for (const productId of [productAId, productBId]) {
        const result = await shownFor(productId)
        expect(result.product).toContain('Custom badge')
        expect(result.variants).toContain('Custom badge')
        expect(result.search).toContain('Custom badge')
      }
    })

    it('keeps promotion badges out of getBadgesFromCollections and collection badges on the product', async () => {
      const { createCollection } = await adminClient.query(CREATE_COLLECTION, {
        input: {
          translations: [
            {
              languageCode: 'en',
              name: 'Badge promo coll',
              slug: 'badge-promo-coll',
              description: '',
            },
          ],
          filters: [
            {
              code: 'product-id-filter',
              arguments: [
                { name: 'productIds', value: JSON.stringify([productAId]) },
                { name: 'combineWithAnd', value: 'false' },
              ],
            },
          ],
        },
      })
      const { createBadge } = await adminClient.query(CREATE_BADGE, {
        input: {
          assetId: await createAsset(),
          text: 'Collection badge',
          collectionId: createCollection.id,
        },
      })
      const { getBadgesFromCollections } = await shopClient.query(GET_BADGES_FROM_COLLECTIONS, {
        collectionIds: [createCollection.id],
      })
      expect(getBadgesFromCollections.map((b: { id: string }) => b.id)).toEqual([createBadge.id])

      let texts: string[] = []
      for (let i = 0; i < 50; i++) {
        const { product } = await shopClient.query(SHOP_PRODUCT_BADGES, { id: productAId })
        texts = product.badges.map((b: { text: string }) => b.text)
        if (texts.includes('Collection badge')) break
        await new Promise((resolve) => setTimeout(resolve, 200))
      }
      expect(texts).toContain('Collection badge')
      expect(texts).toContain(badgeText)
    })
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

    it('returns the promotion name in the admin list', async () => {
      const { badges } = await adminClient.query(GET_BADGES)
      const linked = badges.items.find((b: { promotionId: string | null }) => b.promotionId === containsPromotionId)
      expect(linked.promotion).toEqual({ id: containsPromotionId, name: 'Contains' })
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

  describe('final review fixes', () => {
    it('updates only the position of a badge whose promotion was deleted', async () => {
      const promotion = await createPromotion('Doomed', [{ code: 'test_always', arguments: [] }])
      const { createBadge } = await adminClient.query(CREATE_BADGE, {
        input: { assetId: await createAsset(), promotionId: promotion },
      })
      await adminClient.query(DELETE_PROMOTION, { id: promotion })
      const { updateBadge } = await adminClient.query(UPDATE_BADGE, {
        input: { id: createBadge.id, position: 'top-right' },
      })
      expect(updateBadge.position).toBe('top-right')
      expect(updateBadge.promotionId).toBe(promotion)
    })

    it('reports no unchecked condition codes for a deleted promotion', async () => {
      const promotion = await createPromotion('Doomed amount', [
        {
          code: 'minimum_order_amount',
          arguments: [
            { name: 'amount', value: '5000' },
            { name: 'taxInclusive', value: 'false' },
          ],
        },
      ])
      await adminClient.query(CREATE_BADGE, {
        input: { assetId: await createAsset(), promotionId: promotion },
      })
      await adminClient.query(DELETE_PROMOTION, { id: promotion })
      const { badges } = await adminClient.query(GET_BADGES)
      const badge = badges.items.find((b: { promotionId: string }) => b.promotionId === promotion)
      expect(badge.promotion).toBeNull()
      expect(badge.unmatchedConditionCodes).toEqual([])
    })

    it('clears a deleted promotion link when the badge gets a collection', async () => {
      const promotion = await createPromotion('Soon deleted', [
        { code: 'test_always', arguments: [] },
      ])
      const { createBadge } = await adminClient.query(CREATE_BADGE, {
        input: { assetId: await createAsset(), promotionId: promotion },
      })
      await adminClient.query(DELETE_PROMOTION, { id: promotion })
      const collectionId = await createCollectionId('after-delete')
      const { updateBadge } = await adminClient.query(UPDATE_BADGE, {
        input: { id: createBadge.id, collectionId },
      })
      expect(updateBadge.promotionId).toBeNull()
      expect(updateBadge.collectionId).toBe(collectionId)
    })

    it('rejects an update where an explicit undefined collectionId hides the collection link', async () => {
      const { createBadge } = await adminClient.query(CREATE_BADGE, {
        input: { assetId: await createAsset(), collectionId: await createCollectionId('undef') },
      })
      const ctx = await server.app.get(RequestContextService).create({ apiType: 'admin' })
      await expect(
        server.app.get(BadgeService).update(ctx, {
          id: rawId(createBadge.id),
          collectionId: undefined,
          promotionId: rawId(containsPromotionId),
        }),
      ).rejects.toThrow(/collection or a promotion/i)
    })

    it('hides the badge of a promotion whose global usage limit is used up', async () => {
      const promotion = await createPromotion('Limited', [{ code: 'test_always', arguments: [] }])
      await adminClient.query(UPDATE_PROMOTION, { input: { id: promotion, usageLimit: 1 } })
      await adminClient.query(CREATE_BADGE, {
        input: { assetId: await createAsset(), text: 'Limited badge', promotionId: promotion },
      })
      const { products } = await adminClient.query(gql`
        query {
          products {
            items {
              id
            }
          }
        }
      `)
      const productId = products.items[0].id
      const texts = async () => {
        const { product } = await shopClient.query(SHOP_PRODUCT_BADGES, { id: productId })
        return product.badges.map((b: { text: string }) => b.text)
      }
      expect(await texts()).toContain('Limited badge')
      // Placing a completed order is too heavy for this harness, so the promotion
      // service reports the promotion as exhausted, as it does after the last use.
      const spy = vi
        .spyOn(server.app.get(PromotionService), 'getExhaustedPromotionIds')
        .mockResolvedValue(new Set([String(rawId(promotion))]))
      try {
        expect(await texts()).not.toContain('Limited badge')
      } finally {
        spy.mockRestore()
      }
      expect(await texts()).toContain('Limited badge')
    })

    it('shows a private collection badge on neither Product.badges nor ProductVariant.badges', async () => {
      const { createProduct } = await adminClient.query(CREATE_PRODUCT, {
        input: {
          enabled: true,
          translations: [
            { languageCode: 'en', name: 'priv-prod', slug: 'priv-prod', description: '' },
          ],
        },
      })
      await adminClient.query(CREATE_VARIANTS, {
        input: [
          {
            productId: createProduct.id,
            sku: 'PRIV-1',
            price: 1000,
            translations: [{ languageCode: 'en', name: 'priv-prod' }],
          },
        ],
      })
      const makeCollection = async (slug: string, isPrivate: boolean, text: string) => {
        const { createCollection } = await adminClient.query(CREATE_COLLECTION, {
          input: {
            isPrivate,
            translations: [{ languageCode: 'en', name: slug, slug, description: '' }],
            filters: [
              {
                code: 'product-id-filter',
                arguments: [
                  { name: 'productIds', value: JSON.stringify([createProduct.id]) },
                  { name: 'combineWithAnd', value: 'false' },
                ],
              },
            ],
          },
        })
        await adminClient.query(CREATE_BADGE, {
          input: { assetId: await createAsset(), text, collectionId: createCollection.id },
        })
      }
      await makeCollection('priv-coll', true, 'Private badge')
      await makeCollection('pub-coll', false, 'Public badge')
      let result: { product: string[]; variants: string[] } = { product: [], variants: [] }
      for (let i = 0; i < 50; i++) {
        const { product } = await shopClient.query(SHOP_PRODUCT_BADGES, { id: createProduct.id })
        result = {
          product: product.badges.map((b: { text: string }) => b.text),
          variants: product.variants.flatMap((v: { badges: { text: string }[] }) =>
            v.badges.map((b) => b.text),
          ),
        }
        if (result.product.includes('Public badge')) break
        await new Promise((resolve) => setTimeout(resolve, 200))
      }
      expect(result.product).toContain('Public badge')
      expect(result.variants).toContain('Public badge')
      expect(result.product).not.toContain('Private badge')
      expect(result.variants).not.toContain('Private badge')
    })
  })
})
