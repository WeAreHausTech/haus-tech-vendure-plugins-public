import { Asset } from '@vendure/core'
import { createHash } from 'crypto'

export function generateAssetHash(asset: Asset): string {
  const fileName = asset.source.split('/').pop()!
  // Filename can contain OrdinalSuffix, so we need to remove it
  // Example: atterdal_mg_9678__03.jpg
  // We need to remove the "__03" part
  const fileNameWithoutOrdinalSuffix = fileName.replace(/__\d+/, '')
  // const newSource = asset.source.replace(fileName, fileNameWithoutOrdinalSuffix)
  const hash = createHash('md5').update(fileNameWithoutOrdinalSuffix).digest('hex')
  return hash
}
