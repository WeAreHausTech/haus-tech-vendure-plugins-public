import { registerRouteComponent } from '@vendure/admin-ui/core'
import { ProductImportComponent } from './components/product-import.component'

export default [
  registerRouteComponent({
    component: ProductImportComponent,
    path: '',
    title: 'Import Products',
    breadcrumb: 'Import Products',
  }),
]
