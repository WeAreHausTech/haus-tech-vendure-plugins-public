import { NgModule } from '@angular/core'
import {
  registerDashboardWidget,
  registerDataTableComponent,
  registerHistoryEntryComponent,
  SharedModule,
} from '@vendure/admin-ui/core'
import { OrderNotesWidgetComponent } from './components/order-notes-widget.component'
import { MarkNoteAsReadComponent } from './components/mark-note-as-read.component'
import { CustomOrderNoteEntryComponent } from './components/custom-order-note-entry.component'

@NgModule({
  imports: [SharedModule],
  providers: [
    registerDashboardWidget('order-notes-widget', {
      title: 'order-note-plugin.widgetHeading',
      supportedWidths: [4, 6, 8, 12],
      loadComponent: () =>
        import('./components/order-notes-widget.component').then(
          (m) => m.OrderNotesWidgetComponent,
        ),
    }),
    registerDataTableComponent({
      component: MarkNoteAsReadComponent,
      tableId: 'latest-orders-widget-list',
      columnId: 'markNoteAsRead',
    }),
    registerHistoryEntryComponent({
      type: 'ORDER_NOTE',
      component: CustomOrderNoteEntryComponent,
    }),
  ],
  declarations: [OrderNotesWidgetComponent],
})
export class OrderNotesWidgetModule {}
