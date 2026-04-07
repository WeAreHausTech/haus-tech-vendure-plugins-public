import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3'
import { RequestContext } from '@vendure/core'
import { randomUUID } from 'crypto'
import * as path from 'node:path'
import { Readable } from 'node:stream'
import { createS3Client, S3ExportStorageConfig } from '../export-storage.util'
import { ImportJobInputFile, ImportJobStorageStrategy } from './import-job-storage-strategy'

export type S3ImportJobStorageStrategyOptions = {
  storage: S3ExportStorageConfig
}

function normalizeFileNameForObjectKey(fileName: string): string {
  const base = path.posix.basename(fileName || 'import.csv')
  const trimmed = base.trim()
  if (!trimmed || trimmed === '.' || trimmed === '..') {
    return 'import.csv'
  }
  return trimmed.replace(/[^A-Za-z0-9._-]/g, '_')
}

function buildImportObjectKey(
  storage: S3ExportStorageConfig,
  channelToken: string,
  fileName: string,
): string {
  const prefix = storage.baseKeyPrefix ?? 'imports/'
  const normalizedPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`
  return `${normalizedPrefix}${channelToken}/${fileName}`
}

async function streamToString(stream: Readable): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf8')
}

export class S3ImportJobStorageStrategy implements ImportJobStorageStrategy {
  private storage: S3ExportStorageConfig

  constructor(options: S3ImportJobStorageStrategyOptions) {
    this.storage = options.storage
  }

  async storeImportFile(ctx: RequestContext, file: ImportJobInputFile): Promise<string> {
    const client = createS3Client(this.storage)
    const channelToken = ctx.channel.token
    const safeName = normalizeFileNameForObjectKey(file.originalname)
    const key = buildImportObjectKey(this.storage, channelToken, `${Date.now()}-${randomUUID()}-${safeName}`)

    await client.send(
      new PutObjectCommand({
        Bucket: this.storage.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: 'text/csv',
      }),
    )
    return key
  }

  async getImportFileContent(ctx: RequestContext, storageKey: string): Promise<string> {
    const client = createS3Client(this.storage)
    const channelToken = ctx.channel.token
    const expectedPrefix = buildImportObjectKey(this.storage, channelToken, '')
    if (!storageKey.startsWith(expectedPrefix)) {
      throw new Error('Invalid import storage key')
    }

    const result = await client.send(
      new GetObjectCommand({
        Bucket: this.storage.bucket,
        Key: storageKey,
      }),
    )
    if (!result.Body) {
      throw new Error('Import file not found')
    }

    return streamToString(result.Body as Readable)
  }

  async deleteImportFile(ctx: RequestContext, storageKey: string): Promise<void> {
    const client = createS3Client(this.storage)
    const channelToken = ctx.channel.token
    const expectedPrefix = buildImportObjectKey(this.storage, channelToken, '')
    if (!storageKey.startsWith(expectedPrefix)) {
      throw new Error('Invalid import storage key')
    }

    await client.send(
      new DeleteObjectCommand({
        Bucket: this.storage.bucket,
        Key: storageKey,
      }),
    )
  }
}
