import { SharedModule, getServerLocation } from '@vendure/admin-ui/core'
import { Component, ViewChild, ElementRef, ChangeDetectorRef, OnInit } from '@angular/core'
import { NotificationService, LocalStorageService } from '@vendure/admin-ui/core'
import { marker as _ } from '@biesbjerg/ngx-translate-extract-marker'
import { TranslateService } from '@ngx-translate/core'
import { endsWith, startsWith, size, uniq } from 'lodash'
import { AdminUiConfig } from '@vendure/common/lib/shared-types'
import { Channel, LanguageCode } from '@vendure/core'

type UpdatingStrategy = 'replace' | 'merge'

type ImportOptions = {
  updateProductSlug?: string
}

type ValidateReturnType = {
  isValid: boolean
  langCodes?: (string | undefined)[]
  clearFile?: boolean
}
export interface PluginInitOptions {
  visibleOptions?: Array<keyof ImportOptions>
  defaultOptions?: ImportOptions
}

@Component({
  selector: 'product-import',
  templateUrl: './product-import.component.html',
  standalone: true,
  imports: [SharedModule],
})
export class ProductImportComponent implements OnInit {
  serverPath: string
  validateFile: File | null = null
  selectedFile: File | null = null
  updateProductSlug = true
  selectedMainLanguage: LanguageCode | undefined
  availableLanguages: LanguageCode[] = []
  updatingStrategy: UpdatingStrategy = 'merge'

  @ViewChild('fileUpload', { static: false }) fileUploadElement: ElementRef<HTMLInputElement>

  config: PluginInitOptions
  appConfig: AdminUiConfig
  currentChannel: Channel

  constructor(
    private notificationService: NotificationService,
    private cd: ChangeDetectorRef,
    private translate: TranslateService,
    private localStorageService: LocalStorageService,
  ) {
    this.serverPath = getServerLocation()
  }

  async ngOnInit() {
    this.appConfig = await fetch('./vendure-ui-config.json').then((res) => res.json())

    this.config = await fetch(`${this.serverPath}/product-import-export/config`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })
      .then((res) => res.json())
      .then((data) => data.importOptions)
  }

  doValidation(file: File): void {
    this.validateCsvStructure(file).then(({ isValid, langCodes, clearFile = true }) => {
      if (isValid) {
        this.selectedFile = file
      } else if (clearFile) {
        this.clearFile()
      }

      if (langCodes && !this.selectedMainLanguage) {
        this.availableLanguages = langCodes.filter((code) => code) as LanguageCode[]
        this.selectedMainLanguage =
          size(this.availableLanguages) === 1
            ? (this.availableLanguages?.[0] as LanguageCode)
            : undefined
      }

      this.cd.detectChanges()
    })
  }

  onMainLanguageChange() {
    this.cd.detectChanges()

    if (this.validateFile) {
      this.doValidation(this.validateFile)
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement
    if (input.files && input.files.length > 0) {
      const file = input.files[0]
      if (file.type !== 'text/csv') {
        this.notificationService.error(
          this.translate.instant('product-import.notifications.invalid-file-type'),
        )
        this.clearFile()
        return
      }

      this.validateFile = file

      this.doValidation(file)
    }
  }

  clearFile(): void {
    this.fileUploadElement.nativeElement.value = ''
    this.selectedFile = null
    this.validateFile = null
    this.selectedMainLanguage = undefined
    this.updatingStrategy = 'merge'
  }

  async validateCsvStructure(file: File): Promise<ValidateReturnType> {
    const baseColumns = ['sku']

    const optionalColumns = [
      'assets',
      'price',
      'taxCategory',
      'stockOnHand',
      'trackInventory',
      'variantAssets',
    ]

    const translatableBaseColumns = ['name']

    const translatableColumns = [
      'slug',
      'description',
      'facets',
      'optionGroups',
      'optionValues',
      'variantFacets',
    ]

    return new Promise<ValidateReturnType>((resolve) => {
      const reader = new FileReader()
      reader.onload = async (e) => {
        const text = e.target?.result as string
        const lines = text.split('\n')

        // Remove empty lines
        lines.forEach((line, index) => {
          if (line.trim() === '') {
            lines.splice(index, 1)
          }
        })

        // Check if number of columns for each line is consistent and the same as headers
        const headerLength = this.splitLines(lines[0]).length
        const inconsistentLines = lines.filter(
          (line) => this.splitLines(line).length !== headerLength,
        )

        if (inconsistentLines.length > 0) {
          console.log('Inconsistent number of columns in the CSV file.')
          this.notificationService.error(
            this.translate.instant('product-import.notifications.inconsistent-columns'),
          )
          resolve({ isValid: false })
          return
        }

        if (lines.length > 0) {
          const header = this.splitLines(lines[0]).map((col) => col.trim())
          console.log('CSV Header:', header)

          this.currentChannel = await fetch(`${this.serverPath}/product-import-export/channel`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              ...this.getRequestHeaders(),
            },
          })
            .then((res) => res.json())
            .then((data) => data)
          const availableLanguages = this.currentChannel.availableLanguageCodes

          // Extract all language codes from headers
          const languageCodes = header
            .map((col) => col.match(/:(\w{2})$/)?.[1])
            .filter((code, index, self) => code && self.indexOf(code) === index)

          console.log('Language Codes:', languageCodes)

          let validationLanguage = size(languageCodes) === 0 ? undefined : this.selectedMainLanguage

          if (!this.selectedMainLanguage && size(languageCodes) < 2) {
            validationLanguage = (languageCodes as LanguageCode[])?.[0]
          }

          if (!this.selectedMainLanguage && size(languageCodes) > 1) {
            console.log(
              'Multiple languages found in the CSV file. Please select the main language.',
            )
            resolve({ isValid: true, langCodes: languageCodes, clearFile: false })
            return
          }

          if (!this.selectedMainLanguage && size(languageCodes) === 0) {
            resolve({ isValid: true, langCodes: availableLanguages, clearFile: false })
            return
          }

          console.log('Validation language:', validationLanguage)

          // Check if csv-file includes languages that are not available in the system

          const missingLanguages = (languageCodes as LanguageCode[]).filter(
            (code) => !availableLanguages.includes(code),
          )
          if (missingLanguages.length > 0) {
            const missingLangs = missingLanguages.join(', ')
            console.log('Missing languages:', missingLangs)
            this.notificationService.error(
              `${this.translate.instant(
                'product-import.notifications.missing-languages',
              )} ${missingLangs}`,
            )
            resolve({ isValid: false })
            return
          }

          // Validate base columns
          const missingBaseColumns = baseColumns.filter((col) => !header.includes(col))
          const missingTranslatableBaseColumns = translatableBaseColumns.filter(
            (col) => !header.includes(validationLanguage ? `${col}:${validationLanguage}` : col),
          )

          const combinedMissingBaseColumns = [
            ...missingBaseColumns,
            ...missingTranslatableBaseColumns,
          ]
          if (combinedMissingBaseColumns.length > 0) {
            const missingColumns = combinedMissingBaseColumns.join(', ')
            console.log('Missing base columns:', missingColumns)
            this.notificationService.error(
              `${this.translate.instant(
                'product-import.notifications.missing-base-columns',
              )} ${missingColumns}`,
            )
            resolve({ isValid: false })
            return
          }

          const nameColumn = validationLanguage ? `name:${validationLanguage}` : 'name'

          // Get optionGroups and optionValues columns for the main language
          const optionGroupsColumn = validationLanguage ? `optionGroups:${validationLanguage}` : 'optionGroups'
          const optionValuesColumn = validationLanguage ? `optionValues:${validationLanguage}` : 'optionValues'

          const optionGroupsIndex = header.indexOf(optionGroupsColumn)
          const optionValuesIndex = header.indexOf(optionValuesColumn)

          // if (optionGroupsIndex === -1 || optionValuesIndex === -1) {
          //   console.log(
          //     `Missing optionGroups or optionValues columns for language: ${validationLanguage}`,
          //   )
          //   this.notificationService.error(
          //     `${this.translate.instant(
          //       'product-import.notifications.missing-option-columns',
          //     )} ${validationLanguage}`,
          //   )
          //   resolve({ isValid: false })
          //   return
          // }

          // Loop through each row to validate the option values
          let currentOptionGroupCount = 0

          for (let i = 1; i < lines.length; i++) {
            const row = this.splitLines(lines[i]).map((col) => col.trim())

            // Check if it's a product row (it has a 'name' field)
            const isProductRow = row[header.indexOf(nameColumn)]

            if (isProductRow) {
              // It's a new product row, get the option groups
              const optionGroups = (row[optionGroupsIndex]?.split('|') ?? []).filter(
                (group) => group !== '',
              )
              const optionValues = (row[optionValuesIndex]?.split('|') ?? []).filter(
                (value) => value !== '',
              )
              currentOptionGroupCount = optionGroups.length

              // Validate that the number of option values matches the number of option groups
              if (optionValues.length !== currentOptionGroupCount) {
                this.notificationService.error(
                  `${this.translate.instant(
                    'product-import.notifications.mismatched-option-values',
                  )} Row: ${i + 1}. Expected ${currentOptionGroupCount} option values but got ${optionValues.length}.`,
                )
                resolve({ isValid: false })
                return
              }
            } else {
              // It's a variant row, validate the option values
              const optionValues = (row[optionValuesIndex]?.split('|') ?? []).filter(
                (value) => value !== '',
              )

              // Validate that the number of option values matches the product's option groups
              if (optionValues.length !== currentOptionGroupCount) {
                this.notificationService.error(
                  `${this.translate.instant(
                    'product-import.notifications.mismatched-option-values',
                  )} Row: ${i + 1}. Expected ${currentOptionGroupCount} option values but got ${optionValues.length}. ${JSON.stringify(
                    optionValues,
                  )}`,
                )
                resolve({ isValid: false })
                return
              }
            }
          }

          console.log('All option values for the main language are valid.')

          // Check if a row contains JSON, if so check if it is valid. This should be done for all columns, not just translatable ones.
          for (let i = 1; i < lines.length; i++) {
            const row = this.splitLines(lines[i]).map((col) => col.trim())
            for (const col of header) {
              const colIndex = header.indexOf(col)
              if (colIndex !== -1 && row[colIndex]) {
                try {
                  const { isJson } = this.checkifJson(row[colIndex])
                  if (isJson) {
                    JSON.parse(
                      row[colIndex]
                        .trim()
                        .replace(/^"/, '')
                        .replace(/"$/, '')
                        .replace(/'/g, '"')
                        .replace(/\s+/g, ' ')
                        .replace(/,\s*'/g, ", '"),
                    )
                  }
                } catch (error) {
                  console.log(`Invalid JSON in column: ${col}, row: ${i + 1}`)
                  this.notificationService.error(
                    this.translate.instant('product-import.notifications.invalid-json', {
                      col,
                      row: i + 1,
                    }),
                  )
                  resolve({ isValid: false })
                  return
                }
              }
            }
          }
          console.log('All JSON values are valid.')

          const { errorRows: missingBaseTranslatableValuesRows } = this.checkTranslatabeColumns(
            lines,
            translatableBaseColumns,
            header,
            languageCodes,
          )

          if (missingBaseTranslatableValuesRows.length > 0) {
            console.log('Missing translation values in rows:', missingBaseTranslatableValuesRows)
            this.notificationService.error(
              `${this.translate.instant(
                'product-import.notifications.missing-main-language-name',
              )} Rows: ${uniq(missingBaseTranslatableValuesRows).join(', ')}`,
            )

            resolve({ isValid: false })
            return
          }

          // Check if all translatable columns have values for the main language
          const { errorRows, errorColumns } = this.checkTranslatabeColumns(
            lines,
            translatableColumns,
            header,
            languageCodes,
          )

          if (errorRows.length > 0) {
            console.log('Missing translation values in rows:', errorRows)
            this.notificationService.warning(
              `${this.translate.instant(
                'product-import.notifications.missing-translation-values',
              )} Rows: ${uniq(errorRows).join(', ')} Columns: ${uniq(errorColumns).join(', ')}`,
            )
          }

          resolve({ isValid: true, langCodes: languageCodes })
        } else {
          console.log('No lines in CSV file.')
          this.notificationService.error(
            this.translate.instant('product-import.notifications.no-lines-in-file'),
          )
          resolve({ isValid: false })
        }
      }
      reader.onerror = () => {
        console.log('Error reading file.')
        this.notificationService.error(
          this.translate.instant('product-import.notifications.file-read-error'),
        )
        resolve({ isValid: false })
      }
      reader.readAsText(file)
    })
  }

  async uploadFile(): Promise<void> {
    if (this.selectedFile && this.selectedMainLanguage && this.updatingStrategy) {
      const formData = new FormData()
      formData.append('file', this.selectedFile)
      formData.append('updateProductSlug', this.updateProductSlug.toString())
      formData.append('mainLanguage', this.selectedMainLanguage)
      formData.append('updatingStrategy', this.updatingStrategy)

      try {
        const res = await fetch(`${this.serverPath}/product-import/upload`, {
          method: 'POST',
          body: formData,
          headers: this.getRequestHeaders(),
        })

        if (res.ok) {
          this.clearFile()
          this.notificationService.success(
            this.translate.instant('product-import.notifications.upload-success'),
          )
          this.cd.detectChanges()
        } else {
          this.notificationService.error(
            this.translate.instant('product-import.notifications.upload-error'),
          )
        }
      } catch (error) {
        this.notificationService.error(
          this.translate.instant('product-import.notifications.upload-error'),
        )
      }
    } else {
      this.notificationService.error(
        this.translate.instant('product-import.notifications.no-file-selected'),
      )
    }
  }

  splitLines(text: string): string[] {
    // Split text by commas, but not if comma is inside double quotes
    const splittedText = text.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)

    return splittedText
  }

  checkifJson(text: string): {
    startsWithJson: boolean
    endsWithJson: boolean
    startChar: string
    endChar: string
    isJson?: boolean
  } {
    // Replace starting and ending double quotes if exists
    text = text.trim().replace(/^"/, '').replace(/"$/, '')

    return {
      startsWithJson: startsWith(text.trim(), '{') || startsWith(text.trim(), '['),
      endsWithJson: endsWith(text.trim(), '}') || endsWith(text.trim(), ']'),
      startChar: text.trim().charAt(0),
      endChar: text.trim().charAt(text.trim().length - 1),
      isJson:
        startsWith(text.trim(), '{') ||
        startsWith(text.trim(), '[') ||
        endsWith(text.trim(), '}') ||
        endsWith(text.trim(), ']'),
    }
  }

  getRequestHeaders(): Record<string, string> {
    const headers: Record<string, string> = {}
    const channelToken = this.localStorageService.get('activeChannelToken')
    const { tokenMethod, channelTokenKey } = this.appConfig

    if (channelToken) {
      headers[channelTokenKey ?? 'vendure-token'] = channelToken
    }
    if (tokenMethod === 'bearer') {
      const authToken = this.localStorageService.get('authToken')
      if (authToken) {
        headers.authorization = `Bearer ${authToken}`
      }
    }
    return headers
  }

  checkTranslatabeColumns(
    lines: string[],
    columns: string[],
    header: string[],
    languageCodes: (string | undefined)[],
  ): { errorRows: number[]; errorColumns: string[] } {
    const errorRows: number[] = []
    const errorColumns: string[] = []

    if (size(languageCodes) < 2) {
      console.log('Only one language found in the file.')
      return { errorRows, errorColumns }
    }

    for (let i = 1; i < lines.length; i++) {
      const row = this.splitLines(lines[i]).map((col) => col.trim())
      for (const baseColumn of columns) {
        const mainLanguageColumn = `${baseColumn}:${this.selectedMainLanguage}`
        const colIndex = header.indexOf(mainLanguageColumn)
        const mainLanguageValue = row[colIndex]
        const mainLanguageHasValue = mainLanguageValue !== undefined && mainLanguageValue !== ''

        if (mainLanguageHasValue) {
          continue
        }
        for (const lang of languageCodes) {
          if (lang) {
            // Check if lang is defined
            const langSpecificColumn = `${baseColumn}:${lang}`
            const colIndex = header.indexOf(langSpecificColumn)
            const colValue = row[colIndex]
            const colHasValue = colValue !== undefined && colValue !== ''

            if (!mainLanguageHasValue && colHasValue) {
              errorRows.push(i + 1)
              errorColumns.push(langSpecificColumn)
            }
          }
        }
      }
    }

    return { errorRows, errorColumns }
  }
}
