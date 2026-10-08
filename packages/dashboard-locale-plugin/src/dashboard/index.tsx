import { defineDashboardExtension } from '@vendure/dashboard'

import { LocaleDefaultsApplier } from './locale-defaults-applier'

defineDashboardExtension({
  toolbarItems: [
    {
      id: 'dashboard-locale-defaults',
      component: LocaleDefaultsApplier,
    },
  ],
})
