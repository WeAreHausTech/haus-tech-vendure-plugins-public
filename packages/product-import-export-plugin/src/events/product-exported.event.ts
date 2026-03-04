import { RequestContext, VendureEvent } from '@vendure/core'

export interface ProductExportResult {
  filePath: string
  fileName: string
  productCount: number
  toEmail: string
}

/**
 * @description
 * This event is fired whenever a Product export job completes successfully.
 */
export class ProductExportedEvent extends VendureEvent {
  constructor(
    public ctx: RequestContext,
    public input: ProductExportResult,
  ) {
    super()
  }
}
