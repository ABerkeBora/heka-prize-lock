# Prize Lock executor review

Reviewed and rechecked 31 October 2026, Europe/Berlin. Scope: `server/config.ts`, `payment.ts`, `chain.ts`, `agent.ts`, `store.ts`, and local keeper coordination in `index.ts`. This review concerns the local testnet executor, separate from the Solidity verification suite.

## Verified safeguards

- Base Sepolia test-only wallet schema, matching derived addresses, and private wallet-file permissions are checked before key use.
- x402 challenge validation pins the Airnode URL, aUSD token, Base Sepolia network, exact payment scheme, merchant and EIP-712 asset domain; integer price, total reservation, call count and authorization timeout are bounded.
- API authorization payloads and signed raw transactions stay under ignored `.local/`; public evidence contains delivered proofs and receipts, not wallet keys.
- A delivered intent returns its saved result without another network call. Reusing an intent for a changed request fails. A spent uncertain payment nonce freezes the intent rather than creating a replacement authorization.
- Saved successful responses recover by checking the exact aUSD Transfer and the same receipt's AuthorizationUsed payer/nonce, then validating the original Airnode bytes. A successful unrelated transaction cannot stand in for the fee.
- The fee ledger repairs interrupted writes idempotently. A confirmed provider fee remains spent even when its result fails signature validation. Prize release remains blocked.
- Signed transactions are bound to their original destination, calldata and value. Expired mandates can reconcile mined receipts but cannot rebroadcast. Pending payout recovery happens before buying another observation and writes public delivery evidence immediately.
- JSON writes rename a private temporary file atomically. Corrupt state throws instead of silently resetting budgets. The local action lock rejects concurrent actions and recovers after an actual exited child process.

## Findings and verification

Initial findings were corrected by the implementation owner and rechecked. The rows below distinguish tested recovery behavior from source review.

| Finding | Final behavior and evidence |
| --- | --- |
| Signed transaction retry binding and expiry | Fixed; `payment.test.ts` rejects changed recipient/calldata/value and proves expired receipt recovery without rebroadcast. |
| Restart after payout broadcast | Fixed; integration-style mocked restart begins Funded, finds the mined saved payout, returns Paid, writes payout/deployment evidence, and performs zero API purchases. |
| x402 receipt binding | Fixed; receipt must contain the exact token/payer/merchant/amount Transfer and matching AuthorizationUsed nonce. Tests reject wrong asset, payer, merchant, amount, authorizer, nonce, missing event and unused authorization. |
| Saved successful response recovery | Fixed; real Airnode fixture is recovered with mocked confirmed payment receipt without another purchase. |
| Interrupted fee accounting and rejected paid result | Fixed; tests repair a delivered intent missing its ledger exactly once and keep an actual confirmed fee spent when the purchased proof is invalid. |
| Deploy resume before address exists | Fixed by source review; a `deploying` pool bypasses the address read and reuses persisted id/policy/raw transaction. |
| Missing local funding receipt | Fixed by source review; known funding transaction is reconciled instead of funding again. |
| Mandate request/tool identity | Fixed; tests enforce operation, endpoint and exact request hash even when an intent is cached. |
| Local keeper lock and expired pending receipt | Fixed by final source review; keeper reloads mandate under `exclusive`, writes expiry/error states under that same lock, and lets a persisted payout bypass new-observation polling/expiry gates for receipt reconciliation. `sendTx` still refuses an expired rebroadcast. Attention states halt the keeper. |

## Tests run

`node --test server/payment.test.ts server/store.test.ts` — **17 passed, 0 failed** after fixes. Tests use isolated temporary directories within this repository's ignored `.local/` folder, freshly generated ephemeral test keys where a transaction client must be instantiated, and mocked RPC receipts. They never read the prepared project wallet, make paid requests or write to a chain.

The tests cover fee/count/total/expiry limits; wrong network, asset, merchant, URL, transfer method and asset domain; invalid price/timeout encodings; delivered intent reuse and changed-request rejection with zero network calls; consumed-nonce freeze; saved response and fee-ledger recovery; exact transfer and authorization binding; paid-but-rejected result accounting; transaction request binding and expiry; pending payout evidence recovery; integer-safe private persistence; corrupt-state refusal; concurrent-action lock rejection; and crash-lock recovery using an actual short-lived child process.

Application-code budgets are local executor controls. The prize contract independently enforces immutable recipients, proof verification, settlement time and a single terminal payout/refund. The local executor is not a general on-chain session-key system.

The recovery tests cover process interruption and persisted files. JSON writes use atomic rename without explicit disk `fsync`; abrupt power-loss durability was not tested. Preserve `.local/` when restarting, and reconcile public chain receipts before manually repairing or resetting any payment state.
