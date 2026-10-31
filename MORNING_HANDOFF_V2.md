# Prize Lock — V1/V2 kısa karşılaştırma

[V1](http://localhost:3105/): **PASS**, gerçek payout tamam. `v1-baseline`: `7ef30b375ea02b84736d5a39654cb7cec7866b4b`.
[V2](http://localhost:3105/next): **Fonlu / Waiting**; canlı terminal PENDING. Doğrulanan uygulama commit’i `93aa5d19214d55bf5ece2036394506f241cb2af8`, [codex/next](https://github.com/ABerkeBora/heka-prize-lock/tree/codex/next).

Değişenler:

- İmzalı gelecek maçla sonuç öncesi fonlama.
- Sabit schedule, finality ve refund politikası.
- Ayrı API/state/executor; V1 kanıtları korundu.

**V1’i sunun.** Gerçek ödeme ve dört ret, jüriye en açık uçtan uca akışı gösteriyor. V2’yi ön fonlama ve bekleme değerini anlatan ek ekran olarak gösterin. Demo riski düşük.

Gerçek V2 maçı ZANSIDE GAMING–O2 Blast, bugün07:00Berlin.0.0001testETH korunuyor. Kanıtlar: `evidence/v2/funding.json`, `waiting.json`, `live-tamper-checks.json`, `chain-verification.json`, `browser-qa.json`.33uygulama+61contracttesti, build/typecheck, üç genişlik ve public-clone kontrolü PASS. Ayrıntılar README/CONTRACT_V2/TRACK_REQUIREMENTS_V2 dosyalarında.

Bekleyen: V2 canlı payout/refund, video ve Devfolio. Sabah tek küçük adım: **08:30Berlin sonrası Refresh** (~1dk). Keeper en çok3ücretli monitoring çağrısı ve tek terminal eylem yapar;15:10refund,16:10expiry sabit, top-up yok. Maç beklenerek Goal açık tutulmaz. Sunucu3105 erişilebilir bırakıldı.
