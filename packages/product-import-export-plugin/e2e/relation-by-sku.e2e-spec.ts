import path from 'path'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { parse } from 'csv-parse/sync'
import {
  DeepPartial,
  ID,
  Injector,
  LanguageCode,
  PluginCommonModule,
  Product,
  ProductVariant,
  RequestContext,
  RequestContextService,
  TransactionalConnection,
  VendureEntity,
  VendurePlugin,
  mergeConfig,
} from '@vendure/core'
import gql from 'graphql-tag'
import { Column, Entity } from 'typeorm'
import {
  E2E_DEFAULT_CHANNEL_TOKEN,
  createTestEnvironment,
  registerInitializer,
  SqljsInitializer,
  testConfig,
} from '@vendure/testing'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { EXPORT_STORAGE_STRATEGY, IMPORT_JOB_STORAGE_STRATEGY } from '../src/constants'
import { ExportStorageStrategy } from '../src/services/export-storage/export-storage-strategy'
import { ProductExportService } from '../src/services/product-export.service'
import { ImportJobStorageStrategy } from '../src/services/import-storage/import-job-storage-strategy'
import { ProductImporter } from '../src/providers/import-providers/product-importer'
import { RelationLookupResolver } from '../src/services/relation-lookup-resolver'
import { ProductImportExportPlugin } from '../src/product-import-export.plugin'
import {
  DefaultImportRowValidationStrategy,
  ImportRowError,
  ImportRowGroup,
  ImportRowValidationStrategy,
} from '../src/strategies/import-row-validation-strategy'
import { initialData } from './fixtures/initial-data'

// Own data dir (a sibling of `__data__`), because vitest runs spec files in parallel and this
// spec needs its own custom field schema.
const sqliteDataDir = path.join(__dirname, '__data-relation-by-sku__')
const SQLITE_SCHEMA_VERSION = '3.6-test-tag'

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
const TAG_BY_CODE = 'product:tag:testtag:code'
const TAGS_BY_CODE = 'product:tags:testtag:code'

/** A plugin entity with a unique column, a non-unique one and soft delete. */
@Entity()
class TestTag extends VendureEntity {
  constructor(input?: DeepPartial<TestTag>) {
    super(input)
  }

  @Column({ unique: true })
  code: string

  @Column({ type: 'varchar', nullable: true })
  label: string | null

  @Column({ type: Date, nullable: true })
  deletedAt: Date | null
}

@VendurePlugin({
  imports: [PluginCommonModule],
  entities: [TestTag],
  adminApiExtensions: {
    schema: gql`
      type TestTag implements Node {
        id: ID!
        code: String!
      }
    `,
  },
})
class TestTagPlugin {}

/**
 * Rejects a product that has a tag while its first variant's SKU starts with `NO-`. A subclass of
 * the default strategy, which must still be called.
 */
class NoTagOnNoSkuStrategy
  extends DefaultImportRowValidationStrategy
  implements ImportRowValidationStrategy
{
  connection: TransactionalConnection | undefined
  destroyed = false

  init(injector: Injector): void {
    this.connection = injector.get(TransactionalConnection)
  }

  destroy(): void {
    this.destroyed = true
  }

  override async validate(_ctx: RequestContext, rows: ImportRowGroup[]): Promise<ImportRowError[]> {
    return rows.flatMap((row) => {
      const first = row.variants[0]
      const tagged = row.product.customFields.tagId !== undefined
      return tagged && first?.variant.sku.startsWith('NO-')
        ? [{ line: first.line, message: `SKU ${first.variant.sku} cannot have a tag` }]
        : []
    })
  }
}

/**
 * A ProductVariant relation custom field can name the related variant by SKU: the column header
 * gets a fourth segment, `:sku`. Any relation custom field can name its rows by another text
 * column the same way, e.g. `:code`. The upload is checked before it is queued, so the uploader sees
 * a missing or ambiguous SKU at once; the import job checks again, since data can change between
 * upload and run.
 */
describe('relation custom fields given by SKU', () => {
  const rowValidation = new NoTagOnNoSkuStrategy()
  const apiPort = 3064
  const baseUrl = `http://localhost:${apiPort}`
  const { server, adminClient } = createTestEnvironment(
    mergeConfig(testConfig, {
      apiOptions: { port: apiPort },
      customFields: {
        Product: [
          { name: 'relatedProduct', type: 'relation', entity: Product, nullable: true },
          { name: 'tag', type: 'relation', entity: TestTag, nullable: true, public: false },
          { name: 'tags', type: 'relation', entity: TestTag, list: true, public: false },
        ],
        ProductVariant: [
          { name: 'baseVariant', type: 'relation', entity: ProductVariant, nullable: true },
          { name: 'siblings', type: 'relation', entity: ProductVariant, list: true },
          { name: 'note', type: 'string', nullable: true },
        ],
      },
      plugins: [
        TestTagPlugin,
        ProductImportExportPlugin.init({
          importOptions: { rowValidationStrategy: rowValidation },
          exportOptions: {
            relationLookups: {
              'product:tag': 'code',
              'product:tags': 'code',
              'variant:baseVariant': 'sku',
              'variant:siblings': 'sku',
            },
          },
        }),
      ],
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

  async function findProductBySku(sku: string): Promise<Product | null> {
    return server.app
      .get(TransactionalConnection)
      .getRepository(ctx, Product)
      .findOne({
        where: { variants: { sku } },
        relations: ['customFields.tag', 'customFields.tags'],
      }) as Promise<Product | null>
  }

  function validate(csv: string): Promise<string[]> {
    return server.app
      .get(RelationLookupResolver)
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

    const tagRepo = server.app.get(TransactionalConnection).getRepository(ctx, TestTag)
    const tags = await tagRepo.save([
      new TestTag({ code: 'T-1', label: 'Shared' }),
      new TestTag({ code: 'T 2.b', label: 'Shared' }),
      new TestTag({ code: 'T-OLD', label: 'Old', deletedAt: new Date() }),
    ])
    for (const tag of tags) {
      ids[tag.code] = tag.id
    }
  }, 120_000)

  afterEach(() => {
    vi.restoreAllMocks()
  })

  afterAll(async () => {
    await server.destroy()
    expect(rowValidation.destroyed).toBe(true)
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

    it('still accepts any entity segment on a :sku header, as before lookups by column', async () => {
      const csv = [
        `${HEADER},variant:baseVariant:relation:sku,variant:siblings:ProductVariant:sku`,
        'Legacy,legacy,Legacy,LEGACY-1,150,Standard Tax,1,BASE-1,BASE 2.b',
      ].join('\n')
      expect(await runImport(csv)).toEqual([])
      const legacy = await findVariant('LEGACY-1')
      expect(legacy?.customFields.baseVariant?.id).toBe(ids['BASE-1'])
      expect(legacy?.customFields.siblings.map((v: ProductVariant) => v.id)).toEqual([
        ids['BASE 2.b'],
      ])
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

    it('rejects a lookup column the related entity does not have', async () => {
      const csv = [
        `${HEADER},variant:baseVariant:productvariant:code,product:relatedProduct:product:sku`,
        'A,a,A,X-1,1,Standard Tax,1,BASE-1,BASE-1',
      ].join('\n')
      expect(await validate(csv)).toEqual([
        'Invalid lookup column "code" on ProductVariant',
        'Invalid lookup column "sku" on Product',
      ])
    })

    it('rejects a lookup on a field that is not a relation', async () => {
      const csv = [`${HEADER},variant:note:string:sku`, 'A,a,A,X-1,1,Standard Tax,1,BASE-1'].join(
        '\n',
      )
      expect(await validate(csv)).toEqual([
        "Column 'variant:note:string:sku': a lookup works only on relation custom fields",
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

  describe('relation custom fields given by another column', () => {
    it('links a single relation to the row with that code', async () => {
      const csv = [
        `${HEADER},${TAG_BY_CODE}`,
        'Tag One,tag-one,Tag,TAG-1,150,Standard Tax,1,T-1',
      ].join('\n')
      expect(await runImport(csv)).toEqual([])
      expect((await findProductBySku('TAG-1'))?.customFields.tag?.id).toBe(ids['T-1'])
    })

    it('links a list relation with CODE|CODE', async () => {
      const csv = [
        `${HEADER},${TAGS_BY_CODE}`,
        'Tag Two,tag-two,Tag,TAG-2,150,Standard Tax,1,T-1|T 2.b',
      ].join('\n')
      expect(await runImport(csv)).toEqual([])
      const product = await findProductBySku('TAG-2')
      expect(product?.customFields.tags.map((tag: TestTag) => tag.id).sort()).toEqual(
        [ids['T-1'], ids['T 2.b']].sort(),
      )
    })

    it('imports nothing when a code is missing at run time', async () => {
      const csv = [
        `${HEADER},${TAG_BY_CODE}`,
        'Tag Three,tag-three,Tag,TAG-3,150,Standard Tax,1,T-1',
        'Tag Four,tag-four,Tag,TAG-4,150,Standard Tax,1,NOPE',
      ].join('\n')
      expect(await runImport(csv)).toEqual(['Row 3: no TestTag with code NOPE'])
      expect(await findProductBySku('TAG-3')).toBeNull()
    })

    it('reports missing, deleted and ambiguous values with their rows', async () => {
      const csv = [
        `${HEADER},${TAG_BY_CODE},product:tags:testtag:label`,
        'A,a,A,X-1,1,Standard Tax,1,T-1,',
        'B,b,B,X-2,1,Standard Tax,1,t-1,',
        'C,c,C,X-3,1,Standard Tax,1,T-OLD,',
        'D,d,D,X-4,1,Standard Tax,1,,Shared|Missing',
      ].join('\n')
      expect(await validate(csv)).toEqual([
        'Row 3: no TestTag with code t-1',
        'Row 4: no TestTag with code T-OLD',
        'Row 5: label Shared matches 2 TestTag rows',
        'Row 5: no TestTag with label Missing',
      ])
    })

    it('rejects a lookup column the entity does not have', async () => {
      const csv = [`${HEADER},product:tag:testtag:nope`, 'A,a,A,X-1,1,Standard Tax,1,T-1'].join(
        '\n',
      )
      expect(await validate(csv)).toEqual(['Invalid lookup column "nope" on TestTag'])
    })

    it('reports a value that matches several rows on a single relation', async () => {
      const csv = [`${HEADER},product:tag:testtag:label`, 'A,a,A,X-1,1,Standard Tax,1,Shared'].join(
        '\n',
      )
      expect(await validate(csv)).toEqual(['Row 2: label Shared matches 2 TestTag rows'])
    })

    it('rejects a lookup on a relation column of the related entity', async () => {
      const csv = [
        `${HEADER},variant:baseVariant:productvariant:product`,
        'A,a,A,X-1,1,Standard Tax,1,BASE-1',
      ].join('\n')
      expect(await validate(csv)).toEqual(['Invalid lookup column "product" on ProductVariant'])
    })

    it('compares the entity segment without regard to case', async () => {
      const csv = [`${HEADER},product:tag:TestTag:code`, 'A,a,A,X-1,1,Standard Tax,1,T-1'].join(
        '\n',
      )
      expect(await validate(csv)).toEqual([])
    })

    it('rejects a third segment that is not the related entity', async () => {
      const csv = [`${HEADER},product:tag:product:code`, 'A,a,A,X-1,1,Standard Tax,1,T-1'].join(
        '\n',
      )
      expect(await validate(csv)).toEqual([
        "Column 'product:tag:product:code': the third segment must be 'testtag', the related entity",
      ])
    })

    it('rejects two lookup columns for the same field', async () => {
      const csv = [
        `${HEADER},${TAG_BY_CODE},product:tag:testtag:label`,
        'A,a,A,X-1,1,Standard Tax,1,T-1,Shared',
      ].join('\n')
      expect(await validate(csv)).toEqual([
        "Column 'product:tag:testtag:label': product:tag is already given by another column",
      ])
    })

    it('rejects a lookup on a column that is not text', async () => {
      const csv = [
        `${HEADER},product:tag:testtag:deletedAt`,
        'A,a,A,X-1,1,Standard Tax,1,T-1',
      ].join('\n')
      expect(await validate(csv)).toEqual(['Invalid lookup column "deletedAt" on TestTag'])
    })

    it('answers 400 with the errors and queues nothing when a code is wrong', async () => {
      const storage = server.app.get<ImportJobStorageStrategy>(IMPORT_JOB_STORAGE_STRATEGY)
      const store = vi.spyOn(storage, 'storeImportFile')

      const response = await upload(
        [`${HEADER},${TAG_BY_CODE}`, 'A,a,A,UP-6,1,Standard Tax,1,NOPE'].join('\n'),
      )

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ errors: ['Row 2: no TestTag with code NOPE'] })
      expect(store).not.toHaveBeenCalled()
    })

    it('answers 400 and queues nothing when the lookup column is unknown', async () => {
      const storage = server.app.get<ImportJobStorageStrategy>(IMPORT_JOB_STORAGE_STRATEGY)
      const store = vi.spyOn(storage, 'storeImportFile')

      const response = await upload(
        [`${HEADER},product:tag:testtag:nope`, 'A,a,A,UP-7,1,Standard Tax,1,T-1'].join('\n'),
      )

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ errors: ['Invalid lookup column "nope" on TestTag'] })
      expect(store).not.toHaveBeenCalled()
    })
  })

  describe('row validation strategy', () => {
    const TAGGED_HEADER = `${HEADER},${TAG_BY_CODE}`

    async function waitForFailedImportJob(message: string): Promise<{ error: string }> {
      const deadline = Date.now() + 20_000
      while (Date.now() < deadline) {
        const { jobs } = await adminClient.query<{
          jobs: { items: Array<{ state: string; error: string | null }> }
        }>(gql`
          query {
            jobs(options: { filter: { queueName: { eq: "product-import" } } }) {
              items {
                state
                error
              }
            }
          }
        `)
        const failed = jobs.items.find(
          (job) => job.state === 'FAILED' && job.error?.includes(message),
        )
        if (failed) {
          return failed as { error: string }
        }
        await new Promise((resolve) => setTimeout(resolve, 200))
      }
      throw new Error(`No failed import job with "${message}"`)
    }

    it('is initialised with an injector', () => {
      expect(rowValidation.connection).toBeInstanceOf(TransactionalConnection)
    })

    it('answers 400 with the row and queues nothing when the strategy rejects it', async () => {
      const storage = server.app.get<ImportJobStorageStrategy>(IMPORT_JOB_STORAGE_STRATEGY)
      const store = vi.spyOn(storage, 'storeImportFile')

      const response = await upload(
        [TAGGED_HEADER, 'A,a,A,X-1,1,Standard Tax,1,T-1', 'B,b,B,NO-1,1,Standard Tax,1,T-1'].join(
          '\n',
        ),
      )

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ errors: ['Row 3: SKU NO-1 cannot have a tag'] })
      expect(store).not.toHaveBeenCalled()
    })

    it('gets the resolved ids and the line of every row of a product', async () => {
      const validate = vi
        .spyOn(rowValidation, 'validate')
        .mockResolvedValue([{ line: 3, message: 'stop here' }])
      const csv = [
        `${HEADER},optionGroups,optionValues,${TAG_BY_CODE},${TAGS_BY_CODE},${BASE_BY_SKU},variant:siblings:productvariant`,
        `Three,three,Three,THREE-S,1,Standard Tax,1,size,S,T-1,T-1|T 2.b,BASE-1,`,
        '',
        `,,,THREE-M,1,Standard Tax,1,,M,,,BASE 2.b,${ids['BASE-1']}|${ids['BASE 2.b']}`,
        ',,,THREE-L,1,Standard Tax,1,,L,,,,',
      ].join('\n')

      const response = await upload(csv)

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ errors: ['Row 3: stop here'] })
      const [ctxArg, rows] = validate.mock.calls[0]
      expect(ctxArg).toBeInstanceOf(RequestContext)
      expect(rows).toHaveLength(1)
      const [group] = rows
      expect(group.line).toBe(2)
      expect(group.product.customFields).toEqual(
        expect.objectContaining({
          tagId: String(ids['T-1']),
          tagsIds: [String(ids['T-1']), String(ids['T 2.b'])],
        }),
      )
      expect(group.variants.map(({ line, variant }) => [line, variant.sku])).toEqual([
        [2, 'THREE-S'],
        [3, 'THREE-M'],
        [4, 'THREE-L'],
      ])
      expect(group.variants[0].variant.customFields).toEqual({
        baseVariantId: String(ids['BASE-1']),
      })
      expect(group.variants[1].variant.customFields).toEqual({
        baseVariantId: String(ids['BASE 2.b']),
        siblingsIds: [String(ids['BASE-1']), String(ids['BASE 2.b'])],
      })
      expect(group.variants[2].variant.customFields).toEqual({})
    })

    it('reports lookup and strategy errors in one list, by row', async () => {
      const response = await upload(
        [
          TAGGED_HEADER,
          'A,a,A,X-1,1,Standard Tax,1,NOPE',
          'B,b,B,NO-2,1,Standard Tax,1,T-1',
          'C,c,C,X-3,1,Standard Tax,1,T-OLD',
        ].join('\n'),
      )

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({
        errors: [
          'Row 2: no TestTag with code NOPE',
          'Row 3: SKU NO-2 cannot have a tag',
          'Row 4: no TestTag with code T-OLD',
        ],
      })
    })

    it('does not run on a file whose lookup header is wrong', async () => {
      const validate = vi.spyOn(rowValidation, 'validate')

      const response = await upload(
        [`${HEADER},product:tag:testtag:nope`, 'A,a,A,NO-5,1,Standard Tax,1,T-1'].join('\n'),
      )

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ errors: ['Invalid lookup column "nope" on TestTag'] })
      expect(validate).not.toHaveBeenCalled()
    })

    it('rejects the rows again when the job runs, before anything is written', async () => {
      const importer = server.app.get(ProductImporter)
      const hashes = vi.spyOn(importer, 'setMissingAssetHashes')

      const errors = await runImport(
        [
          TAGGED_HEADER,
          'Run One,run-one,Run,RUN-1,1,Standard Tax,1,T-1',
          'Run No,run-no,Run,NO-3,1,Standard Tax,1,T-1',
        ].join('\n'),
      )

      expect(errors).toEqual(['Row 3: SKU NO-3 cannot have a tag'])
      expect(hashes).not.toHaveBeenCalled()
      expect(await findProductBySku('RUN-1')).toBeNull()
      expect(await findProductBySku('NO-3')).toBeNull()
    })

    it('fails the import job with the errors when the rows changed after upload', async () => {
      vi.spyOn(rowValidation, 'validate')
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ line: 2, message: 'changed after upload' }])

      const response = await upload(
        [TAGGED_HEADER, 'Late,late,Late,LATE-1,1,Standard Tax,1,T-1'].join('\n'),
      )

      expect(response.status).toBe(200)
      const job = await waitForFailedImportJob('changed after upload')
      expect(job.error).toContain('Row 2: changed after upload')
      expect(await findProductBySku('LATE-1')).toBeNull()
    })

    it('gets the product id of each product from its own first row', async () => {
      const existingCsv = [
        `${HEADER},optionGroups,optionValues`,
        'Exist Two,exist-two,E,EX2-S,1,Standard Tax,1,size,S',
        ',,,EX2-M,1,Standard Tax,1,,M',
      ].join('\n')
      expect(await runImport(existingCsv)).toEqual([])
      const existing = await findProductBySku('EX2-S')
      expect(existing).not.toBeNull()
      const existingId = existing?.id
      const validate = vi.spyOn(rowValidation, 'validate')

      const errors = await runImport(
        [
          `id,${HEADER},optionGroups,optionValues`,
          ',New One,new-one,N,NEW1-S,1,Standard Tax,1,size,S',
          ',,,,NEW1-M,1,Standard Tax,1,,M',
          `${existingId},Exist Two,exist-two,E,EX2-L,1,Standard Tax,1,size,L`,
          `${existingId},,,,EX2-XL,1,Standard Tax,1,,XL`,
        ].join('\n'),
      )

      expect(errors).toEqual([])
      const [, rows] = validate.mock.calls[0]
      expect(rows.map((row) => [row.line, row.product.productId])).toEqual([
        [2, undefined],
        [4, Number(existingId)],
      ])
      expect((await findProductBySku('EX2-L'))?.id).toBe(existingId)
      expect((await findProductBySku('NEW1-S'))?.id).not.toBe(existingId)
    })

    it('maps product ids by record when a quoted cell spans several lines', async () => {
      const existingCsv = [
        `${HEADER},optionGroups,optionValues`,
        'Exist Three,exist-three,E,EX3-S,1,Standard Tax,1,size,S',
      ].join('\n')
      expect(await runImport(existingCsv)).toEqual([])
      const existing = await findProductBySku('EX3-S')
      expect(existing).not.toBeNull()
      const existingId = existing?.id
      const validate = vi.spyOn(rowValidation, 'validate')
      const csv = [
        `id,${HEADER},optionGroups,optionValues`,
        ',Multi Line,multi-line,"first line',
        'second line",ML-1,1,Standard Tax,1,size,S',
        `${existingId},Exist Three,exist-three,E,EX3-L,1,Standard Tax,1,size,L`,
      ].join('\n')

      // Without clearing slugs: that step splits physical lines, which a multi-line cell breaks.
      const importer = server.app.get(ProductImporter)
      let errors: string[] = []
      await new Promise<void>((resolve, reject) => {
        importer.parseAndImport(csv, ctx, false, LanguageCode.en, 'merge').subscribe({
          next: (result) => {
            errors = result.errors ?? []
          },
          complete: () => resolve(),
          error: (error) => reject(error),
        })
      })

      expect(errors).toEqual([])
      const [, rows] = validate.mock.calls[0]
      expect(rows.map((row) => [row.line, row.product.productId])).toEqual([
        [2, undefined],
        [3, Number(existingId)],
      ])
      expect((await findProductBySku('EX3-L'))?.id).toBe(existingId)
    })

    it('cannot change what is imported by changing the rows it gets', async () => {
      vi.spyOn(rowValidation, 'validate').mockImplementation(async (_ctx, rows) => {
        rows[0].product.customFields.tagId = '999'
        rows[0].variants[0].variant.sku = 'CHANGED'
        rows.pop()
        return []
      })

      const errors = await runImport(
        [TAGGED_HEADER, 'Copy,copy,Copy,COPY-1,1,Standard Tax,1,T-1'].join('\n'),
      )

      expect(errors).toEqual([])
      expect((await findProductBySku('COPY-1'))?.customFields.tag?.id).toBe(ids['T-1'])
    })
  })
  /**
   * `exportOptions.relationLookups` makes the export write a relation by a column of the related
   * row under the lookup header, so the file imports again without database ids.
   */
  describe('export by lookup column', () => {
    const CUSTOM_FIELDS =
      'product:tag,product:tags,product:relatedProduct,variant:baseVariant,variant:siblings'
    let rows: Record<string, string>[]
    let csv: string

    async function streamToString(stream: Readable): Promise<string> {
      const chunks: Buffer[] = []
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      }
      return Buffer.concat(chunks).toString('utf8')
    }

    async function runExport(productIds: ID[]): Promise<string> {
      const exportService = server.app.get(ProductExportService)
      const storage = server.app.get<ExportStorageStrategy>(EXPORT_STORAGE_STRATEGY)
      const file = await exportService.createExportFile(
        ctx,
        productIds,
        'relation-lookups.csv',
        CUSTOM_FIELDS,
        'url',
        'name,slug,description,sku,price,taxCategory,stockOnHand',
      )
      const text = await streamToString(await storage.getExportFileStream(ctx, file))
      await storage.deleteExportFile(ctx, file)
      return text
    }

    const sorted = (cell: string) => cell.split('|').sort()

    beforeAll(async () => {
      const related = await findProductBySku('BASE-1')
      const gone = await variantRepo.findOneOrFail({ where: { sku: 'GONE-1' } })
      // Ids, so the lists can hold the soft-deleted tag and variant too.
      const tagIds = [ids['T-1'], ids['T 2.b'], ids['T-OLD']].join('|')
      const siblingIds = [ids['BASE-1'], ids['BASE 2.b'], gone.id].join('|')
      expect(
        await runImport(
          [
            `${HEADER},${TAG_BY_CODE},product:tags:testtag,${BASE_BY_SKU},variant:siblings:productvariant,product:relatedProduct:product`,
            `Export One,export-one,Export,EXPORT-1,150,Standard Tax,1,T-1,${tagIds},BASE-1,${siblingIds},${related?.id}`,
          ].join('\n'),
        ),
      ).toEqual([])
      const product = await findProductBySku('EXPORT-1')
      if (!product) {
        throw new Error('EXPORT-1 was not imported')
      }
      csv = await runExport([product.id])
      rows = parse(csv, { columns: true }) as Record<string, string>[]
    })

    it('writes each configured relation by its column, under the lookup header, without soft-deleted rows', () => {
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        sku: 'EXPORT-1',
        [TAG_BY_CODE]: 'T-1',
        [BASE_BY_SKU]: 'BASE-1',
      })
      expect(sorted(rows[0][TAGS_BY_CODE])).toEqual(['T 2.b', 'T-1'])
      expect(sorted(rows[0][SIBLINGS_BY_SKU])).toEqual(['BASE 2.b', 'BASE-1'])
    })

    it('keeps writing a relation without a lookup as ids', async () => {
      const related = await findProductBySku('BASE-1')
      expect(rows[0]['product:relatedProduct:product']).toBe(String(related?.id))
    })

    it('imports the file it wrote, linking the same rows by their columns', async () => {
      // Another SKU and name make the same row a new product, so every link is set by the file.
      const copy = csv.replace('EXPORT-1', 'EXPORT-COPY').replace(/Export One/g, 'Export Copy')
      expect(await validate(copy)).toEqual([])
      expect(await runImport(copy)).toEqual([])

      const product = await findProductBySku('EXPORT-COPY')
      const variant = await findVariant('EXPORT-COPY')
      expect(product?.customFields.tag?.id).toBe(ids['T-1'])
      expect(product?.customFields.tags.map((tag: TestTag) => tag.id).sort()).toEqual(
        [ids['T-1'], ids['T 2.b']].sort(),
      )
      expect(variant?.customFields.baseVariant?.id).toBe(ids['BASE-1'])
      expect(variant?.customFields.siblings.map((v: ProductVariant) => v.id).sort()).toEqual(
        [ids['BASE-1'], ids['BASE 2.b']].sort(),
      )
    })
  })
})
