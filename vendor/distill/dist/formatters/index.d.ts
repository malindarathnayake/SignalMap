import type { OracleError, FormatType } from '../types.js';
export { formatToon, formatToonBatch, formatToonGeneric } from './toon.js';
export { formatMarkdown, formatMarkdownBatch, formatMarkdownGeneric } from './markdown.js';
export { formatJson, formatJsonBatch, formatJsonGeneric } from './json.js';
export declare function format(data: OracleError | OracleError[] | Record<string, unknown>, formatType: FormatType): string;
//# sourceMappingURL=index.d.ts.map