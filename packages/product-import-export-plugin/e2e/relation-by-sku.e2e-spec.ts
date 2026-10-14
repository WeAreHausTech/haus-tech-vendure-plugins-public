import path from 'path'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import {
  ID,
  LanguageCode,
  Product,
  ProductVariant,
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
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { IMPORT_JOB_STORAGE_STRATEGY } from '../src/constants'
import { ImportJobStorageStrategy } from '../src/services/import-storage/import-job-storage-strategy'
import { ProductImporter } from '../src/providers/import-providers/product-importer'
import { SkuRelationResolver } from '../src/services/sku-relation-resolver'
import { ProductImportExportPlugin } from '../src/product-import-export.plugin'
import { initialData } from './fixtures/initial-data'

// Own data dir (a sibling of `__data__`), because vitest runs spec files in parallel and this
// spec needs its own custom field schema.
const sqliteDataDir = path.join(__dirname, '__data-relation-by-sku__')
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
const BASE_BY_SKU = 'variant:baseVariant:productvariant:sku'
const SIBLINGS_BY_SKU = 'variant:siblings:productvariant:sku'

/**
 * A ProductVariant relation custom field can name the related variant by SKU: the column header
 * gets a fourth segment, `:sku`. The upload is checked before it is queued, so the uploader sees
 * a missing or ambiguous SKU at once; the import job checks again, since data can change between
 * upload and run.
 */
describe('relation custom fields given by SKU', () => {
  const apiPort = 3064
  const baseUrl = `http://localhost:${apiPort}`
  const { server, adminClient } = createTestEnvironment(
    mergeConfig(testConfig, {
      apiOptions: { port: apiPort },
      customFields: {
        Product: [{ name: 'relatedProduct', type: 'relation', entity: Product, nullable: true }],
        ProductVariant: [
          { name: 'baseVariant', type: 'relation', entity: ProductVariant, nullable: true },
          { name: 'siblings', type: 'relation', entity: ProductVariant, list: true },
          { name: 'note', type: 'string', nullable: true },
        ],
      },
      plugins: [ProductImportExportPlugin.init({ importOptions: {}, exportOptions: {} })],
    }),
  )
  let ctx: Awaited<ReturnType<RequestContextService['create']>>
  let variantRepo: ReturnType<TransactionalConnection['getRepository']>
  const ids: Record<string, ID> = {}

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

  async function findVariant(sku: string): Promise<ProductVariant | null> {
    return server.app
      .get(TransactionalConnection)
      .getRepository(ctx, ProductVariant)
      .findOne({
        where: { sku },
        relations: ['customFields.baseVariant', 'customFields.siblings'],
      }) as Promise<ProductVariant | null>
  }

  function validate(csv: string): Promise<string[]> {
    return server.app
      .get(SkuRelationResolver)
      .resolve(ctx, csv)
      .then((result) => result.errors)
  }

  function upload(csv: string): Promise<Response> {
    const body = new FormData()
    body.append('file', new Blob([csv], { type: 'text/csv' }), 'products.csv')
    body.append('mainLanguage', 'en')
    body.append('updatingStrategy', 'merge')
    return fetch(`${baseUrl}/product-import/upload`, {
      method: 'POST',
      body,
      headers: { authorization: `Bearer ${adminClient.getAuthToken()}` },
    })
  }

  beforeAll(async () => {
    await ensureFreshE2eDatabase()
    await server.init({ initialData })
    await adminClient.asSuperAdmin()
    ctx = await server.app.get(RequestContextService).create({
      apiType: 'admin',
      channelOrToken: E2E_DEFAULT_CHANNEL_TOKEN,
    })

    const csv = [
      HEADER,
      'Base One,base-one,Base,BASE-1,100,Standard Tax,1',
      'Base Two,base-two,Base,BASE 2.b,100,Standard Tax,1',
      'Dup A,dup-a,Dup,DUP-A,100,Standard Tax,1',
      'Dup B,dup-b,Dup,DUP-B,100,Standard Tax,1',
      'Gone,gone,Gone,GONE-1,100,Standard Tax,1',
    ].join('\n')
    expect(await runImport(csv)).toEqual([])

    variantRepo = server.app.get(TransactionalConnection).getRepository(ctx, ProductVariant)
    for (const sku of ['BASE-1', 'BASE 2.b']) {
      ids[sku] = (await variantRepo.findOneOrFail({ where: { sku } })).id
    }
    // Vendure does not keep SKUs unique, so two variants can share one.
    await variantRepo.update({ sku: 'DUP-B' }, { sku: 'DUP-A' })
    await variantRepo.update({ sku: 'GONE-1' }, { deletedAt: new Date() })
  }, 120_000)

  afterEach(() => {
    vi.restoreAllMocks()
  })

  afterAll(async () => {
    await server.destroy()
  })

  describe('import', () => {
    it('links a single relation to the variant with that SKU', async () => {
      const csv = [
        `${HEADER},${BASE_BY_SKU}`,
        'Shop One,shop-one,Shop,SHOP-1,150,Standard Tax,1,BASE-1',
      ].join('\n')
      expect(await runImport(csv)).toEqual([])

      const shop = await findVariant('SHOP-1')
      expect(shop?.customFields.baseVariant?.id).toBe(ids['BASE-1'])
    })

    it('accepts SKUs with spaces and dots, and links a list relation with SKU|SKU', async () => {
      const csv = [
        `${HEADER},${BASE_BY_SKU},${SIBLINGS_BY_SKU}`,
        'Shop Two,shop-two,Shop,SHOP-2,150,Standard Tax,1,BASE 2.b,BASE-1|BASE 2.b',
      ].join('\n')
      expect(await runImport(csv)).toEqual([])

      const shop = await findVariant('SHOP-2')
      expect(shop?.customFields.baseVariant?.id).toBe(ids['BASE 2.b'])
      expect(shop?.customFields.siblings.map((v: ProductVariant) => v.id).sort()).toEqual(
        [ids['BASE-1'], ids['BASE 2.b']].sort(),
      )
    })

    it('imports nothing when a SKU is missing at run time', async () => {
      const csv = [
        `${HEADER},${BASE_BY_SKU}`,
        'Shop Three,shop-three,Shop,SHOP-3,150,Standard Tax,1,BASE-1',
        'Shop Four,shop-four,Shop,SHOP-4,150,Standard Tax,1,NOPE-1',
      ].join('\n')
      expect(await runImport(csv)).toEqual(['Row 3: no variant with SKU NOPE-1'])
      expect(await findVariant('SHOP-3')).toBeNull()
    })

    it('reads a quoted SKU column header', async () => {
      const csv = [
        `${HEADER},"${BASE_BY_SKU}"`,
        'Shop Six,shop-six,Shop,SHOP-6,150,Standard Tax,1,BASE-1',
      ].join('\n')
      expect(await runImport(csv)).toEqual([])
      expect((await findVariant('SHOP-6'))?.customFields.baseVariant?.id).toBe(ids['BASE-1'])
    })

    it('keeps the SKUs of two imports that run at the same time apart', async () => {
      const bySku = [
        `${HEADER},${BASE_BY_SKU}`,
        'Shop Seven,shop-seven,Shop,SHOP-7,150,Standard Tax,1,BASE-1',
      ].join('\n')
      const byId = [
        `${HEADER},variant:baseVariant:productvariant`,
        `Shop Eight,shop-eight,Shop,SHOP-8,150,Standard Tax,1,${ids['BASE 2.b']}`,
      ].join('\n')
      expect(await Promise.all([runImport(bySku), runImport(byId)])).toEqual([[], []])
      expect((await findVariant('SHOP-7'))?.customFields.baseVariant?.id).toBe(ids['BASE-1'])
      expect((await findVariant('SHOP-8'))?.customFields.baseVariant?.id).toBe(ids['BASE 2.b'])
    })

    it('finds the SKU columns the importer finds, also behind a loose quote', async () => {
      const csv = [`name,"desc"x,sku,${BASE_BY_SKU}`, 'A,a,X-9,NOPE-1'].join('\n')
      expect(await validate(csv)).toEqual(['Row 2: no variant with SKU NOPE-1'])
      expect(await runImport(csv)).toEqual(['Row 2: no variant with SKU NOPE-1'])
    })

    it('still reads a three-segment column as ids', async () => {
      const csv = [
        `${HEADER},variant:baseVariant:productvariant`,
        `Shop Five,shop-five,Shop,SHOP-5,150,Standard Tax,1,${ids['BASE-1']}`,
      ].join('\n')
      expect(await runImport(csv)).toEqual([])
      expect((await findVariant('SHOP-5'))?.customFields.baseVariant?.id).toBe(ids['BASE-1'])
    })
  })

  describe('validation', () => {
    it('reports every missing, ambiguous and deleted SKU with its row', async () => {
      const csv = [
        `${HEADER},${BASE_BY_SKU},${SIBLINGS_BY_SKU}`,
        'A,a,A,X-1,1,Standard Tax,1,BASE-1,',
        'B,b,B,X-2,1,Standard Tax,1,NOPE-1,BASE-1|NOPE-2',
        'C,c,C,X-3,1,Standard Tax,1,DUP-A,',
        'D,d,D,X-4,1,Standard Tax,1,GONE-1,',
      ].join('\n')
      expect(await validate(csv)).toEqual([
        'Row 3: no variant with SKU NOPE-1',
        'Row 3: no variant with SKU NOPE-2',
        'Row 4: SKU DUP-A matches 2 variants',
        'Row 5: no variant with SKU GONE-1',
      ])
    })

    it('numbers rows as the importer does, without blank and comma-only lines', async () => {
      const csv = [
        `${HEADER},${BASE_BY_SKU}`,
        'A,a,A,X-1,1,Standard Tax,1,BASE-1',
        '',
        ',,,,,,,',
        'B,b,B,X-2,1,Standard Tax,1,NOPE-1',
      ].join('\n')
      expect(await validate(csv)).toEqual(['Row 3: no variant with SKU NOPE-1'])
    })

    it('says so when no custom field has the name in a :sku column', async () => {
      const csv = [
        `${HEADER},variant:basevariant:productvariant:sku`,
        'A,a,A,X-1,1,Standard Tax,1,BASE-1',
      ].join('\n')
      expect(await validate(csv)).toEqual([
        "Column 'variant:basevariant:productvariant:sku': ProductVariant has no custom field named 'basevariant'",
      ])
    })

    it('rejects a lookup other than sku', async () => {
      const csv = [
        `${HEADER},variant:baseVariant:productvariant:code`,
        'A,a,A,X-1,1,Standard Tax,1,BASE-1',
      ].join('\n')
      expect(await validate(csv)).toEqual([
        "Column 'variant:baseVariant:productvariant:code': only ':sku' is supported as a lookup",
      ])
    })

    it('rejects :sku on a field that is not a relation to ProductVariant', async () => {
      const csv = [
        `${HEADER},product:relatedProduct:product:sku,variant:note:string:sku`,
        'A,a,A,X-1,1,Standard Tax,1,BASE-1,BASE-1',
      ].join('\n')
      expect(await validate(csv)).toEqual([
        "Column 'product:relatedProduct:product:sku': ':sku' works only on relation custom fields to ProductVariant",
        "Column 'variant:note:string:sku': ':sku' works only on relation custom fields to ProductVariant",
      ])
    })

    it('has nothing to say about a file without SKU columns', async () => {
      expect(await validate(`${HEADER}\nA,a,A,X-1,1,Standard Tax,1`)).toEqual([])
    })

    it('leaves a file it cannot read to the importer when it has no SKU columns', async () => {
      expect(await validate('name,desc"x,sku\nA,a,X-1')).toEqual([])
    })

    it('accepts rows with fewer cells than the header, as the importer does', async () => {
      const csv = [
        `${HEADER},${BASE_BY_SKU},variant:note:string`,
        'A,a,A,X-1,1,Standard Tax,1,BASE-1',
      ].join('\n')
      expect(await validate(csv)).toEqual([])
    })
  })

  describe('upload', () => {
    it('answers 400 with the errors and queues nothing when a SKU is wrong', async () => {
      const storage = server.app.get<ImportJobStorageStrategy>(IMPORT_JOB_STORAGE_STRATEGY)
      const store = vi.spyOn(storage, 'storeImportFile')

      const response = await upload(
        [`${HEADER},${BASE_BY_SKU}`, 'A,a,A,UP-1,1,Standard Tax,1,NOPE-1'].join('\n'),
      )

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ errors: ['Row 2: no variant with SKU NOPE-1'] })
      expect(store).not.toHaveBeenCalled()
    })

    it('answers 400 and queues nothing when a column names an unknown custom field', async () => {
      const storage = server.app.get<ImportJobStorageStrategy>(IMPORT_JOB_STORAGE_STRATEGY)
      const store = vi.spyOn(storage, 'storeImportFile')

      const response = await upload(
        [`${HEADER},product:unknownField:string`, 'A,a,A,UP-3,1,Standard Tax,1,x'].join('\n'),
      )

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({
        errors: ['Invalid custom field: product:unknownField'],
      })
      expect(store).not.toHaveBeenCalled()
    })

    it('answers 400 and queues nothing when a required column is missing', async () => {
      const storage = server.app.get<ImportJobStorageStrategy>(IMPORT_JOB_STORAGE_STRATEGY)
      const store = vi.spyOn(storage, 'storeImportFile')

      const response = await upload(['name,slug,price', 'A,a,1'].join('\n'))

      expect(response.status).toBe(400)
      const { errors } = (await response.json()) as { errors: string[] }
      expect(errors).toEqual([expect.stringContaining('missing the following columns')])
      expect(store).not.toHaveBeenCalled()
    })

    it('queues a file whose columns are all known', async () => {
      const response = await upload(
        [`${HEADER},variant:note:string`, 'A,a,A,UP-5,1,Standard Tax,1,hi'].join('\n'),
      )
      expect(response.status).toBe(200)
    })

    it('queues a file whose SKUs all match exactly one variant', async () => {
      const response = await upload(
        [`${HEADER},${BASE_BY_SKU}`, 'A,a,A,UP-2,1,Standard Tax,1,BASE-1'].join('\n'),
      )
      expect(response.status).toBe(200)
    })
  })
})
