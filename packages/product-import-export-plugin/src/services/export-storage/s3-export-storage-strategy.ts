import { DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3'
import { RequestContext } from '@vendure/core'
import { createReadStream } from 'node:fs'
import * as path from 'node:path'
import { Readable } from 'node:stream'
import { ExportStorageOptions } from '../../types'
import { ExportedFileMetadata, ExportStorageStrategy } from './export-storage-strategy'
import { createS3Client, isS3Storage, S3StorageConfig, buildExportObjectKey } from '../export-storage.util'

export type S3ExportStorageStrategyOptions = {
  storage: ExportStorageOptions
}

export class S3ExportStorageStrategy implements ExportStorageStrategy {
  private storage: S3StorageConfig

  constructor(options: S3ExportStorageStrategyOptions) {
    if (!isS3Storage(options.storage)) {
      throw new Error('S3ExportStorageStrategy requires storage.type === "s3"')
    }

    this.storage = options.storage
  }

  async storeExportFile(ctx: RequestContext, fileName: string, localFilePath: string): Promise<void> {
    const client = createS3Client(this.storage)
    const channelToken = ctx.channel.token
    const objectKey = buildExportObjectKey(this.storage, channelToken, fileName)

    await client.send(
      new PutObjectCommand({
        Bucket: this.storage.bucket,
        Key: objectKey,
        Body: createReadStream(localFilePath),
        ContentType: 'text/csv',
      }),
    )
  }

  async getExportFileStream(ctx: RequestContext, fileName: string): Promise<Readable> {
    const client = createS3Client(this.storage)
    const channelToken = ctx.channel.token
    const key = buildExportObjectKey(this.storage, channelToken, fileName)

    const result = await client.send(
      new GetObjectCommand({
        Bucket: this.storage.bucket,
        Key: key,
      }),
    )

    if (!result.Body) {
      throw new Error('File not found')
    }

    return result.Body as Readable
  }

  async listExportFiles(ctx: RequestContext): Promise<ExportedFileMetadata[]> {
    const client = createS3Client(this.storage)
    const channelToken = ctx.channel.token
    const prefix = buildExportObjectKey(this.storage, channelToken, '')
    const normalizedPrefix = prefix.endsWith('/') ? prefix : `${prefix}`

    const result = await client.send(
      new ListObjectsV2Command({
        Bucket: this.storage.bucket,
        Prefix: normalizedPrefix,
      }),
    )

    const contents = result.Contents || []

    const fileList = contents
      .filter((object) => {
        if (!object.Key) {
          return false
        }

        return object.Key.endsWith('.csv') && !object.Key.endsWith('.tmp')
      })
      .map((object) => {
        const key = object.Key as string
        const file = path.posix.basename(key)

        return {
          fileName: file,
          size: object.Size ?? 0,
          created: object.LastModified ?? new Date(),
          modified: object.LastModified ?? new Date(),
        }
      })

    return fileList.sort((a, b) => b.created.getTime() - a.created.getTime())
  }

  async deleteExportFile(ctx: RequestContext, fileName: string): Promise<void> {
    const client = createS3Client(this.storage)
    const channelToken = ctx.channel.token
    const key = buildExportObjectKey(this.storage, channelToken, fileName)

    await client.send(
      new DeleteObjectCommand({
        Bucket: this.storage.bucket,
        Key: key,
      }),
    )
  }
}

