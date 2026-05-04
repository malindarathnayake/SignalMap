import { formatToon, formatToonBatch, formatToonGeneric } from './toon.js';
import { formatMarkdown, formatMarkdownBatch, formatMarkdownGeneric } from './markdown.js';
import { formatJson, formatJsonBatch, formatJsonGeneric } from './json.js';
export { formatToon, formatToonBatch, formatToonGeneric } from './toon.js';
export { formatMarkdown, formatMarkdownBatch, formatMarkdownGeneric } from './markdown.js';
export { formatJson, formatJsonBatch, formatJsonGeneric } from './json.js';
function isOracleError(data) {
    return (typeof data === 'object' &&
        data !== null &&
        'code' in data &&
        'message' in data &&
        'cause' in data);
}
export function format(data, formatType) {
    if (Array.isArray(data)) {
        switch (formatType) {
            case 'toon':
                return formatToonBatch(data);
            case 'markdown':
                return formatMarkdownBatch(data);
            case 'json':
                return formatJsonBatch(data);
        }
    }
    if (isOracleError(data)) {
        switch (formatType) {
            case 'toon':
                return formatToon(data);
            case 'markdown':
                return formatMarkdown(data);
            case 'json':
                return formatJson(data);
        }
    }
    // Generic fallback
    const generic = data;
    switch (formatType) {
        case 'toon':
            return formatToonGeneric(generic);
        case 'markdown':
            return formatMarkdownGeneric(generic);
        case 'json':
            return formatJsonGeneric(generic);
    }
}
//# sourceMappingURL=index.js.map