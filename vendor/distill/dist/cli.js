import { fileURLToPath } from 'node:url';
import { Distill, format } from './index.js';
export async function run(args) {
    // Extract flags:
    let formatType = 'toon'; // default
    let noCache = false;
    let listMode = false;
    let warmMode = false;
    let warmAllMode = false;
    let helpMode = false;
    const codes = [];
    // Walk args array:
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--help' || arg === '-h') {
            helpMode = true;
        }
        else if (arg === '--list') {
            listMode = true;
        }
        else if (arg === '--warm') {
            warmMode = true;
        }
        else if (arg === '--warm-all') {
            warmAllMode = true;
        }
        else if (arg === '--no-cache') {
            noCache = true;
        }
        else if (arg === '--format') {
            const next = args[i + 1];
            if (next && !next.startsWith('--')) {
                formatType = next;
                i++; // skip next arg
            }
        }
        else if (arg.startsWith('--format=')) {
            formatType = arg.split('=')[1];
        }
        else if (!arg.startsWith('-')) {
            codes.push(arg);
        }
    }
    // Handle --help
    if (helpMode) {
        const usage = `Usage: distill [options] [codes...]

Options:
  --format <toon|markdown|json>  Output format (default: toon)
  --no-cache                     Bypass cache
  --list                         List all ORA error codes
  --warm                         Re-fetch stale cache entries
  --warm-all                     Fetch all ~3,500 ORA codes
  --help, -h                     Show this help

Examples:
  distill ORA-00001
  distill ORA-00001 ORA-12154 --format json
  distill --list
  distill --warm`;
        process.stdout.write(usage + '\n');
        return;
    }
    // Validate format
    const validFormats = ['toon', 'markdown', 'json'];
    if (!validFormats.includes(formatType)) {
        process.stderr.write(`Error: Invalid format "${formatType}". Use toon, markdown, or json.\n`);
        process.exitCode = 1;
        return;
    }
    // Handle no codes (not an error condition requiring try/catch)
    if (!listMode && !warmAllMode && !warmMode && codes.length === 0) {
        process.stderr.write('Error: No error codes provided. Use --help for usage.\n');
        process.exitCode = 1;
        return;
    }
    try {
        const client = new Distill();
        // Handle --list
        if (listMode) {
            const items = await client.listErrors();
            for (const item of items) {
                process.stdout.write(`${item.code}\t${item.url}\n`);
            }
            return;
        }
        // Handle --warm-all
        if (warmAllMode) {
            const index = await client.listErrors();
            const allCodes = index.map((item) => item.code);
            await client.warm({
                codes: allCodes,
                concurrency: 5,
                onProgress: (done, total) => {
                    process.stderr.write(`\rWarming all: ${done}/${total}`);
                },
            });
            process.stderr.write('\nCache warming complete (all codes).\n');
            return;
        }
        // Handle --warm
        if (warmMode) {
            const warmOpts = {};
            if (codes.length > 0) {
                warmOpts.codes = codes;
            }
            warmOpts.onProgress = (done, total) => {
                process.stderr.write(`\rWarming: ${done}/${total}`);
            };
            await client.warm(warmOpts);
            process.stderr.write('\nCache warming complete.\n');
            return;
        }
        // Fetch single or multiple codes
        if (codes.length === 1) {
            const result = await client.fetchError(codes[0], { noCache });
            const output = format(result, formatType);
            process.stdout.write(output + '\n');
        }
        else {
            const results = await client.fetchErrors(codes, { noCache });
            const output = format(results, formatType);
            process.stdout.write(output + '\n');
        }
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`Error: ${message}\n`);
        process.exitCode = 1;
    }
}
// Auto-run when invoked directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    run(process.argv.slice(2)).catch((err) => {
        process.stderr.write(`Error: ${err.message}\n`);
        process.exitCode = 1;
    });
}
//# sourceMappingURL=cli.js.map