import { Component, OnInit } from '@angular/core'
import { DataService } from '@vendure/admin-ui/core'
import { BehaviorSubject, Observable, combineLatest } from 'rxjs'
import { gql } from 'apollo-angular'
import { distinctUntilChanged, filter, map, shareReplay, switchMap } from 'rxjs/operators'
import { groupBy } from 'lodash'
import { OrderHistoryEntry } from '@vendure/core/dist/entity/history-entry/order-history-entry.entity'

export type OrderNote = {
  id: string
  type: string
  createdAt: string
  data: {
    note: string
    fromCustomer?: boolean
    readAt?: string
  }
}

export type OrderWithUnreadMessages = OrderNote & {
  numUnreadMessages: number
  unreadMessages: OrderNote[]
}

const GET_UNREAD_MESSAGES = gql`
  query UnreadMessages($options: HistoryEntryListOptions) {
    unreadMessages(options: $options) {
      items {
        id
        type
        createdAt
        data
        order {
          code
          id
          customer {
            id
            emailAddress
            firstName
            lastName
          }
        }
      }
      totalItems
    }
  }
`

const GET_ORDER_NOTE_HISTORY_ENTRIES = gql`
  query OrderNoteHistoryEntries($options: HistoryEntryListOptions) {
    orderNoteHistoryEntries(options: $options) {
      items {
        id
        type
        createdAt
        data
        order {
          code
          id
          customer {
            emailAddress
          }
        }
      }
      totalItems
    }
  }
`

@Component({
  selector: 'order-notes-widget',
  templateUrl: './order-notes-widget.component.html',
})
export class OrderNotesWidgetComponent implements OnInit {
  currentView$ = new BehaviorSubject<'all' | 'unread'>('unread')
  result$: Observable<any>
  unreadMessages$: Observable<OrderHistoryEntry[]>
  allMessages$: Observable<OrderHistoryEntry[]>

  totalItems$: Observable<number>

  // Pagination state as BehaviorSubjects
  itemsPerPage$ = new BehaviorSubject<number>(10)
  currentPage$ = new BehaviorSubject<number>(1)

  private refresh$ = new BehaviorSubject<void>(undefined)

  constructor(private dataService: DataService) {}

  ngOnInit() {
    this.result$ = combineLatest([
      this.itemsPerPage$,
      this.currentPage$,
      this.currentView$.pipe(distinctUntilChanged()),
      this.refresh$,
    ]).pipe(
      switchMap(([itemsPerPage, currentPage, view]) => {
        if (view === 'all') {
          return this.dataService
            .query(GET_ORDER_NOTE_HISTORY_ENTRIES, {
              options: {
                take: itemsPerPage,
                skip: (currentPage - 1) * itemsPerPage,
                sort: { createdAt: 'DESC' },
              },
            })
            .refetchOnChannelChange()
            .mapStream((data: any) => data)
        } else {
          return this.dataService
            .query(GET_UNREAD_MESSAGES, {
              options: {
                sort: { createdAt: 'DESC' },
              },
            })
            .refetchOnChannelChange()
            .mapStream((data: any) => data)
        }
      }),
      shareReplay(1),
    )

    this.allMessages$ = this.result$.pipe(
      filter(() => this.currentView$.value === 'all'),
      map((data) =>
        data.orderNoteHistoryEntries.items.map(
          (item: any) =>
            ({
              ...item,
              note: item.data.note,
            } as OrderHistoryEntry),
        ),
      ),
      shareReplay(1),
    )

    this.unreadMessages$ = this.result$.pipe(
      filter(() => this.currentView$.value === 'unread'),
      map((data) => {
        const grouped = groupBy(data.unreadMessages.items, (item) => item.order.id)
        return Object.entries(grouped)
          .map(([orderId, messages]) => {
            const lastNote = messages.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]

            console.log('lastNote', lastNote)
            return {
              ...lastNote,
              note: lastNote.data.note,
              numUnreadMessages: messages.length,
              unreadMessages: messages,
            }
          })
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      }),
      shareReplay(1),
    )
    this.totalItems$ = this.result$.pipe(map((data) => data?.orderNoteHistoryEntries?.totalItems))
  }

  setPageNumber(pageNumber: number) {
    this.currentPage$.next(pageNumber)
  }

  setItemsPerPage(itemsPerPage: number) {
    this.itemsPerPage$.next(itemsPerPage)
  }

  setCurrentView(view: 'all' | 'unread') {
    this.currentView$.next(view)
  }

  triggerRefresh() {
    this.refresh$.next()
  }
}
