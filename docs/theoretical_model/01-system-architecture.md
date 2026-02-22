# RIAS Architecture Blueprint

## 1) Purpose and system shape

RIAS is a multi-user agent system where users can enter from multiple channels:
- Discord
- Telegram
- OpenClaw Web UI
- connector-based external human channels (mailbox, collaboration tools, developer platforms)
- connector-based external machine/event feeds (webhooks, market/sensor/status signals, scheduled external triggers)
- other approved external sources via connector adapter model

OpenClaw is the only runtime ingress and execution core (running in Docker isolation).
RIAS adds a control layer on top for policy, safety, routing, approvals, and observability.

Core intent:
- allow many users to submit work in parallel
- prevent unsafe overlap in execution
- keep responsibilities clearly separated
- require human decisions only when risk or uncertainty demands it

## 2) High-level architecture

```text
[Discord] [Telegram] [Web UI] [External Human Channels] [External Machine/Event Feeds]
      \       |        |               |                          /
       \      |        |               |                         /
        +----------------------+
        | OpenClaw Gateway     |  (single ingress, Docker)
        +----------+-----------+
                   |
                   v
        +----------------------+
        | RIAS Control Plane   |
        | - authN/authZ        |
        | - policy engine      |
        | - model router       |
        | - budget guard       |
        +----------+-----------+
                   |
                   v
        +----------------------+
        | Scheduler + Queue    |
        | - serial per project |
        | - deps + retries     |
        +----------+-----------+
                   |
                   v
        +----------------------+
        | Lock + State         |
        | - project locks      |
        | - shared/infra locks |
        | - lease/heartbeat    |
        +----------+-----------+
                   |
                   v
        +----------------------+
        | Agents (workers)     |
        | - per project        |
        | - infra agent        |
        | - content agent      |
        +----------+-----------+
                   |
                   v
        +----------------------+
        | Tools/Repos/Infra    |
        +----------------------+

Cross-cutting: Logs, Audit, Metrics (incl. gateway ingress), Traces, Token/Cost telemetry

Supporting components (omitted from diagram for readability):
- Configuration service (distinct component, HA-required; defined in Section 24)
- Secret-management service (sole accessor of secret zone; defined in Section 19)
```

Gateway availability requirements:
- gateway instances must be stateless (no local session state)
- minimum 2 gateway instances in stage and prod environments
- load balancer with health-check routing is mandatory for multi-instance deployment
- single-instance is allowed only in dev environment

Scheduler availability requirements:
- scheduler must use active/standby model with automatic leader election
- leader election must use distributed consensus (etcd/ZooKeeper or equivalent)
- standby instance must be warm (loaded config, connected to state store) and able to assume leadership within 30 seconds
- split-brain protection is mandatory: only the elected leader may dispatch jobs
- failover must preserve in-flight job state via durable queue and lock store (no silent job loss)
- single-instance is allowed only in dev environment

## 3) Responsibility boundaries

- OpenClaw Gateway:
  - channel ingress
  - external connector normalization (chat/mail/webhook payloads to canonical request/event contracts)
  - session/runtime core
  - gateway ingress metrics emission (request count, latency, error rate, per-channel breakdown)
- RIAS Control Plane:
  - decision authority before execution
  - policy and risk classification
  - model and cost routing
  - scaling posture: stateless (no session affinity); horizontally scalable behind gateway load balancer
- Scheduler:
  - ordering and dependency execution
- Lock Manager:
  - anti-overlap guarantees
- Agents:
  - domain-specific planning and execution in allowed scope
- HITL:
  - explicit human approval for risky or ambiguous work

Service discovery:
- all RIAS components must register with a service discovery mechanism (DNS-based or registry-based)
- service endpoints must be resolved via service discovery; hardcoded addresses are prohibited in stage/prod
- health status must propagate to service discovery (unhealthy instances are deregistered)
- service discovery must support environment-scoped resolution (dev/stage/prod isolation)
- implementation options: DNS-based (Consul DNS, CoreDNS) or registry-based (Consul, etcd, Kubernetes service discovery)

Policy engine unavailability behavior:
- if the policy engine is unreachable, the control plane must enter degraded mode:
  - Tier A jobs continue with last-known cached policy (cache TTL: 60 seconds)
  - Tier B and Tier C jobs are queued with `blocked` status pending policy engine recovery
  - emit `INFRA_503_DEPENDENCY_DOWN` alert with `component = policy_engine`
- degraded mode is time-bounded: if policy engine is unavailable for > 5 minutes, all new job submissions are rejected with `POLICY_503_ENGINE_UNAVAILABLE`
- recovery must re-evaluate queued `blocked` jobs against restored policy before resuming dispatch

Policy engine availability requirements:
- policy engine is stateless and horizontally scalable behind the control plane load balancer
- minimum 2 instances in stage and prod environments; single instance is allowed only in dev
- policy version cache is refreshed independently per instance; cache TTL: 60 seconds (consistent with degraded-mode cache TTL above)
- health probes per `03-api-and-event-contracts.md` Section 17 are required
- policy engine node failure must trigger automatic instance replacement; requests during replacement route to remaining healthy instances

## 4) Agent model

Agent-per-project is the default:
- `agents/projects/<project-id>/`
- `agents/infra/`
- `agents/content/`
- controlled dynamic agent provisioning is allowed only via governed self-development workflow (`07-continuous-improvement-and-extension-model.md`)
- canonical identity/memory/skills model is defined in `08-agent-memory-identity-and-skills.md`

Each agent has a capability profile:
- allowed resources
- allowed tools
- allowed actions
- risk limits

Agents do not get unlimited authority. They execute only inside declared capability scope.

## 5) Execution model and overlap prevention

Concurrency policy:
- serial per project (project-local safety)
- shared resources (infra/platform) require shared lock

Serial-per-project throughput implications:
- a single long-running job blocks all subsequent jobs in the same project queue; within-project parallelism is not supported by design
- this is a deliberate safety constraint, not a scalability target; the primary mitigation is job decomposition (smaller atomic jobs with explicit dependencies)
- projects requiring high-throughput parallel execution must decompose work into separate intents submitted as parallel jobs with distinct idempotency keys; the scheduler will interleave them across project queue slots
- sustained per-project queue depth pressure must be tracked via queue depth metrics and reported in weekly scorecard; remediation options are job decomposition or priority tier review

Rules:
1. Every job has `job_id` and `idempotency_key`.
2. Locks use lease + heartbeat.
3. Lock timeout triggers recovery flow.
4. Multi-scope jobs acquire locks in fixed order to avoid deadlocks.
5. Repeated failures move to dead-letter queue.
6. Every lockable resource class must be listed in a lock-order registry (canonical order). Memory locks (`agent:mem-lock:<scope_key>`) must be included in the lock-order registry. Canonical acquisition order: infrastructure locks → budget locks → project locks → memory locks.

Note: budget guard locks are classified as infrastructure-adjacent and must be acquired after infrastructure locks but before project locks to prevent deadlock between budget enforcement and project execution paths.
7. Lock acquisition metrics must be emitted (`acquire_ms`, `wait_ms`, `contention_count`).
8. Idempotency semantics (scope, window, payload hash behavior) are contract-defined and enforced consistently.
9. Deadlock/livelock/starvation scenarios are covered by resilience tests and quarterly chaos drills.
10. Every lease write must include a fencing token (monotonic epoch). Consumers must reject operations bearing stale fencing tokens. Fencing token validation is mandatory at lock acquisition and every mutating operation under lock.

PostgreSQL failover behavior for lock writes:
- if PG failover occurs during an active lock write, the lock write is treated as failed
- the lock manager must retry the lock acquisition against the new primary
- any in-flight operations under the failed lock must be rolled back and re-queued
- lock state must be verified against the new primary before resuming operations
11. Graceful shutdown is mandatory for all worker and scheduler processes. On SIGTERM: stop accepting new work → drain in-flight operations (within drain budget) → release held locks → flush pending telemetry → exit. Drain budget defaults are defined in `05-slo-dr-and-release-ops.md` Section 20.

## 6) Human-in-the-loop (HITL)

Not all actions require human approval.

Risk tiers:
- Tier A (low risk): auto-run
- Tier B (medium risk): auto-run with strict guardrails
- Tier C (high risk): mandatory human approval

HITL state:
- `waiting_human_decision`

Decisions (informative summary; canonical policy is in `05-slo-dr-and-release-ops.md` Section 3):
- `approve`
- `reject`
- `request_changes`
- `defer`

Escalation triggers:
- infra/schema/security changes
- policy conflict
- low confidence / ambiguous user intent
- budget threshold breach

## 7) Model routing (local/cloud, commercial/non-commercial)

Routing inputs:
- task type
- data classification
- cost mode
- quality tier
- policy constraints

Hard rules:
- sensitive data can be forced to local-only
- budget guard can deny or downgrade model choice
- fallback chain must be explicit and audited

Budget guard state management:
- PostgreSQL is source of truth for budget ledger and thresholds
- Redis caches current budget counters for low-latency enforcement
- on Redis unavailability, budget guard must fall back to synchronous PG read (degraded mode) and emit `INFRA_503_DEPENDENCY_DOWN` alert

Budget guard reconciliation:
- on Redis recovery after failover, budget counters must be reconciled from PostgreSQL source of truth before resuming Redis-cached enforcement
- reconciliation must complete before switching back from degraded (PG-direct) mode to normal (Redis-cached) mode
- reconciliation must emit `budget.reconciliation.completed` telemetry event with drift delta

Budget guard double-failure policy (Redis and PostgreSQL simultaneously unavailable):
- if both Redis and PostgreSQL are unavailable, budget guard must fail closed: all new job submissions requiring budget enforcement are rejected with `INFRA_503_DEPENDENCY_DOWN` (`component = budget_guard`, `reason = dual_store_unavailable`)
- in-flight jobs that already passed budget enforcement prior to the dual failure may continue to completion; no new enforcement decisions are issued for any tier
- emit `SEV1` alert in production and `SEV2` alert in stage for dual-store unavailability
- recovery sequence: PostgreSQL availability must be confirmed first; budget counters are reconciled from PostgreSQL before Redis cache is rebuilt; normal Redis-cached enforcement resumes only after reconciliation completes

Model router observability requirements:
- `confidence_score` (0.0-1.0) is mandatory on every routing decision record
- required metrics: `routing_decision_count`, `routing_latency_ms`, `routing_fallback_count`, `confidence_score_distribution`
- metrics must be sliceable by `model_provider`, `data_classification`, `cost_mode`, and `quality_tier`

Model provider circuit breaker:
- external model provider calls must use circuit breaker pattern
- circuit states: `closed` (normal) → `open` (provider failing, requests fail-fast to fallback) → `half-open` (probe traffic to test recovery)
- open threshold: 5 consecutive failures or > 50% error rate in 60-second window
- half-open probe: 1 request every 30 seconds; 3 consecutive successes close the circuit
- circuit state changes must be logged and emit `model.circuit_breaker.state_changed` metric
- open circuit must trigger immediate fallback chain evaluation

Budget guard availability requirements:
- budget guard operates as a sub-component of the control plane; all durable state is in PostgreSQL (source of truth for budget ledger) and Redis (low-latency cache for enforcement)
- minimum 2 instances in stage and prod environments; single instance is allowed only in dev
- budget guard inherits control plane HA topology: horizontally scalable behind gateway load balancer, minimum instance counts align with control plane (canonical topology in Section 3)
- autoscaling triggers and bounds are defined separately in the budget guard row of `05-slo-dr-and-release-ops.md` Section 11; budget guard scales on enforcement latency and error rate (not on CPU like the control plane), reflecting its distinct performance profile as a latency-sensitive sub-component
- on Redis unavailability, budget guard degraded mode (synchronous PG read) must be available across all running instances

## 8) Contracts between components

All communication is contract-driven and versioned.

Required standards:
- OpenAPI for synchronous APIs
- AsyncAPI for event streams
- JSON Schema for payloads

Required fields on every post-submission mutating command/event:
- `schema_version`
- `request_id`
- `trace_id`
- `job_id`
- `idempotency_key`
- `actor_id`
- `project_id`

Note: `RequestMeta` schema (defined in `03-api-and-event-contracts.md`) carries `schema_version`, `request_id`, `trace_id`, `actor_id`, `project_id`. The fields `job_id` and `idempotency_key` are carried in individual operation schemas (not in `RequestMeta`) because `job_id` does not exist at submit time and `idempotency_key` semantics vary by operation type.

Distributed tracing standard:
- all services must propagate W3C Trace Context (`traceparent`, `tracestate`) headers
- span hierarchy (5 levels): `ingress` → `control-plane` → `scheduler` → `worker` → `tool-call`
- every span must include `service.name`, `trace_id`, and `span_id` attributes

## 9) Mandatory controls (17 areas)

1. Identity and tenancy mapping across channels
2. Approval UX with SLA, reminders, timeout handling
3. Prompt/tool injection protection for channel input
4. Secrets lifecycle (vault, scope, rotation, redaction)
5. Data governance (classification, retention, deletion/export)
6. Disaster recovery and backup targets (RPO/RTO)
7. Policy versioning with auditability
8. Contract testing (schema compatibility checks)
9. Dead-letter queue for repeated failures
10. SLOs (latency, success rate, approval lead-time, cost/task)
11. Model evaluation loop by task type
12. Kill switch (scoped: global, per-project, per-agent, per-intent). Enforcement points: gateway ingress, scheduler dispatch, worker execution. Activation requires `owner` or `infra-approver` role.

Kill switch state storage:
- kill switch state is persisted in PostgreSQL `kill_switch_state` table (canonical schema in `02-storage-and-migrations.md`)
- active kill switch state is cached in Redis key `killswitch:<scope>:<target_id>` with TTL matching enforcement check interval
- state changes require `owner` or `infra-approver` role and emit `operations.killswitch.activated` / `operations.killswitch.deactivated` audit events

13. Manual override mode for operators
14. Change windows for high-risk operations
15. On-call runbooks for incident classes
16. Compliance and privacy governance (including GDPR-ready processes)
17. Supply-chain integrity (SBOM, provenance verification, dependency hygiene; see CTRL-17 in Section 21)

Policy engine observability requirements:
- mandatory metrics: `policy_evaluation_count`, `policy_evaluation_latency_ms`, `policy_denial_count`, `policy_denial_reason`, `policy_version_active`
- metrics must be sliceable by `project_id`, `intent`, `risk_tier`, and `policy_version`

## 10) Criticality ranking

P0 (required before production):
- 1 Identity and tenancy
- 2 Approval UX (with timeout-safe behavior)
- 3 Injection protection
- 4 Secrets lifecycle
- 6 DR/backup baseline
- 12 Kill switch

P1 (required for stable operation):
- 5 Data governance
- 7 Policy versioning
- 8 Contract testing
- 9 Dead-letter queue
- 15 On-call runbooks
- 16 Compliance and privacy governance
- 17 Supply-chain integrity (CTRL-17)

P2 (optimization and scale maturity):
- 10 SLOs
- 11 Model evaluation loop
- 13 Manual override expansion
- 14 Change windows automation

## 11) Git and versioning policy (all projects and subprojects)

This policy is mandatory for the RIAS root and every subproject.

Branch model:
- `main` is protected and production-aligned.
- `vX.Y.Z` is the active release branch for a version line.
- `feature/<scope>-<name>` branches from the active `vX.Y.Z`.
- `hotfix/<scope>-<name>` branches from `main` for urgent production fixes.

Flow:
1. New work starts from current `vX.Y.Z`.
2. Features and bugfixes merge into `vX.Y.Z` (PR + required checks).
3. Release approval gates are executed on `vX.Y.Z`.
4. Approved release is merged to `main` with a controlled release PR.
5. Tag is created on `main` (for example `v1.4.0`).
6. If needed, `main` changes are synchronized back to the next `vX.Y.Z`.

Rules:
- no direct push to `main`
- no force-push on protected branches
- conventional commits required
- CODEOWNERS approval required for critical paths (security, policy, scheduler, contracts)
- every PR must include tests or explicit "no-test" justification approved by reviewer

Semantic versioning rules:
- project follows SemVer: `MAJOR.MINOR.PATCH`
- `PATCH`: bug fix, no breaking contract change
- `MINOR`: backward-compatible feature
- `MAJOR`: breaking API/event/behavior contract change
- any breaking contract change requires:
  - major version bump
  - migration guide
  - consumer sign-off

Subproject versioning rules:
- each subproject keeps its own version in addition to root release version
- release tags use:
  - root: `vX.Y.Z`
  - subproject: `<subproject>/vX.Y.Z`
- release PR must declare:
  - affected subprojects
  - target version bump per subproject
  - compatibility impact matrix

Hotfix policy:
- urgent production fixes branch from `main` as `hotfix/*`
- hotfix merges back to `main` first, then is cherry-picked or merged to active `vX.Y.Z`
- hotfix release increments `PATCH`
- hotfix without backport synchronization is not allowed

Branch protection policy:
- required status checks: tests, contracts, security, docs-sync
- required approvals:
  - minimum 1 maintainer for normal changes
  - minimum 2 approvals (one security/infra owner) for Tier C paths
- dismiss stale approvals on new commits

Release gates (mandatory before merge to `main`):
- full test suite green
- security checks green
- contract compatibility checks green
- migration/rollback validation complete
- release checklist approved by maintainers

## 12) Test strategy (TDD mandatory)

Canonical source:
- all normative TDD rules, test matrix, coverage thresholds, and CI/CD gates are defined in `04-testing-and-quality-gates.md`

Informative summary (non-normative):
- RIAS uses strict TDD (`red -> green -> refactor`) for production behavior changes
- production paths require automated tests and release-blocking quality gates
- test coverage includes unit/integration/contract/e2e/security/resilience/DR/HITL/scalability areas

## 13) Reference data contracts (minimum)

Job record contract (persisted job object, not submit payload):
```json
{
  "schema_version": "v1",
  "job_id": "uuid",
  "idempotency_key": "string",
  "request_id": "string",
  "trace_id": "string",
  "actor_id": "user-or-agent-id",
  "project_id": "project-id",
  "intent": "infra.create_db",
  "risk_tier": "A|B|C",
  "requires_human_approval": true,
  "parent_job_id": "uuid | null",
  "delegation_depth": 0,
  "constraints": {
    "data_classification": "public|internal|sensitive",
    "cost_limit_usd": 2.5,
    "prefer_local": true
  },
  "payload": {}
}
```

Decision contract:
```json
{
  "schema_version": "v1",
  "job_id": "uuid",
  "idempotency_key": "string",
  "decision": "approve|reject|request_changes|defer",
  "actor_id": "human-or-agent-id",
  "reason": "string",
  "timestamp": "ISO-8601",
  "idempotency_payload_hash": "string"
}
```

Decision contract notes:
- The JSON above represents the **persisted decision record**, not the `DecisionRequest` API request schema (defined in `03-api-and-event-contracts.md` Section 1). The API request schema carries `idempotency_key` in the request body; the server computes `idempotency_payload_hash` from the submitted decision payload — it is not a client-provided field.
- `idempotency_key` and `idempotency_payload_hash` follow the same ledger semantics as job submissions (informative; canonical idempotency rules are in `02-storage-and-migrations.md` Section 7)
- `actor_id` replaces the previous `decided_by` field and uses the same principal namespace as job record contracts

## 14) MVP implementation phases

Phase 1: Foundation
- Dockerized OpenClaw runtime
- control plane skeleton
- queue + lock + state store
- capability profiles
- Tier A/B/C policy + HITL state
- TDD scaffolding for unit and integration test harness

Phase 2: Safety and contracts
- OpenAPI/AsyncAPI + JSON Schema
- contract tests in CI
- secrets + redaction + audit trail
- budget and model routing guardrails
- security and HITL scenario test packs

Phase 3: Operations
- dead-letter queue
- runbooks + alerts
- SLO dashboards
- backup/restore drills
- model evaluation loop
- resilience and DR recurrent test drills

## 15) Definition of done (system-level)

RIAS is considered ready when:
- all P0 controls are active and tested
- cross-project + infra escalation paths are tested
- HITL decisions are fully audited
- contract tests block breaking changes
- failure recovery and kill switch are operational
- Git/release policy is enforced across root and subprojects
- TDD and CI quality gates are enforced for all protected branches

## 16) Coverage checklist (what is covered vs not yet specified)

Covered in this document:
- architecture boundaries and responsibilities
- multi-channel and external-source ingress through OpenClaw
- agent-per-project model and capability scoping
- anti-overlap execution model and lock semantics
- HITL workflow and escalation triggers
- model routing and budget guard intent
- contract-first communication model
- mandatory control domains (17 areas)
- criticality ranking (P0/P1/P2)
- Git/versioning policy and release flow
- TDD-first testing model and CI/CD gates
- gateway HA requirements and scaling posture
- feature flags and runtime configuration governance
- fencing token and graceful shutdown requirements
- kill switch scoping and enforcement points
- distributed tracing standard (W3C Trace Context)

Specified in companion docs:
- storage and migration model -> `02-storage-and-migrations.md`
- OpenAPI/AsyncAPI baseline contracts -> `03-api-and-event-contracts.md`
- detailed TDD matrix and quality gates -> `04-testing-and-quality-gates.md`
- SLO/DR targets and release timetable -> `05-slo-dr-and-release-ops.md`
- continuous improvement and safe extensibility process -> `07-continuous-improvement-and-extension-model.md`
- agent identity, memory, and skills governance -> `08-agent-memory-identity-and-skills.md`
- health check and probe contracts -> `03-api-and-event-contracts.md`
- runbook structure and deployment strategy -> `05-slo-dr-and-release-ops.md`
- cost optimization strategy -> `05-slo-dr-and-release-ops.md`

Implementation baselines (finalized for v1):
- infrastructure provisioning baseline:
  - runtime stack via Docker Compose for local/stage parity
  - infrastructure as code via Terraform modules per environment
- initial model routing baseline:
  - local-first for `sensitive`
  - cloud primary + cloud fallback for `internal` and `public`
  - provider allowlist and fallback chain versioned in policy repository
- alert routing baseline (severity levels defined in `05-slo-dr-and-release-ops.md` Section 10):
  - `SEV1/SEV2`: paging channel + on-call phone escalation
  - `SEV3/SEV4`: operations chat + ticketing queue
  - escalation ownership follows operations owner runbook

## 17) RBAC matrix (final)

Roles:
- `owner`
- `admin`
- `project-maintainer`
- `infra-approver`
- `viewer`

Scopes:
- `project`
- `infra/platform`
- `production`

Action legend:
- `A` = allowed directly
- `H` = allowed only with human approval flow
- `N` = not allowed

Role-action matrix:

| Role | Read project | Write project code/docs | Submit project jobs | Approve Tier C project job | Read infra | Submit infra request | Execute infra change | Approve infra/prod Tier C | Deploy to production | Change policy/security rules | Emergency kill switch | View audits/logs |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `owner` | A | A | A | A | A | A | A | A | A | A | A | A |
| `admin` | A | A | A | H | A | A | H | H | H | H | A | A |
| `project-maintainer` | A | A (assigned project only) | A (assigned project only) | H (assigned project only) | A (read-only) | A | N | N | N | N | N | A |
| `infra-approver` | A | N | A | N | A | A | H | A | H | N | A | A |
| `viewer` | A | N | N | N | A (read-only) | N | N | N | N | N | N | A |

Hard constraints:
- No role except `owner` can directly modify policy/security rules.
- `project-maintainer` cannot execute infra or production mutations directly.
- `infra-approver` can approve infra/prod Tier C but cannot change global policy.
- All production deploy actions require at least one approval decision from `owner` or `infra-approver`.
- Any destructive operation (delete/irreversible migration) is always Tier C.
- Agent identities cannot access secret zone paths directly under any tier.
- Secret creation/rotation/revocation is always Tier C with human decision.
- Destructive operations spanning multiple projects require dual-authorization: `owner` initiation + separate `owner` or `infra-approver` confirmation. Single-actor approval for multi-project destructive operations is prohibited.

Policy change approval workflow:
- `admin` with `H` on "Change policy/security rules" means: admin may propose policy changes, but every proposal requires explicit `owner` approval through HITL Tier C flow before application
- no policy/security rule change is applied without `owner` decision, regardless of initiating role

Token blocklist durability:
- Redis blocklist for revoked tokens must have a PostgreSQL replay path; the `revoked_tokens` table (canonical schema in `02-storage-and-migrations.md` Section 2) covers revoked/suspended tokens for both human and agent principals (agent token revocation policy: `08-agent-memory-identity-and-skills.md` Section 2; human principal revocation requirement: `03-api-and-event-contracts.md` Section 4)
- on Redis restart/failover, the blocklist must be rebuilt from PostgreSQL `revoked_tokens` record before the enforcement point accepts traffic
- blocklist rebuild must complete within 30 seconds of Redis recovery
- if blocklist rebuild does not complete within 30 seconds, the enforcement point must continue to reject all incoming traffic (fail-closed) until rebuild completes; there is no partial-acceptance fallback
- if rebuild is still incomplete after 60 seconds, emit `INFRA_503_DEPENDENCY_DOWN` alert with `component = token_blocklist` and require explicit operator action to restore traffic; automated fallback to PG-direct token validation is prohibited to prevent blocklist bypass

Agent authorization model:
- agent identities (`actor_id` bound to `agent_instance_id`) are not subject to the RBAC role matrix above; they operate under capability profiles (canonical in `08-agent-memory-identity-and-skills.md`)
- capability profiles constrain: allowed resources, allowed tools, allowed actions, and risk limits per agent instance
- the RBAC matrix governs human-initiated actions; for agent-initiated actions the controlling authority is the capability profile combined with the risk tier of the submitted job
- agents may not perform any action outside their registered capability scope regardless of the risk tier of the initiating human actor
- agent identities cannot hold RBAC roles; role escalation through agent delegation is prohibited
- the hard constraint "Agent identities cannot access secret zone paths directly under any tier" (above) is the intersection point of the RBAC and capability models: it applies to both matrices

Escalation routing:
- project to infra escalation: `project-maintainer` submits request, `infra-approver` or `owner` decides.
- infra to production escalation: requires Tier C approval, then controlled execution window.
- policy/security change escalation: always routed to `owner`.

Identity and assignment rules:
- every actor/source maps to one canonical identity across all enabled channels/connectors (including external human channels and machine/event feeds)
- role bindings are explicit and versioned
- project assignments for `project-maintainer` are explicit allowlists
- permission changes are audit events and require ticket/reference id

## 18) Canonical companion docs

To avoid duplicate or drifting rules, the following sections are canonical:
- HITL decision policy and decision SLA -> `05-slo-dr-and-release-ops.md`
- privacy operations SLA and DSAR timelines -> `05-slo-dr-and-release-ops.md`
- API/event contracts and authorization contract policy -> `03-api-and-event-contracts.md`
- TDD, test matrix, and CI/CD gates -> `04-testing-and-quality-gates.md`
- SLO/DR targets and release operations -> `05-slo-dr-and-release-ops.md`
- continuous improvement and extension governance -> `07-continuous-improvement-and-extension-model.md`
- agent identity lifecycle, memory policy, and skills model -> `08-agent-memory-identity-and-skills.md`
- idempotency ledger policy -> `02-storage-and-migrations.md`
- data classification enforcement matrix -> `02-storage-and-migrations.md`
- N+2 deprecation policy -> `07-continuous-improvement-and-extension-model.md`
- health check and probe contracts -> `03-api-and-event-contracts.md`
- user notification contract model -> `03-api-and-event-contracts.md`
- runbook structure and deployment strategy -> `05-slo-dr-and-release-ops.md`
- cost optimization strategy -> `05-slo-dr-and-release-ops.md`

Conflict resolution rule:
- `01-system-architecture.md` is default primary source.
- if a domain is explicitly listed above as canonical in another file, that file has precedence for that domain.

## 19) Secret zone policy (no agent access)

Purpose:
- define a dedicated secret location that agents cannot access directly

Policy:
- a dedicated `secret zone` exists for sensitive files (keys, tokens, credentials, private configs)
- agents have no direct filesystem permissions to this zone
- only approved human operators and secret-management service can read/write secrets
- all secret access is audited

Recommended layout:
- production: use external secret manager/vault (preferred)
- local development fallback: `secrets/` path, excluded from version control and blocked for agent tooling

Secret-management service availability requirements:
- production: HA-capable external secret manager is mandatory (HashiCorp Vault HA mode, AWS Secrets Manager, or equivalent); single-node secret manager is prohibited in prod
- minimum 2 vault/secret-manager nodes in stage and prod with active/standby or active/active topology per provider HA model
- client-side caching of non-rotating secret references is mandatory to reduce direct vault API dependency; cache TTL must not exceed the relevant credential rotation cadence; default cache TTL (when no shorter rotation cadence applies): `dev` <= 24h, `stage` <= 8h, `prod` <= 4h; these defaults may be shortened but not exceeded; the TTL for a given secret type must be <= 10% of that type's rotation cadence when a specific cadence is defined
- secret manager unavailability must fail closed: secret reads that cannot be served from cache return error; fallback to plaintext or unverified credential is prohibited
- secret manager unavailability emits `INFRA_503_DEPENDENCY_DOWN` alert with `component = secret_manager`
- single-node secret manager is allowed only in dev environment

Mandatory controls:
- no secret material in prompts, logs, or event payloads
- no secret material in repository history
- secret values must be redacted in all observability outputs
- secret rotation and revocation must use HITL Tier C workflow

Network-level enforcement:
- secret zone must be isolated at network level in addition to filesystem permissions
- agent workloads must not have network connectivity to secret storage endpoints (vault API, KMS endpoints)
- only the secret-management service and approved human operator jump hosts may have network access to secret zone
- network policy enforcement is mandatory in stage/prod (Kubernetes NetworkPolicy, security groups, or equivalent)

## 20) Security threat-model baseline

Threat-modeling is mandatory for production-impacting changes.

Method:
- maintain STRIDE-style threat catalog per control-plane component
- map every threat to preventive controls and detective controls
- map controls to automated tests and incident playbooks

Minimum threat scenarios:
- cross-tenant data exposure
- JWT forgery/replay and scope escalation
- prompt/tool injection through ingress channels
- SQL injection through any untrusted input reaching database query paths; all dynamic queries must use parameterized statements or ORM-level query binding; raw string interpolation into SQL is prohibited; SQL injection controls are subject to ASVS L2 verification per `06-sources-and-references.md` Section 3
- server-side request forgery (SSRF) via outbound HTTP calls to webhook, connector, and model provider endpoints; outbound HTTP calls from gateway, connectors, and workers must be restricted to allowlisted destinations only; SSRF attempt blocking must be validated by security tests
- lock poisoning and scheduler starvation attacks
- secret exfiltration via logs/events/prompts
- supply-chain compromise in dependencies/build artifacts

Mandatory transport and key-management controls:
- all ingress, API, and service-to-service traffic must use TLS (`1.2+`; `1.3` preferred)
- internal control-plane and data-plane service calls must enforce mTLS with managed certificate rotation
- encryption keys for data-at-rest controls must be managed via approved KMS/vault integration
- key rotation cadence and emergency revocation workflow must be defined, audited, and test-covered

Data-at-rest encryption key rotation cadence (environment-scoped):
- `dev`: <= 365 days
- `stage`: <= 180 days
- `prod`: <= 90 days
- emergency revocation of a compromised key invalidates it immediately; all data encrypted with the revoked key must be re-encrypted within 24 hours; revocation creates a `SEV1` audit event; re-encryption must complete before the next scheduled key rotation cycle

mTLS certificate lifecycle requirements:
- rotation cadence (environment-scoped):
  - `dev`: <= 90 days
  - `stage`: <= 30 days
  - `prod`: <= 14 days
- active certificates must support overlap window (minimum 24 hours) to allow safe rotation without service-to-service auth outage
- emergency revocation of a compromised certificate invalidates it immediately (no overlap window) and creates a `SEV1` audit event
- revoked certificates must be removed from all service trust stores within 10 minutes of revocation
- certificate lifecycle policy (cadence, overlap window, revocation SLA) is release-blocking configuration per environment
- key material for mTLS certificates must be managed via approved KMS/vault integration; private keys must never leave managed boundary unencrypted

## 21) Control ownership and enforcement map

Every mandatory control must declare:
- `control_id`
- `owner_role`
- `enforcement_point` (gateway, control plane, CI, runtime, ops)
- `evidence_source` (tests, metrics, audit events, runbook drills)

Enforcement rule:
- a control without owner + enforcement point is treated as non-compliant
- release gates fail for non-compliant P0/P1 controls

ASVS supplementary evidence (CTRL-01, CTRL-03, CTRL-04):
- CTRL-01 (identity and tenancy), CTRL-03 (injection protection), and CTRL-04 (secrets lifecycle) require ASVS assessment artifacts as supplementary evidence per `06-sources-and-references.md` Section 3
- supplementary artifacts: assessment report, gap list, and remediation plan with due dates; maintained by the security owner alongside the control registry
- ASVS assessment cadence, scope, and required compliance levels are defined in `06-sources-and-references.md` Section 3 and are not redefined here

Control registry baseline:

| control_id | domain | owner_role | enforcement_point | evidence_source |
|---|---|---|---|---|
| CTRL-01 | identity and tenancy | security owner | gateway + control plane | auth tests + audit events |
| CTRL-02 | approval UX and SLA | operations owner | control plane + ops | HITL tests + SLA dashboard |
| CTRL-03 | injection protection | security owner | gateway + runtime | security tests + blocked-attempt logs |
| CTRL-04 | secrets lifecycle | security owner | runtime + ops | secret audit trail + rotation drills |
| CTRL-05 | data governance | architecture owner | control plane + storage | retention jobs + export/delete audits |
| CTRL-06 | DR and backup | operations owner | ops | restore drill reports + restore success-rate metric |
| CTRL-07 | policy versioning | architecture owner | control plane + CI | versioned policy diffs |
| CTRL-08 | contract testing | architecture owner | CI | compatibility test reports |
| CTRL-09 | dead-letter handling | operations owner | scheduler + runtime | DLQ metrics + incident logs |
| CTRL-10 | SLO management | operations owner | ops | scorecard and SLO reports |
| CTRL-11 | model evaluation loop | product owner | control plane + ops | routing KPI reports |
| CTRL-12 | global kill switch | operations owner | runtime + ops | drill evidence + audit events |
| CTRL-13 | manual override mode | operations owner | control plane + ops | override audit logs |
| CTRL-14 | change windows | operations owner | CI + ops | release logs + window checks |
| CTRL-15 | incident runbooks | operations owner | ops | runbook rehearsal evidence + incident response SLA adherence metric |
| CTRL-16 | compliance and privacy governance | security owner | control plane + ops | DSAR audit logs + compliance reports |
| CTRL-17 | supply-chain integrity | security owner | CI + build pipeline | SBOM artifacts + dependency audit reports + SLSA provenance verification |

## 22) Documentation anti-drift policy

To avoid duplicated and drifting rules:
- every policy domain has one canonical table in one document
- companion docs must reference canonical section instead of duplicating full tables
- duplicated normative statements are prohibited unless marked as informative summary
- docs-sync CI gate fails when canonical references are missing for policy/contract/routing changes

## 23) Compliance and privacy governance

RIAS must satisfy privacy and compliance readiness as a first-class concern.

Minimum governance controls:
- define legal basis and purpose limitation for each data category
- maintain tenant-specific data residency policy (`US`, `EU`, `global`) and enforce routing/storage constraints
- support data subject workflows (access, correction, deletion, export) with auditable ticket linkage
- maintain records of processing activities for policy, routing, and retention changes
- maintain GDPR-ready controls (`EU 2016/679`) including DSAR and DPIA governance where applicable

DPIA trigger policy (mandatory):
- DPIA is required before release for changes that introduce or materially alter:
  - processing of `sensitive` data categories
  - automated decisioning with legal or similarly significant effects
  - cross-region/cross-border routing for regulated tenant scopes
  - new external data sharing or third-party model/tool integrations impacting personal data
- each required DPIA must record owner, decision date, mitigation actions, and linked release/change id

Legal hold process:
- legal hold is applied when data subject data is subject to ongoing or anticipated legal proceedings, regulatory investigation, or law enforcement request
- triggers (any of the following mandate a hold): court order, formal litigation hold notice from legal counsel, or written regulatory mandate; informal requests do not qualify
- application: owner role initiates HITL Tier C workflow with documented legal justification and external ticket/reference id; hold cannot be applied without explicit Tier C decision record
- scope: scoped to the minimum required set of tenant/data-subject records at the minimum classification level required by the hold order; over-broad holds are prohibited
- duration: defined by the originating legal requirement; holds exceeding 12 months require mandatory re-review with the same HITL Tier C workflow
- removal: requires HITL Tier C workflow with documented closure justification and external reference confirming the legal basis has ended
- every hold application and removal creates a `SEV2`-level audit event and is recorded in the `tenant_policies` table with hold status, scope, and linked ticket reference
- deletion/export SLA timelines in `05-slo-dr-and-release-ops.md` Section 3 are suspended for data under legal hold; hold status must be disclosed to data subjects when legally permissible

Operational SLAs:
- canonical privacy operations SLA is defined in `05-slo-dr-and-release-ops.md` (Section 3)

## 24) Feature flags and runtime configuration

Feature flag governance:
- feature flags are the required mechanism for progressive rollout of new capabilities and policy changes
- every flag must declare: `flag_id`, `owner`, `default_state`, `allowed_environments`, `expiry_date`
- flags without expiry date are prohibited; maximum TTL is 90 days (renewable with owner justification)

Runtime configuration:
- runtime config changes (thresholds, timeouts, routing weights) must be versioned and auditable
- changes propagate through configuration service with environment-scoped delivery

Configuration service requirements:
- configuration service is a distinct component in the architecture (not embedded in control plane)
- HA: minimum 2 instances in stage/prod with leader-follower or active-active topology
- scaling: stateless readers with shared persistent backend (PostgreSQL or dedicated config store)
- failure mode: on configuration service unavailability, consumers must use last-known cached configuration with bounded staleness (max cache age: 300 seconds)
- beyond bounded staleness limit: if the configuration service remains unavailable after the 300-second cache age is exceeded, consumers must continue serving in-flight and cache-safe requests with stale configuration; new requests requiring freshness-sensitive configuration not present in cache (new feature flag evaluations, routing weight changes not yet propagated) must fail with `INFRA_503_DEPENDENCY_DOWN`; which configuration keys are freshness-sensitive must be declared per consumer in component-level configuration policy
- configuration service unavailability for > 5 minutes emits `INFRA_503_DEPENDENCY_DOWN` alert
- configuration service must expose health probes per `03-api-and-event-contracts.md` Section 17

- emergency config overrides require `owner` role and create SEV-level audit event

Configuration service observability requirements:
- required metrics: `config_propagation_latency_ms` (P95/P99, from write commit to all consumers receiving update), `config_staleness_seconds` (age of cached config per consumer), `config_read_count` (by consumer service), `config_write_count` (by operator/release process), `config_cache_miss_rate` (consumer fallback to stale on service unavailability)
- metrics must be sliceable by `environment`, `consumer_service`, and `config_key_namespace`
- sustained `config_staleness_seconds` exceeding bounded staleness limit (300 seconds, per above) creates `SEV2` alert
- configuration service health probes per `03-api-and-event-contracts.md` Section 17 apply without redefinition

Flag lifecycle:
- `proposed` → `active` → `deprecated` → `removed`

Terminology note: feature flag lifecycle state `active` is distinct from agent identity lifecycle state `active` (defined in `08-agent-memory-identity-and-skills.md` Section 2). Context always disambiguates: flag states apply to feature flag governance; agent identity states apply to agent principal lifecycle.
- stale flags (past expiry without renewal) are auto-disabled and flagged for cleanup
- CI gate fails if stale flags are detected in production configuration

## 25) Structured logging format

All RIAS services must emit structured logs in JSON format.

Required fields on every log entry:
- `timestamp`: ISO-8601 with millisecond precision
- `level`: `DEBUG|INFO|WARN|ERROR|FATAL`
- `service_name`: canonical service identifier
- `trace_id`: W3C Trace Context trace ID (when available)
- `span_id`: current span ID (when available)
- `request_id`: correlation ID for the originating request (when available)
- `message`: human-readable log message

Conditional fields:
- `job_id`: present for job-scoped operations
- `project_id`: present for project-scoped operations
- `actor_id`: present for actor-initiated operations
- `error_code`: present for error log entries (must match error code catalog)
- `duration_ms`: present for timed operations

Rules:
- logs must not contain secret material, PII outside redaction-safe fields, or full request/response payloads
- log levels must follow consistent severity mapping across all services
- distributed tracing context (W3C Trace Context) must be propagated into log entries for correlation with traces
- log format is enforced by shared logging library; direct stdout/stderr without structured format is prohibited in stage/prod

Metric label PII and cardinality rules:
- metric dimensions (`project_id`, `actor_id`, `connector_id`, `intent`) are system-internal identifiers and are permitted as metric labels; human-readable PII (email addresses, names, phone numbers) must never appear in metric label values
- `actor_id` in metric labels must be the canonical principal identifier (opaque UUID); if an `actor_id` value could contain PII-derived content, it must be hashed before use as a label value
- metric label cardinality must be bounded: label values with unbounded cardinality (e.g., raw `idempotency_key`, `job_id`, `trace_id`) are prohibited as metric dimensions; use aggregate dimensions (`project_id`, `intent`, `risk_tier`, `model_provider`) instead
- when cardinality of a dimension exceeds 10,000 unique values in a 24-hour window, the operations owner must review and apply top-N filtering or label bucketing; a `SEV3` operations action item is created when this threshold is reached
- weekly scorecard must include high-cardinality dimension report for all multi-dimensional metrics

## 26) Tenant onboarding process

Tenant onboarding is the governed workflow that establishes a new tenant's identity, data residency policy, role bindings, and initial configuration before any jobs can be submitted.

Mandatory onboarding steps (in order):
1. **RFC and review**: tenant submits onboarding request with: tenant name, intended use scope, data residency requirement (`US|EU|global`), initial role assignments, and notification channel preferences
2. **Approval**: onboarding request is treated as a Tier C HITL workflow; `owner` approval is required before any tenant state is created
3. **Identity provisioning**: `owner` creates the `tenant_policies` record with declared data residency policy and initial budget overrides; `role_bindings` and `project_assignments` are created for designated human principals
4. **Secret zone initialization**: secrets and credentials for the tenant's initial integrations are provisioned by the secret-management service under HITL Tier C workflow (per Section 19); credentials are never transmitted via API response — access is via approved vault path only
5. **Channel preference initialization**: user identity profiles for notification preferences are created per Section 27; principals receive notification delivery confirmation via their declared channel before onboarding completes
6. **Validation**: a synthetic Tier A test job is submitted and executed under the new tenant to verify policy enforcement, routing, and audit trail generation
7. **Activation**: tenant status is set to `active` in `tenant_policies`; onboarding audit event is emitted with operator identity, timestamp, and linked approval record
8. **Handover**: tenant receives onboarding summary (declared residency policy, role bindings, initial budget limits, escalation contacts); summary must not contain secret material

Hard rules:
- no tenant may submit jobs until onboarding steps 1–7 are complete and validated
- data residency declaration is immutable after activation; changes require a separate Tier C policy-change workflow with DPIA review
- onboarding of tenants with EU data residency requirement must be executed against EU-region infrastructure only; cross-region onboarding writes for EU-resident tenants are prohibited

## 27) User identity profile

Purpose:
- define the canonical profile that maps a human or agent principal to notification preferences, language settings, and channel-specific identifiers

Required profile fields:
- `actor_id`: canonical principal identifier (links to RBAC and role_bindings)
- `preferred_notification_channels`: ordered list of delivery channels (`discord`, `telegram`, `web_ui`, `email`); at least one channel is required
- `channel_handles`: per-channel delivery identifiers (e.g., Discord user ID, Telegram chat ID, email address); required for each declared preferred channel
- `language`: ISO 639-1 language code for UI/notification content (default: `en`)
- `created_at`: ISO-8601 timestamp
- `updated_at`: ISO-8601 timestamp

Management rules:
- identity profile is created during tenant onboarding (Section 26) or principal provisioning
- profile updates are self-service for `preferred_notification_channels` and `language`; `channel_handles` changes require re-verification of the new channel handle
- profile changes are audit events with `actor_id` and `updated_at`
- principals without a valid identity profile cannot receive notifications; jobs requiring HITL approval escalate via Web UI notification center as fallback

Storage:
- identity profiles are stored in the `role_bindings` table extended with notification preference columns, or as a dedicated `identity_profiles` table — the physical schema is implementation-defined; the logical fields above are mandatory regardless of schema layout
- identity profile queries are used in the hot path for notification routing; L1 caching (request-scoped) is mandatory; L2 caching (Redis) is allowed with write-through invalidation on profile update
