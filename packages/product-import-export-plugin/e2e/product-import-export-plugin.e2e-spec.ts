import path from 'path'
import { rm } from 'node:fs/promises'
import { Readable } from 'node:stream'
import {
  LanguageCode,
  RequestContextService,
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
})
