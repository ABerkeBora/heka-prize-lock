# Prize Lock V2 executor isolation review

31 October 2026, Europe/Berlin. Scope: shared `scope.ts`, `store.ts`, `config.ts`, `chain.ts`, `payment.ts`, and the separate `future-agent.ts`, `future-keeper.ts`, V2 routes and preparation scripts. Only API3 is selected.

## Isolation verified

`AsyncLocalStorage` carries the version namespace across overlapping promises and nested asynchronous work. Unscoped callers retain V1 behavior. V2 maps `.local/` to `.local/v2/` and `evidence/` to `evidence/v2/`, including intent, transaction, trail, lock and fee-ledger files. Already scoped paths are not prefixed twice.

The V2 scope selects `.local/v2/test-wallets.json` and the `FuturePrizeLock` artifact. Separate executor addresses prevent V1 and V2 from racing the same EVM nonce. The tests use freshly generated ephemeral wallet fixtures; they do not open the prepared V1 or V2 wallets.

The shared payment safeguards remain active: exact operation/request/endpoint binding, integer API fee/count/expiry limits, a single persisted authorization per intent, matching aUSD Transfer and AuthorizationUsed nonce in the same receipt, and idempotent paid-fee accounting. Signed payout transactions remain bound to destination/calldata/value, reconcile by their saved hash and refuse expired rebroadcasts.

## Tests run

`node --test server/scope.test.ts` — **10 passed, 0 failed**.

`node --test server/future-agent.test.ts server/scope.test.ts` — **14 passed, 0 failed**.

`node --test server/*.test.ts` — **33 passed, 0 failed** after the V2 isolation, agent and edited-proof changes, including V1 regression tests.

The new tests cover:

- namespace mapping, already scoped paths, and unchanged non-storage paths;
- overlapping V1/V2/third-scope work with unchanged V1 pool, mandate and evidence bytes;
- nested scope restoration after an asynchronous error;
- concurrent V1/V2 locks and rejected duplicate actions within V2;
- V2 wallet/executor selection despite a V1 wallet environment variable;
- refusal to use the V1 executor when the V2 wallet is missing;
- future-contract artifact and scoped ABI selection while V1 definitions remain intact;
- identical intent IDs reusing only their own version's saved receipt and fee ledger, with zero new purchases;
- delegated refund permission, fixed-contract/zero-value/exact-calldata enforcement and available gas capacity;
- reconciliation of an already submitted refund after mandate expiry, including receipt, refund evidence and L1 fee accounting without another purchase;
- the captured real signed not-started observation passing signature verification and remaining `Waiting` after mocked on-chain nonfinal rejection, with the prize unchanged;
- early-poll rejection, three-call budget exhaustion and fixed-expiry refusal without extending the mandate or creating new economic intents.
- the edited-proof helper actually changing both a real V1 numeric winner and a real V2 null winner, preserving the source fixture, and invalidating each original signature without network access.

All tests isolate temporary fixtures inside this repository's ignored `.local/` folder. They make no paid requests, chain writes or external messages.

## Review boundary

The scope helper is trusted application routing, not a filesystem sandbox. Callers must keep the entire asynchronous operation inside its scope and generate safe internal intent IDs. Raw filesystem calls, arbitrary absolute paths or traversal fragments are outside this routing guarantee. HTTP clients must never supply file paths or intent path fragments.

## Future-agent and keeper findings

- Discovery has a separate five-minute, three-priced-call mandate. Upcoming discovery, selected-match proof and funding refresh use distinct intent IDs. It does not extend an expired discovery mandate.
- The funded monitor pins the exact request, contract, beneficiaries, API token/merchant and integer budgets. It permits at most three priced observations and one terminal payout or fixed refund. The first check occurs on delegation; the next is no earlier than fifteen minutes and the scheduled match plus ninety minutes; a final retry is thirty minutes later. The recorded expiry is bounded to twelve hours and the fixed refund grace plus an additional hour, whichever comes first. The twelve-hour maximum is an implementation choice within the brief's numeric-bound requirement; it is not a new perpetual delegation.
- A nonfinal/null result preserves the prize, records the spent fee honestly and waits. Canceled, postponed, unavailable or changed-schedule results cannot rewrite the contract policy; the fixed timeout/refund path remains the exit.
- The shared executor now accepts `refund` only with explicit mandate permission, the exact encoded function, zero native value and the fixed contract. The contract determines the immutable refund recipient. A payout and refund share the single terminal economic-action limit.
- Known payout and refund transactions reconcile before new observations or expiry checks. A mined receipt remains recoverable after expiry; an expired authorization cannot initiate a new broadcast.
- V2 preparation holds the V1 lock before the V2 lock while seeding the separate executor. Normal V2 routes and keeper actions run inside the V2 scope and its action lock. The keeper reloads current state under that lock and stops attention states. Neither route consumes V1 intents or receipts.

The final source review found no remaining isolation or executor blocker. Actual future-match funding and waiting evidence are recorded separately in `evidence/v2/funding.json` and `evidence/v2/waiting.json`. These tests use mocked RPC state to exercise failure/recovery boundaries; they do not turn a fixture or V1 payout into a live V2 terminal result. Live final payout/refund remains **PENDING** until the external match or fixed timeout provides it.

The corrected V2 live tamper evidence records four reverted receipts: edited, wrong-request and wrong-signer reject as `NotSignedByAirnode`; stale rejects as `ResponseTooOld`, with prize state unchanged. The earlier null-winner edit attempt, which had not changed the bytes, is retained separately in `evidence/v2/initial-validation-attempts.json` and is not counted as the edited-data test.

Atomic JSON rename protects process-level state updates; explicit disk `fsync` and abrupt power-loss durability are not covered. Preserve both version namespaces and reconcile chain receipts before manual state repair.
