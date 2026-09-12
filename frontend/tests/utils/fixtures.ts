import type { SessionUser, Role } from "@/lib/session";
import type {
  Opportunity,
  PipelineStage,
  PipelineStageId,
} from "@/lib/api/opportunities-types";

/** Session users for the three roles in the matrix (WORKFLOW_SPEC §3). */
export function makeUser(
  role: Role,
  overrides: Partial<SessionUser> = {},
): SessionUser {
  return {
    id: `u-${role}`,
    name: `Utilizador ${role}`,
    email: `${role}@leiritech.pt`,
    role,
    paymentsGrant: false,
    invitesGrant: false,
    locale: "pt-PT",
    avatarUrl: null,
    ...overrides,
  };
}

export const adminUser = makeUser("admin");
/** A Gestor with no explicit grants — the strictest manager case (BR-003). */
export const gestorUser = makeUser("gestor");
/** A Gestor who has been granted both finance and invites. */
export const grantedGestorUser = makeUser("gestor", {
  paymentsGrant: true,
  invitesGrant: true,
});
export const membroUser = makeUser("membro");

export function makeStage(
  id: PipelineStageId,
  order: number,
  winProbability: number,
): PipelineStage {
  return { id, order, winProbability };
}

export const testStages: PipelineStage[] = [
  makeStage("new_contact", 1, 10),
  makeStage("qualification", 2, 25),
  makeStage("meeting_scheduled", 3, 40),
  makeStage("proposal_drafting", 4, 55),
  makeStage("proposal_sent", 5, 70),
  makeStage("negotiation", 6, 85),
];

export function makeOpportunity(
  overrides: Partial<Opportunity> = {},
): Opportunity {
  return {
    id: "opp-1",
    title: "Website institucional",
    companyId: "co-1",
    companyName: "Câmara de Leiria",
    ownerId: "u-gestor",
    ownerName: "Ana Gestora",
    valueCents: 2_500_000,
    probability: 25,
    stageId: "qualification",
    outcome: null,
    nextAction: "Agendar reunião de arranque",
    nextActionAt: "2999-01-31",
    proposalSentReached: false,
    lostReason: null,
    lostReasonNote: null,
    lostAt: null,
    wonAt: null,
    converted: false,
    projectId: null,
    createdAt: "2026-01-02T09:00:00.000Z",
    updatedAt: "2026-01-02T09:00:00.000Z",
    ...overrides,
  };
}
