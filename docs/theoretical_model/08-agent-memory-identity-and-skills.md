# Agent Memory, Identity, and Skills Model

## 1) Purpose and scope

Define canonical rules for:
- agent identity lifecycle
- where agent memory is stored
- how agent memory is updated and audited
- how skills are registered, versioned, and bound
- how identity/memory/skills are isolated across environments

This document is normative for these domains. Other docs must reference this file instead of duplicating policy tables.

Precedence rule:
- this file has canonical precedence only for agent identity/memory/skills domain
- outside this domain, precedence follows `01-system-architecture.md` and its canonical companion mapping

## 2) Agent identity model (canonical)

Required identifiers:
- `agent_template_id`: approved template reference
- `agent_instance_id`: unique runtime identity for an instantiated agent
- `actor_id`: canonical principal used in API/events/audit (maps to `agent_instance_id` for agent actions)
- `environment`: `dev|stage|prod`

Identity lifecycle states:
- `provisioning`
- `active`
- `rotating_credentials`
- `suspended`
- `revoked`
- `deprovisioned`

Mandatory lifecycle controls:
1. identity issuance requires approved template and capability binding
2. credentials are short-lived and rotatable; rotation must be audited
3. `revoked`/`suspended` identities cannot submit jobs or mutate memory
4. deprovision removes active credentials and blocks new token minting
5. every state transition emits audit evidence linked to change/release id
6. every environment must define explicit credential rotation cadence and maximum token lifetime in versioned policy; missing configuration is release-blocking; maximum token lifetime must not exceed the system-wide agent JWT cap of 4 hours (canonical in `03-api-and-event-contracts.md` Section 4); templates should align per-tier lifetimes with the maximum job total timeout budget for the agent's highest-allowed risk tier

Token revocation policy:
- revoked/suspended agent tokens must be invalidated immediately via Redis blocklist
- blocklist propagation to all enforcement points must complete within 10 seconds
- token validation must check blocklist before cryptographic verification
- blocklist entries persist for the maximum token lifetime of the revoked token

Token blocklist SLA clarification:
- the 10-second propagation target above applies to individual token revocation events — newly revoked tokens must reach all enforcement points within 10 seconds
- the 30-second rebuild target defined in `01-system-architecture.md` Section 17 applies to full blocklist rebuild after Redis restart/failover (all `revoked_tokens` records replayed from PostgreSQL) — these are distinct SLAs for distinct scenarios

Environment boundary:
- identity is environment-scoped
- identity material from `dev`/`stage` must never be valid in `prod`
- cross-environment execution using same credentials is prohibited

## 3) Agent memory model (canonical)

Memory classes:
- `working_memory`: short-lived execution context for a job/session
- `project_memory`: durable project-scoped memory shared by allowed project agents
- `global_memory`: durable cross-project operational memory, restricted to explicitly approved global agents

Contract alias mapping (for storage/event contracts):
- `job` scope <-> `working_memory`
- `project` scope <-> `project_memory`
- `global` scope <-> `global_memory`

Storage placement:
- PostgreSQL:
  - `agent_memory_records` (materialized current state)
  - `agent_memory_events` (append-only change journal)
- Redis:
  - `agent:ctx:<agent_instance_id>:<job_id>` for short-lived working memory
  - `agent:mem-lock:<scope_key>` for serialized memory writes
- blob archive:
  - immutable snapshot exports for audit/compliance evidence

Scope enforcement rules:
- default scope is `project_memory`
- `global_memory` is Tier C and requires explicit approval mapping
- agents can read/write only memory scopes allowed by capability profile and role bindings
- tenant/project boundary checks apply to every memory read/write path

Memory lock scope granularity:
- lock scope key format: `agent:mem-lock:<memory_class>:<project_id>:<optional_record_group>`
- `working_memory` locks are scoped to `(agent_instance_id, job_id)` — no cross-job contention
- `project_memory` locks are scoped to `(project_id, record_group)` — concurrent writes to different record groups are allowed
- `global_memory` locks are scoped to `(record_group)` — most restrictive, global serialization per group

Memory lock fairness:
- `project_memory` and `global_memory` lock acquisition must implement fair queuing (FIFO order for waiters)
- no single agent or record group may starve other waiters; maximum lock hold time is bounded by lock lease TTL and `max_renewals` policy (canonical in `05-slo-dr-and-release-ops.md` Section 7)
- sustained contention on a single record group (> 5% of lock attempts result in wait > P95 baseline) triggers capacity review action item

Max renewals and in-flight memory work:
- when a memory lock reaches `max_renewals` limit (defined in `05-slo-dr-and-release-ops.md` Section 7), the lock holder must:
  1. complete the current atomic write operation (steps 4-6 of memory update lifecycle)
  2. release the lock
  3. re-acquire through normal fair queuing flow before starting the next write
- in-flight writes that cannot complete within one additional heartbeat interval after max_renewals are force-released; the incomplete write is rolled back via compensating event
- max_renewals-triggered re-evaluation events must be logged for capacity analysis

## 4) Memory update lifecycle

Every memory mutation follows:
1. classify write intent (`public|internal|sensitive`) and target scope
2. authorize by identity, capability, scope, and risk tier
3. acquire scope lock (`agent:mem-lock:<scope_key>`) with lease + heartbeat
4. append immutable event to `agent_memory_events`
5. update `agent_memory_records` materialized pointer/version
6. emit audit/event evidence with `request_id`, `trace_id`, `actor_id`, `project_id`
7. release lock

Fencing token enforcement:
- memory mutation steps 4-6 must include the fencing token obtained during lock acquisition (step 3)
- the fencing token must be validated before each write to `agent_memory_events` and `agent_memory_records`
- stale fencing tokens (from expired or superseded locks) cause the mutation to be rejected
- this requirement implements `01-system-architecture.md` Section 5 Rule 10 for the memory domain

Hard requirements:
- memory updates are idempotent by scope + mutation key + payload hash window
- conflicting mutation key with different payload hash in active window is rejected
- corrections/deletions are compensating events; journal history stays append-only
- silent memory mutation is prohibited
- informative: canonical idempotency ledger rules are in `02-storage-and-migrations.md` Section 7

Memory content validation (anti-poisoning):
- memory write payloads must pass content validation before persistence
- prohibited content: executable code patterns, prompt injection markers, credential-like strings
- validation rules are versioned in policy and updated via improvement loop
- rejected writes emit `agent.memory.write.rejected` with `details.rejection_reason = content_policy_violation`
- content validation bypass is prohibited; no override mechanism exists for agents

Delegation boundary validation:
- when a delegated agent (child job) writes to `project_memory` or `global_memory`, the write payload must pass content validation using both:
  - the child agent's own content policy
  - the delegating (parent) agent's content policy for the target scope
- writes that pass child policy but fail parent policy are rejected with `details.rejection_reason = delegation_policy_violation`
- this prevents a delegated agent from writing content that the delegating agent's scope policy would not permit

## 5) Memory retention, deletion, and DSAR behavior

Policy:
- memory records inherit data-classification policy and tenant residency constraints
- DSAR export/delete requests must include applicable agent memory records/events in scope
- legal hold handling applies before hard deletion where required

Deletion model:
- soft-delete marker in materialized view + append deletion event
- irreversible purge only via approved retention workflow with audit evidence

DPIA linkage:
- adding new memory class, new external memory sink, or cross-border memory routing is DPIA-triggering change

Retention linkage:
- storage retention windows for memory tables are defined in `02-storage-and-migrations.md` Section 6 and are mandatory for compliance operation

## 6) Skills model (canonical)

Skill descriptor minimum fields:
- `skill_id`
- `skill_version`
- `owner`
- `required_capabilities`
- `allowed_tools`
- `risk_tier`
- `input_contract_ref`
- `output_contract_ref`
- `required_test_pack`

Binding model:
- skills are bound to `agent_instance_id` via `agent_skill_bindings`
- project-specific skill sets are allowed; global skill bindings require explicit approval
- unregistered or incompatible skill versions are blocked at execution time

Compatibility rules:
- skill contract changes follow `N+2` compatibility policy minimum
- breaking skill changes require migration guide and owner sign-off
- informative: canonical N+2 deprecation policy is in `07-continuous-improvement-and-extension-model.md` Section 9

## 7) Project-specific extension model

Project variability is expected. Each project defines additional files as needed, but minimum manifest set is required:
- `agents/projects/<project-id>/agent-profile.yaml`
- `agents/projects/<project-id>/skills/manifest.yaml`
- `agents/projects/<project-id>/memory/policy.yaml`

Rules:
- project-specific files can extend behavior but cannot weaken global policy
- missing required manifest blocks agent activation for that project
- schema for required manifests must be versioned and contract-tested

## 8) Observability and self-awareness for memory/skills

Required telemetry:
- memory read/write latency and error rates by scope
- memory lock contention metrics (`acquire_ms`, `wait_ms`, `contention_count`)
- memory mutation rejection reasons (auth, policy, idempotency conflict)
- skill execution success/failure and rollback rates by `skill_id`/version

Required audit dimensions:
- who changed memory (`actor_id`)
- what changed (mutation key + version diff reference)
- where (`project_id`, scope, environment)
- why (intent/change id/ticket id)

Agent self-introspection API:
- every active agent must expose a read-only introspection endpoint returning:
  - `agent_instance_id`, `agent_template_id`, `environment`
  - current lifecycle state
  - active capability set and skill bindings
  - memory scope permissions
  - current resource utilization (active locks, memory usage)
- introspection data is available to control plane and operations tooling only (not to other agents)
- introspection endpoint requires authentication: callers must present a valid service identity token (control plane or operations service account)
- unauthenticated requests to introspection endpoint are rejected with `AUTH_401_MISSING_TOKEN`
- introspection endpoint rate limiting: maximum 60 requests per minute per caller identity; rate limit breach returns `RATE_429_THROTTLED` with `Retry-After` header
- introspection responses must not include credential material or secret references

## 9) Environment model and promotion

Rules:
- no direct runtime sharing of memory between `dev`, `stage`, and `prod`
- promotion uses approved export/import artifacts with redaction and compatibility checks
- production memory import from lower environments is prohibited unless explicitly approved Tier C exception exists

## 10) Control and test linkage

This domain maps to mandatory controls:
- `CTRL-01` identity and tenancy
- `CTRL-05` data governance
- `CTRL-07` policy versioning
- `CTRL-16` compliance and privacy governance

Testing and gates:
- mandatory test suites and release gates are defined in `04-testing-and-quality-gates.md`
- storage rollback and compatibility requirements are defined in `02-storage-and-migrations.md`

## 11) Agent inter-communication

Communication model:
- agents do not communicate directly with each other
- all inter-agent coordination is mediated by the control plane via job submissions and event channels
- an agent may request work from another agent only by submitting a job through the standard job submission API with appropriate `actor_id` (delegating agent) and `intent`

Discovery:
- agents discover available capabilities through the capability registry (canonical in `07-continuous-improvement-and-extension-model.md` Section 7)
- agents cannot enumerate other agent instances; they submit capability-addressed requests that the scheduler routes

Constraints:
- circular delegation chains are prohibited; the scheduler must detect and reject cycles (max delegation depth: 3)
- delegation depth tracking: every delegated job must carry `parent_job_id` linking to the delegating job, forming a traceable delegation chain
- the scheduler computes current delegation depth from the `parent_job_id` chain before accepting a delegated job
- delegation depth is included in job record and event payloads for observability
- delegated jobs inherit the risk tier of the higher-risk participant (delegator or delegate capability)
- delegated jobs must propagate the original `trace_id` for end-to-end observability
- cross-project delegation requires explicit policy approval and is Tier C by default
- agent-to-agent communication outside the job/event model is prohibited and must be blocked at network level

Delegation lock safety:
- delegated jobs must not hold locks from the parent job's scope while acquiring locks in the child scope
- lock acquisition order for delegated jobs follows the canonical lock-order registry (`01-system-architecture.md` Section 5 Rule 6): infrastructure → budget → project → memory
- if a delegation chain creates a potential lock cycle (child needs parent's project lock while parent holds child's), the scheduler must detect this at dispatch time and reject with `JOB_409_LOCKED`
