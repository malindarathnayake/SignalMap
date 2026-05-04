import type { OracleError, ErrorIndex, DistillConfig, FetchOptions, WarmOptions } from './types.js';
export type { OracleError, ErrorIndex, DistillConfig, FetchOptions, WarmOptions, FormatType, CacheProvider, Descriptor, Parameter, } from './types.js';
export { DistillError, InvalidCodeError, ErrorNotFoundError, FetchTimeoutError, NetworkError, ExtractionError, IndexFetchError, } from './errors.js';
export { format } from './formatters/index.js';
export { FilesystemCache, MemoryCache } from './cache.js';
export declare class Distill {
    private cache;
    private fetcher;
    private descriptors;
    private cacheTtl;
    private baseUrl;
    private debug;
    constructor(config?: DistillConfig);
    fetchError(code: string, options?: FetchOptions): Promise<OracleError>;
    fetchErrors(codes: string[], options?: FetchOptions): Promise<OracleError[]>;
    listErrors(): Promise<ErrorIndex[]>;
    extract(url: string, options?: FetchOptions): Promise<Record<string, unknown>>;
    private warmOne;
    warm(opts?: WarmOptions): Promise<void>;
    warmAll(): Promise<void>;
}
export default Distill;
//# sourceMappingURL=index.d.ts.map