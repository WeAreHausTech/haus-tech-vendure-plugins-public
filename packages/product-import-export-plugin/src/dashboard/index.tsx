import {
  defineDashboardExtension,
  DashboardRouteDefinition,
  PageTitle,
  Page,
  Button,
} from '@vendure/dashboard'
import { HelpCircleIcon } from 'lucide-react'
import { ExportProductsBulkAction } from './bulk-export'
import { ProductImportBlock } from './import'
import { ProductExportBlock } from './export'
import { ExportedList } from './exported-list'

export const productImportRoute: DashboardRouteDefinition = {
  navMenuItem: {
    sectionId: 'catalog',
    id: 'product-importer',
    url: '/product-importer',
    title: 'Import/export',
  },
  path: '/product-importer',
  loader: () => ({
    breadcrumb: 'Import & export products',
  }),
  component: () => (
    <Page pageId="product-import">
      <div className="flex items-start justify-between">
        <div>
          <PageTitle>Import & export products</PageTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Import products from CSV or export your entire catalog as CSV.
          </p>
        </div>
        <a
          href="https://wearehaustech.github.io/docs/vendure-plugins/product-import-export-plugin"
          target="_blank"
          rel="noreferrer"
          className="hidden sm:inline-flex"
        >
          <Button variant="outline" size="sm">
            <HelpCircleIcon className="mr-2 h-4 w-4" />
            Help & guide
          </Button>
        </a>
      </div>
      <div className="space-y-6 w-full">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
          <ProductImportBlock />
          <ProductExportBlock />
        </div>
        <ExportedList />
      </div>
    </Page>
  ),
}

defineDashboardExtension({
  routes: [productImportRoute],
  dataTables: [
    {
      pageId: 'product-list',
      bulkActions: [
        {
          component: ExportProductsBulkAction,
        },
      ],
    },
  ],
})
