# Prize Lock V1 baseline

V1 was delivered and its goal completed on31 October2026 at03:57 Europe/Berlin. The next-goal turn's `get_goal` returned null (no active goal); the completed V1 status is also recorded in the prior tool result and local BUILD_STATUS.

- Working source commit: `260aaca359de5c284edb1ff2f10b5fb2838f231c`, public default branch `codex/build`.
- Baseline tag: `v1-baseline` (created once after this manifest commit; never move it).
- V1 route: http://127.0.0.1:3105/ . Commands: `npm ci`, `forge build`, `npm run build`, `npm start`.
- Current contract: Base Sepolia84532, `0x1ecea4fec536541e494fbf48c3296b10ce7dc502`.
- Prize payout: `0x0b2be2f04133ec2131040e26828101f600aaa7cc49eb30ed5e9f6a32398299f3`.
- Data fee: `0xec74409792c2c1b1e12855f41da1692d5727b4e3849bd45bf61660905f6589a3`.
- Public evidence: existing `evidence/` including both historical deployments, payouts, signed responses, tamper receipts and screenshots. V2 writes only `evidence/v2/`.
- Existing local state: `.local/pool.json`, `.local/mandate.json`, `.local/proof.json`, `.local/intents/`, `.local/transactions/`, `.local/pools.json`, `.local/checks.json`, `.local/trail.json`; preserve all. Current V1 pool and mandate are Paid, with no pending economic transaction.
- Secrets remain ignored in `.env` and isolated wallet access. V2 will use `.local/v2/` and a separate funded executor role; it will not race the V1 nonce.
- V1 checks:18application/state tests,27contract tests, production build, strict frontend TypeScript and CUA1440/768/390px QA. Public fresh-clone evidence is in `evidence/clean-clone.json`.

The V1 historical match and its payout must not be relabeled as a V2 future-match result. V1 `/` and API behavior remain available for comparison. Submission/video items remain separately pending in MORNING_HANDOFF.md.
