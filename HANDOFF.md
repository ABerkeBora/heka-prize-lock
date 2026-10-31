# Prize Lock — approved scope and implementation handoff

Prize Lock is a one-match esports treasury. The organizer fixes the match, two team test wallets, prize, API3 signer/request and timeout policy before funding. A bounded treasury agent then buys PandaScore data, validates the final result and triggers the actual winner payment without another payment click.

Only API3 is selected. The locally runnable app uses port3105 and its independent public source repository is `ABerkeBora/heka-prize-lock`. Hosting, mainnet value, bracket management, betting markets, BSV/Cardano bridges and general account abstraction are outside this scope.

The delivered known-result scenario uses match1772358, Team Synapse–New Growth,2–0. Recipient wallets are isolated test roles and do not represent the teams. Fresh API3 envelopes still require the expected signer, exact request and 120-second freshness; source modified/end times are checked separately within the immutable historical observation window. The finality delay is60seconds. Unresolved/canceled/postponed/null results remain locked until the settlement deadline plus600-second refund grace; only the organizer can receive that refund.

Prize:100000000000000wei test ETH. Priced data:10000 aUSD base units per call. Delegation: at most3calls/30000units total, one fixed-contract payout,30-minute expiry,60-second polling, explicit local API/gas caps. The deterministic executor never sends keys to a model. It is not presented as a runtime LLM. Contract-enforced and application-enforced controls are distinguished in README.

All transaction history and signed evidence live under `evidence/`; sensitive authorizations/raw transactions/wallet references remain ignored under `.local/`. Preserve history when creating fresh scenarios. Refer to README for independent setup, TRACK_REQUIREMENTS.md for current eligibility evidence and MORNING_HANDOFF.md for review status and remaining submission tasks.
