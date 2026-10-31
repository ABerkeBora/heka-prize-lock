# Prize Lock visual direction

Style: TasteSkill `true-black-flat`, seed **1276253979**, drawn 31 October 2026. App detail screen; no sidebar. Palette kept from the reviewed brief: true black, neutral elevation and flat cobalt. No redraws. A six-column grid keeps a four-column match and prize alongside a two-column treasury agent; the second row carries the payment trail and pinned rules.

The screen answers: **Is this match’s prize reserved, who receives it, and which proof releases it?** The largest figure is the prize amount. Scores remain secondary. The product’s face is a match scoreboard: two fixed team identities around a result, with the locked prize as a single reserve beneath them. Its signature element is the match-to-prize composition; it is neither a generic KPI dashboard nor a landing page. The small lock/check mark is drawn for this product.

Data inventory:
- One real PandaScore match; ID, title, league and game.
- Two fixed team IDs and payout wallets; no change after funding.
- Provider score and status; unavailable scores render a dash.
- Exact prize reserve in test ETH, distinct from API aUSD and transaction gas.
- Prize lifecycle, contract address, funding receipt and payout receipt.
- A bounded agent mandate: integer API caps, gas cap, expiry and call count.
- Signed response timestamp, request hash, raw data and signature.
- Immutable signer, projection, finality and deadline/grace policy.
- Economic actions in timestamp order, each with receipt status.
- Four contract rejection checks and a judge-supplied response editor.

Inter 400/500/600 follows the dealt sheet and is self-hosted under web/src/fonts with its OFL license. True-black flat elevation uses #000 / #111 / #222. Cobalt marks reserve/budget data and confirmed payment trail dots. Buttons are neutral; the primary action is inverted white. No charts are added because a few separate money figures explain this job more clearly. No invented customers, balances, scores or transactions exist in the frontend. All fields come from `/api/state`; first load, unavailable, empty and recoverable failure states remain honest.

Grid arithmetic: at 1208px, six columns × 189.6667px + five × 14px gutters = 1208px; main spans 800.667px and side spans 393.333px with one 14px gutter. Tablet rearranges into a two-column band; phone becomes one column with 18px equal margins and 44px controls. Header links remain real view controls.

Verification: TasteSkill source lint ran with 0 FAIL and one WARN for missing-value em dashes. The dashes denote unavailable data, not prose punctuation, so they are retained. Initial Vite production build passed (28 modules). Strict frontend TypeScript check (`npx tsc -p web/tsconfig.json`) passed. Parent owns real-browser QA at 1440, 768 and 390 pixels; this file will record the resulting visual critique. The supported CUA browser route is required instead of a separate browser launched by TasteSkill’s inspector. No browser measurements have been claimed yet.

Font assets: Inter v20 static TTFs from fonts.gstatic.com, upstream rsms/inter. OFL-1.1 license is included at web/src/fonts/LICENSE.txt. No team logos or media were invented or fetched.

## Initial desktop review and polish

The parent reported that the first desktop browser screenshot looked good. Its two requested refinements are applied: the known-result/test-wallet notice remains only at the top; the match footer shows the real source observation timestamp in Berlin time. The mandate now distinguishes API fees confirmed spent from authorisations reserved, and its progress uses the larger committed amount so an uncertain receipt cannot make available budget appear larger. The explicit “Reserved / cap” row remains in view. Phone controls retain 44px hit areas.

Final screenshots and the seven-question app critique at desktop, tablet and phone widths remain with the parent. This record does not claim final visual QA or measurements before that review.

## Final browser critique

Real CUA browser QA completed on the production build at1440,768and390px. Full screenshots are in evidence/screenshots and were all opened and visually inspected. No horizontal overflow; all visible phone buttons measured44px. Fonts loaded locally. Main prize dominates the answer; the match, reserve and agent remain distinct from the proof bench. Columns share outer edges; tablet rearranges and phone stacks with equal18px margins. Amounts derive from the same state, missing values stay dashes, zero API spend is shown as0. No charts need legends. Error recovery was exercised during a server restart, edited proof was rejected through UI and malformed custom proof reported Invalid proof envelope.

App critique: hierarchy8/10, alignment8/10, color8/10, data honesty9/10, phone8/10. A long payment trail needs View all; collapsed policy details keep the main task compact. The signature element and true-black-flat direction remain intact. No invented sample figures or imagery. Standalone inspect.mjs was replaced with supported CUA screenshots/DOM overflow and control measurements because all browser control in this session must use CUA. Source lint:0FAIL/1WARN, missing-value em dashes retained. Two fine-grained DOM probes (minimum font/numeric variant) were inconclusive; source and screenshots were checked, and no automated PASS for these probes is claimed.
