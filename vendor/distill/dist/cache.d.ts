import type { CacheProvider } from './types.js';
declare class FilesystemCache implements CacheProvider {
    private cacheDir;
    private defaultTtl;
    private dirCreated;
    constructor(cacheDir?: string, defaultTtl?: number);
    private filePath;
    private ensureDir;
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T, ttl?: number): Promise<void>;
    has(key: string): Promise<boolean>;
    isFresh(key: string): Promise<boolean>;
    clear(): Promise<void>;
    keys(): Promise<string[]>;
}
declare class MemoryCache implements CacheProvider {
    private map;
    private defaultTtl;
    constructor(defaultTtl?: number);
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T, ttl?: number): Promise<void>;
    has(key: string): Promise<boolean>;
    isFresh(key: string): Promise<boolean>;
    clear(): Promise<void>;
    keys(): Promise<string[]>;
}
export { FilesystemCache, MemoryCache };
//# sourceMappingURL=cache.d.ts.map