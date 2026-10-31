# Prize Lock contract

`contracts/PrizeLock.sol` holds one native test ETH prize for one match. Its deployment policy fixes the PandaScore match, two team IDs, their distinct recipient wallets, organizer refund wallet, expected Airnode, complete request hash, prize and timing bounds. There is no owner method, upgrade path, adjustable winner or recipient setter.

## State transitions

`Unfunded → Funded` requires exactly `prizeWei`, submitted before the fixed funding close. An underfunded prize never becomes active. `Funded → Paid` requires a valid signed result and transfers exactly the prize to the immutable wallet for the signed winner in the same transaction. `Funded → Refunded` requires the fixed settlement deadline plus grace, and transfers only to the immutable organizer. `Paid` and `Refunded` are terminal.

Anyone may submit an authenticated proof or trigger the fixed refund. That permission does not let callers choose recipients, amounts, assets or arbitrary contract calls. Effects precede the external transfer; a failed transfer reverts the whole state transition. Repeated payout and payout/refund races cannot release the prize twice. Forced unsolicited ETH is outside prize accounting and has no withdrawal method.

## Proof and source policy

`validateResponse(timestamp, data, signature)` independently verifies the native Airnode signature using the stored signer and request hash. It remains callable after payout, making rejected proof cases inspectable without another economic action. `submitResponse` applies that verifier and the funded/deadline conditions.

The exact projected JSON aliases are `id`, `status`, `winnerId`, `endAt`, and `modifiedAt`. IDs must be unsigned JSON integers; fractional IDs are rejected rather than truncated. `status` must equal `finished`, winner/end/source times must not be null, and the winner must be one of the two fixed team IDs. Missing or malformed values revert.

The envelope must not come from the future and must be no older than `maxEnvelopeAge`. Separately, `modifiedAt` must be at or after `endAt`, no later than the signature, and inside the fixed source observation window. `endAt` must precede the signature by at least `finalityDelay`. Source and envelope times are separate conditions: a new signature cannot move an old source observation into the allowed window.

The review scenario is an explicitly historical, already-known match. Its historical observation window is declared in the deployed policy before funding; it is not described as a recent live match. A future match needs its own policy and deployment. An Airnode signature authenticates PandaScore's observation; it does not independently establish the true match result or prevent provider mistakes and later corrections.

Canceled, postponed, null-winner, unavailable and unresolved results share one deterministic outcome: no payout; the organizer refund becomes available only after `settlementDeadline + refundGrace`. The grace interval accepts no late settlement. There is no early cancellation refund based on an assumed provider enum.

## Agent boundaries

The contract enforces the prize, recipients, signer, request, timestamps and terminal state. API purchase count, aUSD fee limits, polling interval and the agent's gas budget are enforced by the local executor, not by this contract. API fees already paid and transaction gas already spent are not refunded when a subsequent proof fails.

## Official source provenance

The native verifier, projected JSON reader and ISO timestamp parser are copied unchanged from the official [API3 starter](https://github.com/api3dao/airnodehub-hackathon-starter/tree/52933ae1fb9371446a927338473466c3d320e19a), commit `52933ae1fb9371446a927338473466c3d320e19a`, under MIT. Only their 15 transitive Solidity source files are vendored, with the relevant licenses:

| Source | Pinned commit |
| --- | --- |
| OpenZeppelin Contracts | `cab19933c33c2ad1d4c7a84864a3601dddfd16f3` |
| Solady | `acd959aa4bd04720d640bf4e6a5c71037510cc4b` |

`foundry.toml` uses the starter's Solidity `0.8.37`, optimization and Cancun EVM target. Tests define a small cheatcode interface and do not require a forge-std checkout. A fresh clone can run `forge test` with Foundry installed; no dependency download or ignored `.vendor` folder is needed.

## Verification

`forge test -vv` passes 27 tests: 21 synthetic signer policy/security tests and six tests using the actual paid PandaScore captures in `evidence/preflight-match.json` and `evidence/discovery.json`. The real response verifies the pinned signer/request and releases the local test prize to Team Synapse's fixed wallet. Its edited winner, expired authentic envelope, a real response for another operation, and a wrong-key signature all fail while preserving protected funds. A replay cannot pay again.

The additional policy tests cover source/window/finality failures, exact funding, each team, timeout/refund, duplicate execution, malformed fractional IDs, and failed recipient rollback. Foundry locally advances time for stale tests; it does not modify the captured signed timestamp. These local tests are distinct from the Base Sepolia deployment, API payment receipts and actual payout transaction, which must be recorded separately.
