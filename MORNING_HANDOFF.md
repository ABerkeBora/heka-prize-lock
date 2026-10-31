# Prize Lock — sabah inceleme notu

**İncelemeye hazır — 31.10.2026 03:57 Europe/Berlin.** Yerel ürün ve public kaynak teslim edildi. API3 çekirdek entegrasyonu gerçek ücret/payout/revert kanıtlarıyla çalışıyor. Yarışma gönderimi ve video kaydı henüz yapılmadı; tüm teslim şartları tamamlandı iddiası yok.

## Aç ve incele

- Çalışan adres: [Prize Lock](http://127.0.0.1:3105). Sunucu 127.0.0.1:3105 üzerinde açık bırakıldı.
- Public repo: [ABerkeBora/heka-prize-lock](https://github.com/ABerkeBora/heka-prize-lock), varsayılan branch `codex/build`.
- Bağımsız kurulum: `npm ci`, `forge build`, `npm run build`, `npm start`. Node 22.18+ ve Foundry. README'de tüm adımlar var; parent Heka dosyalarına bağımlılık yok.
- Anahtar olmadan public kanıt ve canlı zincir durumu incelenir; ekonomik kontroller kapalıdır. Yeni akış yalnız ignored 0600 test wallet dosyası ve `.env` ile açılır. Mevcut yerel erişim ayarlı; anahtarları dokümana koyma.
- Yeni senaryo: `npm run setup` → isteğe bağlı `npm run tamper -- --live` → `npm run agent`. Son adım bir kez mandate kaydeder ve API ücreti/payout'u otomatik tamamlar. Aktif bekleme durumu sunucudaki bounded keeper tarafından sürdürülür.
- `npm run agent -- --resume` tamamlanmış işi uzlaştırır; tekrar ücret veya payout üretmez. Jüri: Proof bench editörü veya `npm run submit-proof -- response.json`. Kaydedilmiş120 s'den eski proof doğal olarak reddedilir.

## Gerçek çalışan akış

Maç 1772358, Team Synapse–New Growth, 2–0. Sonucu önceden bilinen gerçek PandaScore kaydıdır. Takım ödeme adresleri izole test cüzdanlarıdır; gerçek takımları temsil etmez.

Organizatör100000000000000 wei/0.0001 test ETH ödülü fonladı. Agent ilk bounded yetkiden sonra 0.01 test aUSD ödeyerek getMatch verisini satın aldı. Contract sabit signer, tam istek, freshness ve finality kontrolünden sonra agent'ın gönderdiği işlemle sabit kazanana gerçek ödülü aktardı. Ödül, veri ücreti ve gas ayrı kaydedildi.

| Kanıt | Konum |
| --- | --- |
| Güncel contract/deploy | [0x1ecea4…c502](https://sepolia.basescan.org/address/0x1ecea4fec536541e494fbf48c3296b10ce7dc502), `evidence/deployment.json` |
| Ödül fonlama | [0x0307e0…](https://sepolia.basescan.org/tx/0x0307e0572cfdd3ec0fb99569c07887a479688a9c919b998d657e2bb5f14b24c6) |
| Agent veri ücreti | [0xec7440…](https://sepolia.basescan.org/tx/0xec74409792c2c1b1e12855f41da1692d5727b4e3849bd45bf61660905f6589a3), `evidence/prize-2-treasury-observation-1.json` |
| Agent payout/alıcıda100000000000000 wei artış | [0x0b2be2…](https://sepolia.basescan.org/tx/0x0b2be2f04133ec2131040e26828101f600aaa7cc49eb30ed5e9f6a32398299f3), `evidence/payout.json` |
| Dört gerçek revert ve değişmeyen fonlu ödül | `evidence/live-tamper-checks.json` |
| Duplicate/bütçe/yanlış alıcı engeli; nonce/spend değişmedi | `evidence/agent-safety.json` |
| Kaynak runtime+metadata eşleşmesi, tüm immutable getter ve receipt doğrulaması | `evidence/runtime-comparison.json`, `evidence/chain-verification.json` |
| Üç boyutta gerçek ekran | `evidence/screenshots`, `evidence/browser-qa.json` |
| Public clone/commit kimliği | `evidence/clean-clone.json`; GitHub author ve committer ABerkeBora olarak eşlendi |

İlk havuzun geçmişi `evidence/prize-1-*` altında korunur. Güncel kaynakla tam metadata eşleşmesi ikinci havuza aittir. Yeni scenario kimlikleri benzersizdir; arşiv transaction'ları sıfırlanmaz.

## Yapılan kontroller

- **PASS:** production build ve strict frontend TypeScript.
- **PASS:**18 executor/state testi;27 contract testi. Gerçek PandaScore imzası, dört tamper, gelecekteki/eski source zamanı, null/nonfinal/bilinmeyen/fractional winner, fonlama, refund/grace/replay/failed-transfer ve restart uzlaştırması dahil.
- **PASS:** GitHub'dan temiz clone içinde `npm ci`, build,18+27test ve wallet olmadan canlı zincir görünümü. Dependency audit0 vulnerability.
- **PASS:**1440/768/390 px gerçek CUA browser walkthrough; taşma yok, telefon butonları44 px; loading, bağlantı hatası/kurtarma, edited proof ve malformed editor kontrol edildi. Ekonomik işlemler CLI'da yürütüldü, tarayıcı proof kontrolleri read-only.
- **PASS:** TasteSkill lint0 FAIL/1 WARN; eksik veri tireleri bilerek korundu. Ayrı inspect.mjs yerine bu oturumun izinli CUA yolu kullanıldı; iki ince DOM ölçümü sonuçsuzdu, otomatik PASS iddiası yok. Görseller ayrıca açılıp incelendi.
- **PASS:** kaynak/publish ağacı gerçek wallet key'leri ve token kalıplarına karşı tarandı; `.env`, `.local`, node_modules ve hassas raw authorization/transaction dosyaları public değil.
- **PASS:** resmi API3 ve genel sayfa03:54 Europe/Berlin tekrar kontrol edildi; TRACK_REQUIREMENTS güncel. Yayınlanan son saat31 Ekim 15:00.

## Güven ve sınırlar

Contract ödülü, sabit signer/istek/alıcıları, iki zaman kontrolünü ve tek terminal payout/refund'u enforce eder. API/gas/tool/expiry sınırları yerel executor kontrolleridir; on-chain session-key platformu değildir. Agent deterministiktir; runtime LLM iddiası yok. Model anahtar görmez.

Mandate:3 API çağrısı,10000/30000 aUSD base unit, tek payout,30 dakika,60 s polling; gas bütçesi ve rollup payı ayrı kayıtlıdır. Gas rezervi uygulama tahminidir. Başarıyla harcanan dış API ücreti veya revert gas'ı sonradan geri dönmüş sayılmaz. Belirsiz authorization ikinci ücret yaratmadan durur. `.local/` silinmemeli; process restart test edildi, güç kesintisinde fsync garantisi iddia edilmiyor.

Envelope 120 s, finality 60 s. Sabit tarih aralığı historical source gözlemi içindir; yeni imza eski kaydı yeni yapmaz. Eksik/null/iptal/ertelenmiş sonuç payout yapamaz. Deadline sonrası600 s grace sonunda yalnız sabit organizatöre refund açılır. **Canlı timeout refund yapılmadı**; contract testleri PASS. API3 imzası PandaScore gözleminin kaynağını/bütünlüğünü doğrular; gerçek maç gerçeği, sağlayıcı düzeltmeleri ve itirazlar ayrıca güven riskidir.

## Sabah kalanları

| Öncelik | İş | Süre / etki |
| --- | --- | --- |
| 1 | PRESENTATION.md akışıyla en fazla2.5 dakikalık video kaydet |15–25 dk; genel ve track video şartı PENDING |
| 1 | Kullanıcı başvuru taslağını sonlandırıp Devfolio'ya göndersin |5–10 dk; submission PENDING, otomatik gönderim yapılmadı |
| 1 | Takımın hangi ürünü göndereceğini seç | Resmi kural takım başına tek submission; ayrı repolar yedi başvuru izni değildir |
| 2 | İstenirse yeni fonlu senaryoyu canlı tekrarla |3–8 dk ve test fonları; mevcut gerçek kanıtlar hazır |

Hosted deployment kapsam dışıdır. Çekirdek ürün hazırdır; video/Devfolio tamamlanmadan tam yarışma teslimi PASS sayılmamalıdır.
