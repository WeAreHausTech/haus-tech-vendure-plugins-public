import { EmailEventListener } from '@vendure/email-plugin'
import { ProductExportedEvent } from '../events/product-exported.event'

export const productExportedHandler = new EmailEventListener('product-export-complete')
  .on(ProductExportedEvent)
  .setRecipient((event) => event.input.toEmail)
  .setFrom('{{ fromAddress }}')
  .setSubject((event) => `Product export complete - ${event.input.fileName}`)
  .setTemplateVars((event) => ({
    fileName: event.input.fileName,
    productCount: event.input.productCount,
  }))
