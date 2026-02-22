# SLO, DR, and Release Operations

## 1) Final SLO targets by environment

| Metric | Dev | Stage | Prod |
|---|---|---|---|
| Job API availability (monthly) | 99.0% | 99.5% | 99.9% |
| Submit-to-start latency P95 (non-blocked) | <= 60s | <= 45s | <= 30s |
| HITL notification latency P95 | <= 20s | <= 15s | <= 10s |
| Failed job recovery initiation | <= 180s | <= 120s | <= 60s |
| Queue processing success rate | >= 98.0% | >= 99.0% | >= 99.5% |

Telemetry metric name for "Failed job recovery initiation": `failed_job_recovery_initiation_latency_ms` (measured from `job.failed` event timestamp to first retry dispatch or operator action event timestamp).

Error-budget burn-rate alerting:
- each SLO metric has a monthly error budget derived from target (e.g., 99.9% availability = 43.2 min/month budget)
- fast-burn alert: fires when burn rate exceeds 14.4x (budget consumed in < 1 hour at current rate)
- slow-burn alert: fires when burn rate exceeds 6x (budget consumed in < 5 hours at current rate)
- fast-burn alerts create `SEV2` incident; slow-burn alerts create `SEV3` operations action item
- burn-rate dashboard must be included in weekly operations scorecard

## 2) Token and cost guardrails

Environment limits:
- Dev:
  - max tokens per job: 250k
  - max cost per job: 2 USD
- Stage:
  - max tokens per job: 350k
  - max cost per job: 5 USD
- Prod:
  - max tokens per job: 500k
  - max cost per job: 10 USD

Multi-level budget enforcement:
- per-user daily budget:
  - Dev: 1M tokens / 10 USD
  - Stage: 1.5M tokens / 20 USD
  - Prod: 2M tokens / 30 USD
- per-project daily budget:
  - Dev: 5M tokens / 40 USD
  - Stage: 8M tokens / 80 USD
  - Prod: 12M tokens / 150 USD
- org monthly budget:
  - Dev: 500 USD
  - Stage: 1500 USD
  - Prod: 5000 USD
- per-channel burst throttle:
  - Discord/Telegram/Web: max 20 submit requests per minute per actor

Breach behavior:
- immediate transition to `budget_exceeded`
- emit `job.budget_exceeded` event
- require explicit retry with updated approved limits

## 3) HITL decision SLA and operations

Decision set:
- `approve`
- `reject`
- `request_changes`
- `defer`

Tier policy:
- Tier C always requires human decision before execution.
- HITL canonical state: jobs awaiting human decision are in `waiting_human_decision` status (canonical name per `03-api-and-event-contracts.md` Section 4).
- Tier B allows guarded auto-run, with escalation on anomaly.
- Tier A auto-runs in allowed scope.

SLA:
- Tier C decision target: <= 2 hours
- reminder cadence: every 15 minutes (applies while in `waiting_human_decision` and `deferred` states)
- timeout handling: transition to `timed_out` with no auto-approval
- decision-to-state operational mapping (informative summary; canonical policy is in `03-api-and-event-contracts.md` Section 4):
  - `request_changes` transitions to `changes_requested`; recovery: submitter creates a new job with a new `idempotency_key`; original `changes_requested` job must be cancelled or will transition to `timed_out`
  - `defer` transitions to `deferred`; follow-up via `POST /jobs/{job_id}:decision` (`approve`, `reject`, or `request_changes`); HITL wait budget applies cumulatively across `waiting_human_decision` and `deferred` periods; canonical follow-up mechanism and budget rules in `03-api-and-event-contracts.md` Section 4

Approver requirements:
- production and infra Tier C decisions require `owner` or `infra-approver`
- policy/security rule changes require `owner`

HITL observability metrics:
- required metrics: `hitl_decision_latency_ms` (P95/P99, by tier), `hitl_timeout_count` (by tier, daily), `hitl_reminder_count` (daily), `hitl_decision_count` (by decision type), `hitl_escalation_count` (daily)
- HITL metrics must be included in weekly operations scorecard
- sustained HITL timeout rate > 10% for Tier C decisions triggers `SEV3` operations alert

Privacy operations SLA:
- data subject access/export request completion: <= 30 calendar days
- data subject correction request completion: <= 30 calendar days
- data deletion request completion: <= 30 calendar days (unless legal hold)
- legal hold application/removal must be audited with owner approval

## 4) Final DR targets by environment

| Target | Dev | Stage | Prod |
|---|---|---|---|
| RPO (queue/state) | <= 30 min | <= 15 min | <= 5 min |
| RTO (control plane restore) | <= 120 min | <= 60 min | <= 30 min |
| Restore drill cadence | Quarterly | Quarterly | Quarterly |

## 5) Release timetable

Release train:
- weekly patch window: Wednesday 10:00-12:00 UTC
- bi-weekly minor release window: Tuesday 09:00-12:00 UTC
- major release window: first Tuesday of quarter, 09:00-14:00 UTC

Versioning and branch alignment:
- patch releases map to `PATCH` SemVer bump
- minor releases map to `MINOR` SemVer bump
- major releases map to `MAJOR` SemVer bump and require migration guide
- release execution must follow branch model in `01-system-architecture.md` Section 11

Freeze windows:
- no major releases in the last 10 business days of a quarter
- holiday freeze by annual calendar (published in January)

## 6) Change windows for risky operations

Tier C infra/prod operations allowed only:
- Tuesday to Thursday
- 09:00-16:00 UTC

Outside window:
- requires emergency override by `owner`
- mandatory incident ticket and postmortem

## 7) Locking and scheduler contention SLOs

| Metric | Dev | Stage | Prod |
|---|---|---|---|
| Lock acquisition latency P95 | <= 2s | <= 1.5s | <= 1s |
| Lock contention ratio | <= 8% | <= 5% | <= 3% |
| Scheduler starvation incidents per month | <= 2 | <= 1 | 0 target |

Operational requirements:
- lock contention telemetry must be dashboarded by resource class
- repeated contention hotspots require weekly remediation action item

Fencing token enforcement:
- every lock acquisition must return a monotonic fencing token (epoch)
- every mutating operation under lock must include the fencing token; stale tokens are rejected
- fencing token validation failures must be dashboarded with `fencing_token_rejected_count` metric
- fencing token rejection creates `SEV2` incident when rate exceeds 0.1% of lock operations in any 15-minute window

Default lock lease/heartbeat parameters (mandatory baseline):

| Parameter | Dev | Stage | Prod |
|---|---|---|---|
| Lease TTL (`lock_ttl`) | 30s | 20s | 15s |
| Heartbeat interval (`heartbeat_interval`) | 10s | 6s | 5s |
| Renewal timeout before stale recovery (`stale_after`) | 45s | 30s | 20s |
| Max lease renewals before forced re-evaluation (`max_renewals`) | 80 | 120 | 180 |

Rules:
- `heartbeat_interval` must be <= one-third of `lock_ttl`.
- lock reclamation before `stale_after` is prohibited unless explicit operator override is active.
- changes to these defaults require resilience test evidence and owner approval.

Max renewals re-evaluation:
- when `max_renewals` is reached, the lock holder must release the lock and re-acquire through normal flow
- re-evaluation creates a scheduling checkpoint: other queued waiters get fair opportunity before re-grant
- sustained max-renewal hits (> 5% of locks in a 1-hour window) require capacity review action item

Starvation prevention:
- scheduler must implement weighted fair queuing across projects
- weight allocation: proportional to project priority tier with minimum guaranteed share (floor: 5% of capacity per active project)
- no single project may consume more than 60% of scheduler capacity for more than 5 consecutive minutes unless it is the only active project
- starvation detection: alert when any project queue wait exceeds 3x the P95 baseline for its priority tier

Lock manager scaling:
- lock manager is a distinct component that must support horizontal scaling
- autoscaling baseline:
  - scale out when lock acquisition latency P95 > 80% of SLO target for 3 consecutive minutes
  - scale in when lock acquisition latency P95 < 30% of SLO target for 15 minutes
  - Dev: min 1, max 2 instances
  - Stage: min 2, max 4 instances
  - Prod: min 2, max 8 instances
- lock manager instances must be stateless (all lock state in Redis/PostgreSQL)
- lock manager scaling changes must not cause lock ownership gaps or duplicate grants

## 8) Timeout budget decomposition

Per-job timeout budget must be split and enforced:
- API acceptance budget
- queue wait budget
- worker execution budget
- HITL wait budget (for Tier C)

Rules:
- total timeout budget must be explicit for every intent
- timeout reason must identify exhausted sub-budget
- budget changes require ops owner approval

Default timeout budgets by tier:

| Tier | API acceptance | Queue wait | Worker execution | HITL wait | Total max |
|---|---|---|---|---|---|
| A | 5s | 60s | 20m | n/a | 21m 5s |
| B | 5s | 120s | 45m | n/a | 47m 5s |
| C | 5s | 180s | 60m | 2h | 3h 3m 5s |

Note: the HITL wait budget (2h for Tier C) applies cumulatively to time spent in both `waiting_human_decision` and `deferred` states combined. A `defer` decision does not reset the budget counter. Canonical follow-up mechanism for deferred jobs is defined in `03-api-and-event-contracts.md` Section 4.

## 9) Retry budget and failure handling

Retry policy:
- retryable failures use bounded exponential backoff with jitter
- max retry attempts and max elapsed retry window are intent-specific
- retry exhaustion transitions to dead-letter and emits incident signal

Compensation policy:
- partial multi-step failures must trigger compensating actions or explicit operator handoff
- compensation outcomes are audit events

## 10) Incident severity and response matrix

Severity levels:
- `SEV1`: active production outage or security compromise
- `SEV2`: major degradation or critical workflow blocked
- `SEV3`: localized degradation with workaround
- `SEV4`: non-critical defect

Minimum requirements:
- each severity has response SLA, comms cadence, and escalation chain
- secret/token compromise has dedicated runbook with immediate rotation workflow

Severity response SLAs:

| Severity | Acknowledge | Incident lead assigned | Exec/owner escalation | Status update cadence | Mitigation target |
|---|---|---|---|---|---|
| `SEV1` | <= 5 min | <= 10 min | <= 15 min | every 15 min | <= 60 min |
| `SEV2` | <= 15 min | <= 30 min | <= 60 min | every 30 min | <= 4 h |
| `SEV3` | <= 60 min | <= 2 h | <= 8 h | every 4 h | <= 2 business days |
| `SEV4` | <= 1 business day | <= 2 business days | optional | daily | next planned release |

Alert routing and tooling requirements:
- `SEV1`/`SEV2`: PagerDuty (or equivalent) paging + dedicated incident channel + phone escalation
- `SEV3`: operations chat channel + ticketing queue with SLA tracking
- `SEV4`: ticketing queue only, prioritized in next sprint planning
- all alerts must include: severity, source metric, affected component, runbook link, and trace context
- alert deduplication: suppress repeat alerts for same incident within configurable window (default: 15 min for SEV1/2, 60 min for SEV3/4)

Postmortem process:
- required for: all SEV1 and SEV2 incidents; SEV3/SEV4 at incident lead discretion
- owner: incident lead assigned during the incident
- deadline: SEV1/SEV2 postmortems must be completed within 5 business days of incident resolution; SEV3 within 10 business days
- required content:
  - incident timeline (trigger, detection, escalation, mitigation, resolution timestamps)
  - root cause (immediate cause + contributing system/process factors)
  - impact assessment (affected services, users, data, SLO error budget consumed)
  - corrective actions: each with owner, due date, and ticket reference
  - improvement loop linkage: corrective actions submitted as input to next improvement cycle (`07-continuous-improvement-and-extension-model.md` Section 2)
- blameless format is mandatory; postmortems must not assign individual fault
- postmortem artifact must be linked to the originating incident ticket; artifacts without ticket linkage are non-compliant

## 11) Capacity, autoscaling, and backpressure

Capacity model (minimum):
- target sustained submit QPS by environment
- max queue depth thresholds by queue class
- worker pool min/max bounds and scaling triggers

Backpressure behavior:
- prioritize Tier C approvals and safety-critical intents
- apply fair scheduling across projects (no single-tenant starvation)
- shed non-critical workloads when system protection thresholds are exceeded

Capacity baselines by environment:

| Metric | Dev | Stage | Prod |
|---|---|---|---|
| Sustained submit throughput | 2 req/s | 8 req/s | 25 req/s |
| Burst submit throughput (60s) | 5 req/s | 15 req/s | 50 req/s |
| Project queue depth soft limit | 200 | 500 | 2000 |
| Project queue depth hard limit | 500 | 1200 | 5000 |
| Infra queue depth soft limit | 100 | 250 | 800 |
| Infra queue depth hard limit | 250 | 600 | 2000 |

Autoscaling baseline:
- scale out when queue depth > soft limit for 3 consecutive minutes or worker CPU > 70% for 5 minutes
- scale in when queue depth < 30% of soft limit for 15 minutes and worker CPU < 35%
- worker pool bounds:
  - Dev: min 1, max 4
  - Stage: min 2, max 12
  - Prod: min 6, max 64

Component autoscaling baselines:

| Component | Metric trigger (scale out) | Metric trigger (scale in) | Dev min/max | Stage min/max | Prod min/max |
|---|---|---|---|---|---|
| Gateway | request rate > 80% capacity for 3 min | request rate < 30% capacity for 15 min | 1/2 | 2/4 | 2/8 |
| Control plane | CPU > 70% for 5 min or queue depth > soft limit | CPU < 35% for 15 min | 1/2 | 2/6 | 2/12 |
| Scheduler | leader failover (standby count drops to 0) or scheduled trigger delay P95 > 80% of SLO target for 3 min | standby count > target for 30 min | 1/1 | 2/2 | 2/3 |
| Event consumers | consumer lag > 1000 events for 5 min | consumer lag < 100 for 15 min | 1/2 | 2/8 | 3/16 |
| Workers | (existing rules above) | (existing rules above) | 1/4 | 2/12 | 6/64 |
| Notification service | notification delivery latency P95 > 80% of SLO target for 3 min or delivery failure rate > 5% for 5 min | delivery latency P95 < 30% of SLO target for 15 min | 1/2 | 2/4 | 2/8 |
| Outbox relay | `outbox.pending_count` > 500 for 3 min or `outbox.oldest_pending_age_seconds` > 60s | `outbox.pending_count` < 100 for 15 min | 1/2 | 2/4 | 2/8 |
| Budget guard | budget enforcement latency P95 > 80% of the `POST /jobs:submit` P95 latency SLO target for the environment (Section 14: dev 800ms → trigger at 640ms, stage 600ms → 480ms, prod 400ms → 320ms) for 3 min, or budget guard error rate > 1% for 5 min | budget enforcement latency P95 < 30% of same `POST /jobs:submit` P95 SLO target for 15 min | 1/2 | 2/6 | 2/12 |

Notification service autoscaling SLO reference: the `80% of SLO target` trigger uses the general high-priority notification delivery P95 SLO (30s, per `03-api-and-event-contracts.md` Section 18) as the autoscaling reference; the stricter `approval_request` P95 SLO (10s, per Section 1) is monitored separately and does not independently gate autoscaling.

Scheduler scaling notes:
- Scheduler uses active/standby model with leader election (canonical in `01-system-architecture.md` Section 2); min/max refers to total instances (leader + standby replicas)
- dev: single instance allowed (no standby required); stage/prod: minimum 2 instances mandatory (1 leader + minimum 1 standby)
- scale-in must not reduce below minimum standby count; standby count of 0 is prohibited in stage/prod
- instance changes must not cause lock ownership gaps or duplicate job dispatch (consensus-based leader election enforces this)

Connection pooling requirements (cross-component):
- PostgreSQL connection pooling: mandatory, defined in `02-storage-and-migrations.md` Section 11
- Redis connection pooling: mandatory for all environments; pool size per application instance: 10-20 connections; idle timeout: 120 seconds
- Event bus connection pooling: mandatory for producers and consumers; pool size per instance: 5-10 connections; connection keepalive: 60 seconds
- connection pool exhaustion for any backend must emit `SEV2` alert

Blob storage (S3-compatible) capacity planning:
- capacity forecast must project 90-day growth based on audit log, trace archive, and backup volume trends
- alert when storage utilization exceeds 70% of allocated/budgeted capacity
- lifecycle policies: automatically transition objects older than retention hot period to infrequent-access tier
- storage cost must be included in infrastructure cost telemetry (`infra_cost_per_component_daily_usd`)

## 12) Multi-region and scale-readiness targets

Deployment posture by environment (canonical declaration):
- `dev`: single-region; no cross-region DR requirement; all DR targets apply within the single region only
- `stage`: active/passive — primary region serves all traffic; standby region receives asynchronous replication; failover is manual and requires `owner` confirmation
- `prod`: active/passive — primary region serves all traffic; standby region receives asynchronous replication; automated failover is allowed only when primary region is fully unreachable (all trigger conditions below met simultaneously); all other failover requires `owner` confirmation

Readiness requirements:
- cross-region failover trigger conditions (mandatory baseline):
  - primary region control plane availability drops below 99.0% for 5 consecutive minutes
  - primary region database primary is unreachable and replica promotion exceeds 30 seconds
  - primary region Redis cluster is unavailable for more than 30 seconds after failover attempt
  - primary region event bus broker quorum is lost and cannot recover within 60 seconds
  - any `SEV1` incident where primary region RTO is projected to exceed the environment RTO target (prod: 30 min)
- automated failover trigger requires `owner` confirmation except when primary region is fully unreachable (automated failover allowed without manual gate)
- test cross-region restore and traffic shift at least quarterly

Cross-region failover SLOs:

| Metric | Stage | Prod |
|---|---|---|
| Traffic shift completion time (from trigger decision to full re-routing) | <= 5 min | <= 3 min |
| API latency P95 during failover window (first 5 min after traffic shift) | <= 2x normal stage P95 SLO | <= 2x normal prod P95 SLO |
| API latency P95 after stabilization (> 5 min post-shift) | normal stage SLOs apply | normal prod SLOs apply |
| Cross-region network overhead (failover region vs. primary, post-stabilization) | <= 80ms P95 intra-continental; <= 200ms P95 cross-continental | <= 50ms P95 intra-continental; <= 150ms P95 cross-continental |
| Replication lag at failover point | <= RPO targets (Section 4) | <= RPO targets (Section 4) |

Rules:
- cross-region network overhead is measured at the API boundary (gateway ingress); it is an additive component on top of normal endpoint SLOs (Section 14)
- failover window latency relaxation applies only during the first 5 minutes after traffic shift; sustained exceedance after 5 minutes is treated as a normal SLO breach
- traffic shift completion time is measured from automated failover trigger confirmation (or `owner` confirmation for manual gates) to readiness probe green status in the failover region
- these SLOs must be validated in quarterly cross-region restore drills (Section 4)

Target outcomes:
- latency and RTO impact per failover mode are defined above and validated quarterly
- regional isolation failures cannot violate tenant boundaries

Notification service state during cross-region failover:
- notification delivery state is persisted in PostgreSQL `notifications` table; the failover region database replica (promoted to primary) is the authoritative source of notification state after failover
- the failover region notification service instance must replay undelivered notifications from the promoted primary using consumer checkpoint before resuming delivery; catch-up rules from `03-api-and-event-contracts.md` Section 18 apply (rate-limited, stale suppression after 24h)
- notifications already delivered by the primary region before failover must not be redelivered; the `notifications.delivered_at` field and `event_id`-based consumer deduplication enforce this
- if primary region recovers and rejoins, its notification state must not override the failover region's state; the failover region's primary remains authoritative until a controlled failback procedure is executed with explicit `owner` approval

Multi-AZ deployment guidance:
- production environment must deploy across minimum 2 availability zones
- stage environment should deploy across 2 AZs; dev may use single AZ
- database primary and at least one replica must be in different AZs
- Redis sentinel/cluster nodes must span AZs
- AZ failure must not cause full service outage; degraded operation with automatic failover is required

## 13) Operational scorecard (single-pane)

The operations dashboard must include:
- availability, latency, queue success, contention, retry exhaustion
- budget exceedance rates and anomaly trends
- HITL SLA adherence and timeout rate
- incident counts by severity and MTTR

Scorecard ownership:
- operations owner publishes weekly status snapshot
- regressions require mitigation item with due date

Cron schedule governance:
- scheduled workflows with implicit ordering dependencies (e.g., monthly review → plan proposal) must declare explicit dependency chains
- scorecard must flag cron schedule conflicts or insufficient gaps between dependent workflows
- canonical cron schedule is in `07-continuous-improvement-and-extension-model.md` Section 4

## 14) Endpoint response-time SLOs (API)

In addition to flow-level SLOs, endpoint-level latency SLOs are mandatory.

Latency SLO targets (P95/P99):

| Endpoint | Dev | Stage | Prod |
|---|---|---|---|
| `POST /jobs:submit` | <= 800ms / <= 1500ms | <= 600ms / <= 1200ms | <= 400ms / <= 900ms |
| `GET /jobs/{job_id}` | <= 500ms / <= 1000ms | <= 350ms / <= 800ms | <= 250ms / <= 600ms |
| `POST /jobs/{job_id}:decision` | <= 700ms / <= 1300ms | <= 500ms / <= 1000ms | <= 350ms / <= 800ms |
| `POST /jobs/{job_id}:cancel` | <= 700ms / <= 1300ms | <= 500ms / <= 1000ms | <= 350ms / <= 800ms |

Rules:
- latency SLOs apply to successful responses and typed non-2xx responses using the standard error envelope.
- measurement excludes network path outside the control API boundary; it includes auth, policy checks, and persistence write/read needed for response.
- sustained breach for 3 consecutive 5-minute windows creates `SEV2` operations alert.
- endpoint SLO regressions for two weekly scorecards in a row require mitigation item with owner and due date.

Gateway ingress SLOs:

| Metric | Dev | Stage | Prod |
|---|---|---|---|
| Gateway request latency P95 (ingress to control plane handoff) | <= 50ms | <= 30ms | <= 20ms |
| Gateway error rate (5xx, per 5-min window) | <= 1.0% | <= 0.5% | <= 0.1% |
| Gateway availability (monthly) | 99.5% | 99.9% | 99.95% |

Model router SLOs:

| Metric | Dev | Stage | Prod |
|---|---|---|---|
| Routing decision latency P95 | <= 200ms | <= 150ms | <= 100ms |
| Routing fallback rate (daily) | <= 5.0% | <= 3.0% | <= 1.0% |
| Confidence score below threshold rate (daily, threshold: 0.5) | <= 10.0% | <= 5.0% | <= 2.0% |

Rules:
- sustained routing fallback rate above SLO for 3 consecutive days creates `SEV3` operations alert
- confidence score distribution must be included in weekly scorecard

Policy engine evaluation latency SLOs:

| Metric | Dev | Stage | Prod |
|---|---|---|---|
| Policy evaluation latency P95 | <= 200ms | <= 150ms | <= 100ms |
| Policy evaluation latency P99 | <= 400ms | <= 300ms | <= 200ms |

Rules:
- latency is measured at the policy engine boundary (excludes control plane overhead and network path to policy engine)
- sustained breach for 3 consecutive 5-minute windows creates `SEV2` operations alert
- these targets are a sub-budget of the control plane endpoint SLOs above; a sustained policy engine P95 regression requires investigation before the endpoint SLO is impacted

Connector normalization SLOs:

| Metric | Dev | Stage | Prod |
|---|---|---|---|
| Normalization latency P95 (per connector) | <= 500ms | <= 300ms | <= 200ms |
| Connector availability (monthly, per enabled connector) | 99.0% | 99.5% | 99.9% |
| Normalization failure rate (daily, per connector) | <= 2.0% | <= 1.0% | <= 0.5% |

Rules:
- latency measured at connector boundary (from auth verification to `ingress.events` publish acknowledgment)
- sustained breach for 3 consecutive 5-minute windows creates `SEV3` operations alert
- metrics must be sliceable by `connector_id` and `source_channel`
- weekly scorecard must include connector normalization health per enabled connector

Identity mapping SLOs (identity mapping is an integral subcomponent of the gateway per `03-api-and-event-contracts.md` Section 19):

| Metric | Dev | Stage | Prod |
|---|---|---|---|
| Identity mapping latency P95 (source identity to canonical `actor_id` resolution) | <= 200ms | <= 100ms | <= 50ms |
| Identity mapping availability (monthly) | 99.0% | 99.5% | 99.9% |

Rules:
- sustained breach for 3 consecutive 5-minute windows creates `SEV2` operations alert
- metrics must be sliceable by `connector_id` and `source_channel`
- weekly scorecard must include identity mapping health per enabled connector

## 15) Scheduler schedule-integrity SLOs

Scheduler reliability for cron/system workflows must be measured explicitly.

| Metric | Dev | Stage | Prod |
|---|---|---|---|
| Scheduled trigger delay P95 (planned vs actual start) | <= 120s | <= 90s | <= 60s |
| Catch-up backlog clear time after scheduler recovery | <= 30 min | <= 20 min | <= 10 min |
| Misfire rate (outside configured catch-up bounds) | <= 1.0% | <= 0.5% | <= 0.1% |

Rules:
- sustained breach for 3 consecutive 15-minute windows creates `SEV2` operations alert.
- scheduler incidents must include `details.misfire_window` and catch-up evidence in incident record.

## 16) Logging and tracing pipeline SLOs

Observability pipeline stability is mandatory for auditability and operations.

| Metric | Dev | Stage | Prod |
|---|---|---|---|
| Log ingestion latency P95 | <= 120s | <= 90s | <= 60s |
| Trace ingestion latency P95 | <= 180s | <= 120s | <= 90s |
| Log pipeline drop rate (daily) | <= 0.5% | <= 0.2% | <= 0.1% |
| Trace pipeline drop rate (daily) | <= 1.0% | <= 0.5% | <= 0.2% |

Rules:
- drops caused by explicit policy redaction/filtering do not count as pipeline loss.
- sustained breach for 3 consecutive 15-minute windows creates `SEV2` operations alert.
- weekly scorecard must include these metrics with trend and owner.

Metric cardinality governance:
- metric label cardinality rules are defined in `01-system-architecture.md` Section 25 and apply to all metrics emitted by RIAS services
- operations owner must review high-cardinality dimension reports weekly (Section 13 scorecard)
- metrics backend must be provisioned with cardinality limits; sustained cardinality breach creates `SEV3` operations action item

Trace sampling policy:
- all services must implement head-based sampling with the following minimum rates:
  - error traces and slow traces (latency exceeds the endpoint/flow P95 SLO target): 100% sampled
  - Tier C job traces and all HITL decision traces: 100% sampled
  - Tier A and Tier B normal-path traces: minimum 10% sampled in prod, 50% in stage, 100% in dev
- sampling decisions must propagate via W3C Trace Context `tracestate` header so all spans in a trace are consistently included or excluded
- sampling configuration is versioned and change-controlled; changes require operations owner approval
- if sampled trace volume causes the trace drop-rate SLO to be approached, operations owner must review and adjust sampling rates before the next scorecard cycle
- sampling rate targets are the floor; higher rates are permitted when storage and cost budgets allow

## 17) Event processing latency SLOs (publish -> consumer success)

Event-path SLOs are mandatory in addition to API and scheduler SLOs.

| Metric | Dev | Stage | Prod |
|---|---|---|---|
| Job event end-to-end latency P95 | <= 60s | <= 45s | <= 30s |
| System event end-to-end latency P95 | <= 90s | <= 60s | <= 45s |
| Event end-to-end latency P99 (all classes) | <= 180s | <= 120s | <= 90s |
| DLQ routing latency after retry exhaustion P95 | <= 120s | <= 90s | <= 60s |

Rules:
- latency measurement starts at broker publish timestamp and ends at successful consumer commit/checkpoint.
- redeliveries must preserve original publish timestamp for SLO accounting.
- sustained breach for 3 consecutive 15-minute windows creates `SEV2` operations alert.
- weekly scorecard must include event latency trend split by `job` and `system` classes.

DLQ accumulation SLOs:

| Metric | Dev | Stage | Prod |
|---|---|---|---|
| DLQ item count (per consumer group, 24h rolling) | <= 50 | <= 20 | <= 5 |
| DLQ item age (oldest unprocessed) | <= 48h | <= 24h | <= 8h |
| DLQ reprocessing success rate (per batch) | >= 80% | >= 90% | >= 95% |

Rules:
- DLQ count exceeding threshold creates `SEV3` alert; exceeding 5x threshold creates `SEV2` alert
- DLQ items older than age threshold require operator triage within 4 hours

Outbox relay publish-path SLOs:

Outbox relay is the critical path for all event delivery; its publish latency directly bounds the event end-to-end SLO floor.

| Metric | Dev | Stage | Prod |
|---|---|---|---|
| Relay publish latency P95 (outbox row claimed to broker ack) | <= 5s | <= 3s | <= 2s |
| Relay publish latency P99 | <= 15s | <= 10s | <= 5s |
| Relay error rate (daily, failed publish / total publish attempts) | <= 1.0% | <= 0.5% | <= 0.2% |

Rules:
- sustained P95 or P99 breach for 3 consecutive 5-minute windows creates `SEV2` operations alert
- daily error rate breach creates `SEV3` operations alert
- metrics must be sliceable by `event_name` and `project_id`
- weekly scorecard must include relay publish latency trend and error rate per environment

## 18) Agent memory and skills observability SLOs

These SLOs operationalize memory/skills telemetry requirements from `08-agent-memory-identity-and-skills.md` Section 8.

| Metric | Dev | Stage | Prod |
|---|---|---|---|
| Memory read latency P95 | <= 400ms | <= 300ms | <= 200ms |
| Memory write latency P95 | <= 700ms | <= 500ms | <= 350ms |
| Memory mutation error rate (daily) | <= 1.0% | <= 0.5% | <= 0.2% |
| Memory idempotency-conflict rejection rate (daily) | <= 2.0% | <= 1.0% | <= 0.5% |
| Skill execution success rate (daily) | >= 97.0% | >= 98.5% | >= 99.0% |
| Skill rollback rate (daily) | <= 2.0% | <= 1.0% | <= 0.5% |

Rules:
- metrics must be sliced by `project_id`, `skill_id`/version, and memory scope (`job|project|global`).
- sustained breach for 3 consecutive 15-minute windows (or daily breach for rate metrics) creates `SEV2` operations alert.
- weekly scorecard must include trend and remediation owner for every breached metric.

Agent introspection endpoint SLO:

| Metric | Dev | Stage | Prod |
|---|---|---|---|
| Introspection response latency P95 | <= 500ms | <= 350ms | <= 250ms |
| Introspection availability (monthly) | 99.0% | 99.5% | 99.9% |

Rules:
- introspection endpoint SLO applies only to authenticated requests from control plane and operations tooling
- sustained breach creates `SEV3` operations alert (introspection is diagnostic, not critical path)

## 19) Runbook structure and minimum inventory

Required runbook sections:
- `runbook_id`: unique identifier (RB-NNN)
- `title`: descriptive name
- `severity_trigger`: which severity levels invoke this runbook
- `symptoms`: observable indicators that trigger runbook execution
- `diagnostic_steps`: ordered investigation checklist
- `remediation_steps`: ordered fix/mitigation actions
- `escalation_path`: when and to whom to escalate
- `rollback_procedure`: how to revert if remediation fails
- `evidence_collection`: what to capture for postmortem
- `last_reviewed`: date of last review (must be within 90 days)

Minimum runbook inventory:

| ID | Title | Severity trigger |
|---|---|---|
| RB-001 | Full service outage | SEV1 |
| RB-002 | Database failover | SEV1/SEV2 |
| RB-003 | Redis cluster failure | SEV1/SEV2 |
| RB-004 | Event bus unavailability | SEV2 |
| RB-005 | Secret/token compromise | SEV1 |
| RB-006 | Kill switch activation | SEV1/SEV2 |
| RB-007 | Budget system failure | SEV2/SEV3 |
| RB-008 | Scheduler starvation | SEV2/SEV3 |
| RB-009 | DLQ overflow | SEV2/SEV3 |
| RB-010 | Certificate/key rotation failure | SEV2 |
| RB-011 | Agent provisioning failure and rollback | SEV2 |
| RB-012 | Configuration service failure | SEV2/SEV3 |
| RB-013 | Agent memory state inconsistency (journal/materialized records divergence) | SEV2/SEV3 |
| RB-014 | Lock manager component failure (stale lock accumulation, split grant, relay-layer failure distinct from Redis cluster failure) | SEV2/SEV3 |
| RB-015 | JWT signing key initial bootstrap (first-time deployment key generation, vault seeding, JWKS publication) | SEV1 |
| RB-016 | Observability pipeline failure (log ingestion pipeline down, metrics collector unavailable, trace ingestion breach) | SEV2/SEV3 |

Rules:
- every runbook must be rehearsed at least quarterly
- runbooks without rehearsal evidence within 90 days are flagged as non-compliant
- new incident classes discovered during postmortems must produce a new or updated runbook within 5 business days

## 20) Deployment strategy and graceful shutdown

Deployment strategy:
- canary deployment is mandatory for production releases
- canary receives 5% of traffic for minimum 15 minutes before progressive rollout
- canary health gate: no increase in error rate, latency P95, or budget anomalies compared to baseline
- rollback trigger: automated rollback if canary health gate fails within observation window
- blue-green deployment is allowed for stage environment
- dev environment may use rolling deployment

Graceful shutdown drain budgets:

| Component | Drain budget | Behavior on budget expiry |
|---|---|---|
| Gateway | 15s | drop new connections, force-close remaining |
| Control plane | 30s | complete in-flight policy evaluations, reject new |
| Scheduler | 30s | finish current dispatch cycle, re-queue pending |
| Workers | 120s | attempt checkpoint, release locks, emit partial-failure event |
| Event consumers | 30s | commit processed offsets, stop polling |

Rules:
- SIGTERM initiates graceful shutdown; SIGKILL is sent only after drain budget + 5s grace period
- processes must emit `service.shutdown.initiated` and `service.shutdown.completed` telemetry events
- incomplete work during shutdown must be recoverable via normal retry/recovery mechanisms

## 21) Cost optimization strategy

Cost visibility KPIs:
- cost per job (by intent, model provider, and environment)
- cost per project (daily, weekly, monthly aggregation)
- infrastructure cost per component (compute, storage, network, external APIs)
- model routing cost efficiency: actual cost vs optimal-route cost ratio

Optimization mechanisms:
- model routing must prefer cost-efficient providers when quality tier allows
- idle resource detection: alert when provisioned capacity utilization < 30% for 7 consecutive days
- reserved capacity vs on-demand ratio target: >= 60% reserved for predictable baseline workloads
- spot/preemptible instance usage allowed for dev and non-critical stage workloads only

Cost governance:
- monthly cost review as part of operations scorecard
- cost anomaly detection: alert when daily cost exceeds 2x 30-day rolling average
- budget forecast: 30-day forward projection updated daily
- cost optimization actions must be tracked with owner and deadline in operations backlog

Cost telemetry metric names:
- `cost_per_job_usd` (by intent, model_provider, environment)
- `cost_per_project_daily_usd` (by project_id)
- `cost_per_project_monthly_usd` (by project_id)
- `infra_cost_per_component_daily_usd` (by component: compute, storage, network, external_apis)
- `token_usage_per_job` (by intent, model_provider)
- `token_usage_per_project_daily` (by project_id)
- `model_routing_cost_efficiency_ratio` (actual_cost / optimal_route_cost)
- `budget_utilization_percent` (by scope: user, project, org)

Collection points:
- job-level cost: emitted by worker on job completion and by budget guard on enforcement
- project/org-level cost: aggregated by budget guard service
- infrastructure cost: collected from cloud provider billing APIs and internal resource metering
- all cost metrics must be available in operations dashboard with daily/weekly/monthly aggregation
