---
name: approval-gate
description: Manage approval flow for dangerous actions
---

## When to Use

Use internally before executing any DANGEROUS-tier action. This skill handles the approval workflow.

## Tier System

| Tier | Behavior |
|------|----------|
| safe | Execute immediately, no notification |
| notice | Execute immediately, log to audit channel |
| dangerous | STOP — request approval via Telegram, wait for response |
| forbidden | BLOCK — never execute, log security alert |

## Code-Enforced Tier Gate

All tool containers enforce tiers via middleware. The tier-gate middleware runs BEFORE your action handler:

- **safe/notice** — request passes through to handler automatically
- **forbidden** — returns `{ status: "blocked" }` with HTTP 403, handler never runs
- **dangerous** without `approval_id` — creates an approval in audit-db, sends Telegram notification, returns `{ status: "approval_required", result: { approval_id } }`
- **dangerous** with valid `approval_id` — checks audit-db, proceeds only if state is `"approved"`

**You cannot bypass the tier gate.** Even if you skip this skill, the middleware will block dangerous actions.

## Handling `approval_required` Responses

When a tool returns `status: "approval_required"`:

1. Tell Adrian what you want to do and why (the Telegram notification is already sent)
2. Include the `approval_id` in your message so Adrian can reference it
3. Wait for Adrian's response ("yes", "go ahead", "do it" or "no", "cancel")
4. If **approved**: call `POST /approvals/{id}/resolve` with `{ "state": "approved", "resolved_by": "Adrian" }`
5. Then **retry** the original request with `approval_id` in the body
6. If **rejected**: call `POST /approvals/{id}/resolve` with `{ "state": "rejected", "resolved_by": "Adrian" }` and acknowledge

## Approval API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/approvals` | POST | Create approval (done automatically by tier-gate) |
| `/approvals/:id` | GET | Check approval state |
| `/approvals/:id/resolve` | POST | Approve or reject: `{ state, resolved_by }` |

All endpoints are on audit-db (port 9000) and require JWT auth.

## What Requires Approval

- Sending emails (send_email)
- Creating calendar events (calendar_create)
- File operations: copy, move, del, mkdir
- Starting programs (start)

## Important

- NEVER execute a dangerous action without explicit approval
- If Adrian says "no" or "cancel", acknowledge and do not proceed
- If unsure about tier, treat it as dangerous
- Timeout: 30 minutes — if no response, approval is automatically timed out
- Approval requests and outcomes are logged to audit automatically
