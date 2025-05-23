import { RequestContext, VendureEvent, Order, Seller, Customer } from '@vendure/core'
/**
 * @description
 * This event is fired whenever a new message from customer is added
 */

interface dataFields {
  message: string
  customer: Customer | undefined
  seller: Seller | undefined
  orderId: string | number
  orderCode: string
}
export class NewMessageEvent extends VendureEvent {
  constructor(public ctx: RequestContext, public data: dataFields) {
    super()
  }
}
