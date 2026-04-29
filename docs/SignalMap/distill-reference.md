# SignalMap Distill Reference

Source repo: `C:\Coding_Workspace\Github_P\distill`

This file captures only the distill context needed for SignalMap descriptor and collector work. It avoids copying the full external repo.

## Package Facts

- Package name: `distill`
- Module type: ESM
- Build command: `npm run build`
- Test command: `npm test`
- Descriptor generator: `npm run create-descriptor -- <url> --name <name> --out <descriptor>`
- Runtime dependencies relevant to SignalMap: `cheerio`, `@toon-format/toon`
- Public extraction API: `new Distill({ descriptors }).extract(url)`
- Pure fixture extractor: `extract(html, descriptor, inputUrl)` from `src/extractor.ts`

## Descriptor Shape

Descriptors are JSON files with:

- `name`, `version`, `description`
- `url_pattern`
- `root`
- optional `section`
- optional `cleanup.remove_selectors`
- `fields`
- optional `metadata`
- optional `prose_rules`

Field extraction supports:

- `text`
- `attr`
- `list`
- `prose`
- `code_blocks`
- `heading_section`
- `nested_sections`
- `link_list`
- `repeating_group`

Required fields throw `ExtractionError` when empty or missing.

## SignalMap News Output Contract

Risky Business News and The Hacker News descriptors must extract:

- `title`
- `articleBody`
- `canonicalUrl`
- `sourceName`

Optional fields:

- `dek`
- `author`
- `publishedAt`
- `updatedAt`
- `tags`

Cleanup should remove:

- `script`
- `style`
- `nav`
- `header`
- `footer`
- ads
- newsletter boxes
- sidebars
- related-post blocks
- comments

## Fixture Test Pattern

Distill fixture tests should:

- import `readFileSync` from `fs`
- import `describe`, `it`, `expect` from `vitest`
- import `extract` from `../extractor.js`
- load descriptor JSON from `descriptors/*.json`
- load HTML from `test/fixtures/*.html`
- assert required output field values, not just object shape

Unit 0b still targets the external distill repo for final descriptor and fixture-test files.
