import { registerRouteComponent } from '@vendure/admin-ui/core'
import { marker as _ } from '@biesbjerg/ngx-translate-extract-marker'
import { SynonymGroupListComponent } from './components/synonym-group-list.component'
import {
  SynonymGroupDetailComponent,
  getSynonymGroupDetailDocument,
} from './components/synonym-group-detail.component'

function synonymDetailBreadcrumbLabel(entity?: { synonyms?: string[] } | null): string {
  if (!entity) {
    return _('synonyms.detail.create')
  }
  const synonyms = entity.synonyms
  if (!synonyms?.length) {
    return _('synonyms.detailTitle')
  }
  const text = synonyms.join(', ')
  return text.length > 20 ? `${text.slice(0, 20)}...` : text
}

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
        label: synonymDetailBreadcrumbLabel(entity),
        link: [],
      },
    ],
  }),
]
