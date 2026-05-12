import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Checkbox,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  toast,
} from '@vendure/dashboard'
import { ChevronRight } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  forwardRef,
  useState,
} from 'react'
import {
  getServerLocation,
  getChannelHeader,
  type PluginInitOptions,
  type ExportFields,
  type ProductFields,
  type VariantFields,
} from './utils'

const MANDATORY_OPTION_FIELDS: Array<ProductFields | VariantFields> = [
  'optionGroups',
  'optionValues',
]

const AVAILABLE_EXPORT_FIELDS: ExportFields = [
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

export type ExportConfigurationPanelProps = {
  /** Selected product IDs for scoped export; omit when `isExportAll` (treated as empty). */
  productIds?: string[]
  isExportAll: boolean
  /** Fetch config + fields only while true (e.g. dialog `open`) */
  active: boolean
  /** Prefix for input/checkbox ids so modal vs page never collide */
  idPrefix?: string
  /** Expand “Select fields to export” on first paint (e.g. modal); inline page keeps it collapsed */
  fieldsAccordionDefaultOpen?: boolean
  onExportSuccess?: () => void
}

export type ExportConfigurationPanelHandle = {
  submitExport: () => Promise<void>
}

export const ExportConfigurationPanel = forwardRef<
  ExportConfigurationPanelHandle,
  ExportConfigurationPanelProps
>(function ExportConfigurationPanel(
  {
    productIds,
    isExportAll,
    active,
    idPrefix = 'export-config',
    fieldsAccordionDefaultOpen = false,
    onExportSuccess,
  },
  ref,
) {
  const resolvedProductIds = productIds ?? []

  const [config, setConfig] = useState<PluginInitOptions['exportOptions'] | null>(null)

  const [fileName, setFileName] = useState('')
  const [customFieldNames, setCustomFieldNames] = useState<string[]>([])
  const [selectedCustomFields, setSelectedCustomFields] = useState<string[]>([])
  const [exportAssetsAs, setExportAssetsAs] = useState<'url' | 'json'>('url')
  const [selectedExportFields, setSelectedExportFields] = useState<ExportFields>([])
  const [toggleAllChecked, setToggleAllChecked] = useState(false)

  /** Stable primitive so effects / callbacks don’t churn on fresh array references with the same IDs. */
  const productIdsFetchKey = resolvedProductIds.join(',')

  useEffect(() => {
    if (!active) return

    const fetchInitial = async () => {
      try {
        const serverPath = getServerLocation()
        const [configRes, customFieldsRes] = await Promise.all([
          fetch(`${serverPath}/product-import-export/config`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              ...getChannelHeader(),
            },
            credentials: 'include',
          }),
          fetch(`${serverPath}/product-export/custom-fields`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...getChannelHeader(),
            },
            credentials: 'include',
            body: JSON.stringify(
              resolvedProductIds.length > 0 ? resolvedProductIds : [],
            ),
          }),
        ])

        const configData = await configRes.json()
        const customFieldsData = await customFieldsRes.json()

        setConfig(configData.exportOptions)

        const names = customFieldsData.map((field: { name: string }) => field.name)
        setCustomFieldNames(names)
        setSelectedCustomFields([...names])

        const defaultAssets =
          configData.exportOptions?.defaultExportAssetsAs ||
          configData.exportOptions?.exportAssetsAsOptions?.[0] ||
          'url'
        setExportAssetsAs(defaultAssets)

        const initialExportFields = Array.from(
          new Set([
            ...(configData.exportOptions?.defaultExportFields || []),
            ...(configData.exportOptions?.requiredExportFields || []),
            ...MANDATORY_OPTION_FIELDS,
          ]),
        ) as ExportFields

        setSelectedExportFields(initialExportFields)
      } catch (error) {
        console.error('Failed to fetch export config:', error)
      }
    }

    fetchInitial()
  }, [active, productIdsFetchKey])

  const derivedToggleAll = useMemo(() => {
    const allStandard = AVAILABLE_EXPORT_FIELDS.every((f) => selectedExportFields.includes(f))
    const allCustom =
      customFieldNames.length === 0 ||
      customFieldNames.every((f) => selectedCustomFields.includes(f))
    return allStandard && allCustom
  }, [selectedExportFields, selectedCustomFields, customFieldNames])

  useEffect(() => {
    setToggleAllChecked(derivedToggleAll)
  }, [derivedToggleAll])

  const toggleCustomField = (fieldName: string) => {
    setSelectedCustomFields((prev) =>
      prev.includes(fieldName) ? prev.filter((f) => f !== fieldName) : [...prev, fieldName],
    )
  }

  const toggleExportField = (fieldName: ProductFields | VariantFields) => {
    if (MANDATORY_OPTION_FIELDS.includes(fieldName)) return
    setSelectedExportFields((prev) =>
      prev.includes(fieldName)
        ? prev.filter((f) => f !== fieldName)
        : [...prev, fieldName],
    )
  }

  const toggleSelectAll = (checked: boolean) => {
    setToggleAllChecked(checked)
    if (checked) {
      setSelectedExportFields([...AVAILABLE_EXPORT_FIELDS])
      setSelectedCustomFields([...customFieldNames])
    } else {
      setSelectedExportFields([
        ...(config?.requiredExportFields || []),
        ...MANDATORY_OPTION_FIELDS,
      ])
      setSelectedCustomFields([])
    }
  }

  const bothAssetModes =
    config?.exportAssetsAsOptions?.includes('url') &&
    config?.exportAssetsAsOptions?.includes('json')

  const submitExport = useCallback(async () => {
    try {
      const serverPath = getServerLocation()
      const trimmed = fileName.trim()
      const finalFileName = trimmed || config?.defaultFileName || 'products_export.csv'
      const endpoint = isExportAll ? 'export-all' : 'export'
      const body = isExportAll ? undefined : JSON.stringify(resolvedProductIds)

      const res = await fetch(
        `${serverPath}/product-export/${endpoint}?fileName=${encodeURIComponent(
          finalFileName,
        )}&customFields=${encodeURIComponent(
          selectedCustomFields.join(','),
        )}&exportAssetsAs=${exportAssetsAs}&selectedExportFields=${encodeURIComponent(
          selectedExportFields.join(','),
        )}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getChannelHeader(),
          },
          credentials: 'include',
          ...(body && { body }),
        },
      )

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.message || 'Export failed')
      }

      toast.success(
        isExportAll
          ? 'Export queued. You will receive an email when the file is ready.'
          : `Export job queued successfully. ${resolvedProductIds.length} products will be exported.`,
      )
      onExportSuccess?.()
    } catch (error: unknown) {
      console.error(error)
      toast.error((error as Error)?.message || 'Failed to queue export')
    }
  }, [
    fileName,
    config?.defaultFileName,
    isExportAll,
    productIdsFetchKey,
    selectedCustomFields,
    exportAssetsAs,
    selectedExportFields,
    onExportSuccess,
  ])

  useImperativeHandle(ref, () => ({ submitExport }), [submitExport])

  if (!active) {
    return null
  }

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor={`${idPrefix}-file-name`}>File name (optional)</Label>
        <p className="text-xs text-muted-foreground mt-1">
          A timestamp is added automatically for uniqueness.
        </p>
        <Input
          id={`${idPrefix}-file-name`}
          value={fileName}
          onChange={(e) => setFileName(e.target.value)}
          placeholder={config?.defaultFileName || 'products_export.csv'}
          className="mt-2"
        />
      </div>

      <Accordion
        className="border rounded-lg px-3"
        defaultValue={
          fieldsAccordionDefaultOpen ? ['select-fields'] : ([] as string[])
        }
      >
        <AccordionItem value="select-fields" className="border-0">
          <AccordionTrigger className="group/trigger flex w-full items-center gap-3 py-3 text-sm hover:no-underline [&>svg:last-child]:size-4 [&>svg:last-child]:shrink-0 [&>svg:last-child]:self-center">
            <ChevronRight className="text-primary size-4 shrink-0 self-center transition-transform duration-200 group-data-[state=open]/trigger:rotate-90" />
            <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1 self-center text-left leading-snug">
              <span className="font-medium text-foreground">Configure fields to export</span>
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4 pt-4 border-t border-border">
            <div className="flex items-center space-x-2 pt-2">
              <Checkbox
                id={`${idPrefix}-select-all`}
                checked={toggleAllChecked}
                onCheckedChange={(checked) => toggleSelectAll(checked === true)}
              />
              <Label htmlFor={`${idPrefix}-select-all`} className="font-normal">
                Select all fields
              </Label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {AVAILABLE_EXPORT_FIELDS.map((field) => (
                <div key={field} className="flex items-center space-x-2">
                  <Checkbox
                    id={`${idPrefix}-field-${field}`}
                    checked={selectedExportFields.includes(field)}
                    onCheckedChange={() => toggleExportField(field)}
                    disabled={
                      config?.requiredExportFields?.includes(field) ||
                      MANDATORY_OPTION_FIELDS.includes(field)
                    }
                  />
                  <Label htmlFor={`${idPrefix}-field-${field}`} className="font-normal">
                    {field}
                  </Label>
                </div>
              ))}
            </div>

            {customFieldNames.length > 0 && (
              <div className="space-y-2 pt-4 border-t">
                <Label className="text-muted-foreground pb-2">Custom fields</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {customFieldNames.map((field) => (
                    <div key={field} className="flex items-center space-x-2">
                      <Checkbox
                        id={`${idPrefix}-custom-${field}`}
                        checked={selectedCustomFields.includes(field)}
                        onCheckedChange={() => toggleCustomField(field)}
                      />
                      <Label htmlFor={`${idPrefix}-custom-${field}`} className="font-normal">
                        {field}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {bothAssetModes ? (
        <Accordion className="border rounded-lg px-3" defaultValue={[]}>
          <AccordionItem value="advanced-settings" className="border-0">
            <AccordionTrigger className="group/trigger flex w-full items-center gap-3 py-3 text-sm hover:no-underline [&>svg:last-child]:size-4 [&>svg:last-child]:shrink-0 [&>svg:last-child]:self-center">
              <ChevronRight className="text-primary size-4 shrink-0 self-center transition-transform duration-200 group-data-[state=open]/trigger:rotate-90" />
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1 self-center text-left leading-snug">
                <span className="font-medium text-foreground">Advanced settings</span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pb-4 pt-4 border-t border-border">
              <div className="flex flex-row flex-wrap items-center gap-x-6 gap-y-2 pt-2">
                <Label className="shrink-0">Export assets as</Label>
                <RadioGroup
                  value={exportAssetsAs}
                  onValueChange={(val) => setExportAssetsAs(val as 'url' | 'json')}
                  className="flex flex-row flex-wrap gap-6"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="url" id={`${idPrefix}-assets-url`} />
                    <Label htmlFor={`${idPrefix}-assets-url`} className="font-normal">
                      URL only
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="json" id={`${idPrefix}-assets-json`} />
                    <Label htmlFor={`${idPrefix}-assets-json`} className="font-normal">
                      Full JSON
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      ) : null}
    </div>
  )
})

ExportConfigurationPanel.displayName = 'ExportConfigurationPanel'
