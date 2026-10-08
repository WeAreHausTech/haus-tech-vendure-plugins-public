import path from 'path'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import {
  LanguageCode,
  Product,
  ProductService,
  ProductVariant,
  RequestContextService,
  TransactionalConnection,
  mergeConfig,
} from '@vendure/core'
import { parse } from 'csv-parse/sync'
import {
  E2E_DEFAULT_CHANNEL_TOKEN,
  createTestEnvironment,
  registerInitializer,
  SqljsInitializer,
  testConfig,
} from '@vendure/testing'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { EXPORT_STORAGE_STRATEGY } from '../src/constants'
import { ExportStorageStrategy } from '../src/services/export-storage/export-storage-strategy'
import { ProductExportService } from '../src/services/product-export.service'
import { ProductImporter } from '../src/providers/import-providers/product-importer'
import { ProductImportExportPlugin } from '../src/product-import-export.plugin'
import { initialData } from './fixtures/initial-data'

// Own data dir (a sibling of `__data__`), because vitest runs spec files in parallel and this
// spec needs its own custom field schema.
const sqliteDataDir = path.join(__dirname, '__data-self-relation__')
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

async function streamToString(stream: Readable): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf8')
}

const SELECTED_CUSTOM_FIELDS = 'product:relatedProduct,variant:baseVariant,variant:siblings'
const RELATED_PRODUCT_COLUMN = 'product:relatedProduct:product'
const BASE_VARIANT_COLUMN = 'variant:baseVariant:productvariant'
const SIBLINGS_COLUMN = 'variant:siblings:productvariant'

/**
 * Relation custom fields whose entity is the owner entity itself (a Product relating to Product,
 * a ProductVariant relating to ProductVariant). Loading them through `ProductService.findAll` or a
 * repository `relations` list makes TypeORM join the owner table twice under the same alias, which
 * Postgres rejects ("table name specified more than once"). sqljs accepts the single-relation
 * query, so the findAll spy pins that path; the list fields fail on sqljs too ("ambiguous column
 * name"), so the ids test fails without the fix.
 */
describe('self-referencing relation custom fields in exports', () => {
  const apiPort = 3061
  const { server } = createTestEnvironment(
    mergeConfig(testConfig, {
      apiOptions: { port: apiPort },
      customFields: {
        Product: [
          {
            name: 'relatedProduct',
            type: 'relation',
            entity: Product,
            nullable: true,
            list: false,
          },
        ],
        ProductVariant: [
          { name: 'baseVariant', type: 'relation', entity: ProductVariant, nullable: true },
          { name: 'siblings', type: 'relation', entity: ProductVariant, list: true },
        ],
      },
      plugins: [ProductImportExportPlugin.init({ importOptions: {}, exportOptions: {} })],
    }),
  )
  let ctx: Awaited<ReturnType<RequestContextService['create']>>
  let productExportService: ProductExportService
  let exportStorageStrategy: ExportStorageStrategy
  let productA: Product
  let productB: Product
  let variantB: ProductVariant

  async function runImport(csv: string): Promise<string[]> {
    const productImporter = server.app.get(ProductImporter)
    let errors: string[] = []
    await new Promise<void>((resolve, reject) => {
      productImporter.parseAndImport(csv, ctx, true, LanguageCode.en, 'replace').subscribe({
        next: (result) => {
          errors = result.errors ?? []
        },
        complete: () => resolve(),
        error: (error) => reject(error),
      })
    })
    return errors
  }

  async function runExport(): Promise<Array<Record<string, string>>> {
    const ids = await productExportService.getAllProductIds(ctx)
    const fileName = await productExportService.createExportFile(
      ctx,
      ids,
      'self-relation.csv',
      SELECTED_CUSTOM_FIELDS,
      'url',
      'name,sku',
    )
    const csv = await streamToString(await exportStorageStrategy.getExportFileStream(ctx, fileName))
    await exportStorageStrategy.deleteExportFile(ctx, fileName)
    return parse(csv, { columns: true, skip_empty_lines: true })
  }

  beforeAll(async () => {
    await ensureFreshE2eDatabase()
    await server.init({ initialData })
    ctx = await server.app.get(RequestContextService).create({
      apiType: 'admin',
      channelOrToken: E2E_DEFAULT_CHANNEL_TOKEN,
    })
    productExportService = server.app.get(ProductExportService)
    exportStorageStrategy = server.app.get<ExportStorageStrategy>(EXPORT_STORAGE_STRATEGY)

    const csv = [
      'name,slug,description,sku,price,taxCategory,stockOnHand',
      'Self A,self-a,Self A description,SELF-A,100,Standard Tax,1',
      'Self B,self-b,Self B description,SELF-B,100,Standard Tax,1',
    ].join('\n')
    expect(await runImport(csv)).toEqual([])

    const connection = server.app.get(TransactionalConnection)
    const variantRepo = connection.getRepository(ctx, ProductVariant)
    const variantA = await variantRepo.findOneOrFail({ where: { sku: 'SELF-A' } })
    variantB = await variantRepo.findOneOrFail({ where: { sku: 'SELF-B' } })
    const productRepo = connection.getRepository(ctx, Product)
    productA = await productRepo.findOneOrFail({ where: { id: variantA.productId } })
    productB = await productRepo.findOneOrFail({ where: { id: variantB.productId } })

    productA.customFields = { ...productA.customFields, relatedProduct: productB } as any
    await productRepo.save(productA)
    variantA.customFields = {
      ...variantA.customFields,
      baseVariant: variantB,
      siblings: [variantB],
    } as any
    await variantRepo.save(variantA)
  }, 120_000)

  afterEach(() => {
    vi.restoreAllMocks()
  })

  afterAll(async () => {
    await server.destroy()
  })

  it('never passes a self-referencing relation custom field to ProductService.findAll', async () => {
    const findAll = vi.spyOn(server.app.get(ProductService), 'findAll')
    await runExport()
    expect(findAll).toHaveBeenCalled()
    for (const call of findAll.mock.calls) {
      const relations = (call[2] ?? []) as string[]
      expect(relations.filter((r) => r.endsWith('customFields.relatedProduct'))).toEqual([])
    }
  })

  it('exports the related ids: single as id, list as id|id, missing as empty', async () => {
    const rows = await runExport()
    const rowA = rows.find((row) => row.sku === 'SELF-A')
    const rowB = rows.find((row) => row.sku === 'SELF-B')

    expect(rowA?.[RELATED_PRODUCT_COLUMN]).toBe(String(productB.id))
    expect(rowA?.[BASE_VARIANT_COLUMN]).toBe(String(variantB.id))
    expect(rowA?.[SIBLINGS_COLUMN]).toBe(String(variantB.id))

    expect(rowB?.[RELATED_PRODUCT_COLUMN]).toBe('')
    expect(rowB?.[BASE_VARIANT_COLUMN]).toBe('')
    expect(rowB?.[SIBLINGS_COLUMN]).toBe('')
  })
})
