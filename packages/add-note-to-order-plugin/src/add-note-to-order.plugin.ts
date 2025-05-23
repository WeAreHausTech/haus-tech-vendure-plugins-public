import { PluginCommonModule, VendurePlugin } from '@vendure/core'
import path from 'path'
import { AdminUiExtension } from '@vendure/ui-devkit/compiler'
import { adminSchema, shopSchema } from './api/api-extensions'
import { AddNoteToOrderResolver } from './api/add-note-to-order.resolver'
import { AddNoteToOrderService } from './services/add-note-to-order.service'
import { SetOrderNoteReadResolver } from './api/set-order-note-read.resolver'
import { SetOrderNoteReadService } from './services/set-order-note-read.service'
import { OrderNoteHistoryEntryResolver } from './api/order-note-history.resolver'
import { UnreadMessagesResolver } from './api/unread-messages.resolver'

export interface AddNoteToOrderOptions {
  enabled: boolean
}

@VendurePlugin({
  imports: [PluginCommonModule],
  shopApiExtensions: {
    resolvers: [AddNoteToOrderResolver, SetOrderNoteReadResolver],
    schema: shopSchema,
  },
  adminApiExtensions: {
    resolvers: [SetOrderNoteReadResolver, OrderNoteHistoryEntryResolver, UnreadMessagesResolver],
    schema: adminSchema,
  },
  providers: [AddNoteToOrderService, SetOrderNoteReadService],
  compatibility: '^2.0.0 || ^3.0.0',
})
export class AddNoteToOrderPlugin {
  static ui: AdminUiExtension = {
    extensionPath: path.join(__dirname, 'ui'),
    ngModules: [
      {
        type: 'shared',
        ngModuleFileName: 'order-notes-widget.module.ts',
        ngModuleName: 'OrderNotesWidgetModule',
      },
    ],
    translations: {
      en: path.join(__dirname, 'ui/**/en.json'),
      sv: path.join(__dirname, 'ui/**/sv.json'),
    },
  }
}
