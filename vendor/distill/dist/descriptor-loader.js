import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
export function loadDescriptors(userDescriptors) {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    // From src/ go up to project root, then into descriptors/
    const descriptorsDir = join(__dirname, '..', 'descriptors');
    const bundled = existsSync(descriptorsDir)
        ? readdirSync(descriptorsDir)
            .filter((file) => file.endsWith('.json'))
            .map((file) => join(descriptorsDir, file))
        : [];
    const bundledDescriptors = bundled
        .map((file) => JSON.parse(readFileSync(file, 'utf-8')));
    const user = [];
    if (userDescriptors) {
        for (const item of userDescriptors) {
            if (typeof item === 'string') {
                user.push(JSON.parse(readFileSync(item, 'utf-8')));
            }
            else {
                user.push(item);
            }
        }
    }
    // User descriptors first so they override bundled on first-match
    return [...user, ...bundledDescriptors];
}
export function matchDescriptor(url, descriptors) {
    for (const descriptor of descriptors) {
        const pattern = descriptor.url_pattern;
        // Split on {name} placeholders, escape each literal part, rejoin with capture groups
        const parts = pattern.split(/\{[^}]+\}/);
        const escapedParts = parts.map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const regexStr = '^' + escapedParts.join('(.+)') + '$';
        const regex = new RegExp(regexStr);
        if (regex.test(url)) {
            return descriptor;
        }
    }
    return null;
}
//# sourceMappingURL=descriptor-loader.js.map
