import { Logger, RequestContextService, VendurePlugin, PluginCommonModule } from '@vendure/core'
import { AdminUiExtension } from '@vendure/ui-devkit/compiler'
import path from 'path'
import { TypeOrmModule } from '@nestjs/typeorm'
import { OnApplicationBootstrap } from '@nestjs/common'
import { SynonymGroup as Synonym } from './entity/synonym-group.entity'
import { SynonymService } from './services/synonym.service'
import { ElasticSynonymsService } from './services/elastic-synonyms.service'
import { PluginInitOptions } from './types'
import { synonymAdminSchema } from './api/api-extensions'
import { SynonymGroupResolver } from './api/synonym-admin.resolver'
import {
  DEFAULT_PLUGIN_OPTIONS,
  ELASTIC_SEARCH_SYNONYMS_OPTIONS,
  loggerCtx,
} from './constants'

@VendurePlugin({
  imports: [PluginCommonModule, TypeOrmModule.forFeature([Synonym])],
  entities: [Synonym],
  providers: [
    SynonymService,
    ElasticSynonymsService,
    {
      provide: ELASTIC_SEARCH_SYNONYMS_OPTIONS,
      useFactory: () => ({
        ...DEFAULT_PLUGIN_OPTIONS,
        ...ElasticSearchSynonymsPlugin.options,
      }),
    },
  ],
  exports: [SynonymService],
  adminApiExtensions: {
    schema: () => synonymAdminSchema,
    resolvers: [SynonymGroupResolver],
  },
  configuration: (config) => {
    return config
  },
  dashboard: './dashboard/index.tsx',
})
export class ElasticSearchSynonymsPlugin implements OnApplicationBootstrap {
  static options: PluginInitOptions = { ...DEFAULT_PLUGIN_OPTIONS }

  constructor(
    private elasticSynonymsService: ElasticSynonymsService,
    private synonymService: SynonymService,
    private requestContextService: RequestContextService,
  ) {}

  static init(options: PluginInitOptions = {}) {
    this.options = { ...DEFAULT_PLUGIN_OPTIONS, ...options }

    return ElasticSearchSynonymsPlugin
  }

  async onApplicationBootstrap() {
    try {
      const ctx = await this.requestContextService.create({
        apiType: 'admin',
      })
      const groupCount = await this.synonymService.syncAllToElasticsearch(ctx)

      if (ElasticSearchSynonymsPlugin.options.channelSpecificSynonyms) {
        Logger.info(
          `[Synonyms] Initialized channel-specific synonym sets in Elasticsearch (${groupCount} group line(s) synced)`,
          loggerCtx,
        )
      } else if (groupCount > 0) {
        Logger.info(
          `[Synonyms] Initialized ${groupCount} synonym group(s) in Elasticsearch`,
          loggerCtx,
        )
      } else {
        await this.elasticSynonymsService.updateElasticsearchSynonyms([])
        Logger.info('[Synonyms] No synonyms found in database at startup; cleared global set', loggerCtx)
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      Logger.error(`[Synonyms] Failed to initialize on startup: ${message}`, loggerCtx)
    }
  }

  static ui: AdminUiExtension = {
    id: 'elastic-search-synonyms-ui',
    extensionPath: path.join(__dirname, 'ui'),
    translations: {
      en: path.join(__dirname, './ui/translations/en.json'),
      sv: path.join(__dirname, './ui/translations/sv.json'),
    },
    routes: [{ route: 'synonyms', filePath: 'routes.ts' }],
    providers: ['providers.ts'],
  }
}
