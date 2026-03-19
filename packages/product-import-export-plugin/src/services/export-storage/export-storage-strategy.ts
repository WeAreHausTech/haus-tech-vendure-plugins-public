import { RequestContext } from '@vendure/core'
import { Readable } from 'node:stream'

export type ExportedFileMetadata = {
  fileName: string
  size: number
  created: Date
  modified: Date
}

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

