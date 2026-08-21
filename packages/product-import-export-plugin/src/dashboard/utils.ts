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
  | 'id'
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

export interface PluginInitOptions {
  visibleOptions?: Array<keyof ImportOptions>
  defaultOptions?: ImportOptions
  exportOptions?: {
    defaultFileName?: string
    exportAssetsAsOptions?: Array<'url' | 'json'>
    defaultExportAssetsAs?: 'url' | 'json'
    defaultExportFields?: ExportFields
    requiredExportFields?: ExportFields
    customExportColumns?: Array<{ name: string }>
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

// Same localStorage keys as @vendure/dashboard's own API client (LS_KEY_SELECTED_CHANNEL_TOKEN /
// LS_KEY_SESSION_TOKEN). The plugin's REST routes require admin permissions, so every fetch must
// carry the session token too, not only cookies: on a server configured with tokenMethod 'bearer'
// there is no session cookie and credentials: 'include' alone would yield 403.
const LS_KEY_SELECTED_CHANNEL_TOKEN = 'vendure-selected-channel-token'
const LS_KEY_SESSION_TOKEN = 'vendure-session-token'

// Return vendure-token (if a non-default channel is selected) and Authorization headers
export const getChannelHeader = (): Record<string, string> => {
  const headers: Record<string, string> = {}
  const channelToken = localStorage.getItem(LS_KEY_SELECTED_CHANNEL_TOKEN)
  if (channelToken) {
    headers['vendure-token'] = channelToken
  }
  const sessionToken = localStorage.getItem(LS_KEY_SESSION_TOKEN)
  if (sessionToken) {
    headers.authorization = `Bearer ${sessionToken}`
  }
  return headers
}
