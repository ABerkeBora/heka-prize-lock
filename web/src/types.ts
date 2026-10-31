export type Team = { id: string | number; name: string; acronym?: string; score?: number | null; address?: string; imageUrl?: string };
export type TrailEntry = { id: string; at?: string; type?: string; title: string; status?: string; amount?: string; asset?: string; txHash?: string; detail?: string };
export type ProofCheck = { case: string; status: string; reason?: string; checkedAt?: string; txHash?: string };
export type AppState = {
  network?: string; updatedAt?: string; notice?: string; mode?: string;
  match?: { id: string | number; name?: string; league?: string; videogame?: string; status?: string; beginAt?: string | null; scheduledAt?: string | null; endAt?: string | null; modifiedAt?: string | null; teams?: Team[]; historical?: boolean };
  pool?: { id?: string; address?: string; status?: string; prizeWei?: string; balanceWei?: string; payee?: string; payoutTx?: string; fundingTx?: string; refundAvailable?: boolean };
  mandate?: { id?: string; status?: string; expiresAt?: string; expiryLabel?: string; nextPollAt?: string; maxCalls?: number; callsUsed?: number; maxApiFee?: string; totalApiBudget?: string; apiSpent?: string; apiReserved?: string; gasBudgetWei?: string; gasSpentWei?: string; payer?: string; payTo?: string; maxActions?: number; pollingSeconds?: number; maxActionGasWei?: string };
  proof?: { timestamp: string; requestHash: string; data: string; signature: string; airnode?: string };
  trail?: TrailEntry[]; checks?: ProofCheck[];
  policy?: { requestHash?: string; signer?: string; operation?: string; projection?: Record<string,string>; maxResponseAge?: number; finalityDelay?: number; deadline?: string; grace?: number; sourceWindowStart?: string; sourceWindowEnd?: string; refundRecipient?: string; [key:string]: unknown };
  actions?: { canFund?: boolean; canStart?: boolean; canRun?: boolean; canRefund?: boolean; canNewPool?: boolean };
};
