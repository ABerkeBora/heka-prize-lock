# Prize Lock V2 — API3 evidence

API3 only. Start gate 31 October 2026 ~04:30 Europe/Berlin: correct sponsor tab, expanded submission/judges, general rules and official starter/catalog read before code. Finish gate**31.10.2026 04:42:30 Europe/Berlin**: official page reloaded; general and API3 tabs reread, submission/judges expanded. No relevant change. Sources: [API3](https://hackathon.tum-blockchain.com/prizes#api3), [general](https://hackathon.tum-blockchain.com/prizes#how-to-submit), [official starter](https://github.com/api3dao/airnodehub-hackathon-starter), [PandaScore](https://airnodehub.api3.org/explore/pandascore).

| Mandatory qualification/evidence | V2 implementation and actual proof | Status |
| --- | --- | --- |
| Airnode essential to core workflow | FuturePrizeLock.fund requires signed not_started/null winner/end before scheduled start; no proof means no funded state | PASS |
| Deployed contract verifies signer, exact request and time | Base Sepolia 84532 contract 0x1f4f2052dcb0fb93b560331bc9e1892b057b6d84; chain-verification.json checks every immutable; runtime-comparison.json matches compiled code+metadata | PASS |
| Bound signed value drives meaningful on-chain state | Authenticated unknown future match admitted 100000000000000 wei into Funded; funding.json includes proof+confirmed receipt+block before schedule | PASS |
| Relevant source/envelope/finality timing | Envelope 180s; initial modified source <=7 days; final source<=1h, end/source fixed window, finality 120s, end after actual funding; contract tests | PASS |
| Duplicate protection | Exact one funding, one payout/refund; shared intent/receipt/gas validator; Future contract tests and 33 executor tests | PASS |
| Valid timely proof triggers intended new action | Real future proof caused funded/waiting state; future-funding-refresh.json + funding.json | PASS |
| Four authentic tamper categories rejected | New real reverted transactions in live-tamper-checks.json: editednullwinner, stale, other request, wrong key; reserve unchanged | PASS |
| Judges submit own proof | Namespaced Proofbench editor; scripts/submit-proof.ts under withScope(v2Scope), or shared proof/check API; no old intents consumed | PASS |
| Description users/forgery/missing source signals | README V2+CONTRACT_V2: organizer/teams, false result diverts fixed prize, authoritative correction/finality signal absent | PASS (prepared copy) |
| Live final payout/refund | Match has not finished; current prize Funded/Waiting. Synthetic final+refund tests are not a live result | PENDING |
| Public repository/README | Same repo codex/next; v1-baseline frozen; public branch+baseline tag pushed; GitHub author/committer ABerkeBora verified; public-clone build/tests/read-only PASS | PASS |
| <=2.5minute video and Devfolio description/submission | V1 presentation outline exists; actual video/submission not made | PENDING |

All files above are under `evidence/v2/` unless named as source/test. Funding tx: `0x6d01987ae940591778f62ab2b9c589555ac0d6879e01f735dafa426182e6f63c`. Paid monitor observation: `0xdc2a117dae0c138798d9be19a1ada5726b817932abfbb5eb9ad0cabfe3f3e579`. Funded match 1713127 starts06:00UTC/**07:00Europe/Berlin**. Teams are real provider records; beneficiary wallets do not represent them.

Discovery used exactly 3 paid calls within 5 minutes, separate from the 3-call monitoring mandate. Monitoring has no top-up or expiry extension; next scheduled check 08:30 Berlin, then at least30min if needed; fixed expiry16:10Berlin. Budget exhaustion stops API requests and waits for fixed refund boundary. Deployment/test gas is separate from delegated terminal-action gas.

The initial ineffective edited-null attempt was a real nonfinal rejection, not signature tamper evidence; initial-validation-attempts.json preserves it. Corrected edited proof is0x8c8b702d…83ade9d. An oversized other-request transaction was rejected before broadcast for intrinsic gas; its signed intent/classification is retained, and corrected new intent0xc58a7851…a700e32 is the confirmed revert. No fixture is labeled live.

**Goal boundary:** authorized V2 engineering+real funded/waiting evidence is complete when verification/publication finishes. Live terminal remains PENDING; do not keep a model loop open waiting for the match. V1 remains the full live payout demonstration. General submission deadline 31 October 15:00 Europe/Berlin, one submission per team, up to 3 partner tracks; no automatic entry.
