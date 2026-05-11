/**
 * Re-export of the product exported email handler for use with @vendure/email-plugin.
 * Import from '@haus-tech/product-import-export-plugin/email'.
 * Requires @vendure/email-plugin to be installed.
 */
import { readFile } from 'node:fs/promises'
import * as path from 'node:path'
import type { Injector, RequestContext } from '@vendure/core'
import type { LoadTemplateInput, TemplateLoader } from '@vendure/email-plugin'
import { productExportedHandler } from './handlers/product-exported.handler'

export { productExportedHandler }

/**
 * Convenience helper to append this plugin's email handler without duplicating it.
 *
 * @example
 * handlers: withProductExportedHandler(defaultEmailHandlers)
 */
export function withProductExportedHandler<T>(handlers: T[]): T[] {
  if (handlers.includes(productExportedHandler as unknown as T)) {
    return handlers
  }
  return [...handlers, productExportedHandler as unknown as T]
}

const PRODUCT_EXPORT_EMAIL_TYPE = 'product-export-complete'
const DEFAULT_TEMPLATE_NAME = 'body.hbs'
const DEFAULT_PRODUCT_EXPORTED_TEMPLATE = `<mjml>
  <mj-body>
    <mj-section>
      <mj-column>
        <mj-text font-size="20px" font-weight="bold">Product export complete</mj-text>
        <mj-text>Your export has finished successfully.</mj-text>
        <mj-text><strong>File:</strong> {{ fileName }}</mj-text>
        <mj-text><strong>Products exported:</strong> {{ productCount }}</mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
`

function isFileNotFoundError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && (error as { code?: string }).code === 'ENOENT'
}

function getBundledTemplatePath(templateName: string): string {
  return path.join(__dirname, 'email-templates', PRODUCT_EXPORT_EMAIL_TYPE, templateName)
}

/**
 * Wrap a TemplateLoader with fallback support for this plugin's export-complete template.
 *
 * If your app has `product-export-complete/body.hbs`, it is used as normal.
 * If it does not exist, the plugin's bundled default template is used.
 */
export function withProductExportedTemplateFallback(templateLoader: TemplateLoader): TemplateLoader {
  return {
    async loadTemplate(injector: Injector, ctx: RequestContext, input: LoadTemplateInput): Promise<string> {
      try {
        return await templateLoader.loadTemplate(injector, ctx, input)
      } catch (error) {
        const isProductExportBodyTemplate =
          input.type === PRODUCT_EXPORT_EMAIL_TYPE && input.templateName === DEFAULT_TEMPLATE_NAME
        if (!isProductExportBodyTemplate || !isFileNotFoundError(error)) {
          throw error
        }
        try {
          return await readFile(getBundledTemplatePath(input.templateName), 'utf8')
        } catch (bundledTemplateError) {
          if (!isFileNotFoundError(bundledTemplateError)) {
            throw bundledTemplateError
          }
          // Final fallback if the package template file is unavailable in node_modules.
          return DEFAULT_PRODUCT_EXPORTED_TEMPLATE
        }
      }
    },
    async loadPartials() {
      if (typeof templateLoader.loadPartials === 'function') {
        return templateLoader.loadPartials()
      }
      return []
    },
  }
}
