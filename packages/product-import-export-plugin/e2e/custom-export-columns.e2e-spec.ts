import path from 'path'
import { Readable } from 'node:stream'
import { LanguageCode, RequestContextService, mergeConfig } from '@vendure/core'
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

async function streamToString(stream: Readable): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf8')
}

let exportStartCalls = 0

describe('customExportColumns e2e', () => {
  const { server, adminClient } = createTestEnvironment(
    mergeConfig(testConfig, {
      apiOptions: { port: 3058 },
      plugins: [
        ProductImportExportPlugin.init({
          importOptions: {},
          exportOptions: {
            customExportColumns: [
              {
                name: 'storeUrl',
                onExportStart: () => {
                  exportStartCalls++
                },
                resolve: (_ctx, _injector, product, variant) =>
                  `https://example.com/${product.slug}?sku=${variant.sku}`,
              },
              {
                name: 'boom',
                resolve: () => {
                  throw new Error('boom')
                },
              },
            ],
          },
        }),
      ],
    }),
  )

  beforeAll(async () => {
    await server.init({ initialData })
    await adminClient.asSuperAdmin()

    // The brief's initialData fixture creates no products; the resolve()/onExportStart
    // assertions below need at least one multi-variant product to exercise per-row
    // resolution, so seed one via the same import path the rest of the plugin uses
    // (mirrors the product creation pattern in e2e/product-import-export-plugin.e2e-spec.ts).
    const result = await adminClient.query(gql`
      query TaxCategoriesForCustomExportColumnsTests {
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
          mutation CreateStandardTaxCategoryForCustomExportColumnsTests($input: CreateTaxCategoryInput!) {
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

    const requestContextService = server.app.get(RequestContextService)
    const productImporter = server.app.get(ProductImporter)
    const ctx = await requestContextService.create({
      apiType: 'admin',
      channelOrToken: E2E_DEFAULT_CHANNEL_TOKEN,
    })
    const importCsv = [
      'name,slug,description,optionGroups,sku,optionValues,price,taxCategory,stockOnHand',
      'Custom column test product,custom-column-test-product,Custom column test description,Size,CCT-S,Small,100,Standard Tax,3',
      ',,,,CCT-M,Medium,100,Standard Tax,5',
    ].join('\n')
    await new Promise<void>((resolve, reject) => {
      productImporter.parseAndImport(importCsv, ctx, true, LanguageCode.en, 'replace').subscribe({
        complete: () => resolve(),
        error: (error) => reject(error),
      })
    })
  }, 120_000)

  afterAll(async () => {
    await server.destroy()
    // NOTE: deliberately not recursively removing the shared `static/` directory here —
    // this file's default LocalExportStorageStrategy shares that root and the
    // E2E_DEFAULT_CHANNEL_TOKEN channel-scoped subdirectories with
    // e2e/product-import-export-plugin.e2e-spec.ts, and vitest runs spec files in
    // parallel by default, so a broad rm() here raced the other file's in-flight
    // export writes (ENOENT on rename). Each test already deletes its own exported
    // file via exportStorageStrategy.deleteExportFile, and createExportFile cleans up
    // its own tmp file, so no directory-level cleanup is needed.
  })

  async function runExport(selectedExportFields: string, fileName: string) {
    const requestContextService = server.app.get(RequestContextService)
    const productExportService = server.app.get(ProductExportService)
    const exportStorageStrategy = server.app.get<ExportStorageStrategy>(EXPORT_STORAGE_STRATEGY)
    const ctx = await requestContextService.create({
      apiType: 'admin',
      channelOrToken: E2E_DEFAULT_CHANNEL_TOKEN,
    })
    const productIds = await productExportService.getAllProductIds(ctx)
    const file = await productExportService.createExportFile(
      ctx,
      productIds,
      fileName,
      '',
      'url',
      selectedExportFields,
    )
    const csv = await streamToString(await exportStorageStrategy.getExportFileStream(ctx, file))
    await exportStorageStrategy.deleteExportFile(ctx, file)
    return csv.trim().split(/\r?\n/)
  }

  it('resolves selected custom columns per variant row, appended last', async () => {
    const callsBefore = exportStartCalls
    const lines = await runExport('name,sku,optionGroups,optionValues,storeUrl', 'custom-col.csv')
    const header = lines[0].split(',')
    expect(header[header.length - 1]).toBe('storeUrl')
    const skuIdx = header.indexOf('sku')
    const urlIdx = header.indexOf('storeUrl')
    for (const line of lines.slice(1)) {
      const cells = line.split(',')
      expect(cells[urlIdx]).toContain(`sku=${cells[skuIdx]}`)
    }
    expect(exportStartCalls).toBe(callsBefore + 1)
  })

  it('omits custom columns that are not selected', async () => {
    const lines = await runExport('name,sku,optionGroups,optionValues', 'no-custom-col.csv')
    expect(lines[0].split(',')).not.toContain('storeUrl')
  })

  it('writes empty cells and completes when resolve throws', async () => {
    const lines = await runExport('name,sku,optionGroups,optionValues,boom', 'boom-col.csv')
    const header = lines[0].split(',')
    const boomIdx = header.indexOf('boom')
    expect(boomIdx).toBeGreaterThan(-1)
    for (const line of lines.slice(1)) {
      expect(line.split(',')[boomIdx]).toBe('')
    }
  })

  it('rejects invalid custom column names at init', () => {
    const base = { importOptions: {} }
    expect(() =>
      ProductImportExportPlugin.init({
        ...base,
        exportOptions: { customExportColumns: [{ name: 'foo:bar', resolve: () => '' }] },
      }),
    ).toThrow(/must not contain/)
    expect(() =>
      ProductImportExportPlugin.init({
        ...base,
        exportOptions: { customExportColumns: [{ name: 'sku', resolve: () => '' }] },
      }),
    ).toThrow(/collides/)
    expect(() =>
      ProductImportExportPlugin.init({
        ...base,
        exportOptions: {
          customExportColumns: [
            { name: 'x', resolve: () => '' },
            { name: 'x', resolve: () => '' },
          ],
        },
      }),
    ).toThrow(/duplicate/)
  })
})
