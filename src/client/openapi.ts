import createClient from 'openapi-fetch';
import type { paths } from './types.js';
import { getApiBaseUrl } from './base-url.js';

export const client = createClient<paths>({ baseUrl: getApiBaseUrl() });
