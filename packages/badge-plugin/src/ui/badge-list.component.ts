import {
  TypedBaseListComponent,
  NotificationService,
  ModalService,
  SelectionManager,
  SharedModule,
} from '@vendure/admin-ui/core'
import {
  Component,
  Injectable,
  OnInit,
  OnChanges,
  ChangeDetectionStrategy,
  SimpleChanges,
} from '@angular/core'
import { graphql } from './gql'
import { Badge, DeletionResult } from './gql/graphql'
import { marker as _ } from '@biesbjerg/ngx-translate-extract-marker'
import { EMPTY } from 'rxjs'
import { finalize, map, switchMap } from 'rxjs/operators'
import { Asset } from '@vendure/core'
import { CommonModule } from '@angular/common'
import { UpdateBadgeComponent } from './update-badge.component'
import { TranslateModule } from '@ngx-translate/core'

const getBadgeListDocument = graphql(`
  query GetBadges($options: BadgeListOptions) {
    badges(options: $options) {
      items {
        id
        createdAt
        updatedAt
        collection {
          id
        }
        collectionId
        position
        text
        asset {
          id
          name
          type
          mimeType
          width
          height
          fileSize
          source
          preview
        }
      }
      totalItems
    }
  }
`)

const createBadgeDocument = graphql(`
  mutation CreateBadge($input: CreateBadgeInput!) {
    createBadge(input: $input) {
      id
    }
  }
`)

const deleteBadgeDocument = graphql(`
  mutation DeleteBadge($ids: [ID!]!) {
    deleteBadge(ids: $ids) {
      result
      message
    }
  }
`)

const getPluginConfigDocument = graphql(`
  query GetBadgePluginConfig {
    getBadgePluginConfig {
      availablePositions
    }
  }
`)

export interface BadgePluginOptions {
  availablePositions: string[]
}

@Component({
  selector: 'badge-list',
  templateUrl: './badge-list.component.html',
  styleUrls: ['./badge-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule, UpdateBadgeComponent, SharedModule, TranslateModule],
})
@Injectable()
export class BadgeListComponent
  extends TypedBaseListComponent<typeof getBadgeListDocument, 'badges'>
  implements OnInit, OnChanges
{
  config: BadgePluginOptions
  uploading = false
  canDelete = true
  badges: Badge[]

  selectionManager = new SelectionManager<Badge>({
    multiSelect: true,
    itemsAreEqual: (a, b) => a.id === b.id,
    additiveMode: false,
  })

  constructor(
    private notificationService: NotificationService,
    private modalService: ModalService,
  ) {
    super()
    super.configure({
      document: getBadgeListDocument,
      getItems: (data) => {
        this.badges = data.badges.items as Badge[]
        return data.badges
      },
      setVariables: () => ({
        options: {
          skip: 0,
          take: 999,
        },
      }),
      refreshListOnChanges: [],
    })

    this.dataService
      .query(getPluginConfigDocument)
      .mapSingle((item) => item)
      .subscribe({
        next: (response) => {
          this.config = response.getBadgePluginConfig as BadgePluginOptions
        },
        error: (error) => console.error('Query error:', error),
      })
  }

  ngOnChanges(changes: SimpleChanges) {
    console.log('changes:', changes)
    if (this.items$) {
      for (const badge of this.selectionManager.selection) {
        // Update any selected assets with any changes
        const match = this.badges.find((a) => a.id === badge.id)
        if (match) {
          Object.assign(badge, match)
        }
      }
    }
    if (changes['badges']) {
      this.selectionManager.setCurrentItems(this.badges)
    }
  }

  async ngOnInit(): Promise<void> {
    super.ngOnInit()
  }

  toggleSelection(asset: Badge, event?: any) {
    this.selectionManager.toggleSelection(asset, event)
  }

  selectMultiple(assets: Badge[]) {
    this.selectionManager.selectMultiple(assets)
  }

  isSelected(asset: Badge): boolean {
    return this.selectionManager.isSelected(asset)
  }

  lastSelected(): Badge {
    return this.selectionManager.lastSelected()
  }

  filesSelected(files: File[]) {
    if (files.length) {
      this.uploading = true
      this.dataService.product
        .createAssets(files)
        .pipe(
          finalize(() => {
            this.uploading = false
          }),
        )
        .subscribe(({ createAssets }) => {
          let successCount = 0
          for (const result of createAssets) {
            switch (result.__typename) {
              case 'Asset':
                successCount++
                break
              case 'MimeTypeError':
                this.notificationService.error(result.message)
                break
            }
          }
          if (0 < successCount) {
            super.refresh()
            this.notificationService.success(_('badge-plugin.notify-create-badges-success'), {
              count: successCount,
            })
            this.createBadges(createAssets as Asset[])
          }
        })
    }
  }

  async createBadges(assets: Asset[]) {
    for (const asset of assets) {
      await this.dataService
        .mutate(createBadgeDocument, {
          input: {
            assetId: asset.id as string,
            position: this.config.availablePositions[0],
          },
        })
        .toPromise()
    }
    this.refresh()
  }

  deleteBadges(badges: Badge[]) {
    this.showModalAndDelete(badges.map((a) => a.id))
      .pipe(
        switchMap((response) => {
          if (response.result === DeletionResult.DELETED) {
            return [true]
          } else {
            return this.showModalAndDelete(
              badges.map((a) => a.id),
              response.message || '',
            ).pipe(map((r) => r.result === DeletionResult.DELETED))
          }
        }),
      )
      .subscribe(
        () => {
          this.notificationService.success(_('common.notify-delete-success'), {
            entity: 'Badges',
          })
          this.refresh()
          this.selectionManager.clearSelection()
        },
        () => {
          this.notificationService.error(_('common.notify-delete-error'), {
            entity: 'Badges',
          })
        },
      )
  }

  onBadgeUpdated() {
    this.refresh()
  }

  private showModalAndDelete(badgeIds: string[], message?: string) {
    return this.modalService
      .dialog({
        title: _('badge-plugin.confirm-delete-badges'),
        translationVars: {
          count: badgeIds.length,
        },
        body: message,
        buttons: [
          { type: 'secondary', label: _('common.cancel') },
          { type: 'danger', label: _('common.delete'), returnValue: true },
        ],
      })
      .pipe(
        switchMap((res) =>
          res
            ? this.dataService.mutate(deleteBadgeDocument, {
                ids: badgeIds,
              })
            : EMPTY,
        ),
        map((res) => res.deleteBadge),
      )
  }
}
