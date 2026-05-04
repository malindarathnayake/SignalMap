export declare class DistillError extends Error {
    code: string;
    constructor(code: string, message: string, options?: ErrorOptions);
}
export declare class InvalidCodeError extends DistillError {
    constructor(message: string);
}
export declare class ErrorNotFoundError extends DistillError {
    errorCode: string;
    url: string;
    constructor(errorCode: string, url: string);
}
export declare class FetchTimeoutError extends DistillError {
    url: string;
    timeoutMs: number;
    constructor(url: string, timeoutMs: number);
}
export declare class NetworkError extends DistillError {
    url: string;
    constructor(url: string, cause?: Error);
}
export declare class ExtractionError extends DistillError {
    url: string;
    constructor(message: string, url: string);
}
export declare class IndexFetchError extends DistillError {
    indexUrl: string;
    constructor(indexUrl: string, cause?: Error);
}
//# sourceMappingURL=errors.d.ts.map