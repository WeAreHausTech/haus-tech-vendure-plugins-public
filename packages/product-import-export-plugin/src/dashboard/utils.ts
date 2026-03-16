// Shared utilities and types for product import/export plugin

export type UpdatingStrategy = 'replace' | 'merge'

export type ImportOptions = {
  updateProductSlug?: boolean
}

export type ValidateReturnType = {
  isValid: boolean
  langCodes?: (string | undefined)[]
  clearFile?: boolean
}

export type ProductFields =
  | 'productId'
  | 'name'
  | 'slug'
  | 'description'
  | 'assets'
  | 'facets'
  | 'optionGroups'

export type VariantFields =
  | 'sku'
  | 'optionValues'
  | 'price'
  | 'taxCategory'
  | 'stockOnHand'
  | 'trackInventory'
  | 'variantAssets'
  | 'variantFacets'
  | 'enabled'

export type ExportFields = Array<ProductFields | VariantFields>

export type ExportStorageOptions =
  | {
      type?: 'disk'
    }
  | {
      type: 's3'
      bucket: string
      region?: string
      accessKeyId: string
      secretAccessKey: string
      endpoint?: string
      forcePathStyle?: boolean
      baseKeyPrefix?: string
    }

export interface PluginInitOptions {
  visibleOptions?: Array<keyof ImportOptions>
  defaultOptions?: ImportOptions
  exportOptions?: {
    defaultFileName?: string
    exportAssetsAsOptions?: Array<'url' | 'json'>
    defaultExportAssetsAs?: 'url' | 'json'
    defaultExportFields?: ExportFields
    requiredExportFields?: ExportFields
    storage?: ExportStorageOptions
  }
}

// Helper function to get server location (matches Angular UI's getServerLocation)
export const getServerLocation = (): string => {
  // In development with Vite, use the API server directly
  if (window.location.port === '5173') {
    return 'http://localhost:3000'
  }
  const { protocol, hostname, port } = window.location
  const origin = port ? `${protocol}//${hostname}:${port}` : `${protocol}//${hostname}`
  return origin
}

// Return vendure-token header if a non-default channel has been selected in the Dashboard
export const getChannelHeader = (): Record<string, string> => {
  const token = localStorage.getItem('vendure-selected-channel-token')
  return token ? { 'vendure-token': token } : {}
}
