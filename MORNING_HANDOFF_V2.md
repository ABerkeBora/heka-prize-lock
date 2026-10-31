# Prize Lock V1/V2 — sabah karşılaştırması

Kontrol: 31.10.2026 04:42:30 Europe/Berlin. [V1](http://localhost:3105/) · [V2](http://localhost:3105/next). Sunucu 3105 açık. [Repo](https://github.com/ABerkeBora/heka-prize-lock/tree/codex/next); `v1-baseline`=7ef30b375ea02b84736d5a39654cb7cec7866b4b, V2 branch=`codex/next`.

**V1'i sunmayı öneriyorum:** gerçek veri ücreti, payout ve dört ret uçtan uca tamam. V2 önceden fonlanan gerçek gelecek maçla müşteri değerini artırıyor; canlı terminal sonuç henüz yok. V2'yi ek ekran olarak gösterin. Demo riski: düşük.

V2 farkları: imzalı `not_started`+nullsonuç ile fonlama; sabit schedule/finality/refund; ayrı API, storage ve executor. Maç 1713127, ZANSIDE GAMING–O2 Blast, bugün 07:00 Berlin. 0.0001 test ETH sözleşmede korunuyor. Agent 0.01 test aUSD veri aldı, `Waiting` kararı verdi. Canlı payout/refund **PENDING**; V1 ödemesi V2 sonucu sayılmadı.

Kanıtlar:`evidence/v2/funding.json`, `waiting.json`, `live-tamper-checks.json`, `chain-verification.json`, `runtime-comparison.json`, `browser-qa.json`.33 uygulama +61 contract testi, build/typecheck ve 1440/768/390px QA PASS; V1 kaynak/kanıt/state korunuyor. Bilinen ilk test hatası ve gas-rejected intent arşivlenip düzeltildi.

**Sabah tek küçük adım:** 08:30 Berlin sonrası `/next` Refresh ile sınırlı keeper sonucunu incele (~1 dk). Üç monitoring çağrısı ve tek terminal eylem sınırı, 15:10 refund,16:10 expiry sabittir; otomatik top-up yok. Video/Devfolio ayrıca PENDING. Maçı beklemek için Goal açık tutulmayacak.
