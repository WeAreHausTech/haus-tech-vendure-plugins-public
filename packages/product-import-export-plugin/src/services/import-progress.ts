import { ImportProgress } from '@vendure/core'

/**
 * Job progress as a whole percentage. The SQL job queue stores progress in an integer
 * column, so a fraction such as 11.11 fails the update and crashes the worker.
 */
export function importProgressPercent(
  progress: Pick<ImportProgress, 'imported' | 'processed'>,
): number {
  const processedCount = progress.processed || 1
  const importedCount = progress.imported || 0
  return Math.min(Math.round((importedCount / processedCount) * 100), 100)
}
