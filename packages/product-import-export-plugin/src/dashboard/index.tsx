import {
  defineDashboardExtension,
  DashboardRouteDefinition,
  PageTitle,
  Page,
  PageLayout,
  PageBlock,
} from '@vendure/dashboard'
import { ExportProductsBulkAction } from './bulk-export'
import { ProductImportBlock } from './import'
import { ProductExportBlock } from './export'
import { ExportedList } from './exported-list'

export const productImportRoute: DashboardRouteDefinition = {
  navMenuItem: {
    sectionId: 'catalog',
    id: 'product-importer',
    url: '/product-importer',
    title: 'Import/export products',
  },
  path: '/product-importer',
  loader: () => ({
    breadcrumb: 'Import/export products',
  }),
  component: () => (
    <Page pageId="product-import">
      <PageTitle>Import/export products</PageTitle>
      <PageLayout>
        <PageBlock
          column="main"
          blockId="main-form-import"
          title="Import products"
          description="Import products from a CSV file"
        >
          <ProductImportBlock />
        </PageBlock>
        <PageBlock
          column="main"
          blockId="main-form-export"
          title="Export products"
          description="Exports all products to a CSV file. The export is added to the job queue and will be processed in the background. When the file is ready, you will receive an email and the exported file will be available to download from the list below."
        >
          <ProductExportBlock />
        </PageBlock>
        <PageBlock
          column="main"
          blockId="main-form-exported-list"
          title="Exported files"
          description="Files available for download"
        >
          <ExportedList />
        </PageBlock>
      </PageLayout>
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
