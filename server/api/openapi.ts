/**
 * generateSpec() — returns the SignalMap OpenAPI 3.1 document as a JS object.
 *
 * Pure function, no file I/O.  Phase 3b will wire a build script to call this
 * and emit YAML; do not add file-system concerns here.
 */

import 'zod-openapi/extend';
import { createDocument, oas31 } from 'zod-openapi';
import { signalmapPaths } from './schemas/signalmap.js';

export function generateSpec(): oas31.OpenAPIObject {
  return createDocument({
    openapi: '3.1.0',
    info: {
      title: 'SignalMap API',
      version: '2.0.0',
      description:
        'Public SignalMap HTTP API for events, source health, SSE stream, and briefs.',
    },
    servers: [{ url: '/' }],
    paths: signalmapPaths,
  });
}
