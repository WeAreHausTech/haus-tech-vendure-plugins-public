import { S3Client, type S3ClientConfig } from '@aws-sdk/client-s3'
import type { AwsCredentialIdentity, AwsCredentialIdentityProvider } from '@aws-sdk/types'

export type S3ExportStorageConfig = {
  bucket: string
  baseKeyPrefix?: string
  credentials?: AwsCredentialIdentity | AwsCredentialIdentityProvider
  nativeS3Configuration?: Record<string, unknown>
  nativeS3UploadConfiguration?: Record<string, unknown>
}

export function createS3Client(storage: S3ExportStorageConfig): S3Client {
  const config: S3ClientConfig = {
    ...(storage.nativeS3Configuration ?? {}),
    credentials: storage.credentials,
  }

  return new S3Client(config)
}

export function buildExportObjectKey(
  storage: S3ExportStorageConfig,
  channelToken: string,
  fileName: string,
): string {
  const prefix = storage.baseKeyPrefix ?? 'exports/'
  const normalizedPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`

  return `${normalizedPrefix}${channelToken}/${fileName}`
}

