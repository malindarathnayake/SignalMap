import * as cheerio from 'cheerio';
import { ExtractionError } from './errors.js';
export function extract(html, descriptor, inputUrl) {
    const $ = cheerio.load(html);
    // Cleanup
    if (descriptor.cleanup?.remove_selectors) {
        for (const sel of descriptor.cleanup.remove_selectors)
            $(sel).remove();
    }
    // Find root
    const root = $(descriptor.root).first();
    if (!root.length)
        throw new ExtractionError(`Root selector "${descriptor.root}" not found`, inputUrl);
    // Find section
    let section = root;
    if (descriptor.section) {
        const found = root.find(descriptor.section.selector).first();
        if (found.length) {
            section = found;
        }
        else if (descriptor.section.fallback) {
            const fallback = root.find(descriptor.section.fallback).first();
            section = fallback.length ? fallback : root;
        }
        else {
            section = root;
        }
    }
    // Extract fields
    const result = {};
    for (const [fieldName, rule] of Object.entries(descriptor.fields)) {
        const value = extractField($, section, rule, descriptor.prose_rules);
        if (value !== null && value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0)) {
            result[fieldName] = value;
        }
        else if (rule.required) {
            throw new ExtractionError(`Required field "${fieldName}" is empty or missing`, inputUrl);
        }
    }
    // Metadata
    if (descriptor.metadata) {
        for (const [k, v] of Object.entries(descriptor.metadata)) {
            if (v.source === 'section_attr') {
                result[k] = section.attr(v.attr) || undefined;
            }
            else if (v.source === 'input_url') {
                result[k] = inputUrl;
            }
            else if (v.source === 'first_match_attr') {
                const el = root.find(v.selector).first();
                result[k] = el.length ? el.attr(v.attr) : undefined;
            }
        }
    }
    return result;
}
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function extractProse($, container, rules) {
    const parts = [];
    const pr = rules || {
        paragraph_selector: 'p',
        list_selector: 'ul > li, ol > li',
        list_prefix: '- ',
        join: '\n',
        trim: true,
    };
    container.find(pr.paragraph_selector).each((_i, el) => {
        const t = $(el).text().trim();
        if (t)
            parts.push(t);
    });
    container.find(pr.list_selector).each((_i, el) => {
        const t = $(el).text().trim();
        if (t)
            parts.push((pr.list_prefix || '- ') + t);
    });
    const joined = parts.join(pr.join || '\n');
    return pr.trim ? joined.trim() : joined;
}
function extractCodeBlocks($, container, selector) {
    const blocks = [];
    container.find(selector).each((_i, el) => {
        const t = $(el).text().trim();
        if (t)
            blocks.push(t);
    });
    return blocks.length > 0 ? blocks : null;
}
function extractNestedSections($, container, rule, proseRules, depth) {
    if (depth > (rule.max_depth || 3))
        return null;
    const sections = [];
    const headingSelectors = rule.heading_selectors.join(', ');
    const sectionSelectors = rule.section_selectors.join(', ');
    const childSections = container.children(sectionSelectors);
    if (childSections.length > 0) {
        childSections.each((_i, sectionEl) => {
            const sec = $(sectionEl);
            const sectionObj = extractSectionContent($, sec, rule, proseRules, depth);
            if (sectionObj && (sectionObj.heading ||
                sectionObj.content ||
                sectionObj.subsections?.length)) {
                sections.push(sectionObj);
            }
        });
    }
    else {
        const headings = container.find(headingSelectors);
        headings.each((_i, hEl) => {
            const heading = $(hEl).text().trim();
            if (!heading)
                return;
            const content = [];
            let next = $(hEl).next();
            while (next.length && !next.is(headingSelectors)) {
                if (next.is('p')) {
                    const t = next.text().trim();
                    if (t)
                        content.push(t);
                }
                else if (next.is('ul, ol')) {
                    next.find('> li').each((_j, li) => {
                        content.push('- ' + $(li).text().trim());
                    });
                }
                else if (next.is('pre')) {
                    const code = next.find('code').text().trim() || next.text().trim();
                    if (code)
                        content.push('```sql\n' + code + '\n```');
                }
                next = next.next();
            }
            if (heading || content.length) {
                sections.push({ heading, content: content.join('\n') });
            }
        });
    }
    return sections.length > 0 ? sections : null;
}
function extractSectionContent($, sec, rule, proseRules, depth) {
    const headingSelectors = rule.heading_selectors.join(', ');
    const headingEl = sec.find(headingSelectors).first();
    const heading = headingEl.length ? headingEl.text().trim() : '';
    const proseSelector = proseRules?.paragraph_selector || 'p';
    const contentParts = [];
    sec.find(`> ${proseSelector}, > div > ${proseSelector}`).each((_i, el) => {
        if ($(el).is(headingSelectors))
            return;
        const t = $(el).text().trim();
        if (t && t.length > 5)
            contentParts.push(t);
    });
    sec.find('> ul > li, > div > ul > li, > ol > li, > div > ol > li').each((_i, el) => {
        const t = $(el).text().trim();
        if (t)
            contentParts.push('- ' + t);
    });
    const codeBlocks = [];
    const codeSel = rule.code_selector || 'pre code';
    sec.find(codeSel).each((_i, el) => {
        const code = $(el).text().trim();
        if (code) {
            codeBlocks.push(code);
            contentParts.push('```\n' + code + '\n```');
        }
    });
    const subsections = extractNestedSections($, sec, rule, proseRules, depth + 1);
    const content = contentParts.join('\n');
    if (!heading && !content && !subsections?.length)
        return null;
    const result = { heading };
    if (content)
        result.content = content;
    if (codeBlocks.length)
        result.code = codeBlocks;
    if (subsections?.length)
        result.subsections = subsections;
    return result;
}
function extractField($, section, rule, proseRules) {
    switch (rule.extract) {
        case 'text': {
            const el = section.find(rule.selector).first();
            let text = el.text().trim();
            if (rule.regex) {
                const m = text.match(new RegExp(rule.regex));
                text = m ? m[1] : text;
            }
            return text || null;
        }
        case 'attr': {
            const el = section.find(rule.selector).first();
            return el.attr(rule.attr) || null;
        }
        case 'list': {
            const items = [];
            section.find(rule.selector).each((_i, el) => {
                const item = {};
                for (const [subName, subRule] of Object.entries(rule.item_fields)) {
                    if (subRule.extract === 'text') {
                        item[subName] = $(el).find(subRule.selector).first().text().trim();
                    }
                    else if (subRule.extract === 'text_after') {
                        const afterEl = $(el).find(subRule.after).first();
                        const fullText = $(el).text().trim();
                        const afterText = afterEl.text().trim();
                        let remaining = fullText.substring(fullText.indexOf(afterText) + afterText.length);
                        if (subRule.trim_prefix) {
                            remaining = remaining.replace(new RegExp(`^\\s*${escapeRegex(subRule.trim_prefix)}\\s*`), '');
                        }
                        item[subName] = remaining.trim();
                    }
                }
                if (Object.values(item).some(v => v))
                    items.push(item);
            });
            return items.length > 0 ? items : null;
        }
        case 'heading_section': {
            const headings = section.find(rule.heading_tag);
            let targetHeading = null;
            headings.each((_i, el) => {
                if ($(el).text().trim().toLowerCase().includes(rule.heading.toLowerCase())) {
                    if (!targetHeading)
                        targetHeading = $(el);
                }
            });
            if (!targetHeading)
                return null;
            // CRITICAL: Use nextAll().first() instead of next() for robustness
            // If there's an <hr> between heading and content div, next(selector) won't find it
            const contentDiv = targetHeading.nextAll(rule.content_selector).first();
            if (!contentDiv.length)
                return null;
            if (rule.content_extract === 'prose')
                return extractProse($, contentDiv, proseRules);
            if (rule.content_extract === 'code_blocks')
                return extractCodeBlocks($, contentDiv, rule.code_selector || 'pre code');
            return contentDiv.text().trim() || null;
        }
        case 'nested_sections': {
            return extractNestedSections($, section, rule, proseRules, 0);
        }
        case 'link_list': {
            const links = [];
            section.find(rule.selector).each((_i, el) => {
                const text = $(el).text().trim();
                const href = $(el).attr('href');
                if (text && href)
                    links.push({ text, href });
            });
            return links.length > 0 ? links : null;
        }
        case 'repeating_group': {
            const anchors = section.find(rule.group_anchor);
            const items = [];
            anchors.each((_i, anchorEl) => {
                const item = {};
                const anchor = $(anchorEl);
                for (const [subName, subRule] of Object.entries(rule.item_fields)) {
                    let target = anchor;
                    if (subRule.offset !== undefined && subRule.offset !== 0) {
                        for (let step = 0; step < subRule.offset; step++) {
                            target = target.next();
                        }
                    }
                    if (!target.length)
                        continue;
                    let text;
                    if (subRule.selector) {
                        text = target.find(subRule.selector).first().text().trim();
                    }
                    else {
                        text = target.text().trim();
                    }
                    if (subRule.regex && text) {
                        const m = text.match(new RegExp(subRule.regex));
                        text = m ? m[1] : text;
                    }
                    item[subName] = text || '';
                }
                if (Object.values(item).some(v => v))
                    items.push(item);
            });
            return items.length > 0 ? items : null;
        }
        default:
            return null;
    }
}
//# sourceMappingURL=extractor.js.map