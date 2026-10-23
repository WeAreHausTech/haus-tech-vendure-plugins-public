import path from 'path'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import type { ReadStream } from 'node:fs'
import {
  Asset,
  AssetService,
  LanguageCode,
  Product,
  ProductAsset,
  ProductVariant,
  ProductVariantAsset,
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
import { UpdatingStrategy } from '../src/types'
import { ExportStorageStrategy } from '../src/services/export-storage/export-storage-strategy'
import { ProductExportService } from '../src/services/product-export.service'
import { ProductImporter } from '../src/providers/import-providers/product-importer'
import { ProductImportExportPlugin } from '../src/product-import-export.plugin'
import { initialData } from './fixtures/initial-data'

// A sibling of the shared `__data__` dir, like the other specs, since vitest runs spec files in parallel.
const sqliteDataDir = path.join(__dirname, '__data-asset-source-paths__')
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

const HEADER = 'name,slug,description,optionGroups,sku,optionValues,price,taxCategory,stockOnHand'
const PRODUCT_CSV = [
  HEADER,
  'Pictured tee,pictured-tee,Two colours,Colour,PIC-BLACK,Black,100,Standard Tax,1',
  ',,,,PIC-NAVY,Navy,100,Standard Tax,1',
].join('\n')

// Exporting assets as a value the importer cannot download (an asset's `source`, relative to the
// storage) used to drop every image on re-import without an error.
describe('asset source paths on import', () => {
  const apiPort = 3066
  const { server } = createTestEnvironment(
    mergeConfig(testConfig, {
      apiOptions: { port: apiPort },
      plugins: [ProductImportExportPlugin.init({ importOptions: {}, exportOptions: {} })],
    }),
  )
  let ctx: Awaited<ReturnType<RequestContextService['create']>>
  let connection: TransactionalConnection
  let productImporter: ProductImporter
  let productExportService: ProductExportService
  let exportStorageStrategy: ExportStorageStrategy
  let black: Asset
  let navy: Asset

  async function runImport(csv: string, strategy: UpdatingStrategy): Promise<string[]> {
    let errors: string[] = []
    await new Promise<void>((resolve, reject) => {
      productImporter.parseAndImport(csv, ctx, true, LanguageCode.en, strategy).subscribe({
        next: (result) => {
          errors = result.errors ?? []
        },
        complete: () => resolve(),
        error: (error) => reject(error),
      })
    })
    return errors
  }

  async function runExport(exportAssetsAs: 'url' | 'json'): Promise<string> {
    const ids = await productExportService.getAllProductIds(ctx)
    const exported = await productExportService.createExportFile(
      ctx,
      ids,
      `asset-source-paths-${exportAssetsAs}.csv`,
      '',
      exportAssetsAs,
      'name,slug,description,assets,optionGroups,optionValues,sku,price,taxCategory,stockOnHand,variantAssets',
    )
    const csv = await streamToString(await exportStorageStrategy.getExportFileStream(ctx, exported))
    await exportStorageStrategy.deleteExportFile(ctx, exported)
    return csv
  }

  async function createAsset(name: string): Promise<Asset> {
    // 1x1 transparent PNG, so the asset service can read real dimensions.
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      'base64',
    )
    const created = await server.app
      .get(AssetService)
      .createFromFileStream(Readable.from(png) as unknown as ReadStream, name, ctx)
    if (!(created instanceof Asset)) {
      throw new Error(`asset ${name} was not created: ${JSON.stringify(created)}`)
    }
    return created
  }

  async function variantAssets(sku: string): Promise<{ featured: string | undefined; ids: string[] }> {
    const variant = await connection.getRepository(ctx, ProductVariant).findOneOrFail({
      where: { sku },
      relations: ['assets', 'featuredAsset'],
    })
    return {
      featured: variant.featuredAsset ? String(variant.featuredAsset.id) : undefined,
      ids: [...variant.assets].sort((a, b) => a.position - b.position).map((a) => String(a.assetId)),
    }
  }

  async function productAssetIds(): Promise<string[]> {
    const product = await connection.getRepository(ctx, Product).findOneOrFail({
      where: { id: (await connection.getRepository(ctx, ProductVariant).findOneOrFail({ where: { sku: 'PIC-BLACK' } })).productId },
      relations: ['assets'],
    })
    return [...product.assets].sort((a, b) => a.position - b.position).map((a) => String(a.assetId))
  }

  async function assetCount(): Promise<number> {
    return connection.getRepository(ctx, Asset).count()
  }

  async function linkImages(): Promise<void> {
    const repo = connection.getRepository(ctx, ProductVariant)
    for (const [sku, asset] of [
      ['PIC-BLACK', black],
      ['PIC-NAVY', navy],
    ] as const) {
      const variant = await repo.findOneOrFail({ where: { sku } })
      await connection.getRepository(ctx, ProductVariantAsset).delete({ productVariantId: variant.id })
      await connection
        .getRepository(ctx, ProductVariantAsset)
        .save(new ProductVariantAsset({ productVariantId: variant.id, assetId: asset.id, position: 0 }))
      await repo.update(variant.id, { featuredAsset: { id: asset.id } })
    }
    const productId = (await repo.findOneOrFail({ where: { sku: 'PIC-BLACK' } })).productId
    await connection.getRepository(ctx, ProductAsset).delete({ productId })
    await connection
      .getRepository(ctx, ProductAsset)
      .save(new ProductAsset({ productId, assetId: black.id, position: 0 }))
  }

  beforeAll(async () => {
    await ensureFreshE2eDatabase()
    await server.init({ initialData })
    ctx = await server.app.get(RequestContextService).create({
      apiType: 'admin',
      channelOrToken: E2E_DEFAULT_CHANNEL_TOKEN,
    })
    connection = server.app.get(TransactionalConnection)
    productImporter = server.app.get(ProductImporter)
    productExportService = server.app.get(ProductExportService)
    exportStorageStrategy = server.app.get<ExportStorageStrategy>(EXPORT_STORAGE_STRATEGY)
    expect(await runImport(PRODUCT_CSV, 'merge')).toEqual([])
    black = await createAsset('tee-black.png')
    navy = await createAsset('tee-navy.png')
  }, 120_000)

  afterAll(async () => {
    await server.destroy()
  })

  for (const exportAssetsAs of ['url', 'json'] as const) {
    for (const strategy of ['replace', 'merge'] as const) {
      it(`keeps every image when an unchanged ${exportAssetsAs} export is imported with ${strategy}`, async () => {
        await linkImages()
        const csv = await runExport(exportAssetsAs)
        expect(csv).toContain(black.source)
        const assetsBefore = await assetCount()

        expect(await runImport(csv, strategy)).toEqual([])

        expect(await variantAssets('PIC-BLACK')).toEqual({ featured: String(black.id), ids: [String(black.id)] })
        expect(await variantAssets('PIC-NAVY')).toEqual({ featured: String(navy.id), ids: [String(navy.id)] })
        expect(await productAssetIds()).toEqual([String(black.id)])
        // Nothing is downloaded or uploaded again.
        expect(await assetCount()).toBe(assetsBefore)
      })
    }
  }

  it('removes the images a replace import does not list', async () => {
    await linkImages()
    const assetsBefore = await assetCount()

    const csv = [
      `${HEADER},assets,variantAssets`,
      `Pictured tee,pictured-tee,Two colours,Colour,PIC-BLACK,Black,100,Standard Tax,1,${navy.source},${black.source}`,
      `,,,,PIC-NAVY,Navy,100,Standard Tax,1,,${black.source}`,
    ].join('\n')
    expect(await runImport(csv, 'replace')).toEqual([])

    expect(await variantAssets('PIC-BLACK')).toEqual({ featured: String(black.id), ids: [String(black.id)] })
    expect(await variantAssets('PIC-NAVY')).toEqual({ featured: String(black.id), ids: [String(black.id)] })
    expect(await productAssetIds()).toEqual([String(navy.id)])
    // The images are unlinked, not deleted.
    expect(await assetCount()).toBe(assetsBefore)
  })

  it('links an existing image given by its source to a variant without images', async () => {
    const variant = await connection.getRepository(ctx, ProductVariant).findOneOrFail({ where: { sku: 'PIC-NAVY' } })
    await connection.getRepository(ctx, ProductVariantAsset).delete({ productVariantId: variant.id })
    await connection.getRepository(ctx, ProductVariant).update(variant.id, { featuredAsset: null })
    const assetsBefore = await assetCount()

    const csv = [
      `${HEADER},variantAssets`,
      'Pictured tee,pictured-tee,Two colours,Colour,PIC-BLACK,Black,100,Standard Tax,1,',
      `,,,,PIC-NAVY,Navy,100,Standard Tax,1,${navy.source}`,
    ].join('\n')
    expect(await runImport(csv, 'merge')).toEqual([])

    expect(await variantAssets('PIC-NAVY')).toEqual({ featured: String(navy.id), ids: [String(navy.id)] })
    expect(await assetCount()).toBe(assetsBefore)
  })

  it('reports a source path that matches no asset instead of skipping it silently', async () => {
    const csv = [
      `${HEADER},variantAssets`,
      'Pictured tee,pictured-tee,Two colours,Colour,PIC-BLACK,Black,100,Standard Tax,1,source/00/missing.png',
      ',,,,PIC-NAVY,Navy,100,Standard Tax,1,',
    ].join('\n')

    const errors = await runImport(csv, 'merge')

    expect(errors).toEqual([expect.stringContaining('source/00/missing.png')])
  })
})
