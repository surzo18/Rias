# Testing and Quality Gates

## 1) Mandatory TDD workflow

All production behavior changes follow:
1. write failing test
2. implement minimal pass
3. refactor with green suite

PRs without tests are blocked unless marked as documentation-only and approved.

## 2) Required test suites

- unit:
  - policy decisions
  - model routing logic
  - lock lease behavior
- integration:
  - control plane + queue + state store
  - agent execution against capability profile
  - controlled agent provisioning/deprovisioning workflow (template selection, capability binding, activation)
  - agent identity lifecycle workflow (issue, rotate, revoke, deactivate)
  - agent memory write/read path across scopes (`job`, `project`, `global`) with isolation guarantees
  - skills binding and skill-version compatibility checks against capability profile
- contract:
  - OpenAPI and AsyncAPI compatibility
  - JSON Schema validation
- e2e:
  - Discord ingress to completed job
  - Telegram ingress to completed job
  - Web UI ingress to completed job
  - representative external human-channel connector ingress to completed job
  - representative developer-platform/webhook connector ingress to completed job
  - representative machine/event-feed connector ingress to completed job (for example market/status/signal feed)
  - external connector normalization parity tests (all enabled connectors map to canonical contract with identical policy/routing outcomes)
- security:
  - authN/authZ enforcement
  - prompt/tool injection attempts
  - SSRF attempt blocking for outbound HTTP calls (webhook, connector, and model provider endpoints; allowlist enforcement)
  - secret redaction in logs
  - memory content validation (anti-poisoning): write payloads containing executable code patterns, prompt injection markers, and credential-like strings must be rejected (`agent.memory.write.rejected` with `content_policy_violation`)
  - agent-to-agent direct network communication blocking (network policy enforcement at agent workload boundary)
  - mTLS enforcement for internal service-to-service calls (control plane, scheduler, worker, lock manager)
  - threat-model mapped test scenarios (STRIDE coverage)
  - supply-chain checks (dependency audit, SBOM/provenance verification)
- resilience:
  - worker crash mid-run
  - lock expiry and stale cleanup
  - retry and dead-letter flow
  - deadlock/livelock/starvation detection and recovery
  - compensation flow validation for partial failures
  - failed agent provisioning rollback/deprovision validation
- HITL:
  - approve/reject/request_changes/defer
  - timeout and reminder behavior
  - agent provisioning approval paths for Tier C/new agent type/cross-project scope
- DR:
  - restore from backup
  - queue/state replay consistency
- tenancy isolation:
  - cross-tenant access denial tests
  - tenant boundary leakage tests (API/events/logs)
- privacy and compliance:
  - DSAR workflow tests (access/correction/export/delete request lifecycle)
  - data residency enforcement tests by tenant policy
  - DPIA-required change flagging tests for high-risk processing paths
  - DPIA trigger-criteria tests (sensitive processing, significant automated decisioning, cross-border regulated routing, new external data sharing)
  - release-blocking tests when DPIA is required but missing/expired
  - agent memory DSAR traceability tests (subject linkage, export, deletion evidence)
- scalability:
  - queue depth stress tests
  - autoscaling reaction tests
  - backpressure policy tests

## 3) Coverage policy

- changed lines coverage: minimum 90%
- critical modules (`policy`, `scheduler`, `locks`, `auth`, `approval`): minimum 95%
- Tier C flows: 100% automated scenario coverage

## 4) CI/CD gates

PR gate:
- unit + integration + contract + security baseline

Pre-release gate:
- full e2e
- resilience smoke
- HITL scenario pack

Release gate:
- full test suite
- DR smoke restore
- rollback verification
- changelog and version tag validation

## 5) Flaky test policy

- flaky tests block release
- flaky marker requires issue id and owner
- 7-day max to stabilize or quarantine with risk sign-off

## 6) Control-to-test traceability (mandatory)

Every P0/P1 control must map to:
- at least one automated test id
- one CI gate where it is enforced
- one runtime signal/metric for production verification

A change touching control behavior without updated traceability mapping fails PR gate.

## 7) Retry, timeout, and compensation test matrix

Mandatory coverage:
- retry-class assertions for every retryable error code
- timeout budget decomposition tests (API, queue wait, worker execution)
- saga/compensation tests for partially-applied multi-step jobs
- idempotency conflict tests for same key + different payload hash

## 8) Contract and migration compatibility tests

Mandatory coverage:
- heterogeneous consumer compatibility in `N`, `N+1`, `N+2` overlap
- dual-write and dual-read migration tests
- rollback rehearsals that include schema compatibility metadata

## 9) Documentation and policy drift checks

CI must validate:
- docs updates for policy/contract/routing/security changes
- canonical source references present in affected docs
- no duplicated normative tables without canonical link

## 10) Test data management policy

Test environments must not contain real production PII:
- dev and stage test suites must use synthetic or anonymized data only; use of real production personal data in test environments is prohibited
- test fixtures and factory data for `sensitive`-classified data categories must use realistic but entirely fabricated values
- automated anonymization or pseudonymization is required before any production data export to a lower environment; export must be approved by the security owner and create an audit event
- test data pipelines that process PII are subject to the same data classification controls as production (`02-storage-and-migrations.md` Section 9)
- CI must fail if real-data-sourced fixtures are detected in test fixture directories

## 11) Agent memory and skills quality gates

Mandatory release checks:
- identity credential lifecycle tests pass for all active agent templates
- credential rotation policy presence and validity checks pass for every environment
- memory migration and rollback rehearsal covers `agent_memory_records` and `agent_memory_events`
- no cross-environment memory access in automated isolation tests
- skill manifest compatibility checks pass for active projects
- agent memory mutation event contract checks pass (`agent.memory.*` events)
