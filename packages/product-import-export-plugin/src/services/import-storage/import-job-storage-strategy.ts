import { RequestContext } from '@vendure/core'

export type ImportJobInputFile = {
  originalname: string
  buffer: Buffer
}

/**
 * @description
 * Strategy that determines where uploaded import files are persisted while their
 * import job is queued, and how that content is later resolved and cleaned up.
 * Implement this to back import jobs with custom storage (the plugin ships local-disk
 * and S3 implementations).
 *
 * @category Strategies
 */
export interface ImportJobStorageStrategy {
  /**
   * @description
   * Persist an uploaded import file and return a storage key to reference it in queued jobs.
   */
  storeImportFile(ctx: RequestContext, file: ImportJobInputFile): Promise<string>

  /**
   * @description
   * Resolve previously stored import file content from a storage key.
   */
  getImportFileContent(ctx: RequestContext, storageKey: string): Promise<string>

  /**
   * @description
   * Delete a stored import file by key. Must be safe to call repeatedly.
   */
  deleteImportFile(ctx: RequestContext, storageKey: string): Promise<void>
}
