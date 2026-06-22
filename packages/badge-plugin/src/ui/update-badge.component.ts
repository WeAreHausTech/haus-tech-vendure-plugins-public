import {
  Component,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Input,
  Output,
  OnChanges,
  SimpleChanges,
  EventEmitter,
} from '@angular/core'
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms'
import { Observable } from 'rxjs'
import { DataService, SharedModule } from '@vendure/admin-ui/core'
import { Badge, Collection } from './gql/graphql'
import { graphql } from './gql'
import { CommonModule } from '@angular/common'
import { NgSelectModule } from '@ng-select/ng-select'
import { TranslateModule } from '@ngx-translate/core'

const updateBadgeDocument = graphql(`
  mutation UpdateBadge($input: UpdateBadgeInput!) {
    updateBadge(input: $input) {
      id
    }
  }
`)

@Component({
  selector: 'update-badge',
  templateUrl: './update-badge.component.html',
  styleUrls: ['./update-badge.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, NgSelectModule, SharedModule, TranslateModule],
})
export class UpdateBadgeComponent implements OnChanges {
  @Input() badge: Badge
  @Input() availablePositions: string[] = []
  @Output() badgeUpdated: EventEmitter<Badge> = new EventEmitter<Badge>()

  form: FormGroup

  allCollections$: Observable<Collection[]>

  constructor(
    private formBuilder: FormBuilder,
    private changeDetector: ChangeDetectorRef,
    private dataService: DataService,
  ) {
    this.form = this.formBuilder.group({
      collectionId: [''],
      position: [''],
      text: [''],
    })
    this.allCollections$ = this.dataService.collection
      .getCollections()
      .mapSingle((data) => data.collections.items as Collection[])
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes.badge && changes.badge.currentValue) {
      this.form.patchValue({
        collectionId: this.badge?.collectionId,
        position: this.badge?.position,
        text: this.badge?.text ?? '',
      })
    }
  }

  collectionValueChanged(event: Collection) {
    this.form.patchValue({ collectionId: event.id })
  }

  positionChanged(event: string) {
    this.form.patchValue({ position: event })
  }

  updateBadge() {
    this.dataService
      .mutate(updateBadgeDocument, {
        input: {
          id: this.badge.id,
          collectionId: this.form.value.collectionId,
          position: this.form.value.position,
          text: this.form.value.text,
        },
      })
      .subscribe({
        next: () => {
          this.form.markAsPristine()
          this.changeDetector.detectChanges()
          this.badgeUpdated.emit({ ...this.badge, ...this.form.value })
        },
        error: (err) => {
          console.error('Error updating badge:', err)
        },
      })
  }
}
