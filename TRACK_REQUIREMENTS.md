# Prize Lock — API3 requirements and evidence

Selected track: **API3 — Any API in your contract** only. General TUM judging applies automatically.

Start gate: 31 October 2026, approximately 03:39 Europe/Berlin, before application/contract implementation. The browser selected API3; qualification, expanded submission/judging sections and the general submission tab were read. Official starter README, API-to-contract, projections and recommended integrations were read. Finish gate: **31.10.2026 03:54:35 Europe/Berlin**, page reloaded from the official source, API3 selected and submission/judging sections expanded, then general submission tab reopened. Requirements unchanged.

Sources: [API3](https://hackathon.tum-blockchain.com/prizes#api3), [general submission](https://hackathon.tum-blockchain.com/prizes#how-to-submit), [starter](https://github.com/api3dao/airnodehub-hackathon-starter), [API-to-contract](https://api3dao.github.io/airnodehub-hackathon/docs/from-api-to-contract), [projection](https://api3dao.github.io/airnodehub-hackathon/docs/projections), [recommended integrations](https://api3dao.github.io/airnodehub-hackathon/docs/integrations), [PandaScore](https://airnodehub.api3.org/explore/pandascore).

## Mandatory qualification

| Requirement | Implementation and evidence | Status |
| --- | --- | --- |
| AirnodeHub essential to a core workflow | Prize cannot pay without authenticated getMatch. `contracts/PrizeLock.sol`, real `evidence/payout.json`; no-data/nonfinal tests | PASS |
| Deployed contract checks trusted signer and exact request | Base Sepolia [0x1ecea4…c502](https://sepolia.basescan.org/address/0x1ecea4fec536541e494fbf48c3296b10ce7dc502); stored signer/request hash; `evidence/runtime-comparison.json` exact runtime+metadata after immutable normalization | PASS |
| Relevant timing conditions | Envelope 120 s, future rejection, source update/end window and60 s finality, immutable settlement cutoff; `test-contracts/PrizeLock.t.sol` and real stale rejection | PASS |
| Exact signed value drives meaningful on-chain action | Winner139124 paid100000000000000 wei to immutable wallet; [payout](https://sepolia.basescan.org/tx/0x0b2be2f04133ec2131040e26828101f600aaa7cc49eb30ed5e9f6a32398299f3), actual balance delta in `evidence/payout.json` | PASS |
| Duplicate execution prevented where needed | Contract terminal state, local payment intent/nonce and signed-tx reconciliation; `evidence/agent-safety.json`,18 executor tests/27 contract tests | PASS |

## Mandatory track submission evidence

| Item | Evidence | Status |
| --- | --- | --- |
| Contract address/network | README, `evidence/deployment.json`, Base Sepolia 84532 | PASS |
| Judges submit their own responses | Proof bench editor, `npm run submit-proof -- response.json`; optional actual payout with `--broadcast` | PASS |
| Valid timely response triggers intended action | `evidence/payout.json`, live prize transfer linked above | PASS |
| Edited real response rejected before action | Live reverted tx0x249187…94f5, `evidence/live-tamper-checks.json` + unchanged funded reserve | PASS |
| Old authentic response rejected | Live reverted tx0x5d5d1a…454a, same evidence file, ResponseTooOld | PASS |
| Authentic other-request response rejected | Live reverted tx0x7a4bcc…50f4, same file, NotSignedByAirnode | PASS |
| Wrong signing key rejected | Live reverted tx0xa8dc2f…5df0, same file, NotSignedByAirnode | PASS |
| Description explains users, forgery harm and wanted missing data | `PRESENTATION.md` English draft; missing authoritative correction/finality signal recorded | PASS (prepared copy) |
| Video shows valid action and four tamper failures | Script ready in PRESENTATION; actual recording not made | PENDING |

Live rejection transactions called the independent contract verifier while the second pool was funded; all four confirmed reverts preserved its100000000000000 wei prize. Local tests additionally exercise the protected payout path. The earlier pool's valid payout preceded these four transactions; the current pool's agent payout followed them. A final video must show the official requested presentation order using these receipts or a fresh scenario.

## General submission

| Item | Evidence/status | Status |
| --- | --- | --- |
| Public repository and independent setup/run README | [ABerkeBora/heka-prize-lock](https://github.com/ABerkeBora/heka-prize-lock), public source pushed to default branch codex/build; fresh-clone npmci/build/18tests/27 contracttests passed | PASS |
| Detailed project description submitted on Devfolio | English copy prepared; not submitted, user action required | PENDING |
| Video at most2.5minutes |2:30 outline prepared; no video artifact | PENDING |
| Timely submission | Official deadline reconfirmed31 October2026,15:00 Europe/Berlin. One submission per team, up to3partner tracks. No automatic submission | PENDING |

## User product acceptance — separate from sponsor rules

| Item | Evidence | Status |
| --- | --- | --- |
| Organizer pays provider and fixed winning test recipient after one delegation | `evidence/prize-2-treasury-mandate.json`, x4020xec7440…89a3 and payout0x0b2be2…99f3 | PASS |
| Network/asset/recipient/tool/caps/expiry fixed before action | Preview shown before delegation; persisted mandate; local executor allowlist, contract fixed payees | PASS |
| Exact fee receipt and delivered result | Same receipt matches Transfer and AuthorizationUsed nonce, real signed result; `evidence/prize-2-treasury-observation-1.json` | PASS |
| Duplicate/retry/timeout and blocked economic action | `evidence/agent-safety.json`; nonce/spend unchanged, overbudget and wrong recipient rejected; restart/uncertain receipt tests | PASS |
| Costs and limits labeled honestly | API fee/prize/gas separate. API/gas caps are application controls with isolated test wallet; rollup gas reserve estimate, contract enforces proof/recipient/one terminal payout | PASS |

## Judging preferences and limits

Usefulness, execution and originality are judging preferences after qualification. Agent data selection/x402/repeated cycles can add value; one payment alone is not the whole rubric. This is a deterministic bounded keeper with repeated polling implemented, not a runtime LLM claim. Only one finished real match was exercised; provider mistakes/corrections remain source risks. The signature authenticates origin and exact bytes, not the truth of the match. Live refund was not exercised; its fixed deadline/grace path passed contract tests. These are recorded in MORNING_HANDOFF.

**Overall: working API3 core and live evidence PASS; competition submission remains PENDING until video and Devfolio work are completed.**
