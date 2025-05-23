import '@vendure/core'

declare module '@vendure/core' {
  export interface OrderHistoryEntryData {
    ORDER_NOTE: {
      note: string
      fromCustomer?: boolean
      readAt?: string
      seller?: {
        id?: string
        name: string
      }
    }
  }

  export interface UpdateOrderNoteInput {
    readAt: string
  }
}
