export type ExportConfigurationPanelProps = {
    /** Selected product IDs for scoped export; omit when `isExportAll` (treated as empty). */
    productIds?: string[];
    isExportAll: boolean;
    /** Fetch config + fields only while true (e.g. dialog `open`) */
    active: boolean;
    /** Prefix for input/checkbox ids so modal vs page never collide */
    idPrefix?: string;
    /** Expand “Select fields to export” on first paint (e.g. modal); inline page keeps it collapsed */
    fieldsAccordionDefaultOpen?: boolean;
    onExportSuccess?: () => void;
};
export type ExportConfigurationPanelHandle = {
    submitExport: () => Promise<void>;
};
export declare const ExportConfigurationPanel: import("react").ForwardRefExoticComponent<ExportConfigurationPanelProps & import("react").RefAttributes<ExportConfigurationPanelHandle>>;
