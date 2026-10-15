export type UpdatingStrategy = 'replace' | 'merge';
export type ImportOptions = {
    updateProductSlug?: boolean;
};
export type ValidateReturnType = {
    isValid: boolean;
    langCodes?: (string | undefined)[];
    clearFile?: boolean;
};
export type ProductFields = 'id' | 'name' | 'slug' | 'description' | 'assets' | 'facets' | 'optionGroups';
export type VariantFields = 'sku' | 'optionValues' | 'price' | 'taxCategory' | 'stockOnHand' | 'trackInventory' | 'variantAssets' | 'variantFacets' | 'enabled';
export type ExportFields = Array<ProductFields | VariantFields>;
export interface PluginInitOptions {
    visibleOptions?: Array<keyof ImportOptions>;
    defaultOptions?: ImportOptions;
    exportOptions?: {
        defaultFileName?: string;
        exportAssetsAsOptions?: Array<'url' | 'json'>;
        defaultExportAssetsAs?: 'url' | 'json';
        defaultExportFields?: ExportFields;
        requiredExportFields?: ExportFields;
        customExportColumns?: Array<{
            name: string;
        }>;
    };
}
export declare const getServerLocation: () => string;
export declare const getChannelHeader: () => Record<string, string>;
