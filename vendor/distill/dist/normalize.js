import { InvalidCodeError } from './errors.js';
export function normalizeOraCode(input) {
    // Check for empty/whitespace-only input first
    if (!input || input.trim() === '') {
        throw new InvalidCodeError('empty input');
    }
    const trimmed = input.trim();
    // Try to match the ORA pattern (with or without dash)
    const oraMatch = /^\s*ora-?(\d{1,5})\s*$/i.exec(trimmed);
    if (oraMatch) {
        const numericPart = oraMatch[1];
        const padded = numericPart.padStart(5, '0');
        return `ora-${padded}`;
    }
    // Check if it has a different prefix (e.g., TNS-12154)
    const differentPrefixMatch = /^[a-zA-Z]+[-_]?\d+/.exec(trimmed);
    if (differentPrefixMatch && !/^ora/i.test(trimmed)) {
        throw new InvalidCodeError('Only ORA prefix supported in v1');
    }
    // Check if it exceeds 5 digits (ORA-100000)
    const oraLongMatch = /^\s*ora-?(\d+)\s*$/i.exec(trimmed);
    if (oraLongMatch) {
        const num = parseInt(oraLongMatch[1], 10);
        if (num > 99999) {
            throw new InvalidCodeError('code exceeds 5-digit pad');
        }
    }
    // Otherwise it's invalid (non-numeric code portion, unrecognized format, etc.)
    throw new InvalidCodeError('invalid ORA code format');
}
//# sourceMappingURL=normalize.js.map