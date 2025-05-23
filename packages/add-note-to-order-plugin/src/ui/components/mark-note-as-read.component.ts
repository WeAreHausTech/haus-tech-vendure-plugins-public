import { Component, Input, ChangeDetectorRef } from '@angular/core'
import {
  CustomColumnComponent,
  DataService,
  NotificationService,
  SharedModule,
} from '@vendure/admin-ui/core'
import { gql } from 'apollo-angular'
import { OrderWithUnreadMessages } from './order-notes-widget.component'
import { forkJoin } from 'rxjs'
import { OrderNotesWidgetComponent } from './order-notes-widget.component'

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
  imports: [SharedModule],
  selector: 'mark-note-as-read',
  template: `
    <button class="button-small" (click)="onMarkAsRead()">
      <clr-icon shape="eye"></clr-icon>
      {{ 'order-note-plugin.markAsRead' | translate }}
    </button>
  `,
  standalone: true,
})
export class MarkNoteAsReadComponent implements CustomColumnComponent {
  @Input() rowItem: OrderWithUnreadMessages

  constructor(
    private dataService: DataService,
    private cdRef: ChangeDetectorRef,
    private notificationService: NotificationService,
    private orderNotesWidgetComponent: OrderNotesWidgetComponent,
  ) {}

  async onMarkAsRead() {
    // Mark all order notes as read
    const order = this.rowItem
    const mutations = order.unreadMessages.map((note) =>
      this.dataService.mutate(SET_ORDER_NOTE_READ, {
        input: {
          id: note.id,
          data: note.data,
          read: true,
        },
      }),
    )
    forkJoin(mutations).subscribe({
      next: (results) => {
        this.cdRef.detectChanges()
        this.notificationService.success('Notes marked as read')
        this.orderNotesWidgetComponent.triggerRefresh();
      },
      error: (error) => {
        this.notificationService.error(`Error marking note as read: ${error.message}`)
      },
    })
  }
}
