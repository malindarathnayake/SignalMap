import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { gzipSync, gunzipSync } from 'node:zlib';
class FilesystemCache {
    cacheDir;
    defaultTtl;
    dirCreated;
    constructor(cacheDir = path.join(os.homedir(), '.distill', 'cache'), defaultTtl = 86400000) {
        this.cacheDir = cacheDir;
        this.defaultTtl = defaultTtl;
        this.dirCreated = false;
    }
    filePath(key) {
        return path.join(this.cacheDir, `${key}.json.gz`);
    }
    ensureDir() {
        if (!this.dirCreated) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
            this.dirCreated = true;
        }
    }
    async get(key) {
        const file = this.filePath(key);
        if (!fs.existsSync(file)) {
            return null;
        }
        const compressed = fs.readFileSync(file);
        const raw = gunzipSync(compressed);
        const entry = JSON.parse(raw.toString());
        return entry.data;
    }
    async set(key, value, ttl) {
        this.ensureDir();
        const entry = {
            data: value,
            fetchedAt: Date.now(),
            ttl: ttl ?? this.defaultTtl,
        };
        const json = JSON.stringify(entry);
        const compressed = gzipSync(json);
        fs.writeFileSync(this.filePath(key), compressed);
    }
    async has(key) {
        return fs.existsSync(this.filePath(key));
    }
    async isFresh(key) {
        const file = this.filePath(key);
        if (!fs.existsSync(file)) {
            return false;
        }
        const compressed = fs.readFileSync(file);
        const raw = gunzipSync(compressed);
        const entry = JSON.parse(raw.toString());
        return Date.now() < entry.fetchedAt + entry.ttl;
    }
    async clear() {
        if (!fs.existsSync(this.cacheDir)) {
            return;
        }
        const files = fs.readdirSync(this.cacheDir);
        for (const file of files) {
            if (file.endsWith('.json.gz')) {
                fs.unlinkSync(path.join(this.cacheDir, file));
            }
        }
    }
    async keys() {
        if (!fs.existsSync(this.cacheDir)) {
            return [];
        }
        const files = fs.readdirSync(this.cacheDir);
        return files
            .filter((f) => f.endsWith('.json.gz'))
            .map((f) => f.slice(0, -'.json.gz'.length));
    }
}
class MemoryCache {
    map;
    defaultTtl;
    constructor(defaultTtl = 86400000) {
        this.map = new Map();
        this.defaultTtl = defaultTtl;
    }
    async get(key) {
        const entry = this.map.get(key);
        if (!entry) {
            return null;
        }
        return entry.data;
    }
    async set(key, value, ttl) {
        this.map.set(key, {
            data: value,
            fetchedAt: Date.now(),
            ttl: ttl ?? this.defaultTtl,
        });
    }
    async has(key) {
        return this.map.has(key);
    }
    async isFresh(key) {
        const entry = this.map.get(key);
        if (!entry) {
            return false;
        }
        return Date.now() < entry.fetchedAt + entry.ttl;
    }
    async clear() {
        this.map.clear();
    }
    async keys() {
        return Array.from(this.map.keys());
    }
}
export { FilesystemCache, MemoryCache };
//# sourceMappingURL=cache.js.map