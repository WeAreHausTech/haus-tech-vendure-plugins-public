import { existsSync, promises as fs } from 'node:fs'
import * as path from 'node:path'
import { randomUUID } from 'crypto'
import { RequestContext } from '@vendure/core'
import { ImportJobInputFile, ImportJobStorageStrategy } from './import-job-storage-strategy'

export type LocalImportJobStorageStrategyOptions = {
  /**
   * @description
   * Base directory in which queued import input files are stored.
   * Files are stored under `<baseDir>/<channelToken>/`.
   */
  baseDir: string
}

export class LocalImportJobStorageStrategy implements ImportJobStorageStrategy {
  constructor(private options: LocalImportJobStorageStrategyOptions) {}

  async storeImportFile(ctx: RequestContext, file: ImportJobInputFile): Promise<string> {
    const importsDir = this.getImportsDir(ctx)
    await fs.mkdir(importsDir, { recursive: true })
    const ext = path.extname(file.originalname || '').toLowerCase() || '.csv'
    const fileName = `${Date.now()}-${randomUUID()}${ext}`
    const filePath = path.join(importsDir, fileName)
    await fs.writeFile(filePath, file.buffer)
    return filePath
  }

  async getImportFileContent(ctx: RequestContext, storageKey: string): Promise<string> {
    const importsDir = this.getImportsDir(ctx)
    if (!storageKey.startsWith(importsDir)) {
      throw new Error('Invalid import storage key')
    }
    if (!existsSync(storageKey)) {
      throw new Error('Import file not found')
    }
    return fs.readFile(storageKey, 'utf8')
  }

  async deleteImportFile(ctx: RequestContext, storageKey: string): Promise<void> {
    const importsDir = this.getImportsDir(ctx)
    if (!storageKey.startsWith(importsDir)) {
      throw new Error('Invalid import storage key')
    }
    await fs.rm(storageKey, { force: true })
  }

  private getImportsDir(ctx: RequestContext): string {
    return path.join(this.options.baseDir, ctx.channel.token)
  }
}
