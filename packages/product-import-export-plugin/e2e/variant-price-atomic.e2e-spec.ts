import path from 'path'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import {
  LanguageCode,
  ProductVariant,
  RequestContextService,
  StockLevelService,
  TransactionalConnection,
  mergeConfig,
} from '@vendure/core'
import {
  E2E_DEFAULT_CHANNEL_TOKEN,
  createTestEnvironment,
  registerInitializer,
  SqljsInitializer,
  testConfig,
} from '@vendure/testing'
import gql from 'graphql-tag'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { ProductImporter } from '../src/providers/import-providers/product-importer'
import { ProductImportExportPlugin } from '../src/product-import-export.plugin'
import { initialData } from './fixtures/initial-data'

// Own data dir (a sibling of `__data__`), because vitest runs spec files in parallel.
const sqliteDataDir = path.join(__dirname, '__data-variant-price-atomic__')
const SQLITE_SCHEMA_VERSION = '3.6'

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

const HEADER = 'name,slug,description,sku,price,taxCategory,stockOnHand'

const VARIANTS_WITH_PRICE = gql`
  query VariantsWithPrice {
    productVariants {
      items {
        sku
        name
        price
      }
    }
  }
`

/**
 * A variant row is never visible without its price for the channels it is assigned to. Vendure's
 * `ProductVariant.price` resolver throws "No price information was found" for such a variant, so
 * one stray row breaks every Admin API list and page that shows it.
 */
describe('variant and price are written together', () => {
  const apiPort = 3065
  const { server, adminClient } = createTestEnvironment(
    mergeConfig(testConfig, {
      apiOptions: { port: apiPort },
      plugins: [ProductImportExportPlugin.init({ importOptions: {}, exportOptions: {} })],
    }),
  )
  let ctx: Awaited<ReturnType<RequestContextService['create']>>

  async function runImport(csv: string): Promise<string[]> {
    const productImporter = server.app.get(ProductImporter)
    let errors: string[] = []
    await new Promise<void>((resolve, reject) => {
      productImporter.parseAndImport(csv, ctx, true, LanguageCode.en, 'merge').subscribe({
        next: (result) => {
          errors = result.errors ?? []
        },
        complete: () => resolve(),
        error: (error) => reject(error),
      })
    })
    return errors
  }

  function findVariant(sku: string): Promise<ProductVariant | null> {
    return server.app
      .get(TransactionalConnection)
      .getRepository(ctx, ProductVariant)
      .findOne({ where: { sku }, relations: ['translations'] })
  }

  function failStockUpdateOnce(): void {
    vi.spyOn(
      server.app.get(StockLevelService),
      'updateStockOnHandForLocation',
    ).mockRejectedValueOnce(new Error('stock update failed'))
  }

  beforeAll(async () => {
    await ensureFreshE2eDatabase()
    await server.init({ initialData })
    await adminClient.asSuperAdmin()
    ctx = await server.app.get(RequestContextService).create({
      apiType: 'admin',
      channelOrToken: E2E_DEFAULT_CHANNEL_TOKEN,
    })
  }, 120_000)

  afterEach(() => {
    vi.restoreAllMocks()
  })

  afterAll(async () => {
    await server.destroy()
  })

  it('leaves no variant behind when a step after the variant insert fails', async () => {
    failStockUpdateOnce()

    const errors = await runImport(`${HEADER}\nHalf Tee,half-tee,Half,HALF-1,100,Standard Tax,5`)

    expect(errors.join('\n')).toContain('stock update failed')
    expect(await findVariant('HALF-1')).toBeNull()
    const { productVariants } = await adminClient.query(VARIANTS_WITH_PRICE)
    expect(productVariants.items.map((v: { sku: string }) => v.sku)).not.toContain('HALF-1')
  })

  it('keeps the variant unchanged when a step of its update fails', async () => {
    expect(
      await runImport(`${HEADER}\nWhole Tee,whole-tee,Whole,WHOLE-1,100,Standard Tax,1`),
    ).toEqual([])
    failStockUpdateOnce()

    const errors = await runImport(
      `${HEADER}\nRenamed Tee,whole-tee,Whole,WHOLE-1,100,Standard Tax,7`,
    )

    expect(errors.join('\n')).toContain('stock update failed')
    const variant = await findVariant('WHOLE-1')
    expect(variant?.translations[0]?.name).toBe('Whole Tee')
  })
})
