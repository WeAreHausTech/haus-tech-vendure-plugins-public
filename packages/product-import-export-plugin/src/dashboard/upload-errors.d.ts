/** The `errors` a rejected upload answers with (HTTP 400, `{ errors: string[] }`), else none. */
export declare function readUploadErrors(res: Response): Promise<string[]>;
export declare function summarizeErrors(errors: string[]): string;
