import { Button } from '@vendure/dashboard'
import { useState } from 'react'
import { ExportDialog } from './export-dialog'

export function ProductExportBlock() {
  const [dialogOpen, setDialogOpen] = useState(false)

  const handleExport = () => {
    setDialogOpen(true)
  }

  return (
    <div className="space-y-4">
      <div>
        <Button onClick={handleExport}>Export all products</Button>
      </div>
      <ExportDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        productIds={[]}
        isExportAll={true}
      />
    </div>
  )
}
