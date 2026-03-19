import { RequestContext } from '@vendure/core'
import { createReadStream, existsSync, promises as fs } from 'node:fs'
import * as path from 'node:path'
import { Readable } from 'node:stream'
import { ExportedFileMetadata, ExportStorageStrategy } from './export-storage-strategy'

export type LocalExportStorageStrategyOptions = {
  /**
   * @description
   * Base directory in which exported files are stored.
   * Files are stored under `<baseDir>/<channelToken>/`.
   */
  baseDir: string
}

export class LocalExportStorageStrategy implements ExportStorageStrategy {
  constructor(private options: LocalExportStorageStrategyOptions) {}

  async storeExportFile(ctx: RequestContext, fileName: string, localFilePath: string): Promise<void> {
    const exportsDir = this.getExportsDir(ctx)
    await fs.mkdir(exportsDir, { recursive: true })
    const destinationPath = path.join(exportsDir, fileName)

    // Move into final location. If rename fails (e.g. cross-device), fall back to copy+unlink.
    try {
      await fs.rename(localFilePath, destinationPath)
      return
    } catch (e) {
      // ignore, fall back below
    }

    await fs.copyFile(localFilePath, destinationPath)
    await fs.unlink(localFilePath)
  }

  async getExportFileStream(ctx: RequestContext, fileName: string): Promise<Readable> {
    const exportsDir = this.getExportsDir(ctx)
    const filePath = path.join(exportsDir, fileName)

    if (!filePath.startsWith(exportsDir)) {
      throw new Error('Invalid file path')
    }

    if (!existsSync(filePath)) {
      throw new Error('File not found')
    }

    return createReadStream(filePath)
  }

  async listExportFiles(ctx: RequestContext): Promise<ExportedFileMetadata[]> {
    const exportsDir = this.getExportsDir(ctx)

    if (!existsSync(exportsDir)) {
      return []
    }

    const files = await fs.readdir(exportsDir)
    const csvFiles = files.filter((file) => file.endsWith('.csv') && !file.endsWith('.tmp'))

    const fileList = await Promise.all(
      csvFiles.map(async (file) => {
        const filePath = path.join(exportsDir, file)
        const stats = await fs.stat(filePath)
        return {
          fileName: file,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime,
        }
      }),
    )

    return fileList.sort((a, b) => b.created.getTime() - a.created.getTime())
  }

  async deleteExportFile(ctx: RequestContext, fileName: string): Promise<void> {
    const exportsDir = this.getExportsDir(ctx)
    const filePath = path.join(exportsDir, fileName)

    if (!filePath.startsWith(exportsDir)) {
      throw new Error('Invalid file path')
    }

    if (!existsSync(filePath)) {
      throw new Error('File not found')
    }

    await fs.unlink(filePath)
  }

  private getExportsDir(ctx: RequestContext): string {
    const channelToken = ctx.channel.token
    return path.join(this.options.baseDir, channelToken)
  }
}

