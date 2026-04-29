# Foreman Real-World Usage Review

Date: 2026-04-25  
Reviewer perspective: Codex using Foreman MCP during SignalMap implementation

## Summary

Foreman's core idea is strong: durable phase/unit state plus mandatory clean-worker delegation before pass verdicts materially improves implementation quality. In real use, the worker-before-verdict invariant caught a genuine issue that a normal "tests pass, ship it" loop would likely have missed.

The biggest improvement area is host adaptation. Foreman currently feels optimized for Claude Code terminology and assumptions. It should detect or be told which CLI/agent host it is running under, then adjust protocol text, test execution, delegation expectations, and state hints accordingly.

## What Worked Well

### Worker-before-verdict invariant

This is worth keeping. During SignalMap Unit 1a, the first worker patch passed focused tests but accidentally allowed same-origin Fetch Metadata to bypass desktop/Tauri API-key enforcement. The pit-boss review rejected it, spawned a fresh worker, and the second worker fixed the issue with better regression tests.

That is exactly the value proposition:

- Worker context is clean and bounded.
- Pit-boss context has the full spec and validation responsibility.
- Rejections are durable, not just conversational.
- Fresh workers reduce sunk-cost bias after a failed attempt.

### Durable ledger

The ledger made the implementation trail explicit:

- unit status
- worker brief
- rejection reason
- pass verdict
- validation note
- checkpoint status

That gives future sessions a much better chance of resuming accurately than chat memory alone.

### Rejection flow

The enforced rejection path is useful. It pushes the pit-boss to name the exact defect, record it, and give the next worker a focused fix brief. This is better than letting the same context rationalize a weak patch.

## Friction Observed

### Host assumptions are Claude-specific

The protocol uses Claude-centric language such as Opus, Sonnet, `/model opus`, and "Agent tool". In Codex, this still works conceptually, but the instructions feel translated rather than native.

Recommendation: introduce a host adapter layer.

```text
host = claude_code | codex_cli | gemini_cli | cursor | unknown
```

Then render the same Foreman protocol with host-native terms:

| Concept | Claude Code | Codex |
|---|---|---|
| Pit-boss model | Opus | current parent agent |
| Worker model | Sonnet worker | spawned worker agent |
| Agent tool | Task/Agent | spawn_agent |
| Read tool | Read | shell/Get-Content or MCP resources |
| Test runner | Bash/tooling | Foreman run_tests or shell fallback |

### CLI detection should be explicit first, inferred second

Do not rely only on environment sniffing. CLI-specific env vars are brittle and will drift.

Recommended detection order:

1. Explicit user/project config:
   - `.foreman/config.json`
   - `FOREMAN_HOST=codex|claude|gemini`
2. MCP client metadata if available:
   - client name/version from MCP initialization
   - tool namespace availability
3. Capability probes:
   - can spawn subagents?
   - can run shell commands?
   - can run tests through Foreman?
   - can request approvals?
4. Environment hints:
   - CLI-specific env vars
   - executable/process names
5. Fallback:
   - `unknown` host with conservative generic protocol

The host should be recorded in the journal and ledger session metadata.

### Foreman `run_tests` failed on Windows npm resolution

Foreman attempted:

```text
C:\Program Files\nodejs\npm
```

and failed with `ENOENT`. PowerShell `npm run test:data` worked outside the Foreman runner.

Recommendation:

- Resolve npm through platform-aware lookup:
  - Windows: `npm.cmd` via `where.exe npm`
  - Unix: `which npm`
- Store the resolved command in session diagnostics.
- If resolution fails, return a structured remediation message.
- Consider a `run_tests` fallback mode that can invoke the shell-approved test command safely.

### Progress and ledger orientation drifted

After Unit 1a passed, `session_orient` correctly reported last completed `phase-1/1a`, but still showed current phase as Phase 0 and progress hints said resume at `0a`.

This is risky because agents trust orientation output.

Recommendation:

- Make ledger the single source of truth for next unit.
- Treat progress as a human-readable projection, not an authority.
- Add a consistency check:
  - if unit verdict is `pass`, it cannot appear as pending in resume hints.
  - if all units in a phase are pass, phase should not remain the active resume target unless the phase gate is explicitly blocking.
- Provide `foreman doctor` output:
  - ledger/progress mismatches
  - invalid phase pointers
  - orphaned completed units
  - stale hints

### Delegation status schema was discoverable only by error

I first wrote `s: delegated` with a worker-like field, and Foreman rejected it because it required `brief`. The error was good, but the protocol text should show the exact schema.

Recommendation:

Document required payloads directly in the protocol:

```json
{
  "operation": "set_unit_status",
  "phase": "phase-1",
  "unit_id": "1a-public-api-gate-policy",
  "data": {
    "s": "delegated",
    "brief": "Worker brief summary, min 20 chars"
  }
}
```

Also consider accepting `w` as a deprecated alias with a warning, then normalizing to `brief`.

## Recommended Improvements

### 1. Add a host adapter

Foreman should have a small internal abstraction:

```ts
interface ForemanHostAdapter {
  host: 'claude_code' | 'codex' | 'gemini' | 'unknown';
  canSpawnWorkers: boolean;
  canRunShell: boolean;
  canRequestApproval: boolean;
  testRunnerStrategy: 'foreman' | 'shell' | 'manual';
  terms: {
    pitBoss: string;
    worker: string;
    delegationTool: string;
  };
}
```

Use this adapter to generate instructions and warnings that match the active host.

### 2. Separate protocol invariants from host-specific instructions

Keep these as invariant:

- pit-boss validates worker output independently
- workers get narrow briefs
- pass verdict requires prior delegation
- rejections require fresh workers
- ledger is mutated only through MCP tools

Move these to host templates:

- model names
- exact tool names
- shell/test execution mechanics
- approval workflow details

### 3. Make checkpoint state more expressive

A unit can pass while the full checkpoint is red from unrelated baseline failures. Foreman should model that explicitly.

Suggested statuses:

```text
unit verdict: pass | fail | pending
checkpoint: pass | fail-related | fail-unrelated | blocked | skipped
phase gate: pass | fail | pending
```

This avoids making a good unit look suspect because the global suite had unrelated historical failures.

### 4. Add structured validation notes

Instead of a single free-form note, consider:

```json
{
  "focused_tests": [
    {
      "command": "npx tsx --test tests/signalmap-public-access.test.mjs ...",
      "result": "pass",
      "tests": 61
    }
  ],
  "full_checkpoint": {
    "command": "npm run test:data",
    "result": "fail-unrelated",
    "known_failures": [
      "agent-skills fetch-country-brief sha256 drift",
      "regulatory-seed-unit import.meta VM SyntaxError"
    ]
  },
  "pitboss_gates": {
    "contract_completeness": "pass",
    "assertion_integrity": "pass",
    "spec_fidelity": "pass",
    "test_suite_impact": "pass",
    "worker_hygiene": "pass"
  }
}
```

This would make later audits easier than parsing prose.

### 5. Add a `doctor` or `orient --strict` command

This command should detect:

- passed units still shown as pending
- phase mismatch between ledger and progress
- phase gate failure caused only by unrelated baseline failures
- missing worker brief for delegated units
- pass verdicts without delegation
- test runner unavailable on current platform

### 6. Improve Windows support

Windows support needs first-class handling:

- use `npm.cmd`
- avoid hardcoded executable paths
- normalize paths in ledger output
- distinguish sandbox `EPERM` from real test failure
- allow platform-specific command resolution diagnostics

### 7. Keep worker isolation, but make it easier to comply

The worker isolation rule is good. To reduce accidental violations:

- provide a generated worker-brief template for the current unit
- include only approved file paths and excerpts
- include a checklist of "do not read"
- include a one-line command to record delegation

Example:

```text
foreman build-worker-brief phase-1/1a --files api/bootstrap.js api/rss-proxy.js server/gateway.ts
```

## Design Principle To Preserve

Do not make Foreman lighter by removing the hard parts that caught real bugs. The cost is justified when the task has multiple files, security behavior, or stateful phase tracking.

Instead, make the hard parts smoother:

- better host detection
- better Windows test execution
- clearer schemas
- stronger ledger/progress consistency
- structured validation records

## Priority List

1. Fix platform-aware `run_tests` command resolution.
2. Add host detection with explicit config override.
3. Fix orientation/progress drift so completed units never appear as resume targets.
4. Document ledger schemas for delegated status and verdicts.
5. Add structured checkpoint status for unrelated baseline failures.
6. Add `foreman doctor` consistency checks.
7. Render host-native protocol text for Codex, Claude Code, Gemini, and unknown hosts.

## Bottom Line

Foreman's core protocol is sound. The worker-before-verdict invariant is not busywork; in real use it caught a security-relevant edge case. The next step is not to loosen Foreman. The next step is to make it host-aware, platform-aware, and stricter about its own state consistency.
