export function formatMarkdown(data) {
    const lines = [];
    lines.push(`# ${data.code}`);
    lines.push('');
    lines.push(`**${data.message}**`);
    if (data.parameters.length > 0) {
        lines.push('');
        lines.push('## Parameters');
        for (const param of data.parameters) {
            lines.push(`- **${param.name}:** ${param.description}`);
        }
    }
    lines.push('');
    lines.push('## Cause');
    lines.push(data.cause);
    lines.push('');
    lines.push('## Action');
    lines.push(data.action);
    if (data.additionalInfo !== undefined) {
        lines.push('');
        lines.push('## Additional Information');
        lines.push(data.additionalInfo);
    }
    if (data.sql !== undefined && data.sql.length > 0) {
        lines.push('');
        lines.push('## SQL Examples');
        for (const sqlEntry of data.sql) {
            lines.push('```sql');
            lines.push(sqlEntry);
            lines.push('```');
        }
    }
    lines.push('');
    lines.push(`> Source: ${data.url}`);
    return lines.join('\n');
}
export function formatMarkdownBatch(data) {
    return data.map(formatMarkdown).join('\n\n---\n\n');
}
export function formatMarkdownGeneric(data) {
    const lines = [];
    for (const [key, value] of Object.entries(data)) {
        if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
            lines.push(`**${key}:** ${JSON.stringify(value)}`);
        }
        else {
            lines.push(`**${key}:** ${String(value)}`);
        }
    }
    return lines.join('\n');
}
//# sourceMappingURL=markdown.js.map