import { createFetcher } from './fetcher.js';
import { loadDescriptors, matchDescriptor } from './descriptor-loader.js';
import { extract as extractFromHtml } from './extractor.js';
import { FilesystemCache } from './cache.js';
import { ExtractionError } from './errors.js';

// Re-export error classes
export {
    DistillError,
    InvalidCodeError,
    ErrorNotFoundError,
    FetchTimeoutError,
    NetworkError,
    ExtractionError,
    IndexFetchError,
} from './errors.js';

// Re-export format utility
export { format } from './formatters/index.js';

// Re-export cache providers
export { FilesystemCache, MemoryCache } from './cache.js';

export class Distill {
    cache;
    fetcher;
    descriptors;
    cacheTtl;
    baseUrl;
    debug;

    constructor(config) {
        if (config?.cache === false) {
            this.cache = null;
        }
        else if (config?.cache != null) {
            this.cache = config.cache;
        }
        else {
            this.cache = new FilesystemCache(undefined, config?.cacheTtl);
        }
        this.fetcher = createFetcher({
            timeout: config?.timeout ?? 10000,
            debug: config?.debug,
        });
        this.descriptors = loadDescriptors(config?.descriptors);
        this.baseUrl = config?.baseUrl ?? '';
        this.cacheTtl = config?.cacheTtl ?? 86400000;
        this.debug = config?.debug ?? false;
    }

    async extract(url, _options) {
        const descriptor = matchDescriptor(url, this.descriptors);
        if (!descriptor) {
            throw new ExtractionError('No descriptor matches URL', url);
        }
        const html = await this.fetcher.get(url);
        return extractFromHtml(html, descriptor, url);
    }
}

export default Distill;
//# sourceMappingURL=index.js.map
