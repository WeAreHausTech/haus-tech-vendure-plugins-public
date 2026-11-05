import path from 'path'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import {
  LanguageCode,
  ProductVariant,
  RequestContext,
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
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { EXPORT_STORAGE_STRATEGY } from '../src/constants'
import { ExportStorageStrategy } from '../src/services/export-storage/export-storage-strategy'
import { ProductExportService } from '../src/services/product-export.service'
import { ProductImporter } from '../src/providers/import-providers/product-importer'
import { ProductImportExportPlugin } from '../src/product-import-export.plugin'
import { initialData } from './fixtures/initial-data'

// Own data dir (a sibling of `__data__`), because vitest runs spec files in parallel.
const sqliteDataDir = path.join(__dirname, '__data-money-custom-fields__')
const SQLITE_SCHEMA_VERSION = '3.8'

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

const HEADER =
  'name,slug,description,optionGroups,sku,optionValues,price,taxCategory,stockOnHand,variant:listPrice:int,variant:packSize:int'

/**
 * `listPrice` is an amount stored in minor units like Vendure's own price, shown with the currency
 * input; `packSize` is a plain number. Only the currency field is read and written in major units,
 * with nothing to configure.
 */
describe('money custom fields', () => {
  const apiPort = 3068
  const { server, adminClient } = createTestEnvironment(
    mergeConfig(testConfig, {
      apiOptions: { port: apiPort },
      customFields: {
        ProductVariant: [
          {
            name: 'listPrice',
            type: 'int',
            nullable: true,
            ui: { component: 'currency-form-input' },
          },
          { name: 'packSize', type: 'int', nullable: true },
        ],
      },
      plugins: [
        ProductImportExportPlugin.init({
          importOptions: {},
          exportOptions: {},
        }),
      ],
    }),
  )
  let ctx: RequestContext

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

  async function runExport(): Promise<string> {
    const productExportService = server.app.get(ProductExportService)
    const exportStorageStrategy = server.app.get<ExportStorageStrategy>(EXPORT_STORAGE_STRATEGY)
    const productIds = await productExportService.getAllProductIds(ctx)
    const file = await productExportService.createExportFile(
      ctx,
      productIds,
      'money.csv',
      'variant:listPrice,variant:packSize',
      'url',
      'name,slug,description,optionGroups,sku,optionValues,price,taxCategory,stockOnHand',
    )
    const csv = await streamToString(await exportStorageStrategy.getExportFileStream(ctx, file))
    await exportStorageStrategy.deleteExportFile(ctx, file)
    return csv
  }

  async function storedFields(sku: string): Promise<Record<string, unknown> | undefined> {
    const variant = await server.app
      .get(TransactionalConnection)
      .getRepository(ctx, ProductVariant)
      .findOne({ where: { sku } })
    const { listPrice, packSize } = (variant?.customFields ?? {}) as Record<string, unknown>
    return variant ? { listPrice, packSize } : undefined
  }

  function cell(csv: string, sku: string, column: string): string {
    const [header, ...rows] = csv.trim().split(/\r?\n/)
    const columns = header.split(',')
    const row = rows.map((line) => line.split(',')).find((cells) => cells.includes(sku))
    return row?.[columns.indexOf(column)] ?? ''
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

  afterAll(async () => {
    await server.destroy()
  })

  it('stores a money custom field in minor units, like price', async () => {
    const errors = await runImport(
      [
        HEADER,
        'Money Hoodie,money-hoodie,Hoodie,Size,MONEY-S,S,199,Standard Tax,1,164,6',
        ',,,,MONEY-M,M,199,Standard Tax,1,164.5,12',
      ].join('\n'),
    )

    expect(errors).toEqual([])
    expect(await storedFields('MONEY-S')).toEqual({ listPrice: 16400, packSize: 6 })
    expect(await storedFields('MONEY-M')).toEqual({ listPrice: 16450, packSize: 12 })
  })

  it('exports a money custom field in major units, like price', async () => {
    const csv = await runExport()

    expect(cell(csv, 'MONEY-S', 'variant:listPrice:int')).toBe('164')
    expect(cell(csv, 'MONEY-M', 'variant:listPrice:int')).toBe('164.5')
    expect(cell(csv, 'MONEY-S', 'variant:packSize:int')).toBe('6')
  })

  it('imports its own export without changing the amounts', async () => {
    const errors = await runImport(await runExport())

    expect(errors).toEqual([])
    expect(await storedFields('MONEY-S')).toEqual({ listPrice: 16400, packSize: 6 })
    expect(await storedFields('MONEY-M')).toEqual({ listPrice: 16450, packSize: 12 })
  })

  it('rejects a money cell that is not a number and keeps the stored amount', async () => {
    const errors = await runImport(
      [HEADER, 'Money Hoodie,money-hoodie,Hoodie,Size,MONEY-S,S,199,Standard Tax,1,164 kr,6'].join(
        '\n',
      ),
    )

    expect(errors.join('\n')).toContain('"listPrice" must be a number')
    expect(await storedFields('MONEY-S')).toEqual({ listPrice: 16400, packSize: 6 })
  })
})
