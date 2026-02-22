import type { RBACRole, RoleBinding } from './types.js';

const SUBMIT_ALLOWED: RBACRole[] = ['owner', 'admin', 'project-maintainer', 'infra-approver'];
const TIER_C_APPROVE_ALLOWED: RBACRole[] = ['owner', 'infra-approver'];

export class RBACEngine {
  private bindings: Map<string, RoleBinding>;

  constructor(bindings: RoleBinding[]) {
    this.bindings = new Map(bindings.map((b) => [b.actor_id, b]));
  }

  getRoleFor(actorId: string): RBACRole | null {
    return this.bindings.get(actorId)?.role ?? null;
  }

  canSubmitJob(actorId: string, projectId: string): boolean {
    const binding = this.bindings.get(actorId);
    if (!binding) return false;
    if (!SUBMIT_ALLOWED.includes(binding.role)) return false;

    if (binding.role === 'project-maintainer') {
      return binding.project_ids?.includes(projectId) ?? false;
    }

    return true;
  }

  canApproveTierC(actorId: string, _projectId: string): boolean {
    const role = this.getRoleFor(actorId);
    if (!role) return false;
    return TIER_C_APPROVE_ALLOWED.includes(role);
  }
}
