# Future Prize Lock contract

V2 adds one customer capability: the prize can be funded while the selected provider still reports a future match as not started with no known winner or end time. The later result is accepted only under the rules fixed before that funding. `contracts/PrizeLock.sol` and its V1 receipt history remain unchanged.

`FuturePrizeLock.sol` imports the same unchanged official `AirnodeV2Attestation`, `ProjectedJson`, ISO timestamp and Solady parser libraries as V1. It uses a small separate escrow because V1's funding and validation functions are not virtual. A wrapper exposing V1's public `fund()` would allow its initial-proof guard to be bypassed. There is no new oracle implementation, session-key platform or arbitrary executor.

## ABI and immutable policy

The constructor takes one `Policy` tuple in this order:

```text
airnode address
requestHash bytes32
matchId uint256
teamA uint256
teamB uint256
walletA address
walletB address
organizer address
prizeWei uint256
fundingClosesAt uint256
scheduledAt uint256
endWindowStart uint256
endWindowEnd uint256
settlementDeadline uint256
refundGrace uint256
maxEnvelopeAge uint256
finalityDelay uint256
maxInitialSourceAge uint256
maxFinalSourceAge uint256
```

Methods are `fund(timestamp, data, signature)` payable, `validateFundingResponse(timestamp, data, signature)` view, `validateResponse(timestamp, data, signature)` view returning `(winnerId, fixedRecipient)`, `submitResponse(timestamp, data, signature)` and `refund()`. State getters use V1's enum mapping: `0 Unfunded`, `1 Funded`, `2 Paid`, `3 Refunded`. The funding record also exposes `fundingProofHash`, `fundingObservedAt` (signed envelope time) and `fundedAt` (actual funding block time).

One exact signed request is used for both stages. The eight projected fields are:

| Alias | Provider JSON pointer |
| --- | --- |
| `id` | `/id` |
| `status` | `/status` |
| `winnerId` | `/winner_id` |
| `endAt` | `/end_at` |
| `modifiedAt` | `/modified_at` |
| `scheduledAt` | `/scheduled_at` |
| `teamAId` | `/opponents/0/opponent/id` |
| `teamBId` | `/opponents/1/opponent/id` |

The signed team IDs are compared as an unordered set. Provider array reordering does not change the ID-to-recipient mapping. Unknown or duplicate teams, a different match, changed schedule and fractional IDs cannot select a recipient.

## Funding proof

Exact prize funding requires all of these on-chain checks:

- Native Airnode signature from the stored signer over the stored exact request hash and raw `data` bytes.
- Envelope not from the future and at most `maxEnvelopeAge` old.
- Actual funding and the proof occur no later than `fundingClosesAt`; the fixed scheduled time is still in the future.
- Exact match, scheduled time and the fixed two-team set.
- `status` exactly `not_started`, with `winnerId` and `endAt` both explicitly null.
- A non-null provider modification timestamp no later than the signature and at most `maxInitialSourceAge` old at the funding block.

Funding with a stale proof, already-known winner, non-null end time, started status or changed policy fails atomically. The contract stores the accepted proof hash and times together with the funded state. No nonexistent end time is parsed or replaced by the current date.

## Final result and timeout

Later settlement authenticates the same signer/request and matches the same identities and schedule. It requires `finished`, a non-null winner among the two pinned IDs, an actual end time inside `[endWindowStart, endWindowEnd]` and no earlier than actual funding, plus the fixed post-match finality delay. Provider modification time must be at or after the end, no later than the signature or fixed window end, and no older than `maxFinalSourceAge`. Envelope and provider ages remain separate checks.

Only `Funded → Paid` transfers the exact prize to its fixed winning-team wallet. Effects precede transfer; failure rolls back the state. Replay, a caller change or a process restart cannot produce another contract payout. Null/pending/running/canceled data and a changed schedule cannot release funds. The contract never changes its schedule or extends expiry to accommodate an observation.

After the settlement deadline, no late payout is accepted. At `settlementDeadline + refundGrace`, anyone can trigger `Funded → Refunded`, paying only the fixed organizer. Postponement, cancellation, missing data and ambiguity share this fixed timeout policy. There is no early refund inferred from an unverified cancellation enum, and payout/refund are mutually exclusive.

## Selected test policy and evidence boundary

The selected actual future source is PandaScore match `1713127`, scheduled **2026-10-31 06:00 UTC / 07:00 Europe/Berlin**. The capture reports `not_started`, team IDs `138767` and `13719`, and null winner/end. The exact request hash is `0x0bf52ab2e1687b20e14a9063033f8bf531daa8b74c176a5730bf6355004514db`. See `evidence/v2/future-selection.json` for the paid response and receipt. Deployed policy values and actual chain receipts are separate evidence owned by the application flow.

The agreed selected-policy values are a 180-second envelope age, 120-second finality delay, seven-day initial source-age bound and 3600-second final source-age bound. The fixed final end/source window is scheduled time minus 1800 through plus 21600 seconds; settlement closes at scheduled time plus 28800, refund grace is 600 seconds. The constructor accepts arbitrary valid immutable values; these are the selected product configuration rather than hidden constants in the contract.

The initial source-age allowance permits a stable upcoming schedule last modified before the funding day. A fresh Airnode envelope does not make that upstream update new. The trusted claim is the pinned PandaScore observation, including its disclosed update time; source mistakes or later corrections remain inherited risks. These isolated test recipients do not represent the actual teams.

## Checks run

`forge test -vv`: **61 PASS**, consisting of V1's 27 regression tests and V2's 34 tests. V2 includes 28 time-controlled policy tests and six tests using the real paid future-match capture: successful unknown-result funding, pending no-payout, edited winner, stale authentic envelope, real wrong request and wrong-key signature. Synthetic future final-result tests cover exact payout, recipient mapping despite team reordering, wrong teams/schedule, finality, source ages, end window, null/canceled results, timeout/grace, duplicate funding and terminal replay.

The synthetic final result is not a live V2 terminal event. If the real match has not finished at review time, a real funded/waiting state plus the implementation/tests is the bounded V2 goal result; live final payout or timeout remains **PENDING**. V1's historical payout is never counted as V2's terminal evidence.
