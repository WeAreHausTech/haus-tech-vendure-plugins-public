import { addNavMenuItem, SharedModule } from '@vendure/admin-ui/core'

export default [
  addNavMenuItem(
    {
      id: 'badges',
      label: 'Badges',
      routerLink: ['/extensions/badges'],
      icon: 'star',
    },
    'catalog',
  ),
]
