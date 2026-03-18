import { S3Client, type S3ClientConfig } from '@aws-sdk/client-s3'
import type { AwsCredentialIdentity, AwsCredentialIdentityProvider } from '@aws-sdk/types'
import * as path from 'node:path'

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

function normalizeExportFileNameForObjectKey(fileName: string): string {
  if (fileName === '') {
    return ''
  }

  const trimmed = fileName.trim()
  if (!trimmed) {
    throw new Error('Invalid fileName')
  }

  // Prevent path traversal / virtual directory injection in S3 object keys.
  if (trimmed.includes('/') || trimmed.includes('\\')) {
    throw new Error('Invalid fileName')
  }

  if (trimmed.includes('..')) {
    throw new Error('Invalid fileName')
  }

  const base = path.posix.basename(trimmed)
  if (base !== trimmed) {
    throw new Error('Invalid fileName')
  }

  return base
}

/**
 * Build an S3 object key that is guaranteed to stay under the channel prefix.
 *
 * @param storage - S3 storage configuration.
 * @param channelToken - Current channel token.
 * @param fileName - Basename only (e.g. `export.csv`). Directory separators and traversal sequences are rejected.
 */
export function buildExportObjectKey(
  storage: S3ExportStorageConfig,
  channelToken: string,
  fileName: string,
): string {
  const prefix = storage.baseKeyPrefix ?? 'exports/'
  const normalizedPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`

  const normalizedFileName = normalizeExportFileNameForObjectKey(fileName)
  return `${normalizedPrefix}${channelToken}/${normalizedFileName}`
}

