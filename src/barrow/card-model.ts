export type CardState = 'prepared' | 'requires_action' | 'authorized' | 'captured' | 'declined' | 'cancelled'
export type CardPayment = {
 collectionKey?:string; dueDate?:string; scheduleId?:string; scheduledBy?:string; scheduledAt?:string; scheduleReason?:string
 savedCardId?:string; savedCardRevision?:string
 id:string; installationId?:string; accountId:string; orderId:string; orderRevision:string; currency:string; amountCents:number; surchargeCents:number
 state:CardState; createdAt:string; updatedAt:string; latestFinancialAt?:string; capturedAt?:string
 providerAccountId:string; providerCustomerId?:string; livemode?:boolean; providerPaymentId?:string; setupSessionId?:string; paymentMethodId?:string
 checkoutUrl?:string; actionUrl?:string; captureBefore?:string; restored?:boolean
 card?:{brand:string;last4:string;funding:string;state:string}
 exception?:{reason:string;verifiedAt:string;resolvedAt?:string;resolution?:string}
}
export type CardConnection = {account_id:string;country:string;livemode:number;secret_cipher:string;webhook_cipher:string;webhook_id:string;revision:string;surcharge_bps:number;allowed_states:string}
