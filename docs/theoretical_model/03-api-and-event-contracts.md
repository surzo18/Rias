# API and Event Contracts

## 1) OpenAPI baseline (v1)

```yaml
openapi: 3.1.0
info:
  title: RIAS Control API
  version: 1.0.0
servers:
  - url: https://rias-control.internal
security:
  - bearerAuth: []
paths:
  /jobs:submit:
    post:
      operationId: submitJob
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JobSubmitRequest'
      responses:
        '202':
          description: Accepted
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/JobAcceptedResponse'
  /jobs/{job_id}:
    get:
      operationId: getJob
      parameters:
        - in: path
          name: job_id
          required: true
          schema:
            type: string
            format: uuid
      responses:
        '200':
          description: Job status
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/JobStatusResponse'
  /jobs/{job_id}:cancel:
    post:
      operationId: cancelJob
      parameters:
        - in: path
          name: job_id
          required: true
          schema:
            type: string
            format: uuid
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CancelRequest'
      responses:
        '202':
          description: Cancel requested
  /jobs/{job_id}:approve:
    post:
      operationId: approveJob
      parameters:
        - in: path
          name: job_id
          required: true
          schema:
            type: string
            format: uuid
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/DecisionRequest'
      responses:
        '200':
          description: Decision accepted
  /jobs/{job_id}:reject:
    post:
      operationId: rejectJob
      parameters:
        - in: path
          name: job_id
          required: true
          schema:
            type: string
            format: uuid
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/DecisionRequest'
      responses:
        '200':
          description: Decision accepted
  /jobs/{job_id}:decision:
    post:
      operationId: decideJob
      parameters:
        - in: path
          name: job_id
          required: true
          schema:
            type: string
            format: uuid
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/DecisionRequest'
      responses:
        '200':
          description: Decision accepted
  /dlq/items:
    get:
      operationId: listDlqItems
      summary: List DLQ items with optional filters (requires owner or infra-approver role)
      parameters:
        - in: query
          name: event_name
          required: false
          schema:
            type: string
        - in: query
          name: project_id
          required: false
          schema:
            type: string
        - in: query
          name: max_age_hours
          required: false
          schema:
            type: integer
            minimum: 1
        - in: query
          name: limit
          required: false
          schema:
            type: integer
            minimum: 1
            maximum: 100
            default: 20
        - in: query
          name: cursor
          required: false
          schema:
            type: string
      responses:
        '200':
          description: DLQ item list
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DlqListResponse'
  /dlq/items/{event_id}:reprocess:
    post:
      operationId: reprocessDlqItem
      summary: Reprocess a single DLQ item (requires owner or infra-approver role)
      parameters:
        - in: path
          name: event_id
          required: true
          schema:
            type: string
            format: uuid
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/DlqReprocessRequest'
      responses:
        '202':
          description: Reprocess accepted
  /dlq/items:reprocess-bulk:
    post:
      operationId: bulkReprocessDlqItems
      summary: Bulk reprocess DLQ items (requires owner or infra-approver role; rate-limited and audited)
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/DlqBulkReprocessRequest'
      responses:
        '202':
          description: Bulk reprocess accepted
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DlqBulkReprocessResponse'
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
  schemas:
    RequestMeta:
      type: object
      required: [schema_version, request_id, trace_id, actor_id, project_id]
      properties:
        schema_version: { type: string, enum: [v1] }
        request_id: { type: string }
        trace_id: { type: string }
        actor_id: { type: string }
        project_id: { type: string }
    JobSubmitRequest:
      type: object
      required: [meta, idempotency_key, intent, risk_tier, payload]
      properties:
        meta: { $ref: '#/components/schemas/RequestMeta' }
        idempotency_key: { type: string }
        intent: { type: string }
        risk_tier: { type: string, enum: [A, B, C] }
        parent_job_id: { type: string, format: uuid, nullable: true }
        constraints:
          type: object
          properties:
            data_classification: { type: string, enum: [public, internal, sensitive] }
            cost_limit_usd: { type: number, minimum: 0 }
            prefer_local: { type: boolean }
        payload: { type: object, additionalProperties: true }
    JobAcceptedResponse:
      type: object
      required: [job_id, status]
      properties:
        job_id: { type: string, format: uuid }
        status: { type: string, enum: [queued] }
    JobStatusResponse:
      type: object
      required: [job_id, status]
      properties:
        job_id: { type: string, format: uuid }
        status:
          type: string
          enum: [queued, blocked, waiting_human_decision, changes_requested, deferred, running, retrying, done, failed, timed_out, rejected, budget_exceeded, cancelled]
        last_error: { type: string, nullable: true }
    DecisionRequest:
      type: object
      required: [meta, idempotency_key, decision, reason]
      properties:
        meta: { $ref: '#/components/schemas/RequestMeta' }
        idempotency_key: { type: string }
        decision: { type: string, enum: [approve, reject, request_changes, defer] }
        reason: { type: string, minLength: 1 }
    CancelRequest:
      type: object
      required: [meta, idempotency_key, reason]
      properties:
        meta: { $ref: '#/components/schemas/RequestMeta' }
        idempotency_key: { type: string }
        reason: { type: string, minLength: 1 }
    DlqItem:
      type: object
      required: [event_id, event_name, project_id, created_at, original_occurred_at, retry_count, last_error_code]
      properties:
        event_id: { type: string, format: uuid }
        event_name: { type: string }
        project_id: { type: string }
        created_at: { type: string, format: date-time }
        original_occurred_at: { type: string, format: date-time }
        retry_count: { type: integer, minimum: 0 }
        last_error_code: { type: string }
    DlqListResponse:
      type: object
      required: [items, total_count]
      properties:
        items:
          type: array
          items: { $ref: '#/components/schemas/DlqItem' }
        total_count: { type: integer }
        next_cursor: { type: string, nullable: true }
    DlqReprocessRequest:
      type: object
      required: [meta, idempotency_key]
      properties:
        meta: { $ref: '#/components/schemas/RequestMeta' }
        idempotency_key: { type: string }
    DlqBulkReprocessRequest:
      type: object
      required: [meta, idempotency_key, event_ids]
      properties:
        meta: { $ref: '#/components/schemas/RequestMeta' }
        idempotency_key: { type: string }
        event_ids:
          type: array
          items: { type: string, format: uuid }
          minItems: 1
          maxItems: 100
    DlqBulkReprocessResponse:
      type: object
      required: [accepted_count, rejected_count, batch_id]
      properties:
        accepted_count: { type: integer }
        rejected_count: { type: integer }
        batch_id: { type: string, format: uuid }
```

Payload size and depth limits:
- maximum request body size: 1 MB
- maximum JSON nesting depth: 10 levels
- maximum array element count per field: 1000
- payloads exceeding limits are rejected with `REQ_400_INVALID_SCHEMA`

CORS policy:
- API endpoints are internal-only by default; CORS is disabled
- Web UI origin is the only allowed CORS origin when enabled
- allowed methods: `GET`, `POST` (no `PUT`, `DELETE`, `PATCH` on job endpoints)
- `Access-Control-Allow-Credentials: true` only for Web UI origin
- preflight cache: `Access-Control-Max-Age: 3600`

## 2) AsyncAPI baseline (v1)

```yaml
asyncapi: 3.0.0
info:
  title: RIAS Job Events
  version: 1.0.0
channels:
  job.queued:
    messages:
      queued:
        $ref: '#/components/messages/JobEvent'
  job.blocked:
    messages:
      blocked:
        $ref: '#/components/messages/JobEvent'
  job.waiting_human_decision:
    messages:
      waiting_human_decision:
        $ref: '#/components/messages/JobEvent'
  job.waiting_human:
    deprecated: true
    messages:
      waiting_human:
        $ref: '#/components/messages/JobEvent'
  job.running:
    messages:
      running:
        $ref: '#/components/messages/JobEvent'
  job.retrying:
    messages:
      retrying:
        $ref: '#/components/messages/JobEvent'
  job.done:
    messages:
      done:
        $ref: '#/components/messages/JobEvent'
  job.failed:
    messages:
      failed:
        $ref: '#/components/messages/JobEvent'
  job.rejected:
    messages:
      rejected:
        $ref: '#/components/messages/JobEvent'
  job.timed_out:
    messages:
      timed_out:
        $ref: '#/components/messages/JobEvent'
  job.budget_exceeded:
    messages:
      budget_exceeded:
        $ref: '#/components/messages/JobEvent'
  job.changes_requested:
    messages:
      changes_requested:
        $ref: '#/components/messages/JobEvent'
  job.deferred:
    messages:
      deferred:
        $ref: '#/components/messages/JobEvent'
  job.cancelled:
    messages:
      cancelled:
        $ref: '#/components/messages/JobEvent'
  ingress.events:
    messages:
      ingress_event:
        $ref: '#/components/messages/SystemEvent'
  improvement.events:
    messages:
      improvement_event:
        $ref: '#/components/messages/SystemEvent'
  documentation.events:
    messages:
      documentation_event:
        $ref: '#/components/messages/SystemEvent'
  agent.lifecycle.events:
    messages:
      agent_lifecycle_event:
        $ref: '#/components/messages/SystemEvent'
  agent.memory.events:
    messages:
      agent_memory_event:
        $ref: '#/components/messages/SystemEvent'
  operations.events:
    messages:
      operations_event:
        $ref: '#/components/messages/SystemEvent'
components:
  messages:
    JobEvent:
      payload:
        $ref: '#/components/schemas/JobEventPayload'
    SystemEvent:
      payload:
        $ref: '#/components/schemas/SystemEventPayload'
  schemas:
    JobEventPayload:
      type: object
      required: [schema_version, event_id, event_name, occurred_at, job_id, idempotency_key, request_id, trace_id, actor_id, project_id]
      properties:
        schema_version: { type: string, enum: [v1] }
        event_id: { type: string, format: uuid }
        event_name: { type: string }
        occurred_at: { type: string, format: date-time }
        job_id: { type: string, format: uuid }
        idempotency_key: { type: string }
        request_id: { type: string }
        trace_id: { type: string }
        actor_id: { type: string }
        project_id: { type: string }
        parent_job_id: { type: string, format: uuid, nullable: true }
        delegation_depth: { type: integer, minimum: 0 }
        status: { type: string }
        details: { type: object, additionalProperties: true }
    SystemEventPayload:
      type: object
      required: [schema_version, event_id, event_name, occurred_at, request_id, trace_id, actor_id, project_id]
      properties:
        schema_version: { type: string, enum: [v1] }
        event_id: { type: string, format: uuid }
        event_name: { type: string }
        occurred_at: { type: string, format: date-time }
        request_id: { type: string }
        trace_id: { type: string }
        actor_id: { type: string }      # "system" allowed
        project_id: { type: string }    # "global" allowed
        details:
          oneOf:
            - $ref: '#/components/schemas/IngressEventDetails'
            - $ref: '#/components/schemas/AgentProvisionEventDetails'
            - $ref: '#/components/schemas/AgentDeprovisionEventDetails'
            - $ref: '#/components/schemas/AgentMemoryEventDetails'
            - $ref: '#/components/schemas/SchedulerFailureEventDetails'
            - $ref: '#/components/schemas/GenericSystemEventDetails'
    IngressEventDetails:
      type: object
      required: [source_channel, source_system, source_message_id, connector_id, normalization_version, auth_context]
      properties:
        source_channel:
          type: string
          enum: [human_chat, human_mail, human_collaboration, developer_platform, machine_signal_feed, webhook_generic, external_app]
        source_system: { type: string }
        source_message_id: { type: string }
        connector_id: { type: string }
        normalization_version: { type: string }
        auth_context:
          type: object
          required: [auth_mode, verification_result, replay_check]
          properties:
            auth_mode: { type: string, enum: [hmac, asymmetric_signature, mtls] }
            verification_result: { type: string, enum: [passed, failed] }
            key_id: { type: string }
            replay_check: { type: string, enum: [passed, failed] }
      additionalProperties: true
    AgentProvisionEventDetails:
      type: object
      required: [agent_template_id, agent_instance_id, capability_set, change_risk_score, hitl_required]
      properties:
        agent_template_id: { type: string }
        agent_instance_id: { type: string }
        capability_set:
          type: array
          items: { type: string }
        change_risk_score: { type: number, minimum: 0, maximum: 100 }
        hitl_required: { type: boolean }
        approver_id: { type: string }
        deduplication_key: { type: string }         # present on provision.requested; format: hash(template_id+project_id+capability_hash)
        failure_reason: { type: string }            # required when event_name = agent.provision.failed
        rollback_steps: { type: array, items: { type: string } }  # required when event_name = agent.provision.failed or agent.provision.rolled_back
      additionalProperties: true
    AgentDeprovisionEventDetails:
      type: object
      required: [agent_instance_id, reason, result]
      properties:
        agent_instance_id: { type: string }
        reason: { type: string }
        result: { type: string, enum: [requested, completed, failed] }
        approver_id: { type: string }
      additionalProperties: true
    AgentMemoryEventDetails:
      type: object
      required: [agent_instance_id, memory_scope, memory_record_id, mutation_type, classification, result]
      properties:
        agent_instance_id: { type: string }
        memory_scope: { type: string, enum: [job, project, global] }
        memory_record_id: { type: string }
        mutation_type: { type: string, enum: [write, delete, correction] }
        classification: { type: string, enum: [public, internal, sensitive] }
        result: { type: string, enum: [applied, rejected] }
        rejection_reason: { type: string }
      additionalProperties: true
    SchedulerFailureEventDetails:
      type: object
      required: [failure_class]
      properties:
        failure_class:
          type: string
          enum: [retry_exhausted, misfire_bounds_exceeded, dependency_not_met, internal_error]
        failure_reason: { type: string }
        misfire_window:
          type: object
          required: [start_at, end_at]
          properties:
            start_at: { type: string, format: date-time }
            end_at: { type: string, format: date-time }
      allOf:
        - if:
            properties:
              failure_class: { const: misfire_bounds_exceeded }
          then:
            required: [misfire_window]
      additionalProperties: true
    GenericSystemEventDetails:
      type: object
      required: [event_class]
      properties:
        event_class: { type: string }
      additionalProperties: true
```

Channel-to-status mapping note:
- `job.waiting_human` channel is a deprecated alias for `job.waiting_human_decision` channel. Both channels emit events for the `waiting_human_decision` status (defined in `JobStatusResponse` enum). The `job.waiting_human` channel does not correspond to a separate status value.

System/cron events use the `SystemEventPayload` contract and one of the canonical non-job channels above.

Event channel mapping for non-job events:
- ingress normalization events -> `ingress.events`
- scheduled/self-improvement events -> `improvement.events`
- documentation workflow events -> `documentation.events`
- agent lifecycle events (`agent.provision.*`, `agent.deprovision.*`) -> `agent.lifecycle.events`
- agent memory mutation events (`agent.memory.*`) -> `agent.memory.events`
- operational scheduled events (`budget.*`, `security.review.*`, `drill.restore.*`) -> `operations.events`
- HITL reminder and escalation events -> `operations.events`
- feature flag lifecycle events -> `operations.events`

System/cron payload shape:
- canonical definition is in Section 2 (`components.schemas.SystemEventPayload`)
- this section is informative only and must not duplicate the schema body

## 3) Contract compatibility policy

- Backward compatible changes:
  - add optional fields
  - add new event types
- Breaking changes:
  - remove required fields
  - change required field type
  - rename existing event channel

Breaking changes require:
- major schema version bump
- migration guide
- consumer sign-off

API version coexistence strategy:
- URL path versioning is mandatory: breaking major versions use distinct path prefix (`/v1/`, `/v2/`)
- old version paths must remain operational for minimum `N+2` releases after new version activation (N+2 deprecation policy canonical in `07-continuous-improvement-and-extension-model.md` Section 9)
- version negotiation via `Accept` header is not supported; clients must explicitly target the versioned path
- version routing is handled at gateway level; both versions may be served by the same control plane or separate deployments — deployment model is environment-specific and declared in release notes
- version decommission requires active consumer count to reach zero as evidenced by telemetry (`routing_decision_count` per version path)

## 4) Auth and authorization contract policy

- All endpoints require JWT bearer auth.
- transport/key-management controls are canonical in `01-system-architecture.md` Section 20 and apply here without redefinition
- Required claims:
  - `sub` (actor identity)
  - `role` (RBAC role)
  - `project_scope` (allowed project ids or wildcard)
  - `session_id`
  - `iss` (trusted issuer)
  - `aud` (expected audience)
  - `exp` (token expiry)
  - `iat` (issued-at time)
  - `jti` (unique token identifier for replay detection)
  - `kid` (key identifier for signing key resolution; must match active key in JWKS endpoint per Section 14)
Token lifetime constraints:
- maximum token lifetime for user/service JWTs: 8 hours (absolute)
- maximum token lifetime for agent JWTs: 4 hours (absolute system-wide cap); individual agent templates may configure shorter lifetimes per tier but cannot exceed 4 hours; canonical per-template policy in `08-agent-memory-identity-and-skills.md` Section 2
- tokens exceeding maximum lifetime must be rejected regardless of `exp` claim
- the 4-hour agent cap is aligned with the maximum Tier C job total timeout budget (3h 3m 5s, per `05-slo-dr-and-release-ops.md` Section 8) plus a 57-minute issuance and scheduling buffer; agents requiring token refresh for long-running jobs must use credential rotation (per `08-agent-memory-identity-and-skills.md` Section 2)
- signing key rotation cadence (Section 14) must be shorter than maximum token lifetime to ensure overlap

- Signing algorithm requirements:
  - allowed algorithms: `RS256`, `RS384`, `RS512`, `ES256`, `ES384`, `ES512` (asymmetric only)
  - `HS256`, `HS384`, `HS512`, and `none` are prohibited; tokens signed with these algorithms must be rejected at validation
  - algorithm is resolved from token `kid`; the verifier must not accept an algorithm declared in the token header if it does not match the algorithm bound to the resolved `kid` in JWKS (algorithm confusion prevention)
- Token validation sequence (mandatory order):
  1. check Redis blocklist (revoked/suspended tokens rebuilt from `revoked_tokens` per `01-system-architecture.md` Section 17) — fail-fast before any crypto work
  2. verify cryptographic signature against the `kid`-resolved public key from JWKS
  3. validate claims: `iss`, `aud`, `exp`, `iat`, clock skew, algorithm match against `kid`
  4. check `jti` in replay-prevention store (`auth:jti`) for non-revoked active tokens
- Validation requirements:
  - `iss` and `aud` must match environment allowlists.
  - `exp` is mandatory; expired tokens are rejected.
  - `iat` cannot be in the future beyond allowed clock skew (`<= 120s`).
  - `jti` is checked in replay-prevention store for active token lifetime.
- Decision endpoints (`approve`, `reject`, `decision`) must validate role against Tier C approval policy.
- Authorization failures return `403` with stable error code format.
- Canonical decision endpoint is `POST /jobs/{job_id}:decision`.
- `POST /jobs/{job_id}:approve` and `POST /jobs/{job_id}:reject` are convenience aliases for `POST /jobs/{job_id}:decision` and follow deprecation policy (`N+2` minimum) if removed in future major versions.
- connector/webhook ingress authentication is mandatory before normalization and must use one approved mode per connector policy:
  - HMAC signature (shared secret in vault)
  - asymmetric signature verification via trusted JWKS/managed keyset
  - mTLS for private connector links
- connector HMAC shared secret rotation cadence (mandatory, environment-scoped):
  - `dev`: <= 180 days
  - `stage`: <= 90 days
  - `prod`: <= 30 days
  - rotation must be audited; the outgoing secret remains valid for a maximum overlap window of 24 hours to allow connector reconfiguration without auth outage
  - emergency revocation of a compromised HMAC secret invalidates it immediately with no overlap window and creates a `SEV1` audit event
- webhook/connector requests must include connector identity and anti-replay material (`connector_id`, signed timestamp, nonce or unique signature id).
- replay protection must enforce:
  - maximum clock skew (`<= 300s`)
  - nonce/signature-id uniqueness for the active replay window (minimum 24h)
- trusted source constraints (IP/CIDR allowlist or private-network binding) must be versioned per connector.
- authentication verification failures must be rejected before enqueue/normalization and must not create jobs.

Web UI session and CSRF protection:
- Web UI must use HTTP-only, Secure, SameSite=Strict session cookies
- all state-mutating Web UI requests must include CSRF token validated server-side
- session idle timeout: 30 minutes; absolute timeout: 8 hours
- session invalidation on password change or explicit logout is mandatory
- session and token invalidation is also mandatory on role revocation, permission scope reduction, or account suspension; existing sessions must be terminated immediately and any active JWT tokens added to the revocation blocklist; this applies to both human and agent principals

Required HTTP security headers for Web UI responses:
- `Content-Security-Policy`: `script-src 'self'` plus approved CDN origins only; `unsafe-inline` and `unsafe-eval` are prohibited
- `X-Content-Type-Options: nosniff`: mandatory on all responses
- `X-Frame-Options: DENY`: mandatory; `SAMEORIGIN` allowed only when iframe embedding is explicitly required for an approved use case
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`: mandatory in stage and prod environments
- `Referrer-Policy: strict-origin-when-cross-origin`: mandatory
- security headers must be enforced at the gateway layer for all Web UI origin responses and cannot be overridden by Web UI application code

DLQ endpoint authorization:
- all DLQ endpoints require `owner` or `infra-approver` role; requests from other roles return `AUTH_403_ROLE`
- `GET /dlq/items`: read access; returns only items where `project_id` matches the actor's project scope (or all items for `owner` role)
- `POST /dlq/items/{event_id}:reprocess` and `POST /dlq/items:reprocess-bulk`: write access; every reprocess action creates an audit event with actor identity, `event_id`(s), and timestamp

DLQ endpoint rate limiting:
- `GET /dlq/items`: maximum 60 requests per minute per actor
- `POST /dlq/items/{event_id}:reprocess`: maximum 20 reprocess requests per minute per actor
- `POST /dlq/items:reprocess-bulk`: maximum 5 bulk requests per minute per actor; maximum 100 items per request
- rate limit breach returns `RATE_429_THROTTLED` with `Retry-After` header

Decision endpoint rate limiting:
- `POST /jobs/{job_id}:decision` (and aliases `:approve`, `:reject`): maximum 10 decisions per minute per actor
- rate limit breach returns `RATE_429_THROTTLED` with `Retry-After` header
- rate limits are per-actor and cannot be bypassed by switching endpoints for the same job

Submit endpoint rate limiting:
- `POST /jobs:submit`: maximum 20 submissions per minute per actor (aligned with per-channel burst throttle in `05-slo-dr-and-release-ops.md` Section 2)
- rate limit breach returns `RATE_429_THROTTLED` with `Retry-After` header
- rate limits are enforced at API level in addition to gateway-level per-channel throttle

Terminal status recovery paths:
- `failed`: operator may resubmit as new job (new `idempotency_key` required)
- `timed_out`: operator may resubmit as new job (new `idempotency_key` required) or extend the per-intent timeout budget via configuration service policy override; timeout budget extension requires `owner` or `infra-approver` role, creates an audit event, and applies to new submissions only — the timed-out job record is immutable
- `rejected`: submitter may revise and resubmit as new job
- `budget_exceeded`: submitter may resubmit after budget increase approval
- `cancelled`: submitter may resubmit as new job
- no terminal status can be reversed to a non-terminal status; resubmission creates a new job record

`changes_requested` recovery:
- `changes_requested` is not terminal but has no direct path back to `queued`; recovery requires the submitter to create a new job with a new `idempotency_key` incorporating the requested changes
- the original `changes_requested` job must be explicitly cancelled (via `POST /jobs/{job_id}:cancel`) or will transition to `timed_out` when its total timeout budget is exhausted

Event/status naming policy:
- canonical waiting-for-approval status is `waiting_human_decision`
- canonical lifecycle event channel is `job.waiting_human_decision`
- `job.waiting_human` is a backward-compatible alias and follows deprecation policy (`N+2` minimum) before removal
- decision-to-state mapping:
  - `approve` from `waiting_human_decision` resumes execution path (`running` or queued scheduling path)
  - `reject` transitions to `rejected` and emits `job.rejected`
  - `request_changes` transitions to `changes_requested` and emits `job.changes_requested`
  - `defer` transitions to `deferred` and emits `job.deferred`

Job status state machine (formal transitions):

Valid state transitions:
- `queued` -> `blocked`, `running`, `waiting_human_decision`, `cancelled`, `budget_exceeded`
- `blocked` -> `queued`, `cancelled`, `timed_out`
- `waiting_human_decision` -> `running` (approve), `rejected` (reject), `changes_requested` (request_changes), `deferred` (defer), `timed_out` (timeout)
- `changes_requested` -> `cancelled`, `timed_out`
- `deferred` -> `waiting_human_decision` (follow-up decision), `timed_out`
- `running` -> `done`, `failed`, `timed_out`, `budget_exceeded`, `cancelled`, `retrying`
- `retrying` -> `running`, `failed`, `timed_out`

Terminal states (no outbound transitions):
- `done`, `failed`, `timed_out`, `rejected`, `budget_exceeded`, `cancelled`

Rules:
- any transition not listed above is invalid and must be rejected with `REQ_422_INVALID_STATE`
- all transitions emit the corresponding `job.<status>` event
- terminal status recovery is via resubmission only (see terminal status recovery paths above)

Blocked status triggers:
- `blocked` is entered when a job cannot proceed due to an unresolved dependency or precondition:
  - unresolved job dependency (dependent job not yet completed)
  - policy engine unavailability (Tier B/C jobs queued pending recovery, per `01-system-architecture.md` Section 3)
  - resource lock contention timeout: job waiting for lock acquisition beyond the lock contention timeout threshold (default: 5x lock acquisition P95 SLO target for the environment; prod default: 5s); configurable per resource class in scheduler policy
  - kill switch active for the job's scope
- `blocked` jobs are re-evaluated when the blocking condition resolves
- jobs blocked for longer than their total timeout budget transition to `timed_out`

Non-cancellable HITL states (by design):
- jobs in `waiting_human_decision` or `deferred` state cannot be cancelled via the cancel endpoint; the cancel operation returns `REQ_422_INVALID_STATE`
- this is intentional: once a job enters the HITL decision path, resolution must occur through a human decision (`approve`, `reject`, `request_changes`, `defer`) or timeout expiry, to preserve the approval audit trail
- to abandon a job in `waiting_human_decision`, use `POST /jobs/{job_id}:decision` with `decision: reject`

Deferred state follow-up mechanism:
- `deferred -> waiting_human_decision` is triggered by an approver submitting a follow-up decision via `POST /jobs/{job_id}:decision`; the follow-up `decision` field must be one of `approve`, `reject`, or `request_changes`; submitting `defer` again from `deferred` state is prohibited and returns `REQ_422_INVALID_STATE`
- the HITL wait budget (canonical in `05-slo-dr-and-release-ops.md` Section 8) applies cumulatively across `waiting_human_decision` and `deferred` periods; if the budget is exhausted while in `deferred` state, the job transitions to `timed_out` with no auto-approval
- the reminder cadence defined in `05-slo-dr-and-release-ops.md` Section 3 (every 15 minutes) applies while in `deferred` state; reminders are emitted as `hitl.reminder.sent` on the `operations.events` channel

## 5) Metadata policy clarification

- `submit` requests do not include `job_id`; `job_id` is created by the system and returned in acceptance response.
- `delegation_depth` is server-computed by the scheduler from the `parent_job_id` chain before dispatch and is not a client-provided field; `JobSubmitRequest` does not carry `delegation_depth`; the computed value is stored in the persisted job record and carried in `JobEventPayload`.
- All post-submission mutating commands and events must include `job_id` and `idempotency_key`.
- Idempotency window is mandatory and explicit:
  - `idempotency_key` scope: `(project_id, intent, actor_id, window)`
  - default window: 24 hours (unless policy override exists)
  - conflicting payload under same key in active window returns `JOB_409_IDEMPOTENCY_CONFLICT`
- informative: canonical idempotency ledger rules are in `02-storage-and-migrations.md` Section 7

## 6) Error response envelope (mandatory)

All non-2xx responses must use this JSON shape:

```json
{
  "error": {
    "code": "AUTH_403_SCOPE",
    "message": "Actor is not authorized for this project scope.",
    "http_status": 403,
    "retryable": false,
    "request_id": "req-123",
    "trace_id": "trc-123",
    "job_id": "optional-uuid",
    "details": {}
  }
}
```

Rules:
- `code` is stable and machine-readable.
- `message` is human-readable and safe for logs.
- `retryable` drives client retry behavior.
- `request_id` and `trace_id` are always present.
- `job_id` is required for post-submission failures when available.

## 7) Error code catalog (v1)

### AUTH domain

| Code | HTTP | Retryable | Meaning |
|---|---|---|---|
| `AUTH_401_MISSING_TOKEN` | 401 | false | Missing bearer token. |
| `AUTH_401_INVALID_TOKEN` | 401 | false | Invalid/expired token. |
| `AUTH_401_CONNECTOR_INVALID_SIGNATURE` | 401 | false | Connector/webhook signature verification failed. |
| `AUTH_401_CONNECTOR_REPLAY` | 401 | false | Connector/webhook replay check failed. |
| `AUTH_403_SCOPE` | 403 | false | Actor not allowed in requested project scope. |
| `AUTH_403_ROLE` | 403 | false | Role cannot perform requested action. |

### INPUT and CONTRACT domain

| Code | HTTP | Retryable | Meaning |
|---|---|---|---|
| `REQ_400_INVALID_SCHEMA` | 400 | false | Payload does not match schema. |
| `REQ_400_MISSING_FIELD` | 400 | false | Required field is missing. |
| `REQ_422_INVALID_STATE` | 422 | false | Operation invalid for current job state. |
| `CONTRACT_409_VERSION_MISMATCH` | 409 | false | Unsupported schema version or incompatible contract. |

### JOB and SCHEDULER domain

| Code | HTTP | Retryable | Meaning |
|---|---|---|---|
| `JOB_404_NOT_FOUND` | 404 | false | Job id does not exist. |
| `JOB_409_LOCKED` | 409 | true | Resource lock conflict, retry later. |
| `JOB_409_IDEMPOTENCY_CONFLICT` | 409 | false | Same idempotency key used with different payload. |
| `JOB_423_WAITING_HUMAN` | 423 | true | Job paused for human decision. |
| `JOB_409_ALREADY_TERMINAL` | 409 | false | Job already in terminal state. |
| `JOB_422_NOT_CANCELLABLE` | 422 | false | Job is in a terminal or non-cancellable state. |
| `JOB_422_DELEGATION_DEPTH_EXCEEDED` | 422 | false | Delegated job rejected; maximum delegation depth (3) exceeded. |
| `JOB_503_QUEUE_UNAVAILABLE` | 503 | true | Queue backend unavailable. |

### POLICY and APPROVAL domain

| Code | HTTP | Retryable | Meaning |
|---|---|---|---|
| `POLICY_403_DENIED` | 403 | false | Policy engine denied execution. |
| `POLICY_409_REQUIRES_APPROVAL` | 409 | false | Human approval required before execution. |
| `POLICY_503_ENGINE_UNAVAILABLE` | 503 | true | Policy engine unavailable; Tier A continues on cached policy; Tier B/C jobs are queued until recovery. |
| `APPROVAL_409_DECISION_CONFLICT` | 409 | false | Conflicting decision for same job/version. |
| `APPROVAL_403_NOT_APPROVER` | 403 | false | Actor is not an allowed approver for this scope/tier. |

### BUDGET and RATE domain

| Code | HTTP | Retryable | Meaning |
|---|---|---|---|
| `BUDGET_429_LIMIT` | 429 | true | Budget threshold reached for active window. |
| `BUDGET_409_EXCEEDED` | 409 | false | Job exceeded hard budget and was stopped. |
| `RATE_429_THROTTLED` | 429 | true | Request rate limit exceeded. |

### DLQ domain

| Code | HTTP | Retryable | Meaning |
|---|---|---|---|
| `DLQ_404_NOT_FOUND` | 404 | false | DLQ item with given event_id does not exist. |
| `DLQ_409_ALREADY_REPROCESSED` | 409 | false | DLQ item has already been reprocessed or resolved. |

### INFRA and INTERNAL domain

| Code | HTTP | Retryable | Meaning |
|---|---|---|---|
| `INFRA_503_DEPENDENCY_DOWN` | 503 | true | Required downstream dependency unavailable. |
| `INTERNAL_500_UNEXPECTED` | 500 | false | Unexpected internal error. |

## 8) Event error signaling

- Failures that occur after job creation must emit `job.failed` with:
  - `details.error.code`
  - `details.error.retryable`
  - `details.error.message`
- Budget stops must emit `job.budget_exceeded` with `details.error.code = BUDGET_409_EXCEEDED`.
- Authorization failures before job creation do not emit job events.

## 9) System and scheduled event taxonomy

In addition to job lifecycle events, RIAS uses scheduled and operational events.

Ingress normalization events:
- `ingress.message.received`
- `ingress.message.normalized`
- `ingress.message.rejected`
- `ingress.identity.mapping_failed`
- `ingress.rate_limited`
- `ingress.policy_blocked`

Ingress source taxonomy (`source_channel`):
- canonical classes:
  - `human_chat`
  - `human_mail`
  - `human_collaboration`
  - `developer_platform`
  - `machine_signal_feed`
  - `webhook_generic`
  - `external_app`
- optional `details.source_system` identifies concrete platform/provider (for example Slack, Teams, GitHub, market-feed vendor, custom line-of-business app)

Scheduled/self-improvement events:
- `improvement.review.scheduled`
- `improvement.input.snapshot_created`
- `improvement.analysis.completed`
- `improvement.plan.proposed`
- `improvement.plan.approved`
- `improvement.plan.rejected`
- `improvement.change.applied`
- `improvement.change.validated`
- `improvement.change.rolled_back`
- `improvement.report.published`
- `improvement.incident.triage_scheduled`
- `improvement.routing.review_scheduled`
- `improvement.rollout.window_checked`
- `improvement.scheduler.failed` (improvement workflow cron failures; uses `SchedulerFailureEventDetails`)
- `documentation.snapshot.scheduled`
- `documentation.snapshot.generated`
- `documentation.validation.passed`
- `documentation.validation.failed`
- `documentation.publish.candidate_scheduled`
- `documentation.publish.candidate_created`
- `documentation.published`
- `agent.provision.requested`
- `agent.provision.approved`
- `agent.provision.rejected`
- `agent.provision.started`
- `agent.provision.validated`
- `agent.provision.completed`
- `agent.provision.failed`
- `agent.provision.rolled_back`
- `agent.deprovision.requested`
- `agent.deprovision.completed`
- `agent.deprovision.failed`
- `agent.memory.write.applied`
- `agent.memory.write.rejected`
- `agent.memory.delete.applied`
- `agent.memory.delete.rejected`
- `agent.memory.correction.applied`
- `agent.memory.correction.rejected`

Scheduler job dispatch failure events:
- `scheduler.job.dispatch_failed` — failure to dispatch a queued job (not a cron/improvement workflow); uses `SchedulerFailureEventDetails` schema; emitted on `operations.events` channel
- `scheduler.leader.elected` — leader election completed; uses `GenericSystemEventDetails` with `event_class = scheduler`; emitted on `operations.events` channel
- `scheduler.leader.lost` — leader lost (SIGTERM, crash, lease expiry); uses `GenericSystemEventDetails` with `event_class = scheduler`; emitted on `operations.events` channel

Details schema binding for scheduler dispatch events:
- `scheduler.job.dispatch_failed` -> `SchedulerFailureEventDetails`
- `scheduler.leader.*` -> `GenericSystemEventDetails` with `event_class = scheduler`

Operational scheduled events:
- `budget.anomaly.scan_completed`
- `budget.reconciliation.completed`
- `security.review.deep_scheduled`
- `drill.restore.scheduled`
- `operations.killswitch.activated`
- `operations.killswitch.deactivated`
- `operations.runbook.staleness_check_scheduled`
- `hitl.reminder.sent`
- `hitl.reminder.escalated`
- `service.shutdown.initiated`
- `service.shutdown.completed`

Feature flag lifecycle events:
- `operations.feature_flag.activated`
- `operations.feature_flag.deprecated`
- `operations.feature_flag.removed`
- `operations.feature_flag.expired`

Event payload requirements:
- job lifecycle events use `JobEventPayload`
- system and scheduled events use `SystemEventPayload`
- non-job events must include `request_id`, `trace_id`, `actor_id` (`system` allowed), and `project_id` (`global` allowed)
- ingress events must include:
  - `details.source_channel` (from taxonomy above)
  - `details.source_system`
  - `details.source_message_id`
  - `details.connector_id`
  - `details.normalization_version`
  - `details.auth_context` (connector auth mode, no secrets) with:
    - `auth_mode`
    - `verification_result` (`passed|failed`)
    - `key_id` (when applicable, no secret/key material)
    - `replay_check` (`passed|failed`)
  - for `ingress.message.rejected` caused by auth failure:
    - `details.error.code` (for example `AUTH_401_CONNECTOR_INVALID_SIGNATURE` or `AUTH_401_CONNECTOR_REPLAY`)
- agent provisioning events must include:
  - `details.agent_template_id`
  - `details.agent_instance_id`
  - `details.capability_set`
  - `details.change_risk_score`
  - `details.hitl_required`
  - `details.approver_id` (when applicable)
- agent deprovision events must include:
  - `details.agent_instance_id`
  - `details.reason`
  - `details.result` (`requested|completed|failed`)
  - `details.approver_id` (when applicable)
- agent memory mutation events must include:
  - `details.agent_instance_id`
  - `details.memory_scope` (`job|project|global`; canonical alias mapping: `job <-> working_memory`, `project <-> project_memory`, `global <-> global_memory`)
  - `details.memory_record_id`
  - `details.mutation_type` (`write|delete|correction`)
  - `details.classification` (`public|internal|sensitive`)
  - `details.result` (`applied|rejected`)
  - `details.rejection_reason` (required when `result = rejected`)

Details schema binding policy (mandatory):
- `details` for non-job events must validate against one of the typed schemas in Section 2.
- event-to-schema mapping is normative:
  - `ingress.*` -> `IngressEventDetails`
  - `agent.provision.*` -> `AgentProvisionEventDetails`
  - `agent.deprovision.*` -> `AgentDeprovisionEventDetails`
  - `agent.memory.*` -> `AgentMemoryEventDetails`
  - `improvement.scheduler.failed` -> `SchedulerFailureEventDetails`
  - `scheduler.job.dispatch_failed` -> `SchedulerFailureEventDetails`
  - all remaining non-job events -> `GenericSystemEventDetails` with `details.event_class` required
- CI compatibility checks must fail if an event name is added without an explicit details-schema mapping.

GenericSystemEventDetails validation:
- events mapped to `GenericSystemEventDetails` must include a non-empty `event_class` string that identifies the event domain (e.g., `improvement`, `documentation`, `operations`)
- `event_class` values must be from the following registered set; unregistered `event_class` values fail CI validation:
  - `improvement` — improvement workflow events (`improvement.review.*`, `improvement.input.*`, `improvement.analysis.*`, `improvement.plan.*`, `improvement.change.*`, `improvement.report.*`, `improvement.incident.*`, `improvement.routing.*`, `improvement.rollout.*`)
  - `documentation` — documentation workflow events (`documentation.snapshot.*`, `documentation.validation.*`, `documentation.publish.*`, `documentation.published`)
  - `operations` — budget, security, drill, killswitch, HITL reminder, feature flag, and service lifecycle events (`budget.*`, `security.review.*`, `drill.*`, `operations.killswitch.*`, `hitl.*`, `operations.feature_flag.*`, `service.shutdown.*`)
  - `scheduler` — scheduler leader election events (`scheduler.leader.*`)
- adding a new `event_class` value requires a PR updating this registered set and a corresponding CI rule update; no new value may be used in production before registration
- teams owning new event domains should define typed detail schemas (like `IngressEventDetails`) rather than relying on `GenericSystemEventDetails` for long-term use

## 10) Contract-driven generation (SDK/types/validators)

Generation goals:
- keep all services, agents, and clients aligned to one contract source
- avoid handwritten drift for models and error handling

Inputs:
- OpenAPI spec (`v1`) from this document
- AsyncAPI spec (`v1`) from this document
- error code catalog from Section 7

Generated artifacts:
- TypeScript API types for request/response payloads
- TypeScript client SDK for sync endpoints
- Event payload types for async consumers
- JSON Schema validators for runtime payload checks
- shared `ErrorCode` enum and typed error helper classes

Usage targets:
- control plane service implementation
- web UI client
- channel connectors (human chat/mail/collaboration classes)
- developer platform and generic webhook adapters
- machine/event feed adapters (for external status/price/signal ingestion)
- project and infra agents

Contract generation rules:
- generated artifacts are updated on every contract change
- CI fails if generated artifacts are out of date
- breaking contract changes require major version bump and migration guide

## 11) Retry and timeout classification policy

Clients and workers must follow stable retry behavior by `error.code` and `retryable`.

Retry classes:
- `none`: never retry (`AUTH_*`, `REQ_*`, `CONTRACT_*`, `POLICY_403_DENIED`, `APPROVAL_*`, `BUDGET_409_EXCEEDED`)
- `bounded`: retry with capped exponential backoff (`JOB_409_LOCKED`, `JOB_423_WAITING_HUMAN`, `JOB_503_QUEUE_UNAVAILABLE`, `INFRA_503_DEPENDENCY_DOWN`, `RATE_429_THROTTLED`, `BUDGET_429_LIMIT`)
- `operator`: retry only after human action or config change

Timeout contract:
- API timeout, queue wait timeout, and worker execution timeout must be emitted in event details when exceeded
- timeout reason field is mandatory for `job.timed_out`

Default bounded retry parameters:

| Parameter | Default | Override scope |
|---|---|---|
| Initial backoff | 1s | per-intent policy |
| Backoff multiplier | 2x | per-intent policy |
| Max backoff | 60s | per-intent policy |
| Max retry attempts | 5 | per-intent policy |
| Max elapsed retry window | 10 min | per-intent policy |
| Jitter range | 0-50% of current backoff | global |

## 12) Heterogeneous consumer compatibility policy

During schema transitions:
- event producers must publish backward-compatible payloads for at least `N+2` releases (informative; canonical N+2 deprecation policy is in `07-continuous-improvement-and-extension-model.md` Section 9)
- consumers must declare supported schema range (`min_supported_version`, `max_supported_version`)
- compatibility checks fail CI when active consumers cannot process proposed schema
- breaking changes require consumer sign-off artifacts attached to release PR

Consumer sign-off artifact lifecycle:
- owner roles:
  - producer owner: creates impact assessment
  - consumer owner: approves compatibility/migration plan
  - architecture owner: final contract governance sign-off
- required artifact fields:
  - `artifact_id`
  - `contract_change_id`
  - `producer_component`
  - `consumer_component`
  - `impact_level` (`none|minor|major|breaking`)
  - `accepted_by`
  - `accepted_at`
  - `migration_deadline`
  - `test_evidence_refs`
- release PRs with breaking changes fail if any active consumer artifact is missing or expired

Artifact storage:
- consumer sign-off artifacts are persisted in the `consumer_signoff_artifacts` table (columns: `artifact_id`, `contract_change_id`, `producer_component`, `consumer_component`, `impact_level`, `accepted_by`, `accepted_at`, `migration_deadline`, `test_evidence_refs`)
- artifacts are linked to release PRs and queryable by `contract_change_id`

## 13) Data classification and routing contract signals

The following fields are mandatory for routing and enforcement:
- `constraints.data_classification`
- `constraints.prefer_local`
- `confidence_score` in routing decision details (0.0-1.0, mandatory)

Rules:
- `sensitive` + low confidence routing decisions must escalate to HITL
- missing required classification signals is a schema validation failure
- informative: canonical data classification enforcement matrix is in `02-storage-and-migrations.md` Section 9

## 14) JWT signing-key lifecycle contract policy

Token-signing key management is mandatory and environment-scoped.

Requirements:
- JWT signing keys must be published through environment-specific JWKS endpoints.
- every issued JWT must include `kid`; verifiers must resolve keys by `kid` and trusted issuer.
- active signing keys must support overlap window to allow safe key rotation without auth outage.
- signing key rotation cadence:
  - `dev`: <= 30 days
  - `stage`: <= 14 days
  - `prod`: <= 7 days
- emergency revocation must invalidate compromised `kid` immediately and be auditable.
- removed/revoked keys must stay queryable in key-history metadata for forensic window (minimum 90 days).
- key material must be managed via approved KMS/vault integration; private keys must never leave managed boundary unencrypted.

Validation rules:
- tokens signed with unknown/revoked `kid` return `AUTH_401_INVALID_TOKEN`.
- acceptance of tokens signed by stale keys beyond configured grace window is prohibited.
- key lifecycle policy (rotation cadence, overlap duration, revocation SLA) is release-blocking configuration per environment.

Initial key bootstrap procedure:
- first-time deployment requires out-of-band key generation performed entirely inside the approved KMS/vault boundary; key material must never leave the vault unencrypted during bootstrap
- bootstrap is executed by an operator with `owner` role using vault root token or equivalent bootstrap credential; the bootstrap action must create a `SEV1` audit event with operator identity and timestamp
- after bootstrap, the normal key rotation cadence and overlap policy defined above apply immediately
- the bootstrap procedure must be documented in and rehearsed as part of RB-015 (JWT signing key initial bootstrap runbook, per `05-slo-dr-and-release-ops.md` Section 19) before the first production deployment

## 15) Event delivery semantics contract policy

RIAS event delivery is explicitly at-least-once.

Delivery and ordering rules:
- consumers must treat `event_id` as globally unique and use idempotent processing.
- producers must not reuse `event_id`; redelivery of the same event keeps original `event_id`.
- ordering guarantee is per `job_id` stream; global ordering across jobs/projects is not guaranteed.
- for non-job/system events, ordering guarantee is per `(event_name, project_id)` partition key when applicable.
- consumers must tolerate duplicates and out-of-order events outside guaranteed ordering scope.

Consumer-state contract:
- consumers must persist last processed offset/checkpoint per subscription.
- consumers must keep dedup ledger keyed by `event_id` for at least 72 hours; this value is derived from the minimum broker message retention period (72 hours, per event bus technology requirements in this section) — the broker can redeliver any unacknowledged message within this retention window, so the dedup ledger must cover the full window; a 24-hour floor alone is insufficient.
- side-effecting handlers must be idempotent and replay-safe.

Failure and replay policy:
- on consumer processing failure, message is retried with bounded backoff under broker policy.
- poison events after retry exhaustion must route to DLQ with original `event_id`, `request_id`, and `trace_id`.
- replay/rebuild workflows must preserve original `occurred_at` and `event_id`.

DLQ reprocessing workflow:
- DLQ items must be inspectable via operations API with filtering by `event_name`, `project_id`, and age
- reprocessing requires `owner` or `infra-approver` role authorization
- reprocessed events re-enter the consumer pipeline with original `event_id` and a `reprocessed_at` timestamp
- reprocessing must respect consumer idempotency (duplicate detection via `event_id`)
- bulk reprocessing operations must be rate-limited and audited

Memory event DLQ reconciliation:
- agent memory events that fail consumer processing and land in DLQ create an audit gap between PostgreSQL journal (`agent_memory_events`) and the event stream
- reconciliation procedure: operations must compare `agent_memory_events` journal entries against event consumer checkpoints to identify missed events
- reconciliation must be performed within 24 hours of DLQ item creation for memory events
- reconciliation results must be audited with `trace_id` linkage to original memory mutation

Event bus unavailability mitigation:
- producers must implement transactional outbox pattern: events are first written to a local `outbox` table in the same database transaction as the state change
- a relay process reads the outbox and publishes to the event bus with at-least-once semantics
- outbox entries are marked as published after broker acknowledgment
- on sustained event bus unavailability (> 5 minutes), emit `INFRA_503_DEPENDENCY_DOWN` alert and continue accumulating in outbox

Outbox backpressure:
- outbox table has a soft size limit of 10,000 pending entries and hard limit of 50,000
- soft limit breach emits `INFRA_503_DEPENDENCY_DOWN` alert with `component = event_bus` and triggers operator review
- hard limit breach rejects new event-producing transactions with `INFRA_503_DEPENDENCY_DOWN` error to prevent unbounded outbox growth
- outbox relay must emit `outbox.pending_count` and `outbox.oldest_pending_age_seconds` metrics

Event bus technology requirements:
- event bus must support durable subscriptions with at-least-once delivery guarantee
- minimum retention for unprocessed messages: 72 hours
- partitioning must support per-`job_id` ordering and per-`(event_name, project_id)` ordering for system events
- broker must support DLQ routing natively or via consumer-side implementation
- broker access must support the authentication and ACL requirements defined in Section 16

Event bus high-availability topology:
- production: minimum 3-node broker cluster with replication factor >= 2
- stage: minimum 3-node broker cluster
- dev: single broker instance allowed
- broker failover must complete within 60 seconds without message loss for acknowledged messages
- unacknowledged messages during failover are subject to at-least-once redelivery from producer outbox
- event bus HA topology must be included in quarterly DR drills

Event bus scaling strategy:
- partition count must be sufficient to support peak consumer parallelism (minimum: number of consumer instances per consumer group)
- partition rebalancing must be automated and triggered by sustained consumer lag > 1000 events for 5 minutes
- broker storage scaling: alert when broker disk usage > 70%; mandatory expansion plan at 80%
- consumer group autoscaling baseline is defined in `05-slo-dr-and-release-ops.md` Section 11 (Event consumers row)

Outbox relay availability requirements:
- outbox relay is a distinct process responsible for reading from the `outbox` table and publishing to the event bus; it is the critical path for all event delivery
- minimum 2 instances in stage and prod environments; single instance is allowed only in dev
- relay instances must coordinate to avoid duplicate publishing using a row-level claiming mechanism (e.g., `SELECT FOR UPDATE SKIP LOCKED` or equivalent atomic claim per outbox entry)
- autoscaling baseline is defined in `05-slo-dr-and-release-ops.md` Section 11 (Outbox relay row)
- relay failure for > 2 minutes emits `INFRA_503_DEPENDENCY_DOWN` alert with `component = outbox_relay`
- standard health probes (liveness, readiness, startup per Section 17) are required

## 16) Event channel authentication and authorization policy

Event bus access is mandatory-authenticated and role-scoped.

Authentication requirements:
- all producers and consumers must use workload identity (service account or mTLS client identity)
- anonymous publish/subscribe is prohibited
- identity must be environment-scoped; cross-environment credentials are prohibited

Authorization requirements:
- publish/subscribe ACL must be explicit per channel namespace and owner-approved
- least-privilege policy applies: producers can publish only to channels they own; consumers can subscribe only to approved channels
- wildcard publish to `job.*` and `*.events` is prohibited except for broker operations identity approved by `owner`

Minimum ACL baseline:
- gateway:
  - publish: `operations.events` (service lifecycle events only: `service.shutdown.*`)
  - subscribe: `ingress.events`
  - note: OpenClaw Web UI requests are processed directly by the gateway and submitted to the control plane API without routing through `ingress.events`; no gateway publish to `ingress.events` is required or permitted for the Web UI channel
- control plane:
  - publish: `job.*`, `improvement.events`, `documentation.events`, `operations.events`, `agent.lifecycle.events`, `agent.memory.events`
  - subscribe: none by default
- scheduler:
  - publish: `job.queued`, `job.retrying`, `improvement.events`, `operations.events`
  - subscribe: job scheduling input streams
- agents/workers:
  - publish: `job.running`, `job.done`, `job.failed`, `job.timed_out`, `job.budget_exceeded`, `agent.memory.events`, `operations.events` (service lifecycle events only: `service.shutdown.*`)
  - subscribe: assigned job input streams and approved system-event channels
- connectors:
  - publish: `ingress.events`
  - subscribe: none by default
- outbox relay:
  - the outbox relay runs as a co-deployed process using the same workload identity as the component that owns the outbox entries (e.g., control plane relay uses control plane workload identity); no separate ACL entry is required; the relay inherits publish rights from its owning component identity; relay identity must be explicitly declared in the owning component's deployment manifest and reviewed during security owner ACL sign-off

Governance and evidence:
- ACL policy is versioned and release-controlled
- ACL changes require security owner sign-off
- CI must fail when channel definitions change without corresponding ACL policy update

## 17) Health check and probe contracts

All RIAS services must expose standardized health endpoints.

Liveness probe (`GET /healthz`):
- returns `200` if process is running and responsive
- returns `503` if process is in fatal/unrecoverable state
- must not check downstream dependencies (pure self-check)
- response body: `{ "status": "ok" | "error", "timestamp": "ISO-8601" }`

Readiness probe (`GET /readyz`):
- returns `200` if service is ready to accept traffic
- returns `503` if service cannot serve requests (dependency down, draining, warming up)
- must check critical dependencies: database connectivity, Redis connectivity, event bus connectivity
- response body: `{ "status": "ready" | "not_ready", "checks": { "<dependency>": "ok" | "degraded" | "down" }, "timestamp": "ISO-8601" }`

Startup probe (`GET /startupz`):
- returns `200` when initial bootstrap is complete (migrations applied, caches warmed, config loaded)
- returns `503` during startup sequence
- used by orchestrator to distinguish slow startup from crash loop

Probe requirements:
- all probes must respond within 5 seconds
- probe endpoints must not require authentication
- probe endpoints must not expose sensitive information
- load balancers and orchestrators must use readiness probe for traffic routing decisions
- liveness probe failure triggers container/process restart
- readiness probe failure removes instance from load balancer pool

## 18) User notification contract model

Purpose:
- define how RIAS notifies users about job lifecycle events, approval requests, and system alerts across channels

Notification triggers:
- job status transitions requiring user attention: `waiting_human_decision`, `changes_requested`, `failed`, `timed_out`, `budget_exceeded`, `cancelled`
- approval reminder escalations (per HITL SLA cadence)
- system alerts affecting user's projects (maintenance windows, incidents)

Notification contract:
- `notification_id`: unique identifier
- `recipient_actor_id`: target user identity
- `channel`: delivery channel (`discord`, `telegram`, `web_ui`, `email`)
- `notification_type`: `approval_request` | `status_change` | `reminder` | `system_alert`
- `job_id`: linked job (when applicable)
- `project_id`: linked project
- `priority`: `high` (approval requests, failures) | `normal` (status updates) | `low` (system info)
- `payload`: channel-specific rendered content
- `created_at`: ISO-8601 timestamp
- `delivered_at`: ISO-8601 timestamp (null until confirmed)
- `trace_id`: for end-to-end observability

Delivery requirements:
- notifications must be delivered to user's preferred channel(s) as configured in identity profile (canonical identity profile schema and management rules: `01-system-architecture.md` Section 27)
- high-priority notifications must attempt delivery within 30 seconds of trigger
- delivery failures must retry with bounded backoff (max 3 attempts)
- undeliverable notifications must be logged and visible in Web UI notification center
- notification content must not include secret material or full payload data

Notification observability:
- required metrics: `notification_delivery_count` (by channel, type, priority), `notification_delivery_latency_ms` (P95/P99), `notification_delivery_failure_count`, `notification_retry_count`
- SLO: high-priority notification delivery latency P95 <= 30 seconds end-to-end (trigger to confirmed delivery), except `approval_request` notifications which follow the stricter HITL notification SLO from `05-slo-dr-and-release-ops.md` Section 1 (prod: P95 <= 10s end-to-end)
- notification delivery dashboard must be included in weekly operations scorecard

Notification failure handling:
- notifications that fail all delivery attempts are routed to a notification DLQ
- DLQ items are visible in Web UI notification center and operations dashboard
- high-priority notification delivery failures trigger escalation: if undelivered for > 5 minutes, attempt delivery via alternate channel (if configured in user profile)
- notification DLQ items older than 24 hours require operator triage

Notification catch-up on service recovery:
- after notification service downtime, the service must replay missed notification triggers from the event stream (using consumer checkpoint)
- catch-up notifications must include a `delayed: true` flag in payload to allow UI to display delay context
- catch-up processing must be rate-limited to avoid notification storms (maximum 100 notifications per minute per channel)
- notifications older than 24 hours at catch-up time are logged but not delivered (stale notification suppression)

Notification service availability requirements:
- notification service is stateless; all delivery state is persisted in PostgreSQL `notifications` table
- minimum 2 instances in stage and prod environments; single instance is allowed only in dev
- notification service unavailability for > 5 minutes emits `INFRA_503_DEPENDENCY_DOWN` alert with `component = notification_service`
- standard health probes (liveness, readiness, startup per Section 17) are required

## 19) Connector adapter contract

Connectors normalize external channel payloads into canonical `IngressEventDetails` and publish to the `ingress.events` event bus channel.

Adapter model:
- connectors operate as event producers: they receive external input, normalize it, and publish to `ingress.events`
- connectors do not call the control plane API directly; all downstream work is initiated by the gateway consuming the published ingress event
- the gateway subscribes to `ingress.events` and routes normalized events to the control plane for identity mapping and job submission

Authentication:
- connectors authenticate to the event bus using workload identity (mTLS client identity or service account) per Section 16
- connector identity must be environment-scoped; cross-environment connector credentials are prohibited
- incoming source authentication (HMAC, asymmetric signature, mTLS per Section 4) is verified by the connector before normalization

Required normalization steps (in order, before publish):
1. verify incoming source auth per connector policy (auth mode, replay check, clock skew per Section 4)
2. reject unauthenticated or replay-detected requests; emit `ingress.message.rejected` with `details.error.code` — do not publish a partial event
3. map source identity to canonical `actor_id` via gateway identity-mapping service (note: identity mapping is an integral subcomponent of the gateway, not a separately deployed service; it inherits gateway HA requirements — minimum 2 instances in stage and prod per `01-system-architecture.md` Section 2; sustained identity-mapping failure rate > 5% for 5 consecutive minutes emits `INFRA_503_DEPENDENCY_DOWN` alert with `component = identity_mapping`)
4. normalize payload to canonical `SystemEventPayload` with `IngressEventDetails`
5. assign `normalization_version`, `connector_id`, and `source_message_id`
6. publish to `ingress.events` with workload identity

Project routing resolution:
- connectors set `project_id` in `SystemEventPayload` during normalization step 4 as follows:
  - if the connector manifest declares `default_project_id`, use that value
  - otherwise, set `project_id: "global"` (sentinel indicating deferred gateway resolution)
- the gateway, when consuming from `ingress.events`, resolves the final `project_id` before calling `POST /jobs:submit`:
  1. query `project_assignments` for the resolved `actor_id`
  2. actor has exactly one project assignment → use that `project_id`
  3. actor has multiple project assignments and connector manifest declares `default_project_id` → use `default_project_id`
  4. actor has multiple project assignments and no `default_project_id` in manifest → emit `ingress.identity.mapping_failed` and reject; do not submit to control plane
  5. actor has no project assignments → emit `ingress.identity.mapping_failed` and reject; do not submit to control plane
- the resolved `project_id` is used in `RequestMeta` of the `JobSubmitRequest` submitted by the gateway to the control plane
- connectors must not embed hardcoded tenant-specific `project_id` values in `SystemEventPayload` directly; `default_project_id` in the manifest is the approved mechanism for per-connector project targeting
- project routing resolution is part of the identity mapping sub-component of the gateway and is subject to the same HA requirements and SLOs (`05-slo-dr-and-release-ops.md` Section 14 identity mapping SLOs)

Normalization failure behavior:
- if normalization fails (schema violation, unknown identity, auth failure): emit `ingress.message.rejected` and stop; do not publish a partial payload
- normalization errors must be logged with `connector_id`, `source_message_id`, and error class
- sustained normalization failure rate > 5% for 5 consecutive minutes emits `INFRA_503_DEPENDENCY_DOWN` alert with `component = connector_<connector_id>`

Required connector manifest fields:
- `connector_id`: unique identifier
- `source_channel`: canonical class from `IngressEventDetails.source_channel` enum
- `auth_mode`: `hmac | asymmetric_signature | mtls`
- `normalization_version`: versioned normalization contract reference
- `owner`: owning team
- `allowed_environments`: environment allowlist
- `risk_tier`: default risk tier for intents originating from this connector
- `manifest_version`: SemVer string (`MAJOR.MINOR.PATCH`); breaking connector contract changes require `MAJOR` bump; backward-compatible additions use `MINOR`; fix-only changes use `PATCH`; versioning rules follow `01-system-architecture.md` Section 11
- `default_project_id`: (optional) project ID used when actor-to-project resolution is ambiguous (actor has multiple project assignments); must reference a valid project configured in `project_assignments`; required for connectors whose actors may belong to multiple projects

Connector registration and governance:
- connectors must be registered in the capability registry (`07-continuous-improvement-and-extension-model.md` Section 7) before activation in stage or prod
- new connector types follow the safe extension process in `07-continuous-improvement-and-extension-model.md` Section 8
- connector manifests must be version-controlled and pass CI contract checks before deployment
- connector ACL grants (`publish: ingress.events`) require security owner sign-off per Section 16
