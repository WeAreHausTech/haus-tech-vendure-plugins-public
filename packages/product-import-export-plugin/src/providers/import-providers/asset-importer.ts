import { Injectable, OnModuleInit } from '@nestjs/common'
import {
  Asset,
  AssetService,
  Channel,
  ChannelService,
  ConfigService,
  isGraphQlErrorResult,
  Logger,
  RequestContext,
  TransactionalConnection,
} from '@vendure/core'
import { JsonAsset } from '../../types'
import { generateAssetHash } from '../../helpers/generate-asset-hash'
import { Readable } from 'stream'
import fs from 'fs-extra'
import axios from 'axios'
import path from 'path'
import { from, lastValueFrom } from 'rxjs'
import { delay, retryWhen, take, tap } from 'rxjs/operators'
import { compact } from 'lodash'

/**
 * @description
 * This service creates new {@link Asset} entities based on string paths provided in the CSV
 * import format. The source files are resolved by joining the value of `importExportOptions.importAssetsDir`
 * with the asset path. This service is used internally by the {@link Importer} service.
 *
 * @docsCategory import-export
 */
@Injectable()
export class ExtendedAssetImporter implements OnModuleInit {
  private assetMap = new Map<string, Asset>()
  private defaultChannel: Channel

  /** @internal */
  constructor(
    private configService: ConfigService,
    private assetService: AssetService,
    private connection: TransactionalConnection,
    private channelService: ChannelService,
  ) {}

  async onModuleInit() {
    this.defaultChannel = await this.channelService.getDefaultChannel()
  }

  /**
   * @description
   * Creates Asset entities for the given paths, using the assetMap cache to prevent the
   * creation of duplicates.
   */
  async getAssets(
    assetPaths: JsonAsset[],
    ctx?: RequestContext,
  ): Promise<{ assets: Asset[]; errors: string[] }> {
    const assets: Asset[] = []
    const errors: string[] = []
    const uniqueAssetPaths = new Set(assetPaths)
    for (const assetPath of uniqueAssetPaths.values()) {
      try {
        const assetHash = generateAssetHash({
          source: assetPath.url,
        } as Asset)

        const assetFromHash = await this.connection.getRepository(ctx, Asset).findOne({
          where: {
            customFields: {
              hash: assetHash,
            },
          },
          relations: ['channels'],
        })

        if (assetFromHash) {
          // Check if the asset name has changed
          if (
            (assetPath.name && assetFromHash.name !== assetPath.name) ||
            assetFromHash.channels.some((channel) => channel.id !== ctx?.channelId)
          ) {
            assetFromHash.name = assetPath.name || assetFromHash.name
            assetFromHash.channels.push(ctx?.channel as Channel)
            await this.connection.getRepository(ctx, Asset).save(assetFromHash)
          }
          this.assetMap.set(assetPath.url, assetFromHash)
          assets.push(assetFromHash)
          continue
        }

        const stream = await this.getStreamFromPath(assetPath.url)
        if (stream) {
          const createdAsset = await this.assetService.createFromFileStream(
            stream,
            assetPath.url,
            ctx,
          )

          if (isGraphQlErrorResult(createdAsset)) {
            errors.push(createdAsset.message)
          } else {
            let assetToUpdate: Asset = createdAsset as Asset
            let shouldDeleteCreatedAsset = false

            const assetFromHash = await this.connection.getRepository(ctx, Asset).findOne({
              where: {
                customFields: {
                  hash: assetHash,
                },
              },
              relations: ['channels'],
            })

            if (assetFromHash) {
              shouldDeleteCreatedAsset = true
              assetToUpdate = { ...assetFromHash, name: assetPath.name || assetFromHash.name }
            }

            if (assetPath.id) {
              shouldDeleteCreatedAsset = true
              assetToUpdate = {
                ...assetToUpdate,
                id: assetPath.id,
              }
            }

            this.assetMap.set(assetPath.url, assetToUpdate)
            assets.push(assetToUpdate)

            assetToUpdate.name = assetPath.name || assetToUpdate.name
            assetToUpdate.channels.push(ctx?.channel as Channel)
            assetToUpdate.customFields = {
              ...assetToUpdate.customFields,
              hash: assetHash,
            }
            await this.connection.getRepository(ctx, Asset).save(assetToUpdate)

            if (shouldDeleteCreatedAsset) {
              await this.connection.getRepository(ctx, Asset).delete(createdAsset.id)
            }
          }
        }
      } catch (e: any) {
        if (e.message.includes('no elements in sequence')) {
          errors.push(`Could not find asset at path "${assetPath.url}"`)
        } else {
          errors.push(e.message)
        }
      }
    }
    return { assets, errors }
  }

  getStreamFromPath(assetPath: string) {
    if (/^https?:\/\//.test(assetPath)) {
      return this.getStreamFromUrl(assetPath)
    } else {
      return this.getStreamFromLocalFile(assetPath)
    }
  }

  private getStreamFromUrl(assetUrl: string): Promise<Readable> {
    const retryCount = 3
    const retryDelayMs = 200
    return lastValueFrom(
      from(fetchUrlWithAxios(assetUrl)).pipe(
        retryWhen((errors) =>
          errors.pipe(
            tap((error) => {
              Logger.verbose(error.message)
              if (error.message.includes('Status code: 404')) {
                throw error // Stop retrying on 404 errors
              }
              Logger.verbose(`CustomAssetImportStrategy: retrying fetchUrl for ${assetUrl}`)
            }),
            delay(retryDelayMs ?? 200),
            take(retryCount ?? 3),
          ),
        ),
      ),
    )
  }

  private getStreamFromLocalFile(assetPath: string): Readable {
    const { importAssetsDir } = this.configService.importExportOptions
    const filename = path.join(importAssetsDir, assetPath)

    if (fs.existsSync(filename)) {
      const fileStat = fs.statSync(filename)
      if (fileStat.isFile()) {
        try {
          const stream = fs.createReadStream(filename)
          return stream
        } catch (err: any) {
          Logger.error(`Error creating read stream for local file "${filename}": ${err.message}`)
          throw err
        }
      } else {
        const errorMessage = `Could not find file "${filename}"`
        Logger.error(errorMessage)
        throw new Error(errorMessage)
      }
    } else {
      const errorMessage = `File "${filename}" does not exist`
      Logger.error(errorMessage)
      throw new Error(errorMessage)
    }
  }
}

async function fetchUrlWithAxios(urlString: string): Promise<Readable> {
  try {
    const response = await axios.get(urlString, {
      responseType: 'stream',
      timeout: 5000, // 5 seconds timeout
    })

    if (response.status !== 200) {
      Logger.error(`Failed to fetch "${urlString}", statusCode: ${response.status}`)
      throw new Error(`Request failed. Status code: ${response.status}`)
    }

    return response.data
  } catch (error: any) {
    Logger.error(`Error fetching URL "${urlString}": ${error.message}`)
    throw error
  }
}
