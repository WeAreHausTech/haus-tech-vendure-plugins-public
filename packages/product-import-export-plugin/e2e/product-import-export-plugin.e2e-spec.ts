import path from 'path'
import { access, rm } from 'node:fs/promises'
import { constants } from 'node:fs'
import { Readable } from 'node:stream'
import {
  Asset,
  ConfigService,
  LanguageCode,
  Product,
  ProductOptionGroup,
  RequestContextService,
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
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { EXPORT_STORAGE_STRATEGY } from '../src/constants'
import { ExportStorageStrategy } from '../src/services/export-storage/export-storage-strategy'
import { ProductExportService } from '../src/services/product-export.service'
import { ProductImporter } from '../src/providers/import-providers/product-importer'
import { ProductImportExportPlugin } from '../src/product-import-export.plugin'
import { ProductImportService } from '../src/services/product-import.service'
import { initialData } from './fixtures/initial-data'

const sqliteDataDir = path.join(__dirname, '__data__')
registerInitializer('sqljs', new SqljsInitializer(sqliteDataDir))
const exportDir = path.join(process.cwd(), 'static', 'exports', E2E_DEFAULT_CHANNEL_TOKEN)
const exportTmpDir = path.join(process.cwd(), 'static', 'exports-tmp', E2E_DEFAULT_CHANNEL_TOKEN)

async function streamToString(stream: Readable): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function cleanupExportArtifacts(): Promise<void> {
  await Promise.all([
    rm(exportDir, { recursive: true, force: true }),
    rm(exportTmpDir, { recursive: true, force: true }),
  ])
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function waitFor(
  condition: () => Promise<boolean>,
  timeoutMs = 20_000,
  intervalMs = 200,
): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await condition()) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  throw new Error('Timed out waiting for condition')
}

async function runImport(
  importer: ProductImporter,
  ctx: Awaited<ReturnType<RequestContextService['create']>>,
  csv: string,
): Promise<{ imported: number; processed: number; errors: string[] }> {
  let importResult: { imported: number; processed: number; errors: string[] } | undefined
  await new Promise<void>((resolve, reject) => {
    importer.parseAndImport(csv, ctx, true, LanguageCode.en, 'replace').subscribe({
      next: (result) => {
        importResult = {
          imported: result.imported,
          processed: result.processed,
          errors: result.errors ?? [],
        }
      },
      complete: () => resolve(),
      error: (error) => reject(error),
    })
  })
  return importResult ?? { imported: 0, processed: 0, errors: [] }
}

describe('ProductImportExportPlugin e2e', () => {
  const apiPort = 3057
  const { server, adminClient } = createTestEnvironment(
    mergeConfig(testConfig, {
      apiOptions: { port: apiPort },
      plugins: [
        ProductImportExportPlugin.init({
          importOptions: {},
          exportOptions: {},
        }),
      ],
    }),
  )

  beforeAll(async () => {
    await cleanupExportArtifacts()

    await server.init({
      initialData,
    })
    await adminClient.asSuperAdmin()

    const result = await adminClient.query(gql`
      query TaxCategoriesForPluginTests {
        taxCategories(options: { take: 50 }) {
          items {
            id
            name
          }
        }
      }
    `)
    const hasStandardTax = result.taxCategories.items.some(
      (item: { name: string }) => item.name === 'Standard Tax',
    )
    if (!hasStandardTax) {
      await adminClient.query(
        gql`
          mutation CreateStandardTaxCategoryForPluginTests($input: CreateTaxCategoryInput!) {
            createTaxCategory(input: $input) {
              id
              name
            }
          }
        `,
        {
          input: {
            name: 'Standard Tax',
            isDefault: true,
          },
        },
      )
    }
  }, 120_000)

  afterAll(async () => {
    await server.destroy()
    await cleanupExportArtifacts()
  })

  it('returns plugin config defaults from HTTP endpoint', async () => {
    const response = await fetch(
      `http://localhost:${apiPort}/product-import-export/config`,
    )
    expect(response.status).toBe(200)

    const config = await response.json()
    expect(config.exportOptions.defaultFileName).toBe('products_export.csv')
    expect(config.exportOptions.defaultExportAssetsAs).toBe('url')
    expect(config.exportOptions.requiredExportFields).toEqual(
      expect.arrayContaining(['name', 'sku']),
    )
    expect(config.importOptions.defaultOptions).toEqual({
      restoreSoftDeleted: true,
      updateProductSlug: true,
    })
  })

  it('returns active channel from HTTP endpoint', async () => {
    const response = await fetch(
      `http://localhost:${apiPort}/product-import-export/channel`,
    )
    expect(response.status).toBe(200)

    const channel = await response.json()
    expect(channel.code).toBe('__default_channel__')
    expect(channel.token).toBe(E2E_DEFAULT_CHANNEL_TOKEN)
  })

  it('returns exportable custom fields from HTTP endpoint', async () => {
    const response = await fetch(
      `http://localhost:${apiPort}/product-export/custom-fields`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify([]),
      },
    )

    expect([200, 201]).toContain(response.status)
    const customFields = await response.json()
    expect(customFields).toEqual([])
  })

  it('rejects invalid fileName for export-all endpoint', async () => {
    const response = await fetch(
      `http://localhost:${apiPort}/product-export/export-all?fileName=../bad&selectedExportFields=name,sku`,
      {
        method: 'POST',
      },
    )

    expect(response.status).toBe(422)
    const body = await response.json()
    expect(String(body?.message ?? '')).toContain('Invalid fileName')
  })

  it('exports stockOnHand value for variants', async () => {
    const requestContextService = server.app.get(RequestContextService)
    const productImporter = server.app.get(ProductImporter)
    const productExportService = server.app.get(ProductExportService)
    const exportStorageStrategy = server.app.get<ExportStorageStrategy>(
      EXPORT_STORAGE_STRATEGY,
    )

    const ctx = await requestContextService.create({
      apiType: 'admin',
      channelOrToken: E2E_DEFAULT_CHANNEL_TOKEN,
    })

    const importCsv = [
      'name,slug,description,sku,stockOnHand,price,taxCategory',
      'Stock export test product,stock-export-test-product,Stock export description,STOCK-EXPORT-001,7,100,Standard Tax',
    ].join('\n')

    let importResult:
      | {
          imported: number
          processed: number
          errors: string[]
        }
      | undefined

    await new Promise<void>((resolve, reject) => {
      productImporter
        .parseAndImport(importCsv, ctx, true, LanguageCode.en, 'replace')
        .subscribe({
          next: (result) => {
            importResult = {
              imported: result.imported,
              processed: result.processed,
              errors: result.errors ?? [],
            }
          },
          complete: () => resolve(),
          error: (error) => reject(error),
        })
    })

    const productIds = await productExportService.getAllProductIds(ctx)
    if (productIds.length === 0) {
      const errors = importResult?.errors?.join(' | ') ?? 'No import errors returned'
      throw new Error(`Expected imported products before export. Details: ${errors}`)
    }

    const fileName = await productExportService.createExportFile(
      ctx,
      productIds,
      'stock-export.csv',
      '',
      'url',
      'name,sku,stockOnHand',
    )

    const stream = await exportStorageStrategy.getExportFileStream(ctx, fileName)
    const exportedCsv = await streamToString(stream)

    expect(exportedCsv).toContain('stockOnHand')
    expect(exportedCsv).toMatch(/STOCK-EXPORT-001,7(?:\r?\n|$)/)

    await exportStorageStrategy.deleteExportFile(ctx, fileName)
  })

  it('imports option groups and preserves option values per variant', async () => {
    const requestContextService = server.app.get(RequestContextService)
    const productImporter = server.app.get(ProductImporter)
    const productExportService = server.app.get(ProductExportService)
    const exportStorageStrategy = server.app.get<ExportStorageStrategy>(
      EXPORT_STORAGE_STRATEGY,
    )

    const ctx = await requestContextService.create({
      apiType: 'admin',
      channelOrToken: E2E_DEFAULT_CHANNEL_TOKEN,
    })

    const importCsv = [
      'name,slug,description,optionGroups,sku,optionValues,price,taxCategory,stockOnHand',
      'Option group test product,option-group-test-product,Option group test description,Size,OG-S,Small,100,Standard Tax,3',
      ',,,,OG-M,Medium,100,Standard Tax,5',
    ].join('\n')

    await new Promise<void>((resolve, reject) => {
      productImporter
        .parseAndImport(importCsv, ctx, true, LanguageCode.en, 'replace')
        .subscribe({
          complete: () => resolve(),
          error: (error) => reject(error),
        })
    })

    const productIds = await productExportService.getAllProductIds(ctx)
    const fileName = await productExportService.createExportFile(
      ctx,
      productIds,
      'option-group-export.csv',
      '',
      'url',
      'name,sku,optionGroups,optionValues,stockOnHand',
    )

    const stream = await exportStorageStrategy.getExportFileStream(ctx, fileName)
    const exportedCsv = await streamToString(stream)
    const lines = exportedCsv.trim().split(/\r?\n/)
    const header = lines[0].split(',')
    const rows = lines.slice(1).map((line) => line.split(','))

    const idx = {
      optionGroups: header.indexOf('optionGroups:en'),
      optionValues: header.indexOf('optionValues:en'),
      sku: header.indexOf('sku'),
      stockOnHand: header.indexOf('stockOnHand'),
    }

    const smallRow = rows.find((row) => row[idx.sku] === 'OG-S')
    const mediumRow = rows.find((row) => row[idx.sku] === 'OG-M')
    expect(smallRow).toBeDefined()
    expect(mediumRow).toBeDefined()

    expect(smallRow?.[idx.optionGroups]).toBe('Size')
    expect(smallRow?.[idx.optionValues]).toBe('Small')
    expect(smallRow?.[idx.stockOnHand]).toBe('3')

    expect(mediumRow?.[idx.optionGroups]).toBe('')
    expect(mediumRow?.[idx.optionValues]).toBe('Medium')
    expect(mediumRow?.[idx.stockOnHand]).toBe('5')

    await exportStorageStrategy.deleteExportFile(ctx, fileName)
  })

  it('shares an option group across products that use the name:code syntax', async () => {
    const requestContextService = server.app.get(RequestContextService)
    const productImporter = server.app.get(ProductImporter)
    const connection = server.app.get(TransactionalConnection)

    const ctx = await requestContextService.create({
      apiType: 'admin',
      channelOrToken: E2E_DEFAULT_CHANNEL_TOKEN,
    })

    // Two shoe products share the "shoe-size" code; the third product uses a
    // plain "size" name and must end up with its own per-product group.
    // The first occurrence of the shared code (Shared shoe A) defines the full
    // option set for the shared group; subsequent products reference a subset
    // of those values, mirroring Vendure core's shared-group semantics.
    const importCsv = [
      'name,slug,description,optionGroups,sku,optionValues,price,taxCategory,stockOnHand',
      'Shared shoe A,shared-shoe-a,Shoe A description,size:shoe-size,SHOE-A-S,Small,100,Standard Tax,1',
      ',,,,SHOE-A-M,Medium,100,Standard Tax,1',
      ',,,,SHOE-A-L,Large,100,Standard Tax,1',
      'Shared shoe B,shared-shoe-b,Shoe B description,size:shoe-size,SHOE-B-S,Small,120,Standard Tax,1',
      ',,,,SHOE-B-M,Medium,120,Standard Tax,1',
      'Standalone phone,standalone-phone,Phone description,size,PHONE-4G,4GB,200,Standard Tax,1',
      ',,,,PHONE-8G,8GB,200,Standard Tax,1',
    ].join('\n')

    const importResult = await runImport(productImporter, ctx, importCsv)
    expect(importResult.errors).toEqual([])
    expect(importResult.imported).toBe(3)

    const productRepo = connection.getRepository(ctx, Product)
    const groupRepo = connection.getRepository(ctx, ProductOptionGroup)

    const findProductBySlug = (slug: string) =>
      productRepo.findOne({
        where: { translations: { slug } },
        relations: ['optionGroups'],
      })

    const [shoeA, shoeB, phone] = await Promise.all([
      findProductBySlug('shared-shoe-a'),
      findProductBySlug('shared-shoe-b'),
      findProductBySlug('standalone-phone'),
    ])

    expect(shoeA?.optionGroups).toHaveLength(1)
    expect(shoeB?.optionGroups).toHaveLength(1)
    expect(phone?.optionGroups).toHaveLength(1)

    // Both shoes resolve to the same shared group with the explicit code.
    expect(shoeA?.optionGroups[0].code).toBe('shoe-size')
    expect(shoeB?.optionGroups[0].code).toBe('shoe-size')
    expect(shoeA?.optionGroups[0].id).toEqual(shoeB?.optionGroups[0].id)

    // The phone has its own per-product group with a product-scoped code.
    expect(phone?.optionGroups[0].id).not.toEqual(shoeA?.optionGroups[0].id)
    expect(phone?.optionGroups[0].code).not.toBe('shoe-size')

    // The shared group is linked to exactly the two shoe products and owns the
    // canonical set of options (Small/Medium/Large) declared by the first
    // occurrence.
    const sharedGroup = await groupRepo.findOne({
      where: { code: 'shoe-size' },
      relations: ['products', 'options'],
    })
    expect(sharedGroup).toBeDefined()
    const sharedProductIds = (sharedGroup?.products ?? []).map((p) => p.id).sort()
    expect(sharedProductIds).toEqual([shoeA?.id, shoeB?.id].sort())
    const sharedOptionCodes = (sharedGroup?.options ?? []).map((o) => o.code).sort()
    expect(sharedOptionCodes).toEqual(['large', 'medium', 'small'])
  })

  it('reports parser error when optionValues count mismatches optionGroups', async () => {
    const requestContextService = server.app.get(RequestContextService)
    const productImporter = server.app.get(ProductImporter)

    const ctx = await requestContextService.create({
      apiType: 'admin',
      channelOrToken: E2E_DEFAULT_CHANNEL_TOKEN,
    })

    const importCsv = [
      'name,slug,description,optionGroups,sku,optionValues,price,taxCategory,stockOnHand',
      'Mismatch product,mismatch-product,Mismatch description,Size|Color,MISMATCH-001,Small,100,Standard Tax,1',
    ].join('\n')

    let importResult:
      | {
          imported: number
          processed: number
          errors: string[]
        }
      | undefined

    await new Promise<void>((resolve, reject) => {
      productImporter
        .parseAndImport(importCsv, ctx, true, LanguageCode.en, 'replace')
        .subscribe({
          next: (result) => {
            importResult = {
              imported: result.imported,
              processed: result.processed,
              errors: result.errors ?? [],
            }
          },
          complete: () => resolve(),
          error: (error) => reject(error),
        })
    })

    expect(importResult?.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "The number of optionValues in column 'optionValues' must match the number of optionGroups",
        ),
      ]),
    )
  })

  it('filters exported columns based on selectedExportFields', async () => {
    const requestContextService = server.app.get(RequestContextService)
    const productExportService = server.app.get(ProductExportService)
    const exportStorageStrategy = server.app.get<ExportStorageStrategy>(
      EXPORT_STORAGE_STRATEGY,
    )

    const ctx = await requestContextService.create({
      apiType: 'admin',
      channelOrToken: E2E_DEFAULT_CHANNEL_TOKEN,
    })

    const productIds = await productExportService.getAllProductIds(ctx)
    expect(productIds.length).toBeGreaterThan(0)

    const fileName = await productExportService.createExportFile(
      ctx,
      productIds,
      'selected-fields-export.csv',
      '',
      'url',
      'name,sku',
    )

    const stream = await exportStorageStrategy.getExportFileStream(ctx, fileName)
    const exportedCsv = await streamToString(stream)
    const headerLine = exportedCsv.trim().split(/\r?\n/)[0]

    expect(headerLine).toBe('name:en,sku')
    expect(headerLine).not.toContain('description:en')
    expect(headerLine).not.toContain('stockOnHand')

    await exportStorageStrategy.deleteExportFile(ctx, fileName)
  })

  it('does not mutate configured defaultFileName when export endpoint appends .csv', async () => {
    const requestContextService = server.app.get(RequestContextService)
    const productExportService = server.app.get(ProductExportService)

    const ctx = await requestContextService.create({
      apiType: 'admin',
      channelOrToken: E2E_DEFAULT_CHANNEL_TOKEN,
    })
    const productIds = await productExportService.getAllProductIds(ctx)
    expect(productIds.length).toBeGreaterThan(0)

    const originalDefaultFileName = ProductImportExportPlugin.options.exportOptions.defaultFileName
    ProductImportExportPlugin.options.exportOptions.defaultFileName = 'e2e-default-export'

    try {
      const response = await fetch(
        `http://localhost:${apiPort}/product-export/export?selectedExportFields=name,sku`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify([productIds[0]]),
        },
      )

      expect(response.status).toBe(200)
      expect(ProductImportExportPlugin.options.exportOptions.defaultFileName).toBe(
        'e2e-default-export',
      )
    } finally {
      ProductImportExportPlugin.options.exportOptions.defaultFileName = originalDefaultFileName
    }
  })

  it('keeps existing description when description column is omitted in import CSV', async () => {
    const requestContextService = server.app.get(RequestContextService)
    const productImporter = server.app.get(ProductImporter)
    const productExportService = server.app.get(ProductExportService)
    const exportStorageStrategy = server.app.get<ExportStorageStrategy>(EXPORT_STORAGE_STRATEGY)
    const ctx = await requestContextService.create({
      apiType: 'admin',
      channelOrToken: E2E_DEFAULT_CHANNEL_TOKEN,
    })

    const initialCsv = [
      'name,slug,description,sku,price,taxCategory,stockOnHand',
      'Missing column keep test,missing-column-keep-test,Original description,MISSCOL-001,100,Standard Tax,1',
    ].join('\n')
    await runImport(productImporter, ctx, initialCsv)

    const omittedDescriptionCsv = [
      'name,slug,sku,price,taxCategory,stockOnHand',
      'Missing column keep test,missing-column-keep-test,MISSCOL-001,100,Standard Tax,1',
    ].join('\n')
    const secondImport = await runImport(productImporter, ctx, omittedDescriptionCsv)
    expect(secondImport.errors).toEqual([])

    const productIds = await productExportService.getAllProductIds(ctx)
    const fileName = await productExportService.createExportFile(
      ctx,
      productIds,
      'missing-column-keep.csv',
      '',
      'url',
      'name,description,sku',
    )
    const csv = await streamToString(await exportStorageStrategy.getExportFileStream(ctx, fileName))
    await exportStorageStrategy.deleteExportFile(ctx, fileName)
    expect(csv).toContain('MISSCOL-001')
    expect(csv).toContain('Original description')
  })

  it('clears description when description column exists but cell is empty', async () => {
    const requestContextService = server.app.get(RequestContextService)
    const productImporter = server.app.get(ProductImporter)
    const productExportService = server.app.get(ProductExportService)
    const exportStorageStrategy = server.app.get<ExportStorageStrategy>(EXPORT_STORAGE_STRATEGY)
    const ctx = await requestContextService.create({
      apiType: 'admin',
      channelOrToken: E2E_DEFAULT_CHANNEL_TOKEN,
    })

    const initialCsv = [
      'name,slug,description,sku,price,taxCategory,stockOnHand',
      'Empty clears test,empty-clears-test,To be cleared,EMPTCLR-001,100,Standard Tax,1',
    ].join('\n')
    await runImport(productImporter, ctx, initialCsv)

    const emptyDescriptionCsv = [
      'name,slug,description,sku,price,taxCategory,stockOnHand',
      'Empty clears test,empty-clears-test,,EMPTCLR-001,100,Standard Tax,1',
    ].join('\n')
    const secondImport = await runImport(productImporter, ctx, emptyDescriptionCsv)
    expect(secondImport.errors).toEqual([])

    const productIds = await productExportService.getAllProductIds(ctx)
    const fileName = await productExportService.createExportFile(
      ctx,
      productIds,
      'empty-clears.csv',
      '',
      'url',
      'name,description,sku',
    )
    const csv = await streamToString(await exportStorageStrategy.getExportFileStream(ctx, fileName))
    await exportStorageStrategy.deleteExportFile(ctx, fileName)
    const line = csv
      .split(/\r?\n/)
      .find((row) => row.includes('EMPTCLR-001'))
    expect(line).toBeDefined()
    expect(line?.endsWith('EMPTCLR-001')).toBe(true)
  })

  it('keeps existing stockOnHand when stockOnHand column is omitted in import CSV', async () => {
    const requestContextService = server.app.get(RequestContextService)
    const productImporter = server.app.get(ProductImporter)
    const productExportService = server.app.get(ProductExportService)
    const exportStorageStrategy = server.app.get<ExportStorageStrategy>(EXPORT_STORAGE_STRATEGY)
    const ctx = await requestContextService.create({
      apiType: 'admin',
      channelOrToken: E2E_DEFAULT_CHANNEL_TOKEN,
    })

    const sku = `KEEP-STOCK-${Date.now()}`
    const initialCsv = [
      'name,slug,description,sku,price,taxCategory,stockOnHand',
      `Keep stock test,keep-stock-test-${Date.now()},Keep stock description,${sku},100,Standard Tax,9`,
    ].join('\n')
    await runImport(productImporter, ctx, initialCsv)

    const omittedStockCsv = [
      'name,slug,description,sku,price,taxCategory',
      `Keep stock test,keep-stock-test-${Date.now()},Keep stock description updated,${sku},100,Standard Tax`,
    ].join('\n')
    const secondImport = await runImport(productImporter, ctx, omittedStockCsv)
    expect(secondImport.errors).toEqual([])

    const productIds = await productExportService.getAllProductIds(ctx)
    const fileName = await productExportService.createExportFile(
      ctx,
      productIds,
      'keep-stock.csv',
      '',
      'url',
      'sku,stockOnHand',
    )
    const exportedCsv = await streamToString(await exportStorageStrategy.getExportFileStream(ctx, fileName))
    await exportStorageStrategy.deleteExportFile(ctx, fileName)
    const line = exportedCsv.split(/\r?\n/).find((row) => row.startsWith(`${sku},`))
    expect(line).toBe(`${sku},9`)
  })

  it('requires optionGroups and optionValues when importing multi-variant products', async () => {
    const requestContextService = server.app.get(RequestContextService)
    const productImporter = server.app.get(ProductImporter)
    const ctx = await requestContextService.create({
      apiType: 'admin',
      channelOrToken: E2E_DEFAULT_CHANNEL_TOKEN,
    })

    const invalidCsv = [
      'name,slug,description,sku,price,taxCategory,stockOnHand',
      'Multi variant requirement,multi-variant-requirement,Needs options,MULTI-001,100,Standard Tax,1',
      ',,,MULTI-002,100,Standard Tax,1',
    ].join('\n')

    const importResult = await runImport(productImporter, ctx, invalidCsv)
    expect(importResult.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'optionGroups and optionValues are required when importing products with multiple variants',
        ),
      ]),
    )
  })

  it('omits custom field columns when customFields is not requested in export', async () => {
    const requestContextService = server.app.get(RequestContextService)
    const productExportService = server.app.get(ProductExportService)
    const exportStorageStrategy = server.app.get<ExportStorageStrategy>(EXPORT_STORAGE_STRATEGY)
    const ctx = await requestContextService.create({
      apiType: 'admin',
      channelOrToken: E2E_DEFAULT_CHANNEL_TOKEN,
    })

    const productIds = await productExportService.getAllProductIds(ctx)
    const fileName = await productExportService.createExportFile(
      ctx,
      productIds,
      'no-custom-fields.csv',
      '',
      'url',
      'name,sku',
    )
    const csv = await streamToString(await exportStorageStrategy.getExportFileStream(ctx, fileName))
    await exportStorageStrategy.deleteExportFile(ctx, fileName)
    const headerLine = csv.trim().split(/\r?\n/)[0]
    expect(headerLine).toBe('name:en,sku')
    expect(headerLine).not.toContain('product:')
    expect(headerLine).not.toContain('variant:')
  })

  it('rejects export when multi-variant products are exported without option fields selected', async () => {
    const requestContextService = server.app.get(RequestContextService)
    const productImporter = server.app.get(ProductImporter)
    const productExportService = server.app.get(ProductExportService)
    const ctx = await requestContextService.create({
      apiType: 'admin',
      channelOrToken: E2E_DEFAULT_CHANNEL_TOKEN,
    })

    const validMultiVariantCsv = [
      'name,slug,description,optionGroups,sku,optionValues,price,taxCategory,stockOnHand',
      'Export option validation,export-option-validation,Needs option export fields,Size,EXP-OPT-S,Small,100,Standard Tax,1',
      ',,,,EXP-OPT-M,Medium,100,Standard Tax,1',
    ].join('\n')
    await runImport(productImporter, ctx, validMultiVariantCsv)
    const productIds = await productExportService.getAllProductIds(ctx)
    const targetProductId = productIds[productIds.length - 1]

    const response = await fetch(
      `http://localhost:${apiPort}/product-export/export?selectedExportFields=name,sku`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify([targetProductId]),
      },
    )

    expect(response.status).toBe(422)
    const payload = await response.json()
    expect(String(payload?.message ?? '')).toContain(
      'optionGroups and optionValues are required when exporting products with multiple variants',
    )
  })

  it('validates required relation custom fields with clear errors', async () => {
    const requestContextService = server.app.get(RequestContextService)
    const productImporter = server.app.get(ProductImporter) as unknown as {
      processCustomFieldValues: (
        customFields: Record<string, string>,
        config: Array<{
          name: string
          type: 'relation'
          nullable: boolean
          list: boolean
          entity: typeof Asset
        }>,
        ctx: Awaited<ReturnType<RequestContextService['create']>>,
      ) => Promise<Record<string, unknown>>
    }
    const ctx = await requestContextService.create({
      apiType: 'admin',
      channelOrToken: E2E_DEFAULT_CHANNEL_TOKEN,
    })

    await expect(
      productImporter.processCustomFieldValues(
        { requiredAsset: '' },
        [
          {
            name: 'requiredAsset',
            type: 'relation',
            nullable: false,
            list: false,
            entity: Asset,
          },
        ],
        ctx,
      ),
    ).rejects.toThrow('Required relation custom field "requiredAsset" is missing or empty')
  })

  it('reports parser/import error for relation custom field with invalid format in CSV', async () => {
    const requestContextService = server.app.get(RequestContextService)
    const configService = server.app.get(ConfigService)
    const productImporter = server.app.get(ProductImporter)
    const ctx = await requestContextService.create({
      apiType: 'admin',
      channelOrToken: E2E_DEFAULT_CHANNEL_TOKEN,
    })

    const originalProductCustomFields = [...configService.customFields.Product]
    configService.customFields.Product = [
      ...configService.customFields.Product,
      {
        name: 'relatedProductRef',
        type: 'relation',
        entity: Asset,
        nullable: false,
      },
    ]

    try {
      const importCsv = [
        'name,slug,description,sku,price,taxCategory,stockOnHand,product:relatedProductRef:asset',
        'Invalid relation format test,invalid-relation-format-test,Invalid relation format description,REL-INVALID-001,100,Standard Tax,1,not-a-valid-asset-relation',
      ].join('\n')

      const importResult = await runImport(productImporter, ctx, importCsv)
      expect(importResult.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining(
            'Required relation custom field "relatedProductRef" must contain valid asset data',
          ),
        ]),
      )
    } finally {
      configService.customFields.Product = originalProductCustomFields
    }
  })

  it('queues import job with storageKey payload and cleans up temp file after processing', async () => {
    const requestContextService = server.app.get(RequestContextService)
    const productImportService = server.app.get(ProductImportService)
    const productExportService = server.app.get(ProductExportService)
    const ctx = await requestContextService.create({
      apiType: 'admin',
      channelOrToken: E2E_DEFAULT_CHANNEL_TOKEN,
    })
    const baselineCount = (await productExportService.getAllProductIds(ctx)).length
    const csv = [
      'name,slug,description,sku,price,taxCategory,stockOnHand',
      `Queue payload test,queue-payload-test-${Date.now()},Queue payload desc,QUEUE-PAYLOAD-${Date.now()},100,Standard Tax,1`,
    ].join('\n')
    const file = {
      originalname: 'queue-payload.csv',
      buffer: Buffer.from(csv, 'utf8'),
    } as Express.Multer.File

    const job = await productImportService.processFile(ctx, file, true, LanguageCode.en, 'replace')
    const jobData = job.data as { storageKey?: string; fileContent?: string }
    expect(jobData.storageKey).toBeTruthy()
    expect(jobData.fileContent).toBeUndefined()
    const tempFilePath = jobData.storageKey
    if (!tempFilePath) {
      throw new Error('Expected queue job to include storageKey')
    }
    expect(await fileExists(tempFilePath)).toBe(true)

    await waitFor(async () => (await productExportService.getAllProductIds(ctx)).length > baselineCount)
    await waitFor(async () => !(await fileExists(tempFilePath)))
  })

  it('imports a large CSV upload without crashing the import queue worker', async () => {
    const requestContextService = server.app.get(RequestContextService)
    const productImportService = server.app.get(ProductImportService)
    const productExportService = server.app.get(ProductExportService)
    const ctx = await requestContextService.create({
      apiType: 'admin',
      channelOrToken: E2E_DEFAULT_CHANNEL_TOKEN,
    })

    const baselineCount = (await productExportService.getAllProductIds(ctx)).length
    const uniquePrefix = `bulk-${Date.now()}`
    const rows = Array.from({ length: 300 }, (_, i) => {
      const idx = i + 1
      return `Bulk product ${idx},${uniquePrefix}-${idx},Bulk description ${idx},BULK-${uniquePrefix}-${idx},100,Standard Tax,1`
    })
    const csv = [
      'name,slug,description,sku,price,taxCategory,stockOnHand',
      ...rows,
    ].join('\n')
    const file = {
      originalname: 'bulk-import.csv',
      buffer: Buffer.from(csv, 'utf8'),
    } as Express.Multer.File

    await productImportService.processFile(ctx, file, true, LanguageCode.en, 'replace')
    await waitFor(async () => (await productExportService.getAllProductIds(ctx)).length >= baselineCount + 300)
  })
})
