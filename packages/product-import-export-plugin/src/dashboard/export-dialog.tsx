import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@vendure/dashboard'
import { useRef, useState } from 'react'
import {
  ExportConfigurationPanel,
  type ExportConfigurationPanelHandle,
} from './export-configuration-panel'

interface ExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Omit for export-all-only dialogs; bulk export passes selected IDs. */
  productIds?: string[]
  isExportAll?: boolean
}

export function ExportDialog({
  open,
  onOpenChange,
  productIds,
  isExportAll = false,
}: ExportDialogProps) {
  const panelRef = useRef<ExportConfigurationPanelHandle>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleExport = async () => {
    setIsSubmitting(true)
    try {
      await panelRef.current?.submitExport()
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Export products to CSV</DialogTitle>
          <DialogDescription>Configure export settings</DialogDescription>
        </DialogHeader>

        <ExportConfigurationPanel
          ref={panelRef}
          productIds={productIds}
          isExportAll={isExportAll}
          active={open}
          idPrefix="dialog-export"
          fieldsAccordionDefaultOpen
          onExportSuccess={() => onOpenChange(false)}
        />

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleExport} disabled={isSubmitting || !open}>
            Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
