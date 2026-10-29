import type { SubstitutionLine } from './substitution-preview'
import type { Delivery, DeliveryOption } from './shipping-rules'

export type ProposalCandidate = {
 lines: SubstitutionLine[]; delivery?: Delivery; deliveryOptions: DeliveryOption[];
 totalCents: number; merchandiseDifferenceCents: number; freightDifferenceCents: number | null;
 taxNote: string; rank: number
}
export type AgentProposal = {
 preparedBy?: {agent:string;person:string;label:string};
 id: string; number: number; revision: string; accountId: string; orderId: string; grantId: string;
 state: 'proposed' | 'offered' | 'executing' | 'completed' | 'blocked' | 'superseded';
 model: string; runId: string; reportedCostCents: number; createdAt: string;
 source: { orderRevision: string; accountRevision: string; documentSha256: string | null; fingerprint: string; observedAt: string; toolPermissions: string[] };
 effects: string[]; candidates: ProposalCandidate[]; selected?: number;
 managerApproval?: { version:number;staffRevision?:string;by: string; at: string; reason: string; candidate: number };
 offerNumber?: number; executionKey?: string; replacementId?: string; completedAt?: string;
 attempts?: { id: string; at: string; actorId: string; code: string; reason: string }[];
 buyerApproval?: { by: string; at: string; status: string }; grantActive?: boolean
}
