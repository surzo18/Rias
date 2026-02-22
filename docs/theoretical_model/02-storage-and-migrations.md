# Storage and Migrations

## 1) Final storage choices

Primary transactional store:
- PostgreSQL (single source of truth for durable state)

Ephemeral/coordination store:
- Redis (queue transport, short-lived locks, rate limits, cache)
- encryption at rest is required for Redis persistence files (RDB/AOF) in stage and prod environments

Object/log archive:
- S3-compatible blob storage (audit exports, long retention logs, backups)

Why this split:
- Postgres gives strong consistency for jobs, approvals, and audit decisions.
- Redis gives low-latency coordination for runtime orchestration.
- Blob storage gives cheap immutable retention.

## 2) Logical schema (PostgreSQL)

Core tables:
- `jobs`
- `job_events`
- `job_dependencies`
- `approvals`
- `locks` (durable lock journal; active lock state can be mirrored in Redis)
- `policy_versions`
- `model_usage`
- `audit_log`
- `role_bindings`
- `project_assignments`
- `agent_identities`
- `agent_skill_bindings`
- `agent_memory_records`
- `agent_memory_events`
- `tenant_policies`
- `outbox`
- `notifications`
- `capability_registry`
- `kill_switch_state`
- `schema_compatibility_window`
- `idempotency_ledger`
- `deprecation_registry`
- `feature_flags`

Required invariants:
- `jobs.idempotency_key` unique per `(project_id, intent, actor_id, window)`
- `jobs.idempotency_payload_hash` required for conflict detection on duplicate keys
- `job_events` append-only
- `audit_log` append-only
- approval records immutable; corrections use compensating events

Extended tables:
- `tenant_policies`: per-tenant policy configuration including data residency (`US|EU|global`), budget overrides, and channel preferences. Referenced in Section 9 for data residency enforcement.
- `outbox`: transactional outbox for at-least-once event delivery (columns: `outbox_id`, `event_payload`, `created_at`, `published_at`, `retry_count`). Used by relay process per `03-api-and-event-contracts.md` Section 15.
- `notifications`: notification delivery tracking (columns: `notification_id`, `recipient_actor_id`, `channel`, `notification_type`, `job_id`, `project_id`, `priority`, `payload` (channel-specific rendered content, stored as JSONB; must not contain secret material), `created_at`, `delivered_at`, `trace_id`). Schema per `03-api-and-event-contracts.md` Section 18.
- `capability_registry`: registered capabilities (columns: `capability_id`, `version`, `owner`, `risk_tier`, `required_roles`, `allowed_scopes`, `required_test_pack`, `registered_at`, `status`). Enforced per `07-continuous-improvement-and-extension-model.md` Section 7.
- `kill_switch_state`: kill switch activation records (columns: `switch_id`, `scope`, `target_id`, `activated_by`, `activated_at`, `deactivated_at`, `reason`). Scopes per `01-system-architecture.md` Section 9.
- `schema_compatibility_window`: tracks version support windows during migrations (columns: `window_id`, `table_name`, `old_version`, `new_version`, `overlap_start`, `overlap_end`, `status`). Referenced in Section 8.
- `idempotency_ledger`: dedicated idempotency tracking (columns: `ledger_id`, `idempotency_key`, `project_id`, `intent`, `actor_id`, `window_start`, `window_end`, `payload_hash`, `job_id`, `first_seen_at`, `last_seen_at`). Canonical rules in Section 7.
- `deprecation_registry`: tracks deprecated items (columns: `deprecation_id`, `item_type`, `deprecated_in_version`, `removal_target_version`, `migration_guide_ref`, `owner`, `registered_at`). Per `07-continuous-improvement-and-extension-model.md` Section 9.
- `feature_flags`: feature flag state (columns: `flag_id`, `owner`, `default_state`, `current_state`, `allowed_environments`, `expiry_date`, `created_at`, `updated_at`). Per `01-system-architecture.md` Section 24.
- `revoked_tokens`: PostgreSQL-backed token revocation records for Redis blocklist rebuild (columns: `token_jti`, `actor_id`, `agent_instance_id` (nullable; present only for agent tokens), `revoked_at`, `expires_at`, `reason`). Covers revoked/suspended tokens for both human and agent principals; used for blocklist durability per `01-system-architecture.md` Section 17 and `03-api-and-event-contracts.md` Section 4.
- `consumer_signoff_artifacts`: consumer sign-off records for breaking contract changes (columns: `artifact_id`, `contract_change_id`, `producer_component`, `consumer_component`, `impact_level`, `accepted_by`, `accepted_at`, `migration_deadline`, `test_evidence_refs`). Enforced per `03-api-and-event-contracts.md` Section 12.

## 3) Redis key layout

- `queue:project:<project_id>` -> list/stream of pending jobs
- `queue:infra` -> infra queue
- `lock:<resource_key>` -> active lease lock with TTL
- `rate:<actor_id>` -> request throttle buckets
- `dedup:<idempotency_key>` -> short-term duplicate prevention
- `lock-order:registry` -> canonical lock class ordering cache (read-only mirror)
- `auth:jti:<jti>` -> JWT replay-prevention store; key presence = token `jti` has been seen; TTL = token `exp` minus `iat`; used to detect jti reuse for non-revoked active tokens (distinct from `revoked_tokens` table which covers revoked/suspended tokens)
- `replay:connector:<connector_id>:<nonce_or_signature_hash>` -> connector/webhook replay prevention; key presence = request has been seen; TTL = active replay window (minimum 24h per `03-api-and-event-contracts.md` Section 4); enforces nonce/signature-id uniqueness within the active replay window; eviction policy must be `noeviction` (same as lock keyspace)

Redis high-availability topology:
- production: Redis Sentinel (minimum 3 nodes) or Redis Cluster (minimum 6 nodes)
- stage: Redis Sentinel (minimum 3 nodes)
- dev: single instance allowed
- lock writes must use `WAIT` command to ensure replication to at least 1 replica before acknowledging
- eviction policy must be `noeviction` for lock and dedup keyspaces; `allkeys-lru` allowed only for cache keyspaces
- Sentinel/Cluster failover must complete within 30 seconds; failover exceeding this creates `SEV2` alert

## 4) Migration policy

Tooling:
- SQL migrations with forward and rollback scripts
- migration metadata table: `schema_migrations`

Rules:
1. Every schema change needs forward + rollback migration.
2. Destructive changes use two-step rollout:
   - add new column/table in release N
   - backfill and switch reads in N+1
   - remove old path in N+2
3. Zero-downtime requirement for production migrations.
4. Migration PR must include migration tests and rollback rehearsal result.

## 5) Backup policy

Postgres:
- full backup daily
- WAL/incremental every 5 minutes

Redis:
- snapshot every 15 minutes
- runtime queue replay support from Postgres `jobs` + `job_events`

Blob storage:
- immutable retention for audit snapshots
- backup files and audit exports stored in blob storage must be encrypted at rest using KMS/vault managed keys; the encryption requirement applies to the highest-classified data present in the backup (typically `sensitive`)
- encryption key management for blob storage follows the transport and key-management controls canonical in `01-system-architecture.md` Section 20 and applies without redefinition

Data residency constraints for backups:
- backup storage destinations must comply with tenant data residency policy (Section 9): backups containing EU-resident tenant sensitive data must be stored in EU-region blob storage only
- backup storage routing must be declared per environment and per residency zone in the backup configuration policy
- cross-region backup replication for EU-resident tenant data is prohibited unless the destination region is also within the EU
- residency-violating backup writes are treated as data residency violations (SEV1 per Section 9) with mandatory DPIA review

Backup integrity verification:
- weekly automated restore test to isolated environment
- restore test must verify: data integrity (row counts, checksum comparison), application startup, and basic query execution
- restore test failures create `SEV3` incident and block next release until resolved
- quarterly full DR drill includes end-to-end restore validation (canonical schedule in `05-slo-dr-and-release-ops.md` Section 4)

## 6) Data retention

- `job_events`: 180 days hot, then archive
- `audit_log`: 365 days minimum
- `model_usage`: 365 days for cost analytics
- `agent_memory_events`: 365 days minimum, then archive
- `agent_memory_records`: retained while scope is active; deletions must be represented by tombstone state and linked deletion event in `agent_memory_events`
- PII-sensitive fields are redacted in log payload columns
- control-plane application logs: 90 days hot, then archive to 365 days minimum
- distributed traces: 30 days hot, then archive to 180 days minimum
- operational metrics:
  - high-resolution retention: 30 days minimum
  - downsampled retention: 365 days minimum

Log and trace integrity policy:
- archived log/trace bundles must be immutable (append-only/WORM-capable storage)
- every archived bundle must include integrity evidence (hash/checksum manifest) verifiable during audits
- access to log/trace archives must be auditable with actor identity and timestamp
- secret-bearing material is prohibited in logs/traces; redaction controls are mandatory before persistence

Online `audit_log` tamper-evidence requirements:
- the application database role must not hold UPDATE or DELETE privileges on the `audit_log` table; only INSERT is permitted; this constraint must be enforced at the database-role level, not only by application policy
- a daily integrity verification job must compute a rolling hash digest over consecutive `audit_log` row batches (keyed by row-id range) and store the digest artifacts in blob storage alongside archived bundles
- integrity verification failures create `SEV2` incident and constitute evidence failures for CTRL-16 (compliance and privacy governance)

## 7) Idempotency ledger policy

Idempotency must be deterministic across API, scheduler, and workers.

Required fields:
- `idempotency_key`
- `idempotency_window_start`
- `idempotency_window_end`
- `idempotency_payload_hash`
- `first_seen_at`
- `last_seen_at`

Behavior:
- same key + same hash in active window returns original `job_id` (safe replay)
- same key + different hash in active window is hard conflict (`JOB_409_IDEMPOTENCY_CONFLICT`)
- expired window creates a new ledger record and new `job_id`

## 8) Schema rollout compatibility storage policy

For heterogeneous consumers during migrations:
- producers must dual-write compatible fields for at least `N+2` releases
- readers must tolerate both old and new representations during overlap
- version support window is tracked in metadata table `schema_compatibility_window`
- rollback scripts must restore both schema and compatibility metadata
- informative: canonical N+2 deprecation policy is in `07-continuous-improvement-and-extension-model.md` Section 9

## 9) Data classification enforcement matrix

Classification levels:
- `public`
- `internal`
- `sensitive`

Minimum storage and transport constraints:
- `sensitive`: encrypted at rest, redacted in logs, restricted export workflow
- `internal`: encrypted at rest, standard retention
- `public`: standard controls, no secret-bearing payloads
- transport/key-management controls are canonical in `01-system-architecture.md` Section 20 and apply here without redefinition

Deletion/export requirements:
- classification-aware deletion jobs with audit evidence
- tenant-scoped export with role-based approval for `sensitive` datasets

Tenant data residency enforcement:
- each tenant declares data residency policy (`US`, `EU`, `global`) at onboarding
- storage routing must respect declared residency: `sensitive` data for EU-resident tenants must not leave EU region
- residency violations are `SEV1` incidents with mandatory DPIA review
- residency policy is stored in `tenant_policies` table and enforced at write path by control plane
- informative: canonical compliance governance rules are in `01-system-architecture.md` Section 23

## 10) Agent identity and memory storage baseline

Canonical policy source:
- normative identity/memory/skills rules are defined in `08-agent-memory-identity-and-skills.md`

Storage mapping:
- `agent_identities`: canonical agent principal (`agent_instance_id`, template/version, environment, lifecycle status, credential metadata refs)
- `agent_skill_bindings`: active skill assignments and policy constraints per agent instance
- `agent_memory_records`: current materialized memory items with scope (`job`, `project`, `global`), classification, and version pointer
- `agent_memory_events`: append-only change journal for memory writes, corrections, and deletions

Scope terminology alignment:
- storage scope `job|project|global` is the contract/storage alias for canonical memory classes in `08-agent-memory-identity-and-skills.md`:
  - `job <-> working_memory`
  - `project <-> project_memory`
  - `global <-> global_memory`

Anti-drift note: this scope terminology mapping is informative. The canonical (normative) source for memory scope definitions is `08-agent-memory-identity-and-skills.md` Section 3. This section must not introduce additional normative rules for memory scope behavior.

Redis coordination keys (runtime):
- `agent:ctx:<agent_instance_id>:<job_id>` -> short-lived working memory context
- `agent:mem-lock:<scope_key>` -> lease lock for serialized writes in same memory scope

## 11) Data-layer scale-out policy

Storage scale-out must be explicit and trigger-driven.

PostgreSQL scale strategy:
- baseline mode: single primary + read replicas for read-heavy paths.
- write failover: managed via Patroni (or equivalent consensus-based failover manager); maximum failover time: 30 seconds; split-brain protection via distributed consensus (etcd/ZooKeeper) is mandatory
- read scaling: `GET`-only and analytics reads may route to replicas with bounded replica lag policy.
- partitioning requirement:
  - `jobs`, `job_events`, `audit_log`, `agent_memory_events`, and `agent_memory_records` must support partitioning strategy by time and/or `project_id`.
  - partition strategy activation is mandatory before any table exceeds 100M rows in production.
  - row count monitoring is mandatory: daily `table_row_count` metric must be collected for all tables in the partitioning list.
  - preparation trigger: `SEV3` operations action item when any monitored table exceeds 60M rows (60% of activation threshold); partition design and rehearsal must complete within 10 business days of the alert.
  - activation trigger: partition strategy must be fully activated before any table reaches 90M rows; this provides a 10M row buffer for the activation rollout window.
  - if a table reaches 90M rows without an active partitioning strategy, a `SEV2` incident is created and new writes to that table require operations owner approval pending activation.
- write hotspot mitigation:
  - high-contention indexes must be reviewed monthly.
  - intent/project-aware index strategy is required for scheduler-critical queries.

Connection pooling:
- PgBouncer (or equivalent) is mandatory for all environments
- pool mode: `transaction` for application connections
- pool sizing: `max_connections = (num_app_instances * 20) + 10` reserve for admin/monitoring
- connection limits must be monitored; exhaustion creates `SEV2` alert
- idle connection timeout: 300 seconds

Redis scale strategy:
- queue and lock keyspaces must be separable by namespace to allow independent scaling.
- sustained memory pressure above 75% for 15 minutes requires scale action or key TTL review.
- eviction policy must never evict active lock keys.
- Redis HA topology (Sentinel/Cluster) is defined in Section 3 and applies to all production/stage deployments

Scale trigger thresholds (prod):
- Postgres primary CPU > 70% for 15 minutes -> scale action review required.
- Postgres storage growth forecast crossing 80% of allocated capacity within 30 days -> mandatory capacity expansion plan.
- replica lag > 5s for 3 consecutive windows -> read-routing protection and incident action item.

Critical query performance baselines (prod):

| Query class | Latency P95 target | Latency P99 target |
|---|---|---|
| Job lookup by `job_id` | <= 5ms | <= 15ms |
| Job lookup by `idempotency_key` | <= 10ms | <= 25ms |
| Lock acquisition write | <= 10ms | <= 20ms |
| Lock heartbeat update | <= 5ms | <= 10ms |
| Audit log append | <= 15ms | <= 30ms |
| Memory record read by scope | <= 10ms | <= 25ms |
| Memory event append | <= 15ms | <= 30ms |
| Kill switch state lookup | <= 5ms | <= 10ms |

Rules:
- baselines are measured at database level (excludes application and network overhead)
- sustained breach for 3 consecutive 5-minute windows creates `SEV2` operations alert
- weekly scorecard must include query latency trends for all critical query classes

Migration/compatibility requirements:
- scale-out changes (partitioning introduction, replica topology changes) require rollback plan and rehearsal evidence.
- partition or routing changes cannot break idempotency, audit append-only guarantees, or schema compatibility windows.

## 12) Caching strategy

Cache layers:
- L1 (in-process): short-lived request-scoped caches for repeated lookups within a single request lifecycle (policy lookups, role resolutions)
- L2 (Redis): shared caches for frequently-read, infrequently-written data (budget counters, routing tables, capability registry snapshots)

Cache invalidation:
- L1: expires at end of request; no explicit invalidation needed
- L2: write-through invalidation on source mutation; TTL-based expiry as safety net (default TTL: 60 seconds for policy data, 300 seconds for registry data)
- cache-aside pattern: read from cache → on miss, read from PG → populate cache → return

Cache poisoning prevention:
- cache keys must include `schema_version` to prevent stale-schema reads during migrations
- L2 cache entries must include `cached_at` timestamp; consumers must reject entries older than 2x TTL
- cache flush capability must be available as operator action for emergency recovery

Cache observability:
- required metrics: `cache_hit_rate`, `cache_miss_rate`, `cache_eviction_count`, `cache_latency_ms` (by cache layer and key namespace)
- cache hit rate below 70% for L2 caches triggers capacity/TTL review
