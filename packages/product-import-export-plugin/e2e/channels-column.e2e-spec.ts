import path from 'path'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import {
  Channel,
  CurrencyCode,
  LanguageCode,
  Permission,
  Product,
  ProductVariant,
  ProductVariantPrice,
  RequestContext,
  RequestContextService,
  TransactionalConnection,
  User,
  mergeConfig,
} from '@vendure/core'
import { parse } from 'csv-parse/sync'
import gql from 'graphql-tag'
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
const sqliteDataDir = path.join(__dirname, '__data-channels-column__')
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

const HEADER = 'name,slug,description,sku,price,taxCategory,stockOnHand'
const PASSWORD = 'test-password'

/** The default channel's token and the given ones, sorted as the helpers below return them. */
const withDefault = (...tokens: string[]) => [E2E_DEFAULT_CHANNEL_TOKEN, ...tokens].sort()

const CREATE_CHANNEL = gql`
  mutation CreateChannel($input: CreateChannelInput!) {
    createChannel(input: $input) {
      ... on Channel {
        id
      }
    }
  }
`
const CREATE_ROLE = gql`
  mutation CreateRole($input: CreateRoleInput!) {
    createRole(input: $input) {
      id
    }
  }
`
const CREATE_ADMINISTRATOR = gql`
  mutation CreateAdministrator($input: CreateAdministratorInput!) {
    createAdministrator(input: $input) {
      id
    }
  }
`

/**
 * A `channels` column names, by token, the channels a row's product and its variants are assigned
 * to, on top of the default channel and the channel the import runs in. It only adds: an empty cell
 * or a missing column never removes a product from a channel. The uploader needs product rights in
 * every channel the file names, and an import run from a channel other than the default one can
 * only name that channel. The export writes the column so an exported file imports again.
 */
describe('channels column', () => {
  const apiPort = 3066
  const baseUrl = `http://localhost:${apiPort}`
  const { server, adminClient } = createTestEnvironment(
    mergeConfig(testConfig, {
      apiOptions: { port: apiPort },
      plugins: [ProductImportExportPlugin.init({ importOptions: {}, exportOptions: {} })],
    }),
  )
  let ctx: RequestContext
  const channelIds: Record<string, string> = {}

  async function superAdminCtx(channelToken: string): Promise<RequestContext> {
    const user = await server.app
      .get(TransactionalConnection)
      .rawConnection.getRepository(User)
      .findOneOrFail({
        where: { identifier: 'superadmin' },
        relations: ['roles', 'roles.channels'],
      })
    return server.app.get(RequestContextService).create({
      apiType: 'admin',
      channelOrToken: channelToken,
      user,
    })
  }

  async function runImport(csv: string, importCtx = ctx): Promise<string[]> {
    const productImporter = server.app.get(ProductImporter)
    let errors: string[] = []
    await new Promise<void>((resolve, reject) => {
      productImporter.parseAndImport(csv, importCtx, true, LanguageCode.en, 'merge').subscribe({
        next: (result) => {
          errors = result.errors ?? []
        },
        complete: () => resolve(),
        error: (error) => reject(error),
      })
    })
    return errors
  }

  function upload(csv: string, channelToken = E2E_DEFAULT_CHANNEL_TOKEN): Promise<Response> {
    const body = new FormData()
    body.append('file', new Blob([csv], { type: 'text/csv' }), 'products.csv')
    body.append('mainLanguage', 'en')
    body.append('updatingStrategy', 'merge')
    return fetch(`${baseUrl}/product-import/upload`, {
      method: 'POST',
      body,
      headers: {
        authorization: `Bearer ${adminClient.getAuthToken()}`,
        'vendure-token': channelToken,
      },
    })
  }

  async function runExport(exportCtx: RequestContext): Promise<Array<Record<string, string>>> {
    const productExportService = server.app.get(ProductExportService)
    const exportStorageStrategy = server.app.get<ExportStorageStrategy>(EXPORT_STORAGE_STRATEGY)
    const ids = await productExportService.getAllProductIds(exportCtx)
    const fileName = await productExportService.createExportFile(
      exportCtx,
      ids,
      'channels.csv',
      '',
      'url',
      'name,slug,channels,sku,price,optionGroups,optionValues',
    )
    const csv = await streamToString(
      await exportStorageStrategy.getExportFileStream(exportCtx, fileName),
    )
    await exportStorageStrategy.deleteExportFile(exportCtx, fileName)
    return parse(csv, { columns: true, skip_empty_lines: true })
  }

  async function channelsOfProduct(sku: string): Promise<string[]> {
    const variant = await server.app
      .get(TransactionalConnection)
      .rawConnection.getRepository(ProductVariant)
      .findOneOrFail({ where: { sku }, relations: ['product', 'product.channels'] })
    return variant.product.channels.map((channel) => channel.token).sort()
  }

  async function channelsOfVariant(sku: string): Promise<string[]> {
    const variant = await server.app
      .get(TransactionalConnection)
      .rawConnection.getRepository(ProductVariant)
      .findOneOrFail({ where: { sku }, relations: ['channels'] })
    return variant.channels.map((channel) => channel.token).sort()
  }

  async function priceIn(sku: string, channelToken: string): Promise<number | undefined> {
    const connection = server.app.get(TransactionalConnection).rawConnection
    const channel = await connection
      .getRepository(Channel)
      .findOneOrFail({ where: { token: channelToken } })
    const variant = await connection.getRepository(ProductVariant).findOneOrFail({ where: { sku } })
    const price = await connection
      .getRepository(ProductVariantPrice)
      .findOne({ where: { variant: { id: variant.id }, channelId: channel.id } })
    return price?.price
  }

  async function productExists(sku: string): Promise<boolean> {
    const count = await server.app
      .get(TransactionalConnection)
      .rawConnection.getRepository(ProductVariant)
      .count({ where: { sku } })
    return count > 0
  }

  async function createAdmin(
    emailAddress: string,
    channelTokens: string[],
    permissions: Permission[],
  ): Promise<void> {
    const { createRole } = await adminClient.query(CREATE_ROLE, {
      input: {
        code: emailAddress,
        description: emailAddress,
        channelIds: channelTokens.map((token) => channelIds[token]),
        permissions,
      },
    })
    await adminClient.query(CREATE_ADMINISTRATOR, {
      input: {
        firstName: emailAddress,
        lastName: 'Admin',
        emailAddress,
        password: PASSWORD,
        roleIds: [createRole.id],
      },
    })
  }

  beforeAll(async () => {
    await ensureFreshE2eDatabase()
    await server.init({ initialData })
    await adminClient.asSuperAdmin()
    for (const token of ['club-a', 'club-b']) {
      const { createChannel } = await adminClient.query(CREATE_CHANNEL, {
        input: {
          code: token,
          token,
          defaultLanguageCode: LanguageCode.en,
          availableLanguageCodes: [LanguageCode.en],
          currencyCode: CurrencyCode.USD,
          pricesIncludeTax: false,
          defaultShippingZoneId: 'T_1',
          defaultTaxZoneId: 'T_1',
        },
      })
      channelIds[token] = createChannel.id
    }
    channelIds[E2E_DEFAULT_CHANNEL_TOKEN] = 'T_1'
    // Vendure gives the SuperAdmin role every channel created after it, so this context has rights
    // in both clubs.
    ctx = await superAdminCtx(E2E_DEFAULT_CHANNEL_TOKEN)

    const productRights = [Permission.ReadCatalog, Permission.UpdateCatalog]
    await createAdmin('club-a@test.com', ['club-a'], productRights)
    await createAdmin('default-and-a@test.com', [E2E_DEFAULT_CHANNEL_TOKEN, 'club-a'], productRights)
  }, 120_000)

  afterAll(async () => {
    await server.destroy()
  })

  describe('import', () => {
    it('assigns the product and its variants to the named channel and the default channel', async () => {
      const csv = [`${HEADER},channels`, 'One,one,One,ONE-1,10,Standard Tax,1,club-a'].join('\n')
      expect(await runImport(csv)).toEqual([])

      expect(await channelsOfProduct('ONE-1')).toEqual(withDefault('club-a'))
      expect(await channelsOfVariant('ONE-1')).toEqual(withDefault('club-a'))
      expect(await priceIn('ONE-1', 'club-a')).toBe(1000)
    })

    it('assigns every channel of a TOKEN|TOKEN list', async () => {
      const csv = [`${HEADER},channels`, 'Two,two,Two,TWO-1,10,Standard Tax,1,club-a|club-b'].join(
        '\n',
      )
      expect(await runImport(csv)).toEqual([])

      expect(await channelsOfProduct('TWO-1')).toEqual(withDefault('club-a', 'club-b'))
      expect(await channelsOfVariant('TWO-1')).toEqual(withDefault('club-a', 'club-b'))
    })

    it('gives a variant added later the channels the row names', async () => {
      const csv = [
        `${HEADER},optionGroups,optionValues,channels`,
        'Three,three,Three,THREE-S,10,Standard Tax,1,size,S,club-a',
        ',,,THREE-M,10,Standard Tax,1,,M,',
      ].join('\n')
      expect(await runImport(csv)).toEqual([])

      expect(await channelsOfVariant('THREE-M')).toEqual(withDefault('club-a'))
      expect(await priceIn('THREE-M', 'club-a')).toBe(1000)
    })

    it('updates the price in the named channels too', async () => {
      const csv = [`${HEADER},channels`, 'One,one,One,ONE-1,12,Standard Tax,1,club-a'].join('\n')
      expect(await runImport(csv)).toEqual([])

      expect(await priceIn('ONE-1', 'club-a')).toBe(1200)
      expect(await priceIn('ONE-1', E2E_DEFAULT_CHANNEL_TOKEN)).toBe(1200)
    })

    it('never removes a channel: an empty cell and a missing column leave the product where it is', async () => {
      const emptyCell = [`${HEADER},channels`, 'Two,two,Two,TWO-1,10,Standard Tax,1,'].join('\n')
      expect(await runImport(emptyCell)).toEqual([])
      const noColumn = [HEADER, 'Two,two,Two,TWO-1,10,Standard Tax,1'].join('\n')
      expect(await runImport(noColumn)).toEqual([])

      expect(await channelsOfProduct('TWO-1')).toEqual(withDefault('club-a', 'club-b'))
    })

    it('imports nothing when a row names an unknown channel', async () => {
      const csv = [
        `${HEADER},channels`,
        'Four,four,Four,FOUR-1,10,Standard Tax,1,club-a',
        'Five,five,Five,FIVE-1,10,Standard Tax,1,club-x',
      ].join('\n')
      expect(await runImport(csv)).toEqual(["Row 3: channels: no channel with token 'club-x'"])
      expect(await productExists('FOUR-1')).toBe(false)
    })

    it('rejects channels on a variant row', async () => {
      const csv = [
        `${HEADER},optionGroups,optionValues,channels`,
        'Six,six,Six,SIX-S,10,Standard Tax,1,size,S,club-a',
        ',,,SIX-M,10,Standard Tax,1,,M,club-b',
      ].join('\n')
      const errors = await runImport(csv)
      expect(errors.join('\n')).toContain("Column 'channels' holds product data")
      expect(await productExists('SIX-S')).toBe(false)
    })

    it('from a club channel, names only that channel', async () => {
      const clubCtx = await superAdminCtx('club-a')
      const own = [`${HEADER},channels`, 'Seven,seven,Seven,SEVEN-1,10,Standard Tax,1,club-a']
      expect(await runImport(own.join('\n'), clubCtx)).toEqual([])
      expect(await channelsOfProduct('SEVEN-1')).toEqual(withDefault('club-a'))

      const other = [`${HEADER},channels`, 'Eight,eight,Eight,EIGHT-1,10,Standard Tax,1,club-b']
      expect(await runImport(other.join('\n'), clubCtx)).toEqual([
        "Row 2: channels: an import run in channel 'club-a' can only name 'club-a', not 'club-b'",
      ])
      expect(await productExists('EIGHT-1')).toBe(false)
    })
  })

  describe('upload', () => {
    afterAll(async () => {
      await adminClient.asSuperAdmin()
    })

    it('accepts a channel the uploader has product rights in', async () => {
      await adminClient.asSuperAdmin()
      const csv = [`${HEADER},channels`, 'Nine,nine,Nine,NINE-1,10,Standard Tax,1,club-b']
      const response = await upload(csv.join('\n'))
      expect(response.status).toBe(200)
    })

    it('refuses a channel the uploader has no product rights in', async () => {
      await adminClient.asUserWithCredentials('default-and-a@test.com', PASSWORD)
      const csv = [
        `${HEADER},channels`,
        'Ten,ten,Ten,TEN-1,10,Standard Tax,1,club-a',
        'Eleven,eleven,Eleven,ELEVEN-1,10,Standard Tax,1,club-b',
      ]
      const response = await upload(csv.join('\n'))
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({
        errors: ["Row 3: channels: no right to update products in channel 'club-b'"],
      })
    })

    it('refuses another channel from a club channel, and accepts the club itself', async () => {
      await adminClient.asUserWithCredentials('club-a@test.com', PASSWORD)
      const other = [`${HEADER},channels`, 'Twelve,twelve,T,TWELVE-1,10,Standard Tax,1,club-b']
      const refused = await upload(other.join('\n'), 'club-a')
      expect(refused.status).toBe(400)
      expect(await refused.json()).toEqual({
        errors: [
          "Row 2: channels: an import run in channel 'club-a' can only name 'club-a', not 'club-b'",
        ],
      })

      const own = [`${HEADER},channels`, 'Twelve,twelve,T,TWELVE-1,10,Standard Tax,1,club-a']
      const accepted = await upload(own.join('\n'), 'club-a')
      expect(accepted.status).toBe(200)
    })
  })

  describe('export', () => {
    it('writes the channels other than the default one on the first row of a product', async () => {
      const rows = await runExport(ctx)
      const two = rows.find((row) => row.sku === 'TWO-1')
      expect(two?.channels).toBe('club-a|club-b')

      const three = rows.filter((row) => row.sku.startsWith('THREE-'))
      expect(three.map((row) => row.channels)).toEqual(['club-a', ''])
    })

    it('writes only the club itself when exported from a club channel', async () => {
      const rows = await runExport(await superAdminCtx('club-b'))
      expect(rows.find((row) => row.sku === 'TWO-1')?.channels).toBe('club-b')
    })

    it('writes a file that imports again unchanged', async () => {
      const rows = await runExport(ctx)
      const header = Object.keys(rows[0])
      const csv = [
        header.join(','),
        ...rows.map((row) => header.map((key) => JSON.stringify(row[key] ?? '')).join(',')),
      ].join('\n')
      expect(await runImport(csv)).toEqual([])
      expect(await channelsOfProduct('TWO-1')).toEqual(withDefault('club-a', 'club-b'))
    })
  })
})
