import { Component, ViewChild, ElementRef, AfterViewInit, OnInit } from '@angular/core'
import { Dialog } from '@vendure/admin-ui/core'
import { FormsModule } from '@angular/forms'
import { SharedModule } from '@vendure/admin-ui/core'
import { uniq } from 'lodash'

type ProductFields =
  | 'name'
  | 'slug'
  | 'description'
  | 'assets'
  | 'facets'
  | 'optionGroups'

type VariantFields =
  | 'sku'
  | 'optionValues'
  | 'price'
  | 'taxCategory'
  | 'stockOnHand'
  | 'trackInventory'
  | 'variantAssets'
  | 'variantFacets'
  | 'enabled'

type ExportFields = Array<ProductFields | VariantFields>
interface PluginInitOptions {
  defaultFileName?: string
  exportAssetsAsOptions?: Array<'url' | 'json'>
  defaultExportAssetsAs?: 'url' | 'json'
  defaultExportFields?: ExportFields
  requiredExportFields?: ExportFields
}

@Component({
  selector: 'vdr-export-dialog',
  templateUrl: './export-dialog.component.html',
  standalone: true,
  imports: [SharedModule, FormsModule],
})
export class ExportDialogComponent
  implements
    Dialog<{
      result: boolean
      fileName?: string
      selectedFields?: string[]
      exportAssetsAs?: 'url' | 'json'
      selectedExportFields?: ExportFields
    }>,
    AfterViewInit,
    OnInit
{
  private mandatoryOptionFields: Array<ProductFields | VariantFields> = ['optionGroups', 'optionValues']
  @ViewChild('fileNameInput', { static: false }) fileNameElement: ElementRef<HTMLInputElement>

  resolveWith: (result?: {
    result: boolean
    fileName?: string
    selectedFields?: string[]
    exportAssetsAs?: 'url' | 'json'
    selectedExportFields?: ExportFields
  }) => void
  selection: any[] = []
  fileName = ''
  customFields: string[] = []
  selectedFields: string[] = []
  exportAssetsAs: 'url' | 'json' = 'url'
  selectedExportFields: ExportFields = []
  availableExportFields: ExportFields = [
    'name',
    'slug',
    'description',
    'assets',
    'facets',
    'optionGroups',
    'sku',
    'optionValues',
    'price',
    'taxCategory',
    'stockOnHand',
    'trackInventory',
    'variantAssets',
    'variantFacets',
    'enabled',
  ]

  config: PluginInitOptions
  toggleAllChecked = false

  ngOnInit(): void {
    this.selectedFields = [...this.customFields]
    if (this.config.defaultExportAssetsAs?.includes(this.config.defaultExportAssetsAs)) {
      this.exportAssetsAs = this.config.defaultExportAssetsAs
    } else {
      this.exportAssetsAs = this.config.exportAssetsAsOptions?.[0] || 'url'
    }

    this.selectedExportFields = uniq([
      ...(this.config.defaultExportFields || []),
      ...(this.config.requiredExportFields || []),
      ...this.mandatoryOptionFields,
    ])
  }

  ngAfterViewInit(): void {
    if (this.fileNameElement) {
      setTimeout(() => {
        this.fileNameElement.nativeElement.focus()
      }, 0)
    }
  }

  export() {
    this.fileName = this.fileName?.trim()
    this.resolveWith({
      result: true,
      fileName: this.fileName,
      selectedFields: this.selectedFields,
      exportAssetsAs: this.exportAssetsAs,
      selectedExportFields: this.selectedExportFields,
    })
  }

  cancel() {
    this.resolveWith({ result: false })
  }

  toggleFieldSelection(fieldName: string) {
    const index = this.selectedFields.indexOf(fieldName)
    if (index > -1) {
      this.selectedFields.splice(index, 1)
    } else {
      this.selectedFields.push(fieldName)
    }

    this.toggleAllChecked = this.selectedFields.length === this.availableExportFields.length
  }

  toggleExportFieldSelection(fieldName: ProductFields | VariantFields) {
    if (this.mandatoryOptionFields.includes(fieldName)) {
      return
    }
    const index = this.selectedExportFields.indexOf(fieldName)
    if (index > -1) {
      this.selectedExportFields.splice(index, 1)
    } else {
      this.selectedExportFields.push(fieldName)
    }

    this.toggleAllChecked = this.selectedExportFields.length === this.availableExportFields.length
  }

  toggleSelectAll(event: Event) {
    const isChecked = (event.target as HTMLInputElement).checked
    this.toggleAllChecked = isChecked
    if (isChecked) {
      this.selectedExportFields = [...this.availableExportFields]
      this.selectedFields = [...this.customFields]
    } else {
      this.selectedExportFields = [
        ...this.availableExportFields.filter((field) =>
          this.config.requiredExportFields?.includes(field),
        ),
        ...this.mandatoryOptionFields,
      ]
      this.selectedFields = []
    }
  }

  isMandatoryExportField(field: ProductFields | VariantFields): boolean {
    return this.mandatoryOptionFields.includes(field)
  }
}
