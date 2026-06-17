import { RequestContext } from '@vendure/core'
import { Readable } from 'node:stream'

export type ExportedFileMetadata = {
  fileName: string
  size: number
  created: Date
  modified: Date
}

/**
 * @description
 * Strategy that determines where exported CSV files are stored and how they are
 * retrieved, listed and deleted. Implement this to back exports with custom storage
 * (the plugin ships local-disk and S3 implementations).
 *
 * @category Strategies
 */
export interface ExportStorageStrategy {
  /**
   * @description
   * Store the completed export file (already written on local disk) and make it retrievable
   * via the `fileName` in the controller routes.
   */
  storeExportFile(
    ctx: RequestContext,
    fileName: string,
    localFilePath: string,
  ): Promise<void>

  /**
   * @description
   * Returns a readable stream for an exported file.
   */
  getExportFileStream(ctx: RequestContext, fileName: string): Promise<Readable>

  /**
   * @description
   * Lists all exported files for the current channel.
   */
  listExportFiles(ctx: RequestContext): Promise<ExportedFileMetadata[]>

  /**
   * @description
   * Deletes an exported file for the current channel.
   */
  deleteExportFile(ctx: RequestContext, fileName: string): Promise<void>
}

