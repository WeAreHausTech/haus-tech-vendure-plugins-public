interface ExportDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Omit for export-all-only dialogs; bulk export passes selected IDs. */
    productIds?: string[];
    isExportAll?: boolean;
}
export declare function ExportDialog({ open, onOpenChange, productIds, isExportAll, }: ExportDialogProps): import("react/jsx-runtime").JSX.Element;
export {};
