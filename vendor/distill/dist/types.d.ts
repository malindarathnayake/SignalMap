export interface Parameter {
    name: string;
    description: string;
}
export interface StructuredExtractionResult {
    code: string;
    message: string;
    parameters: Parameter[];
    cause: string;
    action: string;
    additionalInfo?: string;
    sql?: string[];
    release?: string;
    url: string;
}
export interface ExtractionIndexEntry {
    code: string;
    url: string;
}
export interface CacheProvider {
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T, ttl?: number): Promise<void>;
    has(key: string): Promise<boolean>;
    clear(): Promise<void>;
    keys(): Promise<string[]>;
    isFresh(key: string): Promise<boolean>;
}
export interface DistillConfig {
    cache?: false | CacheProvider;
    cacheTtl?: number;
    baseUrl?: string;
    timeout?: number;
    descriptors?: Array<string | Descriptor>;
    debug?: boolean;
}
export interface FetchOptions {
    format?: FormatType;
    release?: string;
    noCache?: boolean;
}
export interface WarmOptions {
    codes?: string[];
    concurrency?: number;
    onProgress?: (done: number, total: number) => void;
}
export type FormatType = 'toon' | 'markdown' | 'json';
export type DescriptorExtractionResult = Record<string, unknown>;
export interface Descriptor {
    name: string;
    version: string;
    description: string;
    url_pattern: string;
    base_url?: string;
    index?: DescriptorIndex;
    root: string;
    section?: DescriptorSection;
    cleanup?: DescriptorCleanup;
    fields: Record<string, DescriptorField>;
    metadata?: Record<string, DescriptorMetadataField>;
    prose_rules?: ProseRules;
}
export interface DescriptorIndex {
    url: string;
    item_selector: string;
    item_extract: Record<string, {
        source: string;
        attr?: string;
    }>;
}
export interface DescriptorSection {
    strategy: string;
    selector: string;
    fallback?: string;
}
export interface DescriptorCleanup {
    remove_selectors: string[];
}
export interface DescriptorField {
    selector?: string;
    extract: string;
    required?: boolean;
    item_fields?: Record<string, DescriptorField>;
    after?: string;
    attr?: string;
    offset?: number;
    heading?: string;
    heading_tag?: string;
    content_selector?: string;
    content_extract?: string;
    code_selector?: string;
    section_selectors?: string[];
    heading_selectors?: string[];
    table_selector?: string;
    note_selector?: string;
    link_selector?: string;
    max_depth?: number;
    group_anchor?: string;
    group_size?: number;
    regex?: string;
    trim_prefix?: string;
    trim_suffix?: string;
    strip_tags?: string[];
    default?: string;
    transform?: string;
}
export interface DescriptorMetadataField {
    source: string;
    attr?: string;
    selector?: string;
}
export interface ProseRules {
    paragraph_selector: string;
    list_selector: string;
    list_prefix: string;
    join: string;
    trim: boolean;
}
//# sourceMappingURL=types.d.ts.map