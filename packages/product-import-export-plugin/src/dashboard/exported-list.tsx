import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
} from '@vendure/dashboard'
import { getServerLocation, getChannelHeader } from './utils'
import { useState, useEffect, useMemo } from 'react'
import { DownloadIcon, ChevronLeftIcon, ChevronRightIcon, TrashIcon } from 'lucide-react'

interface ExportedFile {
  fileName: string
  size: number
  created: string
}

export function ExportedList() {
  const [exportedFiles, setExportedFiles] = useState<ExportedFile[]>([])
  const [error, setError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [fileToDelete, setFileToDelete] = useState<string | null>(null)
  const itemsPerPage = 10

  const getExportFiles = async () => {
    const serverPath = getServerLocation()
    try {
      const res = await fetch(`${serverPath}/product-export/exported-files`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...getChannelHeader(),
        },
        credentials: 'include',
      })
      if (!res.ok) {
        setError('Could not get exported files, please try again later')
        return
      }
      const data = await res.json()
      setExportedFiles(data)
      setError(null)
    } catch (error) {
      setError('Could not get exported files, please try again later')
      console.error('Error getting exported files', error)
    }
  }

  useEffect(() => {
    getExportFiles()
  }, [])

  // Pagination calculations
  const paginatedFiles = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    return exportedFiles.slice(startIndex, endIndex)
  }, [exportedFiles, currentPage])

  const totalPages = Math.ceil(exportedFiles.length / itemsPerPage)

  const downLoadFile = async (fileName: string) => {
    const serverPath = getServerLocation()
    const res = await fetch(`${serverPath}/product-export/download/${fileName}`, {
      method: 'GET',
      headers: {
        ...getChannelHeader(),
      },
      credentials: 'include',
    })

    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleDeleteClick = (fileName: string) => {
    setFileToDelete(fileName)
    setDeleteDialogOpen(true)
  }

  const deleteFile = async () => {
    if (!fileToDelete) return

    const serverPath = getServerLocation()
    try {
      const res = await fetch(`${serverPath}/product-export/delete/${fileToDelete}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...getChannelHeader(),
        },
        credentials: 'include',
      })

      if (!res.ok) {
        const json = await res.json()
        throw new Error(json?.message || 'Failed to delete file')
      }

      toast.success('File deleted successfully')
      setDeleteDialogOpen(false)
      setFileToDelete(null)
      await getExportFiles()
    } catch (error: unknown) {
      console.error('Delete error:', error)
      toast.error((error as Error)?.message || 'Failed to delete file')
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
  }

  if (error) {
    return (
      <div className="text-center text-muted-foreground col-start-2 grid justify-items-start gap-1 text-sm [&_p]:leading-relaxed">
        <p className="text-red-500">{error}</p>
      </div>
    )
  }

  return (
    <div>
      {exportedFiles.length > 0 && (
        <div className="space-y-2">
          <div className="border rounded-md divide-y">
            {paginatedFiles.map((file) => (
              <div key={file.fileName} className="p-4 hover:bg-muted/50 transition-colors">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex-1">
                    <p className="font-medium">{file.fileName}</p>
                    <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 text-sm text-muted-foreground mt-1">
                      <span>Size: {formatFileSize(file.size)}</span>
                      <span>
                        Created:{' '}
                        {new Date(file.created).toLocaleString(navigator.language || undefined)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => downLoadFile(file.fileName)}>
                      <DownloadIcon className="mr-2 h-4 w-4" />
                      Download
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteClick(file.fileName)}
                      className="text-destructive hover:text-destructive"
                    >
                      <TrashIcon className="h-4 w-4" /> Delete
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between py-2 border-t">
              <div className="text-sm text-muted-foreground">
                Showing {(currentPage - 1) * itemsPerPage + 1} to{' '}
                {Math.min(currentPage * itemsPerPage, exportedFiles.length)} of{' '}
                {exportedFiles.length}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeftIcon className="h-4 w-4" />
                </Button>
                <div className="text-sm text-muted-foreground px-2">
                  {currentPage} / {totalPages}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                >
                  <ChevronRightIcon className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {exportedFiles.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          <p>You have no exported files</p>
        </div>
      )}

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {fileToDelete}?</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this file? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={deleteFile}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default ExportedList
