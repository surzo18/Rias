# RIAS Roadmap

Source of truth: `docs/theoretical_model/`
Current phase: **Phase 1 — in progress**

---

## Phase 1: Foundation

Goal: Funkčný orchester — job submission, policy, HITL, locks.

### Gateway (OpenClaw / esdeath)
- [x] Telegram ingress
- [x] TTS (Chatterbox)
- [x] HITL approval flow
- [x] Shell sandbox
- [x] LLM router (partial)
- [ ] Discord ingress
- [ ] Connector normalization (canonical request/event format)

### RIAS Control Plane
- [ ] Control plane skeleton (authN/authZ, policy engine)
- [ ] Risk tier classification (Tier A / B / C)
- [ ] Capability profiles per agent
- [ ] RBAC model (owner / admin / project-maintainer / viewer)

### Scheduler + Queue
- [ ] Job queue (PostgreSQL)
- [ ] Idempotency ledger
- [ ] Serial-per-project execution
- [ ] Dependency resolution

### Lock + State
- [ ] Lock manager (lease + heartbeat)
- [ ] Fencing tokens
- [ ] Dead-letter queue (DLQ)

### Testing
- [ ] Unit + integration test harness pre control plane
- [ ] HITL scenario test pack

---

## Phase 2: Safety & Contracts

Goal: Produkčné guardraily — contracts, secrets, budget, audit.

- [ ] OpenAPI + AsyncAPI baseline contracts
- [ ] Contract tests v CI
- [ ] Secrets + redaction + audit trail
- [ ] Budget guard (cost limits, model routing guardrails)
- [ ] Security test pack (injection, SSRF, cross-tenant)
- [ ] JWT/token management + blocklist

---

## Phase 3: Operations

Goal: SLO, monitoring, runbooks, DR drills.

- [ ] SLO dashboards
- [ ] On-call runbooks
- [ ] Backup + restore drills
- [ ] Model evaluation loop
- [ ] Resilience + chaos drills
- [ ] Cost optimization baseline
