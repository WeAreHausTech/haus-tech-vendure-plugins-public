import { defineDashboardExtension } from '@vendure/dashboard'
import { synonymGroupList } from './synonym-list'
import { synonymGroupDetail } from './synonym-detail'

defineDashboardExtension({
  routes: [synonymGroupList, synonymGroupDetail],
})
