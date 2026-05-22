import {
  addNavMenuItem,
  DataService,
  ModalService,
  NotificationService,
  registerBulkAction,
} from '@vendure/admin-ui/core'
import { marker as _ } from '@biesbjerg/ngx-translate-extract-marker'
import { graphql } from './gql'
import { DeletionResult, type DeleteSynonymGroupBulkMutation } from './gql/graphql'
import { from, of } from 'rxjs'
import { map, mergeMap, switchMap, toArray } from 'rxjs/operators'

const BULK_DELETE_CONCURRENCY = 5

const deleteSynonymGroupBulkDocument = graphql(`
  mutation DeleteSynonymGroupBulk($id: ID!) {
    deleteSynonymGroup(id: $id) {
      result
      message
    }
  }
`)

export default [
  addNavMenuItem(
    {
      id: 'synonyms-nav',
      label: _('synonyms.nav'),
      routerLink: ['/extensions', 'synonyms'],
      icon: 'search',
    },
    'settings',
  ),
  registerBulkAction({
    label: _('common.delete'),
    icon: 'trash',
    iconClass: 'is-danger',
    onClick: ({ injector, selection, hostComponent, clearSelection }) => {
      const modalService = injector.get(ModalService)
      const dataService = injector.get(DataService)
      const notificationService = injector.get(NotificationService)
      const ids = selection.map((item) => item.id)
      modalService
        .dialog({
          title: _('synonyms.bulk-action.delete-confirm-title'),
          translationVars: {
            count: selection.length,
          },
          buttons: [
            { type: 'secondary', label: _('common.cancel') },
            { type: 'danger', label: _('common.delete'), returnValue: true },
          ],
        })
        .pipe(
          switchMap((response) => {
            if (!response) {
              return of(null)
            }
            return from(ids).pipe(
              mergeMap(
                (id) =>
                  dataService.mutate(deleteSynonymGroupBulkDocument, { id }).pipe(
                    map((result: DeleteSynonymGroupBulkMutation) => {
                      if (result.deleteSynonymGroup.result === DeletionResult.DELETED) {
                        return id
                      }
                      throw new Error(result.deleteSynonymGroup.message ?? 'Delete failed')
                    }),
                  ),
                BULK_DELETE_CONCURRENCY,
              ),
              toArray(),
            )
          }),
        )
        .subscribe({
          next: (ids: string[] | null) => {
            if (!ids) {
              return
            }
            notificationService.success(_('synonyms.bulk-action.delete-success'), {
              count: ids.length,
            })
            clearSelection()
            hostComponent.refresh()
          },
          error: (error) => {
            notificationService.error(error.message || 'Delete failed')
          },
        })
    },
    location: 'synonym-group-list',
  }),
]
