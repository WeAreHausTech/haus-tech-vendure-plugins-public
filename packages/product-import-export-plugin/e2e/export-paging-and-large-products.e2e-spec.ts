import path from 'path'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { Asset, LanguageCode, RequestContextService, mergeConfig } from '@vendure/core'
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

const sqliteDataDir = path.join(__dirname, '__data__', 'export-paging')
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

/** 3 option groups with 4 values each: 64 variants on one product. */
function buildLargeProductCsv(): string {
  const header = 'name,slug,description,optionGroups,sku,optionValues,price,taxCategory,stockOnHand'
  const rows: string[] = []
  const sizes = ['S', 'M', 'L', 'XL']
  const colours = ['Red', 'Blue', 'Green', 'Black']
  const finishes = ['Matt', 'Gloss', 'Satin', 'Raw']
  let first = true
  for (const size of sizes) {
    for (const colour of colours) {
      for (const finish of finishes) {
        const sku = `BIG-${size}-${colour}-${finish}`.toUpperCase()
        const productCols = first
          ? 'Big product,big-product,Sixty four variants,Size|Colour|Finish'
          : ',,,'
        rows.push(`${productCols},${sku},${size}|${colour}|${finish},100,Standard Tax,1`)
        first = false
      }
    }
  }
  return [header, ...rows].join('\n')
}

/** 3 option groups with 5 values each: 125 variants on one product, spanning two 100-item load chunks. */
function buildChunkedProductCsv(): string {
  const header = 'name,slug,description,optionGroups,sku,optionValues,price,taxCategory,stockOnHand'
  const rows: string[] = []
  const sizes = ['S', 'M', 'L', 'XL', 'XXL']
  const colours = ['Red', 'Blue', 'Green', 'Black', 'White']
  const finishes = ['Matt', 'Gloss', 'Satin', 'Raw', 'Brushed']
  let first = true
  for (const size of sizes) {
    for (const colour of colours) {
      for (const finish of finishes) {
        const sku = `CHUNK-${size}-${colour}-${finish}`.toUpperCase()
        const productCols = first
          ? 'Chunked product,chunked-product,One hundred twenty five variants,Size|Colour|Finish'
          : ',,,'
        rows.push(`${productCols},${sku},${size}|${colour}|${finish},100,Standard Tax,1`)
        first = false
      }
    }
  }
  return [header, ...rows].join('\n')
}

/**
 * The CHUNK- SKUs in the same row order buildChunkedProductCsv generates them. The importer
 * creates variants in CSV row order, so this is also the order variant ids ascend in.
 */
function chunkedProductSkusInGenerationOrder(): string[] {
  const skus: string[] = []
  const sizes = ['S', 'M', 'L', 'XL', 'XXL']
  const colours = ['Red', 'Blue', 'Green', 'Black', 'White']
  const finishes = ['Matt', 'Gloss', 'Satin', 'Raw', 'Brushed']
  for (const size of sizes) {
    for (const colour of colours) {
      for (const finish of finishes) {
        skus.push(`CHUNK-${size}-${colour}-${finish}`.toUpperCase())
      }
    }
  }
  return skus
}

/** Five single-variant products, so a pageSize of 2 yields three pages. */
function buildFiveProductsCsv(): string {
  const header = 'name,slug,description,sku,price,taxCategory,stockOnHand'
  const rows = [1, 2, 3, 4, 5].map(
    (n) => `Paged product ${n},paged-product-${n},Paged ${n},PAGED-00${n},100,Standard Tax,1`,
  )
  return [header, ...rows].join('\n')
}

describe('export paging and large products', () => {
  const apiPort = 3060
  const { server } = createTestEnvironment(
    mergeConfig(testConfig, {
      apiOptions: { port: apiPort },
      // A ProductVariant relation custom field: its config-level presence alone makes
      // createExportFile build a `customFields.<name>` relation path for every chunked
      // variant load, regardless of whether any variant has a value set or the field is
      // requested in an export's selected fields.
      customFields: {
        ProductVariant: [
          { name: 'manual', type: 'relation', entity: Asset, graphQLType: 'Asset', nullable: true, eager: false },
        ],
      },
      plugins: [ProductImportExportPlugin.init({ importOptions: {}, exportOptions: {} })],
    }),
  )
  let ctx: Awaited<ReturnType<RequestContextService['create']>>
  let productImporter: ProductImporter
  let productExportService: ProductExportService
  let exportStorageStrategy: ExportStorageStrategy

  async function runImport(csv: string): Promise<string[]> {
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

  async function runExport(selectedExportFields: string, fileName: string, pageSize: number) {
    const ids = await productExportService.getAllProductIds(ctx)
    const exported = await productExportService.createExportFile(
      ctx,
      ids,
      fileName,
      '',
      'url',
      selectedExportFields,
      pageSize,
    )
    const csv = await streamToString(await exportStorageStrategy.getExportFileStream(ctx, exported))
    await exportStorageStrategy.deleteExportFile(ctx, exported)
    return { ids, csv }
  }

  beforeAll(async () => {
    await ensureFreshE2eDatabase()
    await server.init({ initialData })
    ctx = await server.app.get(RequestContextService).create({
      apiType: 'admin',
      channelOrToken: E2E_DEFAULT_CHANNEL_TOKEN,
    })
    productImporter = server.app.get(ProductImporter)
    productExportService = server.app.get(ProductExportService)
    exportStorageStrategy = server.app.get<ExportStorageStrategy>(EXPORT_STORAGE_STRATEGY)
    expect(await runImport(buildFiveProductsCsv())).toEqual([])
    expect(await runImport(buildLargeProductCsv())).toEqual([])
    expect(await runImport(buildChunkedProductCsv())).toEqual([])
  }, 120_000)

  afterAll(async () => {
    await server.destroy()
  })

  it('returns product ids in ascending order', async () => {
    const ids = await productExportService.getAllProductIds(ctx)
    const numeric = ids.map((id) => Number(id))
    expect(numeric).toEqual([...numeric].sort((a, b) => a - b))
    expect(numeric.length).toBe(7)
  })

  it('exports every product exactly once across pages', async () => {
    const { csv } = await runExport('name,sku', 'paged.csv', 2)
    const skus = csv
      .trim()
      .split(/\r?\n/)
      .slice(1)
      .map((line) => line.split(',')[1])
    const pagedSkus = skus.filter((sku) => sku.startsWith('PAGED-'))
    expect(pagedSkus.sort()).toEqual(['PAGED-001', 'PAGED-002', 'PAGED-003', 'PAGED-004', 'PAGED-005'])
    expect(skus.length).toBe(new Set(skus).size)
  })

  it('exports all 64 variants of a product with three option groups', async () => {
    const { csv } = await runExport('name,sku,optionGroups,optionValues', 'large.csv', 2)
    const lines = csv.trim().split(/\r?\n/)
    const header = lines[0].split(',')
    const skuCol = header.indexOf('sku')
    const optionValuesCol = header.indexOf('optionValues:en')
    const bigRows = lines.slice(1).map((l) => l.split(',')).filter((cells) => cells[skuCol]?.startsWith('BIG-'))
    expect(bigRows.length).toBe(64)
    expect(new Set(bigRows.map((cells) => cells[skuCol])).size).toBe(64)
    expect(bigRows.find((cells) => cells[skuCol] === 'BIG-S-RED-MATT')?.[optionValuesCol]).toBe('S|Red|Matt')
  })

  // Exercises loadVariantsForProducts across a chunk boundary: 125 variants > VARIANT_LOAD_CHUNK_SIZE
  // (100), so this product's variants are loaded across two chunk queries and merged back together.
  // There is no variant id column in the export, so ascending id order is asserted via SKU insertion
  // order instead: ProductImporter creates variants in CSV row order, so ids ascend with rows, and
  // chunkedProductSkusInGenerationOrder() reproduces that row order.
  it('exports all 125 variants of a product that spans two load chunks', async () => {
    const { csv } = await runExport('name,sku,optionGroups,optionValues', 'chunked.csv', 2)
    const lines = csv.trim().split(/\r?\n/)
    const header = lines[0].split(',')
    const skuCol = header.indexOf('sku')
    const chunkedSkus = lines
      .slice(1)
      .map((l) => l.split(','))
      .filter((cells) => cells[skuCol]?.startsWith('CHUNK-'))
      .map((cells) => cells[skuCol])
    expect(chunkedSkus.length).toBe(125)
    expect(new Set(chunkedSkus).size).toBe(125)
    expect(chunkedSkus).toEqual(chunkedProductSkusInGenerationOrder())
  })

  // Regression test for a crash on the real catalog: with a ProductVariant relation custom
  // field configured (see the `manual` field in mergeConfig above), variantRelationCustomFields
  // includes a `customFields.manual` path. loadVariantsForProducts's chunk `find` previously
  // passed `order: { id: 'ASC' }` alongside `relationLoadStrategy: 'query'`, and TypeORM
  // propagates that order into every relation sub-query via `deepValue(order, relation.propertyPath)`
  // — for the embedded `customFields.manual` path this reads `.manual` off `undefined` and throws.
  it('exports every product when a ProductVariant relation custom field is configured', async () => {
    const { csv } = await runExport('name,sku', 'variant-relation-custom-field.csv', 2)
    const skus = csv
      .trim()
      .split(/\r?\n/)
      .slice(1)
      .map((line) => line.split(',')[1])
    expect(skus.length).toBe(194)
    expect(new Set(skus).size).toBe(194)
  })
})
