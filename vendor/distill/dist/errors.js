export class DistillError extends Error {
    code;
    constructor(code, message, options) {
        super(message, options);
        this.code = code;
        this.name = 'DistillError';
    }
}
export class InvalidCodeError extends DistillError {
    constructor(message) {
        super('INVALID_CODE', message);
        this.name = 'InvalidCodeError';
    }
}
export class ErrorNotFoundError extends DistillError {
    errorCode;
    url;
    constructor(errorCode, url) {
        super('NOT_FOUND', `Error ${errorCode} not found at ${url}`);
        this.name = 'ErrorNotFoundError';
        this.errorCode = errorCode;
        this.url = url;
    }
}
export class FetchTimeoutError extends DistillError {
    url;
    timeoutMs;
    constructor(url, timeoutMs) {
        super('TIMEOUT', `Request to ${url} timed out after ${timeoutMs}ms`);
        this.name = 'FetchTimeoutError';
        this.url = url;
        this.timeoutMs = timeoutMs;
    }
}
export class NetworkError extends DistillError {
    url;
    constructor(url, cause) {
        super('NETWORK_ERROR', `Network error fetching ${url}`, { cause });
        this.name = 'NetworkError';
        this.url = url;
    }
}
export class ExtractionError extends DistillError {
    url;
    constructor(message, url) {
        super('EXTRACTION_ERROR', message);
        this.name = 'ExtractionError';
        this.url = url;
    }
}
export class IndexFetchError extends DistillError {
    indexUrl;
    constructor(indexUrl, cause) {
        super('INDEX_FETCH_ERROR', `Failed to fetch error index from ${indexUrl}`, { cause });
        this.name = 'IndexFetchError';
        this.indexUrl = indexUrl;
    }
}
//# sourceMappingURL=errors.js.map