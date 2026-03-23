import { Button, Switch, Label, RadioGroup, RadioGroupItem } from '@vendure/dashboard'
import { UploadIcon } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import { LanguageCode, Channel } from '@vendure/core'
import { size, startsWith, endsWith, uniq } from 'lodash-es'
import {
  getServerLocation,
  getChannelHeader,
  type UpdatingStrategy,
  type ValidateReturnType,
  type PluginInitOptions,
} from './utils'

// Import page component
export function ProductImportBlock() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [validateFile, setValidateFile] = useState<File | null>(null)
  const [updateProductSlug, setUpdateProductSlug] = useState(true)
  const [selectedMainLanguage, setSelectedMainLanguage] = useState<LanguageCode | undefined>()
  const [availableLanguages, setAvailableLanguages] = useState<LanguageCode[]>([])
  const [updatingStrategy, setUpdatingStrategy] = useState<UpdatingStrategy>('merge')
  const [config, setConfig] = useState<PluginInitOptions | null>(null)
  const [currentChannel, setCurrentChannel] = useState<Channel | null>(null)

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const serverPath = getServerLocation()
        const [configRes, channelRes] = await Promise.all([
          fetch(`${serverPath}/product-import-export/config`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              ...getChannelHeader(),
            },
            credentials: 'include',
          }),
          fetch(`${serverPath}/product-import-export/channel`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              ...getChannelHeader(),
            },
            credentials: 'include',
          }),
        ])

        const configData = await configRes.json()
        const channelData = await channelRes.json()
        setConfig(configData.importOptions)
        setCurrentChannel(channelData)
        if (configData.importOptions?.defaultOptions?.updateProductSlug !== undefined) {
          setUpdateProductSlug(configData.importOptions.defaultOptions.updateProductSlug)
        }
      } catch (error) {
        console.error('Failed to fetch config:', error)
      }
    }

    fetchConfig()
  }, [])

  const splitLines = (text: string): string[] => {
    return text.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
  }

  const checkifJson = (
    text: string,
  ): {
    startsWithJson: boolean
    endsWithJson: boolean
    startChar: string
    endChar: string
    isJson?: boolean
  } => {
    // Replace starting and ending double quotes if exists
    const trimmedText = text.trim().replace(/^"/, '').replace(/"$/, '')

    return {
      startsWithJson: startsWith(trimmedText, '{') || startsWith(trimmedText, '['),
      endsWithJson: endsWith(trimmedText, '}') || endsWith(trimmedText, ']'),
      startChar: trimmedText.charAt(0),
      endChar: trimmedText.charAt(trimmedText.length - 1),
      isJson:
        startsWith(trimmedText, '{') ||
        startsWith(trimmedText, '[') ||
        endsWith(trimmedText, '}') ||
        endsWith(trimmedText, ']'),
    }
  }

  const checkTranslatabeColumns = (
    lines: string[],
    columns: string[],
    header: string[],
    languageCodes: (string | undefined)[],
    mainLanguage?: LanguageCode,
  ): { errorRows: number[]; errorColumns: string[] } => {
    const errorRows: number[] = []
    const errorColumns: string[] = []

    if (size(languageCodes) < 2 || !mainLanguage) {
      return { errorRows, errorColumns }
    }

    for (let i = 1; i < lines.length; i++) {
      const row = splitLines(lines[i]).map((col) => col.trim())
      for (const baseColumn of columns) {
        const mainLanguageColumn = `${baseColumn}:${mainLanguage}`
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
            const langColIndex = header.indexOf(langSpecificColumn)
            const colValue = row[langColIndex]
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

  const validateCsvStructure = async (file: File): Promise<ValidateReturnType> => {
    const baseColumns = ['sku']
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
        const lines = text.split('\n').filter((line) => line.trim() !== '')

        if (lines.length === 0) {
          toast.error('The file is empty.')
          resolve({ isValid: false })
          return
        }

        const headerLength = splitLines(lines[0]).length
        const inconsistentLines = lines.filter((line) => splitLines(line).length !== headerLength)

        if (inconsistentLines.length > 0) {
          toast.error(
            'The columns in the file are inconsistent. Please ensure all rows have the same number of columns.',
          )
          resolve({ isValid: false })
          return
        }

        const header = splitLines(lines[0]).map((col) => col.trim())

        // Fetch channel if not already loaded (matches Angular implementation)
        let channel = currentChannel
        if (!channel) {
          try {
            const serverPath = getServerLocation()
            const channelRes = await fetch(`${serverPath}/product-import-export/channel`, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                ...getChannelHeader(),
              },
              credentials: 'include',
            })
            channel = await channelRes.json()
            // Update state for next time
            setCurrentChannel(channel)
          } catch (error) {
            console.error('Failed to fetch channel:', error)
            toast.error('Failed to fetch channel information.')
            resolve({ isValid: false })
            return
          }
        }

        const availableLanguages = channel?.availableLanguageCodes || []

        const languageCodes = header
          .map((col) => col.match(/:(\w{2})$/)?.[1])
          .filter((code, index, self) => code && self.indexOf(code) === index)

        let validationLanguage = languageCodes.length === 0 ? undefined : selectedMainLanguage

        if (!selectedMainLanguage && languageCodes.length < 2) {
          validationLanguage = (languageCodes as LanguageCode[])?.[0]
        }

        if (!selectedMainLanguage && languageCodes.length > 1) {
          resolve({ isValid: true, langCodes: languageCodes, clearFile: false })
          return
        }

        if (!selectedMainLanguage && languageCodes.length === 0) {
          // No language codes in CSV, return channel languages so user can select
          resolve({
            isValid: true,
            langCodes: availableLanguages.map((lang) => lang) as (string | undefined)[],
            clearFile: false,
          })
          return
        }

        const missingLanguages = (languageCodes as LanguageCode[]).filter(
          (code) => !availableLanguages.includes(code),
        )
        if (missingLanguages.length > 0) {
          toast.error(
            `Your CSV file contains languages that are not available in this channel. Please add the languages to the channel or remove the languages that are not used and try again. Missing: ${missingLanguages.join(', ')}`,
          )
          resolve({ isValid: false })
          return
        }

        const missingBaseColumns = baseColumns.filter((col) => !header.includes(col))
        const missingTranslatableBaseColumns = translatableBaseColumns.filter(
          (col) => !header.includes(validationLanguage ? `${col}:${validationLanguage}` : col),
        )

        const combinedMissingBaseColumns = [
          ...missingBaseColumns,
          ...missingTranslatableBaseColumns,
        ]
        if (combinedMissingBaseColumns.length > 0) {
          toast.error(`Some columns are missing: ${combinedMissingBaseColumns.join(', ')}`)
          resolve({ isValid: false })
          return
        }

        const nameColumn = validationLanguage ? `name:${validationLanguage}` : 'name'

        // Get optionGroups and optionValues columns for the main language
        const optionGroupsColumn = validationLanguage
          ? `optionGroups:${validationLanguage}`
          : 'optionGroups'
        const optionValuesColumn = validationLanguage
          ? `optionValues:${validationLanguage}`
          : 'optionValues'

        const optionGroupsIndex = header.indexOf(optionGroupsColumn)
        const optionValuesIndex = header.indexOf(optionValuesColumn)

        // Loop through each row to validate the option values
        let currentOptionGroupCount = 0

        for (let i = 1; i < lines.length; i++) {
          const row = splitLines(lines[i]).map((col) => col.trim())

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
              toast.error(
                `Some product variants are missing product options. Please fill in all options: Row: ${i + 1}. Expected ${currentOptionGroupCount} option values but got ${optionValues.length}.`,
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
              toast.error(
                `Some product variants are missing product options. Please fill in all options: Row: ${i + 1}. Expected ${currentOptionGroupCount} option values but got ${optionValues.length}.`,
              )
              resolve({ isValid: false })
              return
            }
          }
        }

        // Check if a row contains JSON, if so check if it is valid. This should be done for all columns, not just translatable ones.
        for (let i = 1; i < lines.length; i++) {
          const row = splitLines(lines[i]).map((col) => col.trim())
          for (const col of header) {
            const colIndex = header.indexOf(col)
            if (colIndex !== -1 && row[colIndex]) {
              try {
                const { isJson } = checkifJson(row[colIndex])
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
              } catch (error: unknown) {
                console.error('Invalid JSON:', error)
                toast.error(
                  `Invalid JSON structure. Please upload a correct JSON file. Column: ${col}, Row: ${i + 1}`,
                )
                resolve({ isValid: false })
                return
              }
            }
          }
        }

        // Check for missing translation values in translatable base columns
        const { errorRows: missingBaseTranslatableValuesRows } = checkTranslatabeColumns(
          lines,
          translatableBaseColumns,
          header,
          languageCodes,
          selectedMainLanguage,
        )

        if (missingBaseTranslatableValuesRows.length > 0) {
          toast.error(
            `Main language is missing for name. Please add the main language and try again. Rows: ${uniq(missingBaseTranslatableValuesRows).join(', ')}`,
          )
          resolve({ isValid: false })
          return
        }

        // Check if all translatable columns have values for the main language
        const { errorRows, errorColumns } = checkTranslatabeColumns(
          lines,
          translatableColumns,
          header,
          languageCodes,
          selectedMainLanguage,
        )

        if (errorRows.length > 0) {
          toast.warning(
            `Some fields are missing translations for the main language that exist in other languages. These will not be imported. Rows: ${uniq(errorRows).join(', ')} Columns: ${uniq(errorColumns).join(', ')}`,
          )
        }

        resolve({ isValid: true, langCodes: languageCodes })
      }

      reader.onerror = (error) => {
        console.error('FileReader error:', error)
        toast.error('An error occurred while reading the file.')
        resolve({ isValid: false })
      }

      reader.readAsText(file)
    })
  }

  const doValidation = async (file: File) => {
    const { isValid, langCodes, clearFile = true } = await validateCsvStructure(file)
    if (isValid) {
      setSelectedFile(file)
    } else if (clearFile) {
      clearFileHandler()
      return
    } else {
      // File is valid but needs language selection
      setSelectedFile(file)
    }

    // Set available languages - either from CSV or from channel
    if (langCodes && langCodes.length > 0) {
      const filteredLangCodes = langCodes.filter((code) => code) as LanguageCode[]
      setAvailableLanguages(filteredLangCodes)
      if (!selectedMainLanguage) {
        setSelectedMainLanguage(filteredLangCodes.length === 1 ? filteredLangCodes[0] : undefined)
      }
    } else if (
      currentChannel?.availableLanguageCodes &&
      currentChannel.availableLanguageCodes.length > 0
    ) {
      // No languages in CSV headers, use channel languages as fallback
      setAvailableLanguages(currentChannel.availableLanguageCodes)
      if (!selectedMainLanguage) {
        setSelectedMainLanguage(
          currentChannel.availableLanguageCodes.length === 1
            ? currentChannel.availableLanguageCodes[0]
            : undefined,
        )
      }
    }
  }

  const onFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target
    if (input.files && input.files.length > 0) {
      const file = input.files[0]
      if (file.type !== 'text/csv') {
        toast.error('Invalid file type. Please upload a CSV file.')
        clearFileHandler()
        return
      }

      setValidateFile(file)
      doValidation(file)
    }
  }

  const clearFileHandler = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    setSelectedFile(null)
    setValidateFile(null)
    setSelectedMainLanguage(undefined)
    setUpdatingStrategy('merge')
  }

  const onMainLanguageChange = (lang: LanguageCode) => {
    setSelectedMainLanguage(lang)
    if (validateFile) {
      doValidation(validateFile)
    }
  }

  const uploadFile = async () => {
    if (selectedFile && selectedMainLanguage && updatingStrategy) {
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('updateProductSlug', updateProductSlug.toString())
      formData.append('mainLanguage', selectedMainLanguage)
      formData.append('updatingStrategy', updatingStrategy)

      try {
        const serverPath = getServerLocation()
        const res = await fetch(`${serverPath}/product-import/upload`, {
          method: 'POST',
          body: formData,
          headers: {
            ...getChannelHeader(),
          },
          credentials: 'include',
        })

        if (res.ok) {
          clearFileHandler()
          toast.success('The file was uploaded and has been added to the import queue.')
        } else {
          toast.error('An error occurred while uploading the file.')
        }
      } catch (error: unknown) {
        console.error('Upload error:', error)
        toast.error('An error occurred while uploading the file.')
      }
    } else {
      toast.error('No file selected or main language not selected.')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Label htmlFor="file-upload">Upload CSV file</Label>
        <div className="flex items-center gap-2 mt-2">
          <input
            ref={fileInputRef}
            type="file"
            id="file-upload"
            accept=".csv"
            onChange={onFileSelected}
            className="hidden"
          />
          {selectedFile ? (
            <>
              <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                <UploadIcon className="mr-2 h-4 w-4" />
                {selectedFile.name}
              </Button>
              <Button type="button" onClick={uploadFile} disabled={!selectedMainLanguage}>
                Upload file
              </Button>
            </>
          ) : (
            <Button type="button" variant="default" onClick={() => fileInputRef.current?.click()}>
              <UploadIcon className="mr-2 h-4 w-4" />
              Select file
            </Button>
          )}
        </div>
      </div>

      {selectedFile && (
        <div className="space-y-4 pt-4 border-t">
          {config?.visibleOptions?.includes('updateProductSlug') && (
            <div className="flex items-center space-x-2">
              <Switch
                id="update-slug"
                checked={updateProductSlug}
                onCheckedChange={setUpdateProductSlug}
              />
              <Label htmlFor="update-slug">Update product slugs based on name</Label>
            </div>
          )}

          <div>
            <Label>Select main language:</Label>
            <RadioGroup
              value={selectedMainLanguage || ''}
              onValueChange={(val) => onMainLanguageChange(val as LanguageCode)}
            >
              <div className="flex flex-col gap-2 mt-2">
                {availableLanguages.map((lang) => (
                  <div key={lang} className="flex items-center space-x-2">
                    <RadioGroupItem value={lang} id={`lang-${lang}`} />
                    <Label htmlFor={`lang-${lang}`} className="font-normal">
                      {lang}
                    </Label>
                  </div>
                ))}
              </div>
            </RadioGroup>
            <p className="text-sm text-muted-foreground mt-2 italic">
              The main language is used as a fallback when translations are missing. It is
              recommended to select the language that is used the most in your system.
            </p>
          </div>

          <div>
            <Label>Strategy for facets and assets:</Label>
            <RadioGroup
              value={updatingStrategy}
              onValueChange={(val) => setUpdatingStrategy(val as UpdatingStrategy)}
            >
              <div className="flex items-center space-x-2 mt-2">
                <RadioGroupItem value="merge" id="merge" />
                <Label htmlFor="merge" className="font-normal">
                  Merge
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="replace" id="replace" />
                <Label htmlFor="replace" className="font-normal">
                  Overwrite
                </Label>
              </div>
            </RadioGroup>
            {updatingStrategy === 'replace' && (
              <p className="text-sm text-red-600 mt-2">
                Warning: This will remove existing facets and assets from products and variants.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
