# Continuous Improvement and Extension Model

## 1) Purpose

Define how RIAS improves itself safely over time and how new channels, agents, and capabilities are introduced without breaking security or contracts.

Canonical note:
- identity lifecycle, memory behavior, and skills governance are normatively defined in `08-agent-memory-identity-and-skills.md`

## 2) Monthly improvement loop

Cadence:
- monthly policy review
- weekly incident triage

Inputs:
- failed jobs and retry patterns
- HITL decision outcomes
- security findings
- cost overruns and budget-exceeded events
- model routing misclassifications
- incident postmortem findings and corrective actions

Required outputs:
- approved policy changes (if needed)
- updated test scenarios
- routing table updates
- runbook updates

## 3) Self-improvement event lifecycle

Standard lifecycle:
1. scheduler emits `improvement.review.scheduled`
2. collector emits `improvement.input.snapshot_created`
3. analyzer emits `improvement.analysis.completed`
4. planner emits `improvement.plan.proposed`
5. HITL decision emits `improvement.plan.approved` or `improvement.plan.rejected`
6. executor emits `improvement.change.applied`
7. validator emits `improvement.change.validated`
8. reporter emits `improvement.report.published`

Guardrails:
- no policy/model/routing change is applied without HITL decision
- every applied change must reference source metrics and test evidence
- failed validation emits `improvement.change.rolled_back`

Post-validation rollback:
- if a validated and published improvement change causes regression (detected by KPI breach, incident, or anomaly signal), rollback must be triggered
- rollback trigger criteria:
  - any KPI from Section 6 or Section 13 breaches alert threshold within 48 hours of change application
  - any `SEV1` or `SEV2` incident causally linked to the applied change
  - operator-initiated rollback via HITL override
- rollback emits `improvement.change.rolled_back` with linkage to original `improvement.change.applied` event
- post-rollback: the rolled-back change is flagged for re-analysis and cannot be re-applied without updated test evidence and explicit HITL approval

Improvement pipeline component definitions:
- `collector`: system capability (`improvement.collector`) responsible for gathering review inputs (Section 2); runs as Tier A job triggered by cron; registered in capability registry
- `analyzer`: system capability (`improvement.analyzer`) that processes snapshot data and produces analysis outputs; runs as Tier A job; registered in capability registry
- `planner`: system capability (`improvement.planner`) that generates proposed change packages from analysis outputs; runs as Tier A job; proposed changes require HITL decision before application
- `executor`: controlled system capability registered as two distinct capability entries in the capability registry (cannot be represented as a single-tier registration):
  - `improvement.executor.standard` (Tier B) — applies approved low-risk changes (`change_risk_score` 0-29); cannot execute without a linked HITL-approved plan; requires `improvement.validator` to be scheduled as follow-on step
  - `improvement.executor.controlled` (Tier C) — applies policy/model/routing/security changes (`change_risk_score` >= 30 or change type is policy/model/routing regardless of score); requires explicit HITL Tier C approval before execution; cannot be triggered without linked approved improvement plan referencing the originating analysis
- `validator`: system capability (`improvement.validator`) that tests applied changes against KPI and quality gates; runs as Tier B job; registered in capability registry
- `reporter`: read-only system capability (`improvement.reporter`) that publishes improvement reports; runs as Tier A job; registered in capability registry

All improvement pipeline capabilities must be registered in the capability registry (Section 7) with appropriate risk tier before first use. Each capability must have a `required_test_pack` covering its nominal and failure paths. The executor is registered as two separate entries (`improvement.executor.standard` Tier B and `improvement.executor.controlled` Tier C) per the multi-tier capability rule in Section 7.

## 4) Cron schedule (UTC)

| Purpose | Cron | Event emitted |
|---|---|---|
| Daily KPI snapshot | `0 1 * * *` | `improvement.input.snapshot_created` |
| Daily budget anomaly scan | `15 1 * * *` | `budget.anomaly.scan_completed` |
| Weekly incident triage build | `0 8 * * 1` | `improvement.incident.triage_scheduled` |
| Weekly routing quality review | `30 8 * * 1` | `improvement.routing.review_scheduled` |
| Monthly policy review start | `0 9 1 * *` | `improvement.review.scheduled` |
| Monthly proposed change pack | `0 10 1 * *` | `improvement.plan.proposed` |
| Monthly rollout window check | `0 11 1 * *` | `improvement.rollout.window_checked` |
| Quarterly deep security review | `0 7 1 */3 *` | `security.review.deep_scheduled` |
| Quarterly DR drill trigger | `0 14 1 */3 *` | `drill.restore.scheduled` |
| Quarterly runbook staleness check | `0 10 1 */3 *` | `operations.runbook.staleness_check_scheduled` |
| Daily documentation snapshot | `30 1 * * *` | `documentation.snapshot.scheduled` |
| Weekly documentation publish candidate | `0 9 * * 2` | `documentation.publish.candidate_scheduled` |

Schedule dependency chains:
- monthly improvement workflows have implicit ordering: `improvement.review.scheduled` (09:00) must complete analysis phase before `improvement.plan.proposed` (10:00) can generate meaningful proposals
- if `improvement.review.scheduled` run has not completed by the time `improvement.plan.proposed` is due, the plan proposal run must be deferred until review completion (maximum defer: 4 hours)
- deferred runs emit `improvement.scheduler.failed` with `details.failure_class = dependency_not_met` if defer window is exceeded
- `improvement.rollout.window_checked` (11:00) depends on `improvement.plan.proposed` having completed or formally failed; if plan.proposed is still pending at 11:00, rollout.window_checked defers its execution until plan.proposed resolves (maximum additional defer: 2 hours); if plan.proposed is still unresolved after 2 hours, rollout.window_checked emits `improvement.scheduler.failed` with `details.failure_class = dependency_not_met` and is skipped for that cycle
- weekly and daily workflows are independent and have no implicit ordering dependencies

Retry policy for scheduled workflows:
- scheduler retries failed cron-triggered runs up to 3 times with exponential backoff
- on final failure emit `improvement.scheduler.failed` with `details.failure_class = retry_exhausted` and open HITL incident item

Runbook staleness check behavior:
- `operations.runbook.staleness_check_scheduled` triggers a check of all runbooks in the inventory (`05-slo-dr-and-release-ops.md` Section 19) against their `last_reviewed` date
- runbooks with `last_reviewed` older than 90 days are flagged as non-compliant; a `SEV3` operations action item is opened per non-compliant runbook with owner assignment based on the runbook's `severity_trigger`
- the check result is included in the quarterly operations scorecard
- if the staleness check job itself fails, it emits `improvement.scheduler.failed` with `failure_class = retry_exhausted`

Severity mapping for `improvement.scheduler.failed`:
- `failure_class = retry_exhausted`: `SEV3` incident; opens HITL incident item for manual triage
- `failure_class = dependency_not_met` or `misfire_bounds_exceeded`: `SEV3` operations action item; no HITL escalation unless the missed workflow has downstream P0/P1 impact (e.g., missed monthly policy review blocking a security fix escalates to `SEV2`)

Misfire and catch-up policy for scheduled workflows:
- scheduler must persist last successful execution timestamp per scheduled workflow
- if a planned run window is missed (scheduler downtime/degradation), scheduler must emit catch-up run(s) in deterministic chronological order
- catch-up mode must be bounded by policy (`max_catchup_runs_per_cycle`, `max_catchup_window`) to avoid recovery storms
- canonical default bounds:
  - `max_catchup_runs_per_cycle = 5`
  - `max_catchup_window = 24h`
- ownership and source of truth:
  - operations owner owns these bounds
  - environment-specific values are versioned in runtime scheduler policy configuration and change-controlled through release process
- skipped windows beyond catch-up bounds must emit `improvement.scheduler.failed` with:
  - `details.failure_class = misfire_bounds_exceeded`
  - explicit `details.misfire_window`
- catch-up execution must preserve idempotency and must not duplicate already completed scheduled runs

## 5) Self-documentation automation

Purpose:
- keep architecture, policies, contracts, and operations docs synchronized with runtime behavior and governance changes

Lifecycle:
1. emit `documentation.snapshot.scheduled`
2. gather inputs (policy versions, contract diffs, release notes, incident learnings)
3. emit `documentation.snapshot.generated`
4. run documentation validation checks (links, schema references, required sections)
5. emit `documentation.validation.passed` or `documentation.validation.failed`
6. on pass, emit `documentation.publish.candidate_created`
7. human review gate for high-impact changes, then emit `documentation.published`

Mandatory rules:
- docs update is required for policy/contract/routing/security changes
- CI fails if documentation-required changes are detected without docs updates
- published documentation includes source references and timestamp

Documentation automation capability registry entries (all must be registered per Section 7 before first use):
- `documentation.snapshot.collector` (Tier A): gathers inputs (policy versions, contract diffs, release notes, incident learnings); runs as Tier A job triggered by cron
- `documentation.validator` (Tier A): runs documentation validation checks (links, schema references, required sections); runs as Tier A job
- `documentation.publisher` (Tier A): publishes approved documentation candidates after human review gate for high-impact changes; runs as Tier A job
Each documentation automation capability must have a `required_test_pack` covering nominal and failure paths before first use.

## 6) Improvement KPIs

- approval regret rate (approved job later classified as bad decision)
- routing misclassification rate (wrong local/cloud or risk tier)
- repeat failure rate by intent
- mean time to recover (MTTR) for failed jobs
- false-positive escalation rate

Baseline KPI targets (v1):

| KPI | Baseline target | Alert threshold |
|---|---|---|
| Approval regret rate | <= 2.0% per month | > 5.0% |
| Routing misclassification rate | <= 3.0% per month | > 7.0% |
| Repeat failure rate by intent | <= 5.0% per month | > 10.0% |
| MTTR for failed jobs | <= 30 min (P95) | > 60 min |
| False-positive escalation rate | <= 10.0% per month | > 20.0% |

Rules:
- trend must improve or remain stable release-over-release
- regressions require explicit mitigation plan in next release
- KPI breach above alert threshold for 2 consecutive measurement cycles triggers forced review

## 7) Capability registry

Every new capability must be registered before use:
- `capability_id`
- `version`
- `owner`
- `risk_tier`
- `required_roles`
- `allowed_scopes`
- `required_test_pack`

Registry rules:
- unregistered capability cannot execute
- capability version changes require compatibility review
- Tier C capabilities require explicit approval workflow mapping
- capabilities that must operate at multiple risk tiers depending on the input change type (such as `improvement.executor.*`) must be registered as separate capability entries per tier; a single capability entry with multiple `risk_tier` values is not permitted

## 8) Safe extension process

Applies to:
- new ingress channels
- new agent types
- new tool integrations
- new model providers

Mandatory steps:
1. submit extension RFC
2. define contracts and schema versions
3. map RBAC and risk tier behavior
4. implement tests (unit/integration/contract/security/e2e)
5. run staged rollout with kill switch ready
6. complete post-rollout review

Controlled agent creation workflow (self-development scope):
- system may create new agent instances when workload/capability demand requires it, but only through this governed workflow
- creation source must be an approved `agent template` tied to capability registry entries

Mandatory provisioning steps:
1. detect need (`capacity`, `new scope`, or `specialized capability demand`)
2. select approved template and target capability set; generate provisioning `deduplication_key` from `(template_id, project_id, capability_hash)` to prevent duplicate agent creation from concurrent requests
3. compute `change_risk_score` and proposed scope bindings
4. require HITL decision for:
   - any Tier C capability
   - any new agent type or template version
   - any cross-project/global scope assignment
5. provision agent identity and least-privilege bindings
6. run post-provision validation tests and policy checks
7. emit audit/event evidence and activate agent

Deduplication enforcement:
- the `deduplication_key` generated in step 2 is enforced via the `idempotency_ledger` table (canonical rules: `02-storage-and-migrations.md` Section 7) with `intent = agent.provision.request` and a 24-hour active window
- concurrent provisioning requests with the same `deduplication_key` in the active window: the first request proceeds; subsequent requests receive the original provisioning `job_id` (safe replay — no new agent instance is created)
- a provisioning job in `provisioning` lifecycle state is treated as an active idempotency lock; duplicate requests within the window return the in-flight `job_id` and do not trigger a new provisioning flow

Hard rules:
- no agent instance can be activated without registered capabilities
- no self-created agent can grant itself broader scopes/roles
- failed validation must prevent activation and trigger rollback/deprovision:
  - immediate actions: revoke provisioned credentials, remove capability bindings, release any acquired resource locks
  - emit `agent.provision.failed` event with `details.failure_reason` and `details.rollback_steps`
  - if partial state was written (identity record, skill bindings), compensating cleanup must restore pre-provisioning state
  - emit `agent.provision.rolled_back` event on successful cleanup
  - failed rollback creates `SEV2` incident requiring manual operator intervention
  - rollback evidence must be linked to the original provisioning `request_id` and `trace_id`

## 8b) Safe decommissioning process

Applies to:
- connectors being removed
- agent templates being retired
- tool integrations being discontinued
- model providers being removed

Mandatory decommissioning steps (in order):
1. confirm zero active traffic via telemetry: `routing_decision_count` for the item must be 0 for a minimum of 2 consecutive release cycles; this is the traffic-zero gate and cannot be waived
2. apply N+2 deprecation policy minimum (canonical in Section 9) before removal; announce in release notes with migration guide for affected consumers
3. register deprecation in `deprecation_registry` with `item_type`, `deprecated_in_version`, `removal_target_version`, `migration_guide_ref`, and `owner`
4. at removal: revoke capability registry entry (set `status = retired`); revoke associated ACL grants (for connectors: event bus publish permission revoked per `03-api-and-event-contracts.md` Section 16 with security owner sign-off)
5. run post-removal validation: CI gate confirms no active code references the decommissioned item; no active jobs reference it in queue
6. archive connector manifest or agent template with final state and decommission timestamp in blob storage as audit evidence
7. emit `agent.deprovision.completed` (for agent templates) or `ingress.message.rejected` stop + `operations.events` audit event (for connectors) as decommission completion evidence

Hard rules:
- the traffic-zero gate (step 1) cannot be bypassed; non-zero traffic at removal time creates a `SEV2` incident
- decommissioning without a migration guide on record fails the deprecation registry CI gate (`07-continuous-improvement-and-extension-model.md` Section 9)
- secret material associated with the decommissioned item (HMAC secrets, mTLS certificates) must be revoked and purged from vault as part of step 4 under HITL Tier C workflow

## 9) Deprecation policy

- deprecations follow `N+2` release policy minimum
- announce deprecation in release notes and contracts
- keep migration guide until removal is complete

Deprecation registry:
- every deprecated item must be registered with: `deprecation_id`, `item_type` (API/event/capability/config), `deprecated_in_version`, `removal_target_version`, `migration_guide_ref`, `owner`
- CI enforcement gate: build fails if code references items past their `removal_target_version`
- deprecation registry is versioned and included in release notes
- canonical N+2 policy source: this section is the canonical declaration; other documents reference informatively

## 10) Governance ownership

- architecture owner: controls structural changes
- security owner: signs off policy and high-risk capabilities
- operations owner: signs off SLO/DR impacts
- product owner: approves rollout priorities

Improvement output routing:
- governance roles map to specific improvement output types for approval:
  - `architecture owner`: structural changes (new components, service boundaries, contract changes)
  - `security owner`: policy changes, capability risk tier modifications, authentication/authorization updates
  - `operations owner`: SLO/DR changes, runbook updates, scheduling/capacity modifications, cost threshold changes
  - `product owner`: routing table updates, new capability prioritization, agent template approvals
- improvement proposals affecting multiple domains require sign-off from all applicable governance owners
- unroutable proposals (no clear domain owner) escalate to `owner` role for decision

## 11) Change risk scoring and approval gates

Every proposed improvement change must include `change_risk_score` (0-100).

Scoring inputs:
- affected control criticality (P0/P1/P2)
- blast radius (single project vs global)
- security impact
- contract compatibility impact
- rollback complexity

Approval thresholds:
- `0-29`: low risk, standard review (uses `improvement.executor.standard`, Tier B)
- `30-69`: medium risk, HITL Tier C approval required (uses `improvement.executor.controlled`, Tier C)
- `70-100`: high risk, HITL Tier C approval + controlled rollout window required (uses `improvement.executor.controlled`, Tier C)

Mandatory override:
- policy/model/routing changes always require HITL Tier C approval, regardless of `change_risk_score`

## 12) No-silent-mutation policy

Policy/model/routing changes cannot be silently applied.

Mandatory evidence per change:
- diff artifact
- linked metric evidence
- linked test evidence
- explicit approver identity

Missing evidence blocks change application and emits `improvement.plan.rejected`.

## 13) Improvement pipeline quality KPIs

Additional KPIs:

| KPI | Baseline target | Alert threshold |
|---|---|---|
| False-fix rate (change applied but issue persists) | <= 5.0% per cycle | > 10.0% |
| Rollback ratio for applied changes | <= 10.0% per cycle | > 20.0% |
| Time-to-validate for proposed changes | <= 5 business days (P95) | > 10 business days |
| Improvement-induced incident rate | <= 1 SEV1/SEV2 per quarter | > 2 SEV1/SEV2 per quarter |

Rules:
- KPI regressions for two consecutive cycles trigger forced review
- forced review must produce mitigation actions and updated test packs

## 14) Confidence and anomaly-awareness model

Self-awareness signals:
- routing confidence score distribution
- policy uncertainty flags
- unknown-intent anomaly rate

Escalation rules:
- low-confidence or high-uncertainty decisions are auto-escalated to HITL
- anomaly budget per intent is defined; repeated breaches trigger policy review

## 15) Documentation synchronization governance

When improvements alter contracts, policy, routing, security, or operations:
- documentation snapshot and validation become release-blocking
- canonical source sections must be updated first
- publish candidate must include change timestamp and owner sign-off
