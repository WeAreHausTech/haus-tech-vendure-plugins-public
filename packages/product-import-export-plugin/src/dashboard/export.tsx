import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@vendure/dashboard'
import { DownloadIcon, InfoIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import {
  ExportConfigurationPanel,
  type ExportConfigurationPanelHandle,
} from './export-configuration-panel'

export function ProductExportBlock() {
  const panelRef = useRef<ExportConfigurationPanelHandle>(null)
  const [isExporting, setIsExporting] = useState(false)

  const handleExport = async () => {
    setIsExporting(true)
    try {
      await panelRef.current?.submitExport()
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-start gap-3 space-y-0 items-center">
        <div className="bg-primary/10 text-primary rounded-md p-2 flex h-9 w-9 items-center justify-center">
          <DownloadIcon className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <CardTitle className="mb-0">Export all products</CardTitle>
          <CardDescription className="text-xs">Export all your products to a CSV file.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ExportConfigurationPanel
          ref={panelRef}
          productIds={[]}
          isExportAll
          active
          idPrefix="page-export"
        />

        <Button className="w-full" onClick={handleExport} disabled={isExporting}>
          <DownloadIcon className="mr-2 h-4 w-4" />
          {isExporting ? 'Queuing export…' : 'Export products'}
        </Button>

        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <InfoIcon className="h-3.5 w-3.5 shrink-0" />
          <span>You will receive an email when the export is ready to download.</span>
        </div>
      </CardContent>
    </Card>
  )
}
