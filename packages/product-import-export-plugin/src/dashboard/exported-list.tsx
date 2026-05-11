import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from '@vendure/dashboard'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  SearchIcon,
  TrashIcon,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { getChannelHeader, getServerLocation } from './utils'

interface ExportedFile {
  fileName: string
  size: number
  created: string
}

const ITEMS_PER_PAGE = 8

export function ExportedList() {
  const [exportedFiles, setExportedFiles] = useState<ExportedFile[]>([])
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [fileToDelete, setFileToDelete] = useState<string | null>(null)

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

  const filteredFiles = useMemo(() => {
    let result = exportedFiles
    if (search) {
      const q = search.toLowerCase()
      result = result.filter((f) => f.fileName.toLowerCase().includes(q))
    }
    return result
  }, [exportedFiles, search])

  const totalPages = Math.max(1, Math.ceil(filteredFiles.length / ITEMS_PER_PAGE))
  const paginatedFiles = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
    return filteredFiles.slice(startIndex, startIndex + ITEMS_PER_PAGE)
  }, [filteredFiles, currentPage])

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(1)
  }, [totalPages, currentPage])

  const downloadFile = async (fileName: string) => {
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
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 space-y-0 pb-4 md:flex-row md:items-start md:justify-between md:gap-6">
        <div className="min-w-0 space-y-1 md:pr-4">
          <CardTitle className="mb-0">Recent exports</CardTitle>
          <CardDescription className=" text-xs">
            Completed CSV exports for this channel. Search by file name to filter the list.
          </CardDescription>
        </div>
        <div className="relative w-full shrink-0 md:w-72 lg:w-80">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search by file name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
            aria-label="Search exports by file name"
          />
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="text-sm text-destructive py-4">{error}</div>
        ) : exportedFiles.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground">
            <p>No exports yet. Run an export to see files listed here.</p>
          </div>
        ) : (
          <>
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">Type</TableHead>
                    <TableHead>File</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedFiles.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        No results match your filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedFiles.map((file) => (
                      <TableRow key={file.fileName}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="bg-primary/10 text-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-md">
                              <DownloadIcon className="h-4 w-4" aria-hidden />
                            </span>
                            <span className="text-sm font-medium">Export</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium truncate max-w-xs">{file.fileName}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatFileSize(file.size)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">
                            {new Date(file.created).toLocaleString(navigator.language || undefined)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => downloadFile(file.fileName)}
                            >
                              <DownloadIcon className="mr-1 h-3.5 w-3.5" /> Download
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteClick(file.fileName)}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <TrashIcon className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {filteredFiles.length > ITEMS_PER_PAGE && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-xs text-muted-foreground">
                  Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–
                  {Math.min(currentPage * ITEMS_PER_PAGE, filteredFiles.length)} of{' '}
                  {filteredFiles.length}
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeftIcon className="h-4 w-4" />
                  </Button>
                  <span className="text-sm px-2 text-muted-foreground">
                    {currentPage} / {totalPages}
                  </span>
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
          </>
        )}
      </CardContent>

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
    </Card>
  )
}

export default ExportedList
