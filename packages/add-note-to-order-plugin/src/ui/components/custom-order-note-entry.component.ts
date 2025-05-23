import { Component, ChangeDetectorRef } from '@angular/core'
import {
  CustomerFragment,
  CustomerHistoryEntryComponent,
  DataService,
  NotificationService,
  OrderDetailFragment,
  OrderHistoryEntryComponent,
  SharedModule,
  TimelineDisplayType,
  TimelineHistoryEntry,
} from '@vendure/admin-ui/core'
import { gql } from 'apollo-angular'

const SET_ORDER_NOTE_READ = gql`
  mutation SetOrderNoteRead($input: SetOrderNoteReadInput!) {
    setOrderNoteRead(input: $input) {
      id
      type
      administrator {
        id
        firstName
        lastName
      }
      data
    }
  }
`

@Component({
  selector: 'custom-order-note-entry',
  templateUrl: './custom-order-note-entry.component.html',
  standalone: true,
  imports: [SharedModule],
})
export class CustomOrderNoteEntryComponent
  implements CustomerHistoryEntryComponent, OrderHistoryEntryComponent
{
  entry: TimelineHistoryEntry
  customer: CustomerFragment
  order: OrderDetailFragment

  constructor(
    private dataService: DataService,
    private cdRef: ChangeDetectorRef,
    private notificationService: NotificationService,
  ) {}

  getDisplayType(entry: TimelineHistoryEntry): TimelineDisplayType {
    if (entry.data.fromCustomer) {
      return entry.data.readAt ? 'success' : 'warning'
    }
    return 'default'
  }

  getName(entry: TimelineHistoryEntry): string {
    if (entry.data.fromCustomer) {
      return `${this.order.customer?.firstName} ${this.order.customer?.lastName}`
    } else if (entry.administrator) {
      return `${entry.administrator.firstName} ${entry.administrator.lastName}`
    } else if (entry.data.seller) {
      return entry.data.seller.name
    } else {
      return 'Unknown'
    }
  }

  isFeatured(entry: TimelineHistoryEntry): boolean {
    return true
  }

  getIconShape(entry: TimelineHistoryEntry) {
    return entry.data.fromCustomer ? 'chat-bubble' : 'note'
  }

  async onMarkAsRead() {
    this.dataService
      .mutate(SET_ORDER_NOTE_READ, {
        input: {
          id: this.entry.id,
          data: this.entry.data,
          read: true,
        },
      })
      .subscribe({
        next: (result) => {
          this.cdRef.detectChanges()
          this.notificationService.success('Note marked as read')
        },
        error: (error) => {
          console.error('Error marking note as read:', error)
          this.notificationService.error(`Error marking note as read: ${error.message}`)
        },
      })
  }
}
