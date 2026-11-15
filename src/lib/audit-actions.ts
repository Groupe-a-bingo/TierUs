/** Every audit log action, with the label shown in the moderators' journal. */
export const AUDIT_ACTIONS = {
  "round.draw": "Tier list du jour tirée",
  "round.extra": "Tier list bonus créée",
  "round.reroll": "Tirage relancé",
  "idea.update": "Idée modifiée",
  "idea.delete": "Idée supprimée",
  "idea.approve": "Idée validée",
  "idea.reject": "Idée refusée",
  "idea.requeue": "Idée déplacée en validation",
  "user.approve": "Membre validé",
  "user.reject": "Membre refusé",
  "user.role": "Rôle changé",
  "user.promote_admin": "Admin nommé (serveur)",
  "comment.delete": "Message supprimé",
  "settings.idea_validation": "Validation des idées changée",
  "settings.draw_hour": "Heure du tirage changée",
} as const;

export type AuditAction = keyof typeof AUDIT_ACTIONS;

export const auditLabel = (action: string) => AUDIT_ACTIONS[action as AuditAction] ?? action;
