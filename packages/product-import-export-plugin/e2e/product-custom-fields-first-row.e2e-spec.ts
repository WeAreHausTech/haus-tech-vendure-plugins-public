import path from 'path'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import {
  LanguageCode,
  Product,
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
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { EXPORT_STORAGE_STRATEGY } from '../src/constants'
import { ExportStorageStrategy } from '../src/services/export-storage/export-storage-strategy'
import { ProductExportService } from '../src/services/product-export.service'
import { ProductImporter } from '../src/providers/import-providers/product-importer'
import { ProductImportExportPlugin } from '../src/product-import-export.plugin'
import { initialData } from './fixtures/initial-data'

// Own data dir (a sibling of `__data__`), because vitest runs spec files in parallel and this
// spec needs its own custom field schema.
const sqliteDataDir = path.join(__dirname, '__data-product-custom-fields__')
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

const SIZE_GUIDE_COLUMN = 'product:sizeGuide:string'
const VARIANT_NOTE_COLUMN = 'variant:note:string'

/**
 * The importer reads product data only from a product's first row (the row with a name), so
 * product custom fields must be written there only, like name, description and facets. Repeating
 * them on every variant row invites edits on later rows that the import silently ignores.
 */
describe('product data on the first row of a product', () => {
  const { server } = createTestEnvironment(
    mergeConfig(testConfig, {
      apiOptions: { port: 3063 },
      customFields: {
        Product: [{ name: 'sizeGuide', type: 'string', nullable: true }],
        ProductVariant: [{ name: 'note', type: 'string', nullable: true }],
      },
      plugins: [ProductImportExportPlugin.init({ importOptions: {}, exportOptions: {} })],
    }),
  )
  let ctx: Awaited<ReturnType<RequestContextService['create']>>
  let productExportService: ProductExportService
  let exportStorageStrategy: ExportStorageStrategy

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

  async function runExport(): Promise<{ csv: string; rows: Array<Record<string, string>> }> {
    const ids = await productExportService.getAllProductIds(ctx)
    const fileName = await productExportService.createExportFile(
      ctx,
      ids,
      'product-custom-fields.csv',
      'product:sizeGuide,variant:note',
      'url',
      'name,slug,description,optionGroups,optionValues,sku,price,taxCategory,stockOnHand',
    )
    const csv = await streamToString(await exportStorageStrategy.getExportFileStream(ctx, fileName))
    await exportStorageStrategy.deleteExportFile(ctx, fileName)
    return { csv, rows: parse(csv, { columns: true, skip_empty_lines: true }) }
  }

  async function sizeGuideOf(slug: string): Promise<unknown> {
    const product = await server.app
      .get(TransactionalConnection)
      .getRepository(ctx, Product)
      .findOneOrFail({ where: { translations: { slug } }, relations: ['translations'] })
    return (product.customFields as { sizeGuide?: string }).sizeGuide
  }

  async function productExists(slug: string): Promise<boolean> {
    const count = await server.app
      .get(TransactionalConnection)
      .getRepository(ctx, Product)
      .count({ where: { translations: { slug } } })
    return count > 0
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
      `name,slug,description,optionGroups,optionValues,sku,price,taxCategory,stockOnHand,product:sizeGuide,variant:note`,
      'Guide tee,guide-tee,Guide tee description,Size,Small,GT-S,100,Standard Tax,1,Fits normal,note S',
      ',,,,Medium,GT-M,100,Standard Tax,1,,note M',
      ',,,,Large,GT-L,100,Standard Tax,1,,note L',
    ].join('\n')
    expect(await runImport(csv)).toEqual([])
  }, 120_000)

  afterAll(async () => {
    await server.destroy()
  })

  it('writes product custom fields on the first variant row only', async () => {
    const { rows } = await runExport()
    const bySku = (sku: string) => rows.find((row) => row.sku === sku)

    expect(bySku('GT-S')?.[SIZE_GUIDE_COLUMN]).toBe('Fits normal')
    expect(bySku('GT-M')?.[SIZE_GUIDE_COLUMN]).toBe('')
    expect(bySku('GT-L')?.[SIZE_GUIDE_COLUMN]).toBe('')
  })

  it('keeps variant custom fields on every variant row', async () => {
    const { rows } = await runExport()
    const bySku = (sku: string) => rows.find((row) => row.sku === sku)

    expect(bySku('GT-S')?.[VARIANT_NOTE_COLUMN]).toBe('note S')
    expect(bySku('GT-M')?.[VARIANT_NOTE_COLUMN]).toBe('note M')
    expect(bySku('GT-L')?.[VARIANT_NOTE_COLUMN]).toBe('note L')
  })

  it('puts product custom fields with the product columns and optionGroups last, next to optionValues', async () => {
    const { csv } = await runExport()
    const header = parse(csv, { to_line: 1 })[0] as string[]
    const order = [SIZE_GUIDE_COLUMN, 'optionGroups:en', 'optionValues:en', 'sku', VARIANT_NOTE_COLUMN]
    const positions = order.map((column) => header.indexOf(column))

    expect(positions.every((position) => position >= 0)).toBe(true)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  it('imports an edited product custom field from the first row of an export', async () => {
    const { csv } = await runExport()
    const edited = csv.replace('Fits normal', 'Runs small')
    expect(edited).not.toBe(csv)

    expect(await runImport(edited)).toEqual([])
    expect(await sizeGuideOf('guide-tee')).toBe('Runs small')
  })

  it('rejects a product whose variant row carries a product custom field', async () => {
    const csv = [
      'name,slug,optionGroups,optionValues,sku,price,taxCategory,stockOnHand,product:sizeGuide',
      'Late guide tee,late-guide-tee,Size,Small,LG-S,100,Standard Tax,1,Fits normal',
      ',,,Medium,LG-M,100,Standard Tax,1,Runs small',
    ].join('\n')

    const errors = await runImport(csv)

    expect(errors).toEqual([
      "Column 'product:sizeGuide' holds product data and must be empty on variant rows; enter it on the product's first row (the row with a name) on line 3",
    ])
    expect(await productExists('late-guide-tee')).toBe(false)
  })

  it('rejects a product whose variant row carries a translated product column', async () => {
    const csv = [
      'name:en,slug:en,description:en,optionGroups:en,optionValues:en,sku,price,taxCategory,stockOnHand',
      'Late desc tee,late-desc-tee,First,Size,Small,LD-S,100,Standard Tax,1',
      ',,Second,,Medium,LD-M,100,Standard Tax,1',
    ].join('\n')

    const errors = await runImport(csv)

    expect(errors).toEqual([
      "Column 'description:en' holds product data and must be empty on variant rows; enter it on the product's first row (the row with a name) on line 3",
    ])
    expect(await productExists('late-desc-tee')).toBe(false)
  })

  it('still imports the other products in the file', async () => {
    const csv = [
      'name,slug,description,optionGroups,optionValues,sku,price,taxCategory,stockOnHand,product:sizeGuide',
      'Bad tee,bad-tee,Bad,Size,Small,BT-S,100,Standard Tax,1,',
      ',,,,Medium,BT-M,100,Standard Tax,1,Runs small',
      'Good tee,good-tee,Good,Size,Small,OK-S,100,Standard Tax,1,Fits normal',
      ',,,,Medium,OK-M,100,Standard Tax,1,',
    ].join('\n')

    const errors = await runImport(csv)

    expect(errors).toEqual([expect.stringContaining('on line 3')])
    expect(await productExists('bad-tee')).toBe(false)
    expect(await sizeGuideOf('good-tee')).toBe('Fits normal')
  })

  it('accepts the product id repeated on every variant row', async () => {
    const ids = await productExportService.getAllProductIds(ctx)
    const fileName = await productExportService.createExportFile(
      ctx,
      ids,
      'with-id.csv',
      'product:sizeGuide',
      'url',
      'name,slug,id,optionGroups,optionValues,sku,price,taxCategory,stockOnHand',
    )
    const withId = await streamToString(await exportStorageStrategy.getExportFileStream(ctx, fileName))
    await exportStorageStrategy.deleteExportFile(ctx, fileName)

    expect(await runImport(withId)).toEqual([])
  })
})
