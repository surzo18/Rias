# RIAS Theoretical Model

This folder is the source of truth for RIAS system design.

Document map:
1. `01-system-architecture.md`
   - full architecture, RBAC, HITL, policy model, execution model, threat-model baseline, control ownership, anti-drift policy, compliance/privacy governance, gateway HA, feature flags, fencing tokens, graceful shutdown, tenant onboarding (Section 26), user identity profile (Section 27)
2. `02-storage-and-migrations.md`
   - storage choices, schema layout, migration and rollback policy, idempotency ledger, data-classification enforcement, Redis HA, caching strategy, connection pooling
3. `03-api-and-event-contracts.md`
   - concrete OpenAPI and AsyncAPI baseline contracts, retry/timeout policy, compatibility windows for heterogeneous consumers, health probes, user notifications
4. `04-testing-and-quality-gates.md`
   - mandatory TDD process, test matrix, CI/CD quality gates, control-to-test traceability and anti-drift checks
5. `05-slo-dr-and-release-ops.md`
   - finalized SLO targets, DR targets, release/change timetable, contention/timeout/retry budgets, capacity/backpressure, multi-region readiness, runbooks, deployment strategy, cost optimization
6. `06-sources-and-references.md`
   - external sources and standards used for this model
7. `07-continuous-improvement-and-extension-model.md`
   - self-improvement loop, capability registry, safe extensibility process, change-risk scoring and no-silent-mutation governance
8. `08-agent-memory-identity-and-skills.md`
   - canonical model for agent identity lifecycle, memory storage/update semantics, skills registry/binding, environment isolation, and agent inter-communication

Reading order for new contributors/agents:
1. `01-system-architecture.md`
2. `03-api-and-event-contracts.md`
3. `04-testing-and-quality-gates.md`
4. `02-storage-and-migrations.md`
5. `08-agent-memory-identity-and-skills.md`
6. `05-slo-dr-and-release-ops.md`
7. `06-sources-and-references.md`
8. `07-continuous-improvement-and-extension-model.md`

Implementation note:
- If any rule conflicts across files, treat `01-system-architecture.md` as primary, except domains explicitly marked as canonical in `01-system-architecture.md` Section 18.
- For agent identity/memory/skills domain, `08-agent-memory-identity-and-skills.md` is canonical.
- Any unresolved conflict still requires a policy update PR.

## Contract generation build flow

Minimal flow:
1. update contracts in `03-api-and-event-contracts.md`
2. regenerate SDK/types/validators/error enums from contract definitions
3. run contract tests and compatibility checks
4. run full CI gate for affected components
5. merge only when generated artifacts and tests are in sync

CI policy:
- pull requests fail when generated contract artifacts are outdated
- breaking contract changes require version bump + migration guide
