import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  Checkbox,
} from '@vendure/dashboard'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import {
  getServerLocation,
  getChannelHeader,
  type PluginInitOptions,
  type ExportFields,
  type ProductFields,
  type VariantFields,
} from './utils'

interface ExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  productIds: string[]
  isExportAll?: boolean
}

export function ExportDialog({
  open,
  onOpenChange,
  productIds,
  isExportAll = false,
}: ExportDialogProps) {
  const mandatoryOptionFields: Array<ProductFields | VariantFields> = ['optionGroups', 'optionValues']
  const [fileName, setFileName] = useState('')
  const [customFields, setCustomFields] = useState<string[]>([])
  const [selectedFields, setSelectedFields] = useState<string[]>([])
  const [exportAssetsAs, setExportAssetsAs] = useState<'url' | 'json'>('url')
  const [selectedExportFields, setSelectedExportFields] = useState<ExportFields>([])
  const [availableExportFields] = useState<ExportFields>([
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
  ])
  const [config, setConfig] = useState<PluginInitOptions['exportOptions'] | null>(null)
  const [toggleAllChecked, setToggleAllChecked] = useState(false)

  useEffect(() => {
    const fetchConfig = async () => {
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
            body: JSON.stringify(productIds.length > 0 ? productIds : []),
          }),
        ])

        const configData = await configRes.json()
        const customFieldsData = await customFieldsRes.json()

        setConfig(configData.exportOptions)
        setCustomFields(customFieldsData.map((field: { name: string }) => field.name))
        setSelectedFields([...customFieldsData.map((field: { name: string }) => field.name)])
        setExportAssetsAs(
          configData.exportOptions?.defaultExportAssetsAs ||
            configData.exportOptions?.exportAssetsAsOptions?.[0] ||
            'url',
        )
        if (
          configData.exportOptions?.defaultExportFields ||
          configData.exportOptions?.requiredExportFields
        ) {
          setSelectedExportFields(
            Array.from(
              new Set([
                ...(configData.exportOptions.defaultExportFields || []),
                ...(configData.exportOptions.requiredExportFields || []),
                ...mandatoryOptionFields,
              ]),
            ) as ExportFields,
          )
        }
      } catch (error) {
        console.error('Failed to fetch config:', error)
      }
    }

    if (open) {
      fetchConfig()
    }
  }, [open, productIds])

  const toggleFieldSelection = (fieldName: string) => {
    setSelectedFields((prev) =>
      prev.includes(fieldName) ? prev.filter((f) => f !== fieldName) : [...prev, fieldName],
    )
  }

  const toggleExportFieldSelection = (fieldName: ProductFields | VariantFields) => {
    if (mandatoryOptionFields.includes(fieldName)) {
      return
    }
    setSelectedExportFields((prev) =>
      prev.includes(fieldName) ? prev.filter((f) => f !== fieldName) : [...prev, fieldName],
    )
  }

  const toggleSelectAll = (checked: boolean) => {
    setToggleAllChecked(checked)
    if (checked) {
      setSelectedExportFields([...availableExportFields])
      setSelectedFields([...customFields])
    } else {
      setSelectedExportFields([
        ...(config?.requiredExportFields || []),
        ...mandatoryOptionFields,
      ])
      setSelectedFields([])
    }
  }

  const handleExport = async () => {
    const trimmedFileName = fileName.trim()
    const finalFileName = trimmedFileName || config?.defaultFileName || 'products_export.csv'

    try {
      const serverPath = getServerLocation()
      const endpoint = isExportAll ? 'export-all' : 'export'
      const body = isExportAll ? undefined : JSON.stringify(productIds)

      const res = await fetch(
        `${serverPath}/product-export/${endpoint}?fileName=${encodeURIComponent(finalFileName)}&customFields=${encodeURIComponent(selectedFields.join(','))}&exportAssetsAs=${exportAssetsAs}&selectedExportFields=${encodeURIComponent(selectedExportFields.join(','))}`,
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
        const json = await res.json()
        throw new Error(json?.message || 'Export failed')
      }

      onOpenChange(false)
      toast.success(
        `Export job queued successfully. ${
          isExportAll ? 'All' : productIds.length
        } products will be exported.`,
      )
    } catch (error: unknown) {
      console.error(error)
      toast.error((error as Error)?.message || 'Failed to queue export')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Export products to CSV</DialogTitle>
          <DialogDescription>Configure export settings</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="file-name">File name (optional)</Label>
            <p className="text-sm text-muted-foreground mt-1">
              A timestamp will be automatically added to the filename to ensure uniqueness.
            </p>
            <Input
              id="file-name"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder={config?.defaultFileName || 'products_export.csv'}
              className="mt-1"
            />
          </div>

          <div>
            <Label>Select fields to export</Label>
            <div className="flex items-center space-x-2 mt-2">
              <Checkbox
                id="select-all"
                checked={toggleAllChecked}
                onCheckedChange={(checked) => toggleSelectAll(checked as boolean)}
              />
              <Label htmlFor="select-all" className="font-normal">
                Select all
              </Label>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {availableExportFields.map((field) => (
                <div key={field} className="flex items-center space-x-2">
                  <Checkbox
                    id={`field-${field}`}
                    checked={selectedExportFields.includes(field)}
                    onCheckedChange={() => toggleExportFieldSelection(field)}
                    disabled={
                      config?.requiredExportFields?.includes(field) ||
                      mandatoryOptionFields.includes(field)
                    }
                  />
                  <Label htmlFor={`field-${field}`} className="font-normal">
                    {field}
                  </Label>
                </div>
              ))}
            </div>
            {customFields.length > 0 && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                {customFields.map((field) => (
                  <div key={field} className="flex items-center space-x-2">
                    <Checkbox
                      id={`custom-${field}`}
                      checked={selectedFields.includes(field)}
                      onCheckedChange={() => toggleFieldSelection(field)}
                    />
                    <Label htmlFor={`custom-${field}`} className="font-normal">
                      {field}
                    </Label>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <Label>Export assets as:</Label>
            <RadioGroup
              value={exportAssetsAs}
              onValueChange={(val) => setExportAssetsAs(val as 'url' | 'json')}
              className="mt-2"
            >
              {config?.exportAssetsAsOptions?.includes('url') && (
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="url" id="assets-url" />
                  <Label htmlFor="assets-url" className="font-normal">
                    URL
                  </Label>
                </div>
              )}
              {config?.exportAssetsAsOptions?.includes('json') && (
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="json" id="assets-json" />
                  <Label htmlFor="assets-json" className="font-normal">
                    JSON
                  </Label>
                </div>
              )}
            </RadioGroup>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleExport}>
            Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
