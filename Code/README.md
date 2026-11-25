# Gembird Stanje (Marketplace Chrome Extension)

Chrome ekstenzija (Manifest V3) koja automatski prepoznaje EAN kodove artikala na različitim e-commerce / marketplace portalima (**Ananas, Bazzar, Planeta Sport, Shoppster**), u pozadini proverava dostupnost i podatke na sajtu `gembird.rs` i prikazuje informativni boks direktno na stranici.

Nastala je kao proširenje prvobitne ekstenzije za KupujemProdajem sa ciljem da se ubrza svakodnevna provera artikala i obrada porudžbina (ušteda od najmanje ~30 sekundi po porudžbini u odnosu na ručno kopiranje EAN koda i pretragu).

## Šta ekstenzija radi

* **Automatsko prepoznavanje EAN koda** na stranicama porudžbina i štampanim pregledima (npr. *Picking Slip* u *about:blank* prozoru kod Shoppstera).
* **Pozadinski upit ka `gembird.rs`** preko Service Worker-a (`background.js`) uz keširanje rezultata po EAN kodu kako se ne bi slali dupli zahtevi.
* **Pregledan informativni boks** sa:
  * statusom i količinom na stanju (uz različite boje u zavisnosti od dostupnosti ili ako artikal nije u ponudi)
  * cenom i nazivom artikla
  * mestom pakovanja (na podržanom prikazu)
* **Prilagođavanje štampe (`@media print`)** da boks bude čitljiv i na crno-belom štampaču.

## Struktura projekta

* `manifest.json` — konfiguracija Manifest V3, dozvole i `content_scripts` pravila
* `background.js` — Service Worker koji izvršava `fetch` ka `gembird.rs` i vraća rezultat content skripti
* `content.js` — skeniranje DOM-a, praćenje dinamičkih promena (`MutationObserver`), parsiranje odgovora i iscrtavanje oznaka
* `icons/` — ikonice ekstenzije (`icon.svg`, `icon16.png`, `icon32.png`, `icon48.png`, `icon128.png`)
* `screenshots/` — slike rada ekstenzije na različitim portalima

## Lokalna instalacija (Developer Mode)

1. Otvori `chrome://extensions` u Google Chrome pregledaču.
2. Uključi **Developer mode** (gore desno).
3. Klikni na **Load unpacked** i izaberi folder projekta.

## Napomene

* Ekstenzija se oslanja na trenutnu HTML strukturu ciljanih stranica i `gembird.rs`, pa promene na tim sajtovima mogu zahtevati prilagođavanje selektora.
* Pre javnog objavljivanja proveri da u fajlovima i slikama nema osetljivih podataka.