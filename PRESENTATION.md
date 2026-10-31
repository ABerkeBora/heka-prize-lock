# Prize Lock — 2,5 dakikalık sunum akışı

Durum: konuşma/gösterim taslağı hazır. **Video kaydı PENDING; Devfolio gönderimi PENDING.** Hedef süre 2 dakika 30 saniye. Ekrandaki bilinen sonuçlu test senaryosunu ve Base Sepolia ağını bir kez açıkla. Takım isimleri gerçek PandaScore kaydından gelir; ödeme cüzdanları takımlara ait değildir.

| Süre | Ekran ve anlatım |
| --- | --- |
| 0.00–0.20 | Prize Lock maç ekranı. “Küçük esport etkinliğinde ödülün hazır olması ile gerçekten ödenmesi arasında boşluk var. Organizatör maçı, iki alıcıyı ve kuralı baştan sabitler; ödülü sözleşmeye yatırır.” Team Synapse–New Growth 2–0 bilinen sonuç testini belirt. |
| 0.20–0.40 | Sabit politika ve ilk mandate. `0.0001 test ETH` ödül; veri için çağrı başı `0.01`, toplam `0.03 test aUSD`; en çok üç veri çağrısı, tek payout, 30 dakika yetki. “Organizatör bir kez yetki verir. Sonraki veri ödemesini ve kazanan transferini treasury agent yürütür.” |
| 0.40–1.05 | Payment trail ve gerçek veri ücreti. [0xec7440…](https://sepolia.basescan.org/tx/0xec74409792c2c1b1e12855f41da1692d5727b4e3849bd45bf61660905f6589a3). “Agent, izinli merchant'a x402 ile test aUSD ödedi. Dönen ham imza tam maç, operation ve projection'a bağlı.” API ücretini ödül fonlamasından ayır. |
| 1.05–1.25 | Gerçek payout ve bakiye farkı. [0x0b2be2…](https://sepolia.basescan.org/tx/0x0b2be2f04133ec2131040e26828101f600aaa7cc49eb30ed5e9f6a32398299f3). “Contract signer, request, iki zaman koşulu ve sabit kazananı doğruladı; agent 100000000000000 wei'yi kayıtlı test alıcıya gönderdi. Claimable bir sayı değil, tamamlanan transfer.” |
| 1.25–1.55 | Dört ret satırı ve explorer linkleri. Değiştirilmiş değer, eski gerçek cevap, yanlış istek ve yanlış signer. “Dördü de fonlu havuzda gerçek revert verdi; öncesi/sonrası ödül ve protected state aynı. Revert gas'ı yine harcandı.” |
| 1.55–2.12 | Duplicate/mandate koruması. Tamamlanmış işe `npm run agent -- --resume` çıktısını ve engellenen bütçe/merchant testini göster. “Aynı intent ikinci ücret veya payout üretmez. Belirsiz ödeme receipt'i uzlaştırılır; yeni authorization ile üstü örtülmez.” |
| 2.12–2.30 | Contract ve güven sınırı. “API3 kaynak/bütünlük kanıtı verir; PandaScore'un yanılmazlığını garanti etmez. Belirsiz sonuçta fonlar tutulur; deadline sonrası 10 dakikalık grace sonunda yalnız sabit organizatöre refund açılır. Public source ve yerel kurulumla aynı akış incelenebilir.” |

Yeni canlı akış çekilecekse `npm run setup`, dört ret işlemi, sonra `npm run agent` sırasını kullan. Başarılı API satın almasını sonradan geri alınmış gibi anlatma. Mevcut havuz zaten ödendiğinden tekrar çekim için yeni havuz gerekir. Ağ veya RPC beklemesini keserek montajlamak uygundur; kaydedilmemiş işlemi yapılmış gibi gösterme.

# English submission draft

## Project description

Prize Lock is a small esports treasury that turns a pre-funded prize promise into a fixed, verifiable payout rule. An organizer pins one match, two team recipient wallets, an API3 Airnode signer, the exact PandaScore request and a timeout/refund policy before depositing the prize. A bounded treasury agent then buys the signed result and triggers the contract payment without requiring another manual click for each economic step.

Our Base Sepolia scenario uses the already-finished PandaScore match 1772358, Team Synapse vs New Growth. The displayed team names and 2–0 score come from the provider; the recipients are isolated test wallets and do not represent these teams. The agent purchased the result for 0.01 test aUSD and triggered a 0.0001 test ETH winner transfer. Data fees, prize funding and payout have separate confirmed transaction evidence.

The contract verifies the stored signer and request hash, a 120-second envelope freshness bound, final match status, a fixed-team winner, source observation timing and a 60-second finality delay. An authenticated result is essential: without it the core payout cannot happen. Four real reverted transactions demonstrate rejection of an edited value, an old authentic response, a response to another request and a response signed by another key. All four left the funded prize unchanged. Terminal state prevents a second payout; the fixed organizer refund becomes available only after the settlement deadline and 600-second grace.

The treasury executor restricts the endpoint, merchant, asset, network, request, contract, call count, integer API/gas budgets and expiry. Persisted intent IDs, payment authorization nonce checks and signed-transaction receipt reconciliation prevent retries from buying or paying twice. These executor budgets are local application controls; the contract independently enforces proof validity, fixed recipients and single settlement. The agent is deterministic; no runtime LLM is claimed.

The project serves small event organizers, sponsors and prize recipients who need to see the funded amount, settlement rule and completed payment in one working flow. Source failures or ambiguous results hold the prize until the fixed refund path. Already-spent API fees and reverted gas are not refunded. API3 authenticates the selected PandaScore observation; provider mistakes, corrections and real-world disputes remain inherited trust risks.

## Submission fields

- Public repository: https://github.com/ABerkeBora/heka-prize-lock — created and pushed; default branch codex/build.
- Contract: https://sepolia.basescan.org/address/0x1ecea4fec536541e494fbf48c3296b10ce7dc502
- Data purchase: https://sepolia.basescan.org/tx/0xec74409792c2c1b1e12855f41da1692d5727b4e3849bd45bf61660905f6589a3
- Prize payout: https://sepolia.basescan.org/tx/0x0b2be2f04133ec2131040e26828101f600aaa7cc49eb30ed5e9f6a32398299f3
- Video: **PENDING**, at most 2.5 minutes.
- Track: API3 — Any API in your contract. No BSV or Cardano qualification is claimed.
- Missing/new data wanted: provider correction/finality signals that distinguish a stable final result from a subsequently corrected match report. Current behavior relies on the pinned PandaScore state and explicit timing policy.

Do not submit automatically. Recheck the official deadline and reconcile `TRACK_REQUIREMENTS.md` before the user submits.
