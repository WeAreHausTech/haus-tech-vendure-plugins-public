import { S3Client } from '@aws-sdk/client-s3'
import { ExportStorageOptions } from '../types'

export type S3StorageConfig = Extract<ExportStorageOptions, { type: 's3' }>

export function isS3Storage(storage?: ExportStorageOptions): storage is S3StorageConfig {
  if (!storage) {
    return false
  }

  return storage.type === 's3'
}

export function createS3Client(storage: S3StorageConfig): S3Client {
  return new S3Client({
    region: storage.region ?? 'eu-north-1',
    endpoint: storage.endpoint,
    forcePathStyle: storage.forcePathStyle,
    credentials: {
      accessKeyId: storage.accessKeyId,
      secretAccessKey: storage.secretAccessKey,
    },
  })
}

export function buildExportObjectKey(
  storage: S3StorageConfig,
  channelToken: string,
  fileName: string,
): string {
  const prefix = storage.baseKeyPrefix ?? 'exports/'
  const normalizedPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`

  return `${normalizedPrefix}${channelToken}/${fileName}`
}

