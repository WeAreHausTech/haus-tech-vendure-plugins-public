import path from 'path'
import { mergeConfig } from '@vendure/core'
import {
  createTestEnvironment,
  registerInitializer,
  SqljsInitializer,
  testConfig,
} from '@vendure/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ProductImportExportPlugin } from '../src/product-import-export.plugin'
import { S3ExportStorageStrategy } from '../src/services/export-storage/s3-export-storage-strategy'
import { S3ImportJobStorageStrategy } from '../src/services/import-storage/s3-import-job-storage-strategy'
import { initialData } from './fixtures/initial-data'

const sqliteDataDir = path.join(__dirname, '__data__')
registerInitializer('sqljs', new SqljsInitializer(sqliteDataDir))

// Fake credentials: they must NEVER appear in any HTTP response body.
const FAKE_ACCESS_KEY_ID = 'AKIA_FAKE_E2E_ACCESS_KEY'
const FAKE_SECRET_ACCESS_KEY = 'FAKE_E2E_SECRET_ACCESS_KEY_DO_NOT_LEAK'

const SENSITIVE_MARKERS = [
  FAKE_ACCESS_KEY_ID,
  FAKE_SECRET_ACCESS_KEY,
  'secretAccessKey',
  'accessKeyId',
  'credentials',
  'storageStrategy',
  'storageStrategyFactory',
  'importJobStorage',
]

type EndpointSpec = {
  method: 'GET' | 'POST' | 'DELETE'
  path: string
  body?: string
}

// Every REST route exposed by this plugin. Each one must reject unauthenticated callers.
const ALL_ENDPOINTS: EndpointSpec[] = [
  { method: 'GET', path: '/product-import-export/config' },
  { method: 'GET', path: '/product-import-export/channel' },
  { method: 'POST', path: '/product-import/upload' },
  { method: 'POST', path: '/product-export/export?selectedExportFields=name,sku', body: '[1]' },
  { method: 'POST', path: '/product-export/export-all?selectedExportFields=name,sku' },
  { method: 'GET', path: '/product-export/download/some-file.csv' },
  { method: 'DELETE', path: '/product-export/delete/some-file.csv' },
  { method: 'POST', path: '/product-export/custom-fields', body: '[]' },
  { method: 'GET', path: '/product-export/exported-files' },
]

describe('REST API security e2e', () => {
  const apiPort = 3059
  const baseUrl = `http://localhost:${apiPort}`

  const { server, adminClient } = createTestEnvironment(
    mergeConfig(testConfig, {
      apiOptions: { port: apiPort },
      plugins: [
        ProductImportExportPlugin.init({
          importOptions: {
            defaultOptions: { updateProductSlug: false, restoreSoftDeleted: false },
            storageStrategy: new S3ImportJobStorageStrategy({
              storage: {
                bucket: 'fake-bucket',
                baseKeyPrefix: 'imports/',
                credentials: {
                  accessKeyId: FAKE_ACCESS_KEY_ID,
                  secretAccessKey: FAKE_SECRET_ACCESS_KEY,
                },
              },
            }),
          },
          exportOptions: {
            defaultFileName: 'security-e2e.csv',
            customExportColumns: [{ name: 'storeUrl', resolve: () => 'https://example.com' }],
            storageStrategy: new S3ExportStorageStrategy({
              storage: {
                bucket: 'fake-bucket',
                baseKeyPrefix: 'exports/',
                credentials: {
                  accessKeyId: FAKE_ACCESS_KEY_ID,
                  secretAccessKey: FAKE_SECRET_ACCESS_KEY,
                },
              },
            }),
          },
        }),
      ],
    }),
  )

  beforeAll(async () => {
    await server.init({ initialData })
    await adminClient.asSuperAdmin()
  }, 120_000)

  afterAll(async () => {
    await server.destroy()
  })

  function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
    return { authorization: `Bearer ${adminClient.getAuthToken()}`, ...extra }
  }

  describe('unauthenticated access is rejected', () => {
    it.each(ALL_ENDPOINTS.map((e) => [e.method, e.path, e] as const))(
      '%s %s returns 403 without a session',
      async (_method, _path, endpoint) => {
        const response = await fetch(`${baseUrl}${endpoint.path}`, {
          method: endpoint.method,
          headers: endpoint.body ? { 'content-type': 'application/json' } : {},
          body: endpoint.body,
        })
        expect(response.status).toBe(403)
        const text = await response.text()
        for (const marker of [FAKE_ACCESS_KEY_ID, FAKE_SECRET_ACCESS_KEY]) {
          expect(text).not.toContain(marker)
        }
      },
    )
  })

  describe('GET /product-import-export/config', () => {
    it('never leaks storage credentials or strategies, even to an authenticated admin', async () => {
      const response = await fetch(`${baseUrl}/product-import-export/config`, {
        headers: authHeaders(),
      })
      expect(response.status).toBe(200)

      const raw = await response.text()
      for (const marker of SENSITIVE_MARKERS) {
        expect(raw, `response must not contain "${marker}"`).not.toContain(marker)
      }
    })

    it('returns only the fields the admin UIs need', async () => {
      const response = await fetch(`${baseUrl}/product-import-export/config`, {
        headers: authHeaders(),
      })
      const config = await response.json()

      // Keys with undefined values are dropped by JSON serialization, so assert the
      // returned keys are a subset of the allow-list rather than an exact match.
      const ALLOWED_IMPORT_KEYS = ['defaultOptions', 'visibleOptions']
      const ALLOWED_EXPORT_KEYS = [
        'customExportColumns',
        'defaultExportAssetsAs',
        'defaultExportFields',
        'defaultFileName',
        'exportAssetsAsOptions',
        'requiredExportFields',
      ]
      expect(Object.keys(config).sort()).toEqual(['exportOptions', 'importOptions'])
      expect(ALLOWED_IMPORT_KEYS).toEqual(expect.arrayContaining(Object.keys(config.importOptions)))
      expect(config.importOptions.defaultOptions).toEqual({
        updateProductSlug: false,
        restoreSoftDeleted: false,
      })
      expect(ALLOWED_EXPORT_KEYS).toEqual(expect.arrayContaining(Object.keys(config.exportOptions)))
      expect(Object.keys(config.exportOptions).sort()).toEqual(ALLOWED_EXPORT_KEYS)
      expect(config.exportOptions.defaultFileName).toBe('security-e2e.csv')
      // Custom columns are reduced to their names; resolver functions are never exposed.
      expect(config.exportOptions.customExportColumns).toEqual([{ name: 'storeUrl' }])
    })
  })

  describe('GET /product-import-export/channel', () => {
    it('returns only the channel fields the admin UIs need', async () => {
      const response = await fetch(`${baseUrl}/product-import-export/channel`, {
        headers: authHeaders(),
      })
      expect(response.status).toBe(200)
      const channel = await response.json()
      expect(Object.keys(channel).sort()).toEqual([
        'availableLanguageCodes',
        'code',
        'defaultLanguageCode',
        'token',
      ])
      expect(channel.code).toBe('__default_channel__')
      expect(Array.isArray(channel.availableLanguageCodes)).toBe(true)
    })
  })

  describe('authenticated admin keeps access', () => {
    it('GET /product-export/exported-files succeeds', async () => {
      // S3 listing with fake credentials will fail inside the handler, which surfaces
      // as a 422 from the controller — the point is that the guard let us through.
      const response = await fetch(`${baseUrl}/product-export/exported-files`, {
        headers: authHeaders(),
      })
      expect(response.status).not.toBe(403)
    })
  })
})
