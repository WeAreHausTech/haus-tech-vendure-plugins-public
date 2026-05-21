import { ChangeDetectionStrategy, Component, OnDestroy, OnInit } from '@angular/core'
import { ResultOf } from '@graphql-typed-document-node/core'
import {
  SharedModule,
  NotificationService,
  ModalService,
  TypedBaseDetailComponent,
  LanguageCode,
} from '@vendure/admin-ui/core'
import { RouterModule } from '@angular/router'
import {
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
} from '@angular/forms'
import { TranslateService } from '@ngx-translate/core'
import { graphql } from '../gql'

@Component({
  selector: 'synonym-group-detail',
  templateUrl: './synonym-group-detail.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [SharedModule, RouterModule, FormsModule, ReactiveFormsModule],
})
export class SynonymGroupDetailComponent
  extends TypedBaseDetailComponent<typeof getSynonymGroupDetailDocument, 'synonymGroup'>
  implements OnInit, OnDestroy
{
  detailForm: FormGroup

  synonyms: string[] = []
  originalSynonyms: string[] = []

  constructor(
    private formBuilder: FormBuilder,
    private notifications: NotificationService,
    private modalService: ModalService,
    private translate: TranslateService,
  ) {
    super()

    this.detailForm = this.formBuilder.group({
      synonyms: new FormArray([]),
      languageCode: new FormControl<LanguageCode | null>(null),
      newTag: new FormControl(''), // Add newTag as a form control
    })
  }

  get newTag(): string {
    return this.detailForm.get('newTag')?.value || ''
  }

  set newTag(value: string) {
    this.detailForm.get('newTag')?.setValue(value)
  }

  protected setFormValues(
    entity: NonNullable<ResultOf<typeof getSynonymGroupDetailDocument>['synonymGroup']>,
    languageCode: LanguageCode,
  ): void {
    // Set the synonyms array for the UI
    this.synonyms = Array.isArray(entity.synonyms) ? [...entity.synonyms] : []
    this.originalSynonyms = [...this.synonyms]

    this.detailForm.patchValue({
      synonyms: entity.synonyms,
      languageCode: entity.languageCode,
      newTag: '', // Reset the input field
    })
  }

  ngOnInit(): void {
    this.init()
  }

  ngOnDestroy(): void {
    this.destroy()
  }

  create(): void {
    if (this.detailForm.invalid) return

    const synonyms = this.synonyms
    if (synonyms.length === 0) {
      this.notifications.error('At least one synonym is required')
      return
    }

    this.dataService.mutate(createSynonymGroupDocument, { input: { synonyms } }).subscribe({
      next: () => {
        this.notifications.success('Synonym group created successfully')
        this.router.navigate(['/extensions', 'synonyms'])
      },
      error: (error) => {
        this.notifications.error(error.message || 'Failed to create synonym group')
      },
    })
  }

  update(): void {
    if (this.detailForm.invalid || !this.id) return

    const synonyms = this.synonyms
    if (synonyms.length === 0) {
      this.notifications.error('At least one synonym is required')
      return
    }

    this.dataService
      .mutate(updateSynonymGroupDocument, { input: { id: this.id, synonyms } })
      .subscribe({
        next: () => {
          this.notifications.success('Synonym group updated successfully')
          this.detailForm.markAsPristine()
        },
        error: (error) => {
          this.notifications.error(error.message || 'Failed to update synonym group')
        },
      })
  }

  goBack() {
    this.router.navigate(['/extensions', 'synonyms'])
  }

  onTagKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault()
      this.addTagFromInput()
    }
  }

  addTagFromInput() {
    const raw = this.newTag.trim()
    if (!raw) return
    if (raw.includes(',')) {
      this.notifications.error(this.translate.instant('synonyms.detail.comma-not-allowed'))
      return
    }
    if (!this.synonyms.includes(raw)) {
      this.synonyms = [...this.synonyms, raw]
      // Mark form as dirty to enable save button
      this.detailForm.markAsDirty()
    }
    this.newTag = ''
  }

  removeTag(index: number) {
    const value = this.synonyms[index]
    this.modalService
      .dialog({
        title: this.translate.instant('synonyms.detail.delete-tag-title'),
        body: this.translate.instant('synonyms.detail.delete-tag-body', { value }),
        buttons: [
          { type: 'secondary', label: this.translate.instant('synonyms.detail.delete-tag-cancel') },
          {
            type: 'danger',
            label: this.translate.instant('synonyms.detail.delete-tag-delete'),
            returnValue: true,
          },
        ],
      })
      .subscribe((confirmed) => {
        if (!confirmed) return
        this.synonyms = this.synonyms.filter((_, i) => i !== index)
        // Mark form as dirty to enable save button
        this.detailForm.markAsDirty()
      })
  }
}

// GraphQL documents
export const getSynonymGroupDetailDocument = graphql(`
  query SynonymGroup($id: ID!) {
    synonymGroup(id: $id) {
      id
      synonyms
      createdAt
      updatedAt
      languageCode
    }
  }
`)

const createSynonymGroupDocument = graphql(`
  mutation CreateSynonymGroup($input: CreateSynonymGroupInput!) {
    createSynonymGroup(input: $input) {
      id
    }
  }
`)

const updateSynonymGroupDocument = graphql(`
  mutation UpdateSynonymGroup($input: UpdateSynonymGroupInput!) {
    updateSynonymGroup(input: $input) {
      id
    }
  }
`)

const deleteSynonymGroupDocument = graphql(`
  mutation DeleteSynonymGroup($id: ID!) {
    deleteSynonymGroup(id: $id) {
      result
      message
    }
  }
`)
