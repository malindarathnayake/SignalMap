Okay, let's begin the adversarial review.

## [HIGH] [CATEGORY (A)] Spec directive not implemented: SSE stream should gracefully handle brief generation failures

**File**: `server/api/routes/signalmap-stream.ts:1` (whole file)
**Spec**: "If brief generation fails, the stream MUST send an SSE `error` event with a JSON payload `{ "message": "Brief generation failed", "details": "..." }` and then close. This is a critical feature for client-side error handling."
**Issue**: The current implementation of `signalmap-stream.ts` does not have any logic to handle failures during brief generation. The SSE stream setup focuses solely on replaying events from the Redis ring buffer. If an upstream service responsible for providing data to generate a brief were to fail, the stream would not notify the client with an `error` event as required by the spec; it would likely hang or close without a specific error message.
**Recommendation**: Implement a `try...catch` block around the brief generation logic. In the `catch` block, construct and send an SSE `error` event with the specified JSON payload before closing the connection. This requires coordination with the brief generation logic, which appears to be a separate process.

## [HIGH] [CATEGORY (B)] Implementation contradicts spec: `resolveApiBaseUrl` returns an empty string for invalid URLs instead of throwing an error or using a default

**File**: `src/client/base-url.ts:31`
**Spec**: "The base URL logic must be robust. If `VITE_API_BASE_URL` is malformed (e.g., missing a scheme), the client should either default to a local URL or throw a build-time/run-time error to prevent silent failures."
**Issue**: The function `resolveApiBaseUrl` returns an empty string (`''`) for scheme-less or invalid base URLs. The spec requires a more explicit failure mode. Returning `''` can lead to confusing and hard-to-debug client-side failures where API calls are made to relative paths that don't exist (e.g., `/api/signalmap/list` from the current page URL instead of `http://localhost:3000/api/signalmap/list`).
**Recommendation**: Modify `resolveApiBaseUrl` to throw an error when the provided `envValue` is determined to be invalid. This will make misconfigurations immediately obvious during application startup or build, which aligns with the spec's intent for robustness.

## [MEDIUM] [CATEGORY (D)] Test gap: No test for SSE replay with a `Last-Event-ID` that has fallen out of the ring buffer's time window

**File**: `tests/sse-stream.test.mjs:1` (whole file)
**Spec**: "When a client reconnects with a `Last-Event-ID` that is older than the `SSE_REPLAY_SECONDS` window, the server must... send a `lost` event with `{"lost":true}`... then resume sending live events."
**Issue**: The test suite for the SSE stream (`tests/sse-stream.test.mjs`) and the replay ring (`tests/sse-replay-ring.test.mjs`) cover cases where `Last-Event-ID` is within the buffer. However, there is no explicit test case that simulates a client reconnecting with an ID that is valid but *older* than the replay window. This is a critical edge case for client synchronization. While the logic in `sse-replay-ring.ts:91-95` was fixed to address this, a regression test is missing.
**Recommendation**: Add a new test case to `tests/sse-stream.test.mjs`. This test should:
1.  Populate the Redis ring buffer with events.
2.  Wait for a duration longer than `SSE_REPLAY_SECONDS`.
3.  Mock a client request with the `Last-Event-ID` header set to the ID of one of the old events.
4.  Assert that the first event received by the client is a `lost` event with the correct payload, and subsequent events are live ones.

## [MEDIUM] [CATEGORY (D)] Test gap: OpenAPI schema generation does not validate endpoint count

**File**: `tests/openapi-spec-generation.test.mjs:1` (whole file)
**Spec**: "Generated `openapi.yaml` MUST contain definitions for all 6 SignalMap endpoints."
**Issue**: The test `tests/openapi-spec-generation.test.mjs` validates that the `openapi.yaml` file is generated and contains some basic metadata like `info.title`. However, it does not programmatically verify that all 6 of the required SignalMap endpoints are present in the generated `paths` object. A developer could accidentally remove an endpoint from `server/api/schemas/signalmap.ts` and this test would still pass, violating the spec.
**Recommendation**: Enhance `tests/openapi-spec-generation.test.mjs` to parse the generated YAML, and assert that the `paths` object contains keys for all 6 specified endpoints: `/api/signalmap/list`, `/api/signalmap/event/{id}`, `/api/signalmap/source-health`, `/api/signalmap/stream`, `/api/signalmap/brief/global`, and `/api/signalmap/brief/event/{id}`.

---
Category (c) Missing Error Handling: No additional findings beyond the one listed in category (a).
