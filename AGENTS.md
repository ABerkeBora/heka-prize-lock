# Prize Lock implementation rules

This project is authorized for implementation and public source delivery. Own only this repository; keep its port 3105, lockfile, environment and `.local/` state isolated. Use test-only Base Sepolia funds; no mainnet spend or paid services. Do not request or publish keys. Public source belongs to ABerkeBora; use repository-local verified identity.

Selected sponsor: API3 — Any API in your contract. Before new application/contract work, read https://hackathon.tum-blockchain.com/prizes in the actual API3 tab and general submission tab, then its official starter https://github.com/api3dao/airnodehub-hackathon-starter. Recheck before claiming readiness. Keep mandatory qualification, submission evidence and judging preferences separate in TRACK_REQUIREMENTS.md. Fixtures do not replace live receipts.

Read HANDOFF.md, TRACK_REQUIREMENTS.md, CONTRACT_DESIGN.md and MORNING_HANDOFF.md. Immutable signer/request/match/two team wallets/prize/timing must be fixed before funding. Raw signed data bytes must not be reserialized. Fresh signature does not refresh old upstream data. Ambiguous/null/nonfinal data cannot pay. One funded prize has exactly one terminal payout or refund.

The organizer funds a prize and a bounded local treasury mandate once. Agent purchases the priced PandaScore getMatch response, validates it and sends the fixed-recipient payout. Keep API aUSD fee, test ETH prize and gas separate. Persist intent, authorization nonce and signed transaction before network submission; reconcile before retry. Never automatically top up. API/gas limits are executor controls; describe them honestly. Keep keys out of model context.

UI English, handoff Turkish. Compact dark-neutral scoreboard with cobalt on meaningful state; use real data and actual actions. Keep the test-wallet/known-result clarification. Verify loading, pending, rejected, confirmed and recoverable errors. Inspect desktop/tablet/phone in a real browser. Use the available TasteSkill app-screen workflow when extending design.

Run relevant executor/contract tests and production build. Inspect publishable files for secrets. Deliver independent README, .env.example, lockfile, evidence, presentation outline and honest morning handoff. Video and Devfolio submission are separate pending human delivery tasks; do not submit on the user's behalf.
