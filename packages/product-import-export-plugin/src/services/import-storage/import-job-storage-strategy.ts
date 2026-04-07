import { RequestContext } from '@vendure/core'

export type ImportJobInputFile = {
  originalname: string
  buffer: Buffer
}

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
