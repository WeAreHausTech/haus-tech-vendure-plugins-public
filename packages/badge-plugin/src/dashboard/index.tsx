import { defineDashboardExtension } from '@vendure/dashboard'
import { badgeListRoute } from './badge-list'
import { badgeDetailRoute } from './badge-detail'

export default defineDashboardExtension({
  routes: [badgeListRoute, badgeDetailRoute],
})
