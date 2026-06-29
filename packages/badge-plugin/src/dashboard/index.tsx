import { defineDashboardExtension } from '@vendure/dashboard'
import { badgeListRoute } from './badge-list'
import { badgeDetailRoute } from './badge-detail'

defineDashboardExtension({
  routes: [badgeListRoute, badgeDetailRoute],
})
