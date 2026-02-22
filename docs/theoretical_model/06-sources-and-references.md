# Sources and References

Last reviewed: 2026-02-19

This document lists the external sources used to build the RIAS theoretical model.

## 1) OpenClaw (primary runtime source)

Official docs and repository:
- OpenClaw docs home: https://docs.openclaw.ai/
- OpenClaw GitHub repository: https://github.com/openclaw/openclaw
- Architecture concepts: https://docs.openclaw.ai/concepts/architecture
- Queue concepts: https://docs.openclaw.ai/concepts/queue
- Multi-agent concepts: https://docs.openclaw.ai/concepts/multi-agent
- Model failover concepts: https://docs.openclaw.ai/concepts/model-failover
- Model providers overview: https://docs.openclaw.ai/models
- Gateway security: https://docs.openclaw.ai/gateway/security
- CLI security/audit: https://docs.openclaw.ai/cli/security
- Exec approvals: https://docs.openclaw.ai/tools/exec-approvals
- Sandboxing: https://docs.openclaw.ai/gateway/sandboxing
- Logging: https://docs.openclaw.ai/logging
- Token usage reference: https://docs.openclaw.ai/reference/token-use

Used for:
- single-ingress runtime model (OpenClaw as core)
- queue and concurrency assumptions
- multi-agent separation model
- model routing/failover assumptions
- security, approvals, sandboxing, and logging controls

## 2) API and contract standards

- OpenAPI Specification: https://spec.openapis.org/oas/latest.html
- AsyncAPI Specification: https://www.asyncapi.com/docs/reference/specification/latest
- JSON Schema: https://json-schema.org/specification
- Semantic Versioning: https://semver.org/
- W3C Trace Context: https://www.w3.org/TR/trace-context/

Used for:
- contract-first sync and async interfaces
- schema versioning and compatibility rules
- distributed tracing standard for cross-service observability

## 3) Security baseline references

- OWASP ASVS (Application Security Verification Standard): https://owasp.org/www-project-application-security-verification-standard/
  - Required compliance level: **minimum L2** (standard for applications processing sensitive data and handling privileged actions; RIAS qualifies due to Tier C execution, agent identity management, and multi-tenant sensitive data routing)
  - L3 is required for: authentication subsystem, secret zone enforcement, and HITL Tier C approval paths
- OWASP Top 10: https://owasp.org/www-project-top-ten/

Used for:
- defense-in-depth direction for auth, injection resistance, and secure defaults
- ASVS L2 baseline for all production components; L3 for authentication and secret management subsystems

ASVS compliance verification:
- L2 compliance must be verified via structured security assessment at minimum annually and before each major version release
- L3 for authentication subsystem, secret zone, and HITL Tier C paths must be verified annually and before any significant change to these subsystems
- assessment evidence (report, gap list, remediation plan with due dates) is a release-blocking artifact for major releases
- assessment is owned by the security owner role; ASVS assessment artifacts (report, gap list, remediation plan with due dates) must be recorded as supplementary evidence for CTRL-01, CTRL-03, and CTRL-04 in the control ownership registry (per `01-system-architecture.md` Section 21), as these subsystems encompass the authentication, injection protection, and secrets lifecycle controls that ASVS L3 verification targets
- identified gaps are tracked as security backlog items with explicit remediation deadline and owner

## 4) Engineering process references

- Martin Fowler on test-driven development (bliki): https://martinfowler.com/bliki/TestDrivenDevelopment.html

Used for:
- strict TDD flow in `04-testing-and-quality-gates.md`

## 5) Notes on interpretation

- The RIAS model combines OpenClaw capabilities with additional control-plane policies.
- Where OpenClaw behavior is configurable, RIAS chooses conservative defaults (safety-first).
- Any mismatch between implementation and sources should be resolved by updating this reference list and architecture docs in the same PR.

## 6) Additional security and reliability references

- STRIDE threat modeling overview: https://learn.microsoft.com/en-us/azure/security/develop/threat-modeling-tool-threats
- NIST Secure Software Development Framework (SSDF): https://csrc.nist.gov/Projects/ssdf
- SLSA framework: https://slsa.dev/
- OpenSSF Scorecard: https://securityscorecards.dev/
- GDPR (EU 2016/679): https://eur-lex.europa.eu/eli/reg/2016/679/oj

Used for:
- threat-model baseline and control-to-test traceability direction
- supply-chain integrity controls (provenance, dependency hygiene)
- secure development lifecycle alignment
- privacy/compliance governance baseline (DSAR, data minimization, purpose limitation)
