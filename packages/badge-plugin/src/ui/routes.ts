import { registerRouteComponent } from '@vendure/admin-ui/core'
import { BadgeListComponent } from './badge-list.component'

export default [
  registerRouteComponent({
    path: '',
    component: BadgeListComponent,
    breadcrumb: 'Badges',
  }),
]
