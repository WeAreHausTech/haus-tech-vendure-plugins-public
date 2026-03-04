import { registerPageTab } from '@vendure/admin-ui/core'
import { ProductImportComponent } from './components/product-import.component'
import { ExportDialogComponent } from './components/export-dialog.component'
import { ModalService, registerBulkAction } from '@vendure/admin-ui/core'
import { ProductExportService } from './product-export.service'
import { marker as _ } from '@biesbjerg/ngx-translate-extract-marker'

export default [
  registerPageTab({
    location: 'product-list',
    tab: _('product-import.import-products'),
    route: 'import',
    tabIcon: 'import',
    component: ProductImportComponent,
  }),
  registerBulkAction({
    location: 'product-list',
    label: _('product-export.action'),
    icon: 'export',
    onClick: ({ injector, selection }) => {
      const modalService = injector.get(ModalService)
      const productExportService = injector.get(ProductExportService)

      const productIds = selection.map((product) => product.id)

      const promises = [
        productExportService.getCustomFields(productIds),
        productExportService.getConfig(),
      ]

      Promise.all(promises).then(([customFields, config]) => {
        modalService
          .fromComponent(ExportDialogComponent, {
            size: 'md',
            locals: {
              selection,
              customFields,
              config: config.exportOptions,
            },
            closable: true,
          })
          .subscribe((response) => {
            if (response?.result) {
              productExportService.exportProducts(
                selection,
                response.fileName,
                response.selectedFields,
                response.exportAssetsAs,
                response.selectedExportFields,
              )
            }
          })
      })
    },
  }),
  ProductExportService,
]
