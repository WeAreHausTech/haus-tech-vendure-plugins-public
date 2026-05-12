import { DataTableBulkActionItem } from '@vendure/dashboard'
import { DownloadIcon } from 'lucide-react'
import { useState } from 'react'
import { ExportDialog } from './export-dialog'

export function ExportProductsBulkAction({
  selection,
  table,
}: {
  selection: Array<{ id: string }>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any
}) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const productIds = selection.map((product) => product.id)

  const handleClose = () => {
    setDialogOpen(false)
    table.resetRowSelection()
  }

  return (
    <>
      <DataTableBulkActionItem
        closeOnClick={false}
        onClick={() => setDialogOpen(true)}
        label="Export products to CSV"
        icon={DownloadIcon}
      />
      <ExportDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (open) {
            setDialogOpen(true)
          } else {
            handleClose()
          }
        }}
        productIds={productIds}
      />
    </>
  )
}
