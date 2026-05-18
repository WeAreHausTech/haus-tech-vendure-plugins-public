import { registerRouteComponent } from '@vendure/admin-ui/core'
import { marker as _ } from '@biesbjerg/ngx-translate-extract-marker'
import { SynonymGroupListComponent } from './components/synonym-group-list.component'
import {
  SynonymGroupDetailComponent,
  getSynonymGroupDetailDocument,
} from './components/synonym-group-detail.component'

export default [
  registerRouteComponent({
    component: SynonymGroupListComponent,
    path: '',
    title: _('synonyms.title'),
    breadcrumb: _('synonyms.title'),
  }),
  registerRouteComponent({
    path: ':id',
    component: SynonymGroupDetailComponent,
    query: getSynonymGroupDetailDocument,
    entityKey: 'synonymGroup',
    title: _('synonyms.title'),
    breadcrumb: _('synonyms.title'),
    getBreadcrumbs: (entity) => [
      {
        label: _('synonyms.title'),
        link: ['/extensions', 'synonyms'],
      },
      {
        label: `${entity?.synonyms.join(', ').slice(0, 20)}...`,
        link: [],
      },
    ],
  }),
]
