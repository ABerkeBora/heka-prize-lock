# Prize Lock

Prize Lock pre-funds an esports prize, buys an authenticated match result, and lets a bounded treasury agent trigger the winner's payment. The organizer fixes the match, recipients, oracle request and refund policy before funding. After one delegation, the executor purchases PandaScore data through API3 AirnodeHub and sends the valid result to the prize contract without another payment click.

This is a locally runnable Base Sepolia application for the API3 **Any API in your contract** track. The included scenario uses an already-finished PandaScore match, **Team Synapse vs New Growth, match 1772358, 2–0**. Recipient addresses are isolated test wallets; they do not represent or belong to these teams. No real-value prize or live-event outcome is claimed.

## Open the recorded result

Requires Node.js **22.18+** and npm. Foundry is needed for contract builds and tests.

```sh
npm ci
forge build
npm run build
npm start
```

Open [Prize Lock locally](http://127.0.0.1:3105). The server binds to `127.0.0.1`; `PORT=3105` is the default. A fresh clone can review the saved evidence and current public chain state without a wallet or private key. Keep `WALLET_FILE` unset for this evidence view. Public Base Sepolia RPC access is required; set `RPC_URL` in `.env` if the default RPC is unavailable.

## What actually ran

The latest pool is [0x1ecea4fec536541e494fbf48c3296b10ce7dc502](https://sepolia.basescan.org/address/0x1ecea4fec536541e494fbf48c3296b10ce7dc502) on **Base Sepolia, chain 84532**. The prize was **100000000000000 wei / 0.0001 test ETH**. The paid observation cost **10000 base units / 0.01 test aUSD**, a separate asset and payment.

| Evidence | Confirmed transaction / file |
| --- | --- |
| Deploy the immutable prize policy | [Deployment](https://sepolia.basescan.org/tx/0xcb4fe0ad063e2eeb090f7fc8a0993845df1f0786e1abefceae464f68804c7211), [policy](evidence/deployment.json) |
| Fund the prize | [Funding](https://sepolia.basescan.org/tx/0x0307e0572cfdd3ec0fb99569c07887a479688a9c919b998d657e2bb5f14b24c6) |
| Agent purchases the signed result | [aUSD payment](https://sepolia.basescan.org/tx/0xec74409792c2c1b1e12855f41da1692d5727b4e3849bd45bf61660905f6589a3), [intent and result](evidence/prize-2-treasury-observation-1.json) |
| Agent triggers the actual winner transfer | [Payout](https://sepolia.basescan.org/tx/0x0b2be2f04133ec2131040e26828101f600aaa7cc49eb30ed5e9f6a32398299f3), [receipt, state and balance change](evidence/payout.json) |
| Current source matches deployed runtime, including metadata after immutable normalization | [Comparison](evidence/runtime-comparison.json) |

The winner wallet increased from `1100000000000000` to `1200000000000000` wei. The contract is paid, its prize balance is zero, and its fixed winner is team `139124`. The earlier pool's deployment and payout remain in `evidence/prize-1-*.json`; the current implementation does not present them as a new payment.

All four required proof failures were sent as real reverted transactions while the latest prize remained funded. [Before/after state and receipts](evidence/live-tamper-checks.json) show the protected `100000000000000` wei unchanged:

| Case | Contract rejection | Transaction |
| --- | --- | --- |
| Edited winner | `NotSignedByAirnode` | [Edited proof](https://sepolia.basescan.org/tx/0x249187a28e48a7076fe726469edbca5ebabd390ca6e52f0dcf1532a5d84294f5) |
| Old authentic response | `ResponseTooOld` | [Stale proof](https://sepolia.basescan.org/tx/0x5d5d1abdbb8cb17cf34f2f4b1cdae5e3747fa88263544add52dfed790bce454a) |
| Real response to another request | `NotSignedByAirnode` | [Wrong request](https://sepolia.basescan.org/tx/0x7a4bcc6098eb33dbbe85b12ece70fff54856467817e3dd76bb97c0fda17a50f4) |
| Response signed by another key | `NotSignedByAirnode` | [Wrong signer](https://sepolia.basescan.org/tx/0xa8dc2fe70bf64ce44c54be0a1a95dc2fc3a9e4eea2e155d0825e187ca7ff5df0) |

## Run a fresh delegated payment

Use only isolated Base Sepolia test funds. Copy `.env.example` to `.env`, set `WALLET_FILE` to an ignored local file and optionally set `RPC_URL`. Keep the wallet file at mode `0600`. Its schema is:

```json
{
  "testOnly": true,
  "chainId": 84532,
  "roles": {
    "deployer": { "address": "0xYOUR_TEST_ADDRESS", "privateKey": "0xYOUR_TEST_KEY" },
    "buyer": { "address": "0xYOUR_SECOND_TEST_ADDRESS", "privateKey": "0xYOUR_SECOND_TEST_KEY" },
    "counterparty": { "address": "0xYOUR_THIRD_TEST_ADDRESS", "privateKey": "0xYOUR_THIRD_TEST_KEY" }
  }
}
```

These are placeholders, not credentials. Configure keys only on your own machine. `deployer` is the organizer, API payer and transaction signer; `buyer` and `counterparty` are fixed team test recipients. The payer needs Base Sepolia test ETH for deployment, prize funding and gas, plus test aUSD at `0xbeA34973e5f67F18F656A2C6070C64326C791808` for data. The existing evidence supplies the known match and pinned request; preflight is optional and buys a fresh, uniquely named observation of the pinned match.

```sh
npm run setup
npm run tamper -- --live
npm run agent
npm run agent -- --resume
```

`setup` deploys and funds one fresh fixed-policy prize. `tamper --live` spends test gas on the four rejection transactions; it buys no additional data. `agent` records the initial mandate, pays for a fresh result and triggers payout. On a completed mandate, `--resume` reconciles its known payout and refuses another data charge or payout. The local server also resumes an active mandate on its bounded polling interval. No automatic top-up occurs.

The UI exposes the same fund/delegate flow when a configured wallet is present. Fresh pools are limited to five local scenarios. Preserve `.local/` state and archived evidence when resuming; signed payment authorizations and transaction hashes are reconciliation records.

## Mandate and enforcement

The initial mandate permits only `getMatch`, its exact request hash, the PandaScore endpoint, Base Sepolia test aUSD, merchant `0x1505FD562AC2Fb4307B85BC6c672FfeafB4d57A7`, and the deployed prize contract. Integer limits are three calls, `10000` aUSD base units per call, `30000` total, one payout, a `300000000000000` wei gas reserve budget (including a conservative local rollup-fee buffer; actual L1 fees are reported) and `150000000000000` wei per payout action. It expires after at most 30 minutes and polls no more often than every 60 seconds. Deployment/funding costs precede this agent mandate and are recorded separately.

These API, gas, tool and expiry limits are enforced by the local executor and its isolated funded wallet. They are not an on-chain session-key allowance. The contract enforces the exact prize, fixed recipients, signature, request binding, timing and one terminal payout/refund. The treasury is a deterministic bounded agent; no runtime LLM is claimed. Keys are never sent to a model.

Payment intents are saved before submission. Retries reuse the existing API authorization or signed transaction; they reconcile its exact token transfer, authorization nonce and receipt. An uncertain spent authorization without a delivered result stops for recovery instead of buying again. Confirmed API fees remain spent when a later proof fails. Reverted transactions still consume gas.

## Verify or submit a proof

```sh
npm test
forge test -vv
npm run build
node contracts/compare-runtime.mjs 0x1ecea4fec536541e494fbf48c3296b10ce7dc502
npm run submit-proof -- response.json
npm run submit-proof -- response.json --broadcast
```

The proof file may be the raw Airnode envelope or an object containing `proof`. The default command calls the deployed `validateResponse` without signing or paying. The read-only command also works without a wallet. `--broadcast` needs the local test wallet and attempts the actual fixed payout path. Use a funded fresh pool and a fresh response; old saved envelopes become stale, and a paid pool cannot pay again. The UI proof panel also lets judges inspect rejection cases and submit an envelope for validation.

`forge test` covers 27 cases, including the actual captured PandaScore signer, four failure categories, source timestamps, exact funding, fractional IDs, refund timing, failed transfers and replay. See [contract design](CONTRACT_DESIGN.md) for the complete state machine and vendored official source provenance.

## Oracle and refund policy

The pinned Airnode signer is `0xd9D29FEDc3737aD5198611457fE04aB08a739C7b`. The request hash binds `getMatch`, match `1772358` and the projection `id/status/winnerId/endAt/modifiedAt`. The contract checks a fresh envelope of at most **120 seconds**, a **60-second** post-match finality delay, `finished` status, a known winner, source update time at or after match end and no later than the signature, and the immutable source observation window. That window and the settlement deadline are stored in [the deployment policy](evidence/deployment.json).

Missing, null, canceled, postponed or ambiguous data cannot release the prize. No late proof is accepted after the settlement deadline. Refund becomes permissionlessly triggerable **600 seconds later**, pays only the pinned organizer and cannot coexist with payout. The included refund path is covered locally; a live timeout refund is not claimed.

An API3 signature proves who signed the exact response to the exact request. It does not prove PandaScore's match report is true, resolve disputes or prevent later source corrections. This known-result test does not establish a production live-match policy. Removing authenticated Airnode data prevents the core payout.

## Submission preparation

[Track checklist](TRACK_REQUIREMENTS.md), [presentation and draft copy](PRESENTATION.md), and [morning handoff](MORNING_HANDOFF.md) record remaining delivery work. Official sources: [API3 rules](https://hackathon.tum-blockchain.com/prizes#api3), [submission rules](https://hackathon.tum-blockchain.com/prizes#how-to-submit), [starter](https://github.com/api3dao/airnodehub-hackathon-starter). A video has not been recorded and no competition entry has been submitted. The prepared presentation is an outline, not a video artifact.
