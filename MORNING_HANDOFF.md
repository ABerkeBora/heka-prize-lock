# Prize Lock — sabah inceleme notu

31 Ekim 2026, Europe/Berlin. Bu not gerçek zincir kanıtlarına dayanır; son browser QA, public repo ve finish-gate durumu koordinatör tarafından aşağıdaki açık maddelerde tamamlanmalıdır. Video kaydı veya yarışma gönderimi yapılmış değildir.

## Çalışan çekirdek

- Yerel ürün: http://127.0.0.1:3105 . `npm ci`, `forge build`, `npm run build`, `npm start`.
- Base Sepolia üzerinde tek maç, iki sabit test alıcısı, tam fonlanan `0.0001 test ETH` ödül ve bounded treasury executor.
- Bir kez verilen mandate sonrası agent gerçek PandaScore `getMatch` verisini x402 ile `0.01 test aUSD` karşılığında aldı, native API3 proof kontrolünü geçirdi ve sabit kazanan cüzdanına gerçek payout başlattı.
- Gerçek veri: maç `1772358`, Team Synapse–New Growth, 2–0. Bu önceden bilinen sonuç testidir; test cüzdanları takımları temsil etmez.
- Geçerli sonucun yanında dört zorunlu tamper durumu fonlu havuzda gerçek revert verdi; protected state ve ödül değişmedi. Replay ve hatalı policy/ödeme durumları testlerle korunuyor.

## İnceleme ve kanıt

| Kanıt | Konum |
| --- | --- |
| Güncel contract ve değişmez politika | [0x1ecea4…c502](https://sepolia.basescan.org/address/0x1ecea4fec536541e494fbf48c3296b10ce7dc502), `evidence/deployment.json` |
| Ödül fonlama | [0x0307e0…](https://sepolia.basescan.org/tx/0x0307e0572cfdd3ec0fb99569c07887a479688a9c919b998d657e2bb5f14b24c6) |
| Agent veri ücreti | [0xec7440…](https://sepolia.basescan.org/tx/0xec74409792c2c1b1e12855f41da1692d5727b4e3849bd45bf61660905f6589a3), `evidence/prize-2-treasury-observation-1.json` |
| Agent payout ve alıcıdaki 100000000000000 wei artış | [0x0b2be2…](https://sepolia.basescan.org/tx/0x0b2be2f04133ec2131040e26828101f600aaa7cc49eb30ed5e9f6a32398299f3), `evidence/payout.json` |
| Dört gerçek revert ve değişmeyen fonlar | `evidence/live-tamper-checks.json` |
| Artifact/deployed runtime+metadata eşleşmesi | `evidence/runtime-comparison.json` |
| İlk havuzun korunan geçmişi | `evidence/prize-1-*.json` |

Sadece incelemek için wallet gerekmez. Taze clone, arşiv kanıtlarını okur ve public RPC ile zincir durumunu doğrular. Yeni işlem için ignored `0600` wallet dosyası ve `.env` gerekir; yalnız `testOnly=true`, `chainId=84532` ve `deployer/buyer/counterparty` rolleri kabul edilir. Gerçek anahtar dokümanlarda veya public repoda bulunmamalıdır.

Yeni akış: `npm run setup` → isteğe bağlı `npm run tamper -- --live` → `npm run agent`. Son komut ilk mandate'i kaydedip veri satın alma ve payout'u yürütür. `npm run agent -- --resume` tamamlanmış işi uzlaştırır; tekrar ücret/payout üretmemelidir. Jury envelope testi: `npm run submit-proof -- response.json`; gerçek gönderim için `--broadcast`. Kaydedilmiş envelope 120 saniyeyi geçtiğinde doğal olarak stale olur; replay'i başarıyla tekrar ödeme diye göstermeyin.

## Kontroller

- **PASS:** `forge test -vv`, 27 test: gerçek PandaScore imzası dahil dört tamper kategorisi, iki takım, fractional ID, fonlama, finality/source time, refund, replay ve transfer rollback.
- **PASS:** güncel contract için normalize runtime ve metadata eşleşmesi; `node contracts/compare-runtime.mjs <address>` ile tekrarlanabilir.
- **PASS:** canlı veri ücreti, fonlama ve payout receipt'leri; payout sonrası sözleşme terminal `Paid`, prize bakiyesi sıfır.
- **PASS:** dört canlı revert sırasında fonlu sözleşmede ödül değişmedi.
- **PENDING:** backend testlerinin son sayısı ve production build çıktısı koordinatör tarafından kaydedilecek.
- **PENDING:** son desktop/tablet/phone browser QA ve ekran görüntüleri koordinatör tarafından kaydedilecek.
- **PENDING:** public repo oluşturma/push, doğru GitHub commit kimliği ve son secret kontrolü koordinatör tarafından doğrulanacak.
- **PENDING:** resmi API3/genel teslim finish-gate yeniden kontrol zamanı ve `TRACK_REQUIREMENTS.md` uzlaştırması.

## Güven ve kapsam sınırları

Contract ödül miktarını, signer'ı, tam isteği, sabit alıcıları, freshness/finality ve tek terminal transferi enforce eder. Kaynak `modifiedAt` ve envelope zamanı ayrı doğrulanır; imzalı eski kaynak gözlemi taze veri diye sunulmaz. Sabit historical source observation aralığı deploy sırasında belirlenmiştir.

API/gas bütçesi ve tool/expiry sınırları yerel executor kontrolüdür; on-chain session key sistemi değildir. Agent deterministiktir, runtime LLM kullanımı iddia edilmiyor. Üç çağrı/tek payout, çağrı başı `10000`, toplam `30000` aUSD base unit; 30 dakika expiry ve 60 saniye polling. Ödül, veri ücreti ve gas ayrıdır. Başarılı dış veri ücreti veya revert gas'ı sonraki hatada geri alınmış sayılmaz.

Eksik/null/belirsiz/ertelenmiş/iptal sonuç ödülü açmaz. Settlement deadline sonrasında yeni payout kabul edilmez; **600 saniyelik grace** sonunda yalnız sabit organizatöre refund açılır. Envelope freshness **120 saniye**, finality beklemesi **60 saniye**. Canlı timeout refund işlemi yapılmadı; yerel contract testleri var.

API3 imzası PandaScore kaynağının tam soruya verdiği cevabı doğrular; sağlayıcının hatasızlığını, gerçek maç gerçeğini veya sonradan düzeltme olmayacağını garanti etmez. Mevcut bilinen sonuç senaryosu, canlı turnuva politikası için tek başına yeterli değildir. İlk havuz korunur; güncel kaynak eşleşmesinin kanıtı ikinci havuzadır.

## Öncelikli kalanlar

| Öncelik | İş | Tahmini süre / etki |
| --- | --- | --- |
| 1 | Son build/backend/browser QA çıktısını ve repo push'unu bu nota işle | Devam eden çalışma; teslim doğruluğu |
| 1 | Resmi track/genel kuralları yeniden aç, mandatory satırları kanıta bağla | 5–10 dk; qualification durumu |
| 2 | `PRESENTATION.md` akışıyla en fazla 2,5 dakikalık gerçek video kaydet | 15–25 dk; genel teslim şartı **PENDING** |
| 2 | İngilizce başvuru taslağını gözden geçirip kullanıcı tarafından Devfolio'ya gönder | 5–10 dk; gönderim **PENDING** |
| 3 | İsteğe bağlı yeni funded havuzla kısa canlı tekrar gösterimi | 3–8 dk + test gas/aUSD; mevcut kanıtın yerine gerekmez |

Resmi yayımlanmış son saat 31 Ekim 2026 15.00 Europe/Berlin; gönderim öncesi tekrar doğrulanmalı. Video ve başvuru tamamlanmadan tüm teslim şartları PASS olarak anlatılmamalıdır. Hosted deployment kapsam dışıdır.
