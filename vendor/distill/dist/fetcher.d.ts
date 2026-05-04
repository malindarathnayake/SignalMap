export interface FetcherConfig {
    timeout?: number;
    debug?: boolean;
}
export interface Fetcher {
    get(url: string): Promise<string>;
    getBatch(urls: string[], rateMs?: number): Promise<string[]>;
}
export declare function createFetcher(config: FetcherConfig): Fetcher;
//# sourceMappingURL=fetcher.d.ts.map