// Pored svakog EAN-a na stranici prikazuje naziv, stanje i cenu sa gembird.rs
// Prepoznaje EAN koji stoji sam (Ananas, Shoppster) i oblik "EAN: 1234..." (Bazzar, KP)
(function () {
  // Na glavnom panelu Shoppstera ne radimo ništa, samo u prozoru Pick Slip (about:blank)
  if (location.hostname === 'backoffice.shoppster.com') return;

  // Zaštita: ako je skripta već ubačena u ovaj prozor, druga kopija ne radi ništa
  if (window.__gembirdStanjeAktivno) return;
  window.__gembirdStanjeAktivno = true;

  // Shoppster Pick Slip se otvara kao prazan prozor
  const JE_SLIP = location.href === 'about:blank';

  const cache = new Map(); // EAN -> Promise sa rezultatom
  const parser = new DOMParser();

  // Koliko je oznaka razmaknuta od EAN-a; na Ananasu je spuštena da ne prekrije naručenu količinu
  const RAZMAK_OD_EAN = location.hostname.includes('ananas') ? '100px' : '8px';

  // Mesto pakovanja se prikazuje samo na Ananas mportal-u
  // (da bi bilo i na wportal-u: location.hostname.includes('ananas'))
  const PRIKAZI_MESTO = location.hostname === 'mportal.svc.ananas.rs';

  // Planeta Sport: kolona EAN je uska, pa je oznaka sužena da ne prekrije Sliku i eSKU
  const SUZENA = location.hostname.includes('planeta.services');
  const SIRINA_SUZENE = '230px';
  const PRESKOCI = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT']);

  // Boje po količini (isto kao KP plugin):
  //   0 kom.             -> crveno
  //   1 do MALA_DO       -> žuto
  //   do SREDNJA_DO      -> svetlo zeleno
  //   više od SREDNJA_DO -> zeleno
  //   artikal ne postoji na gembird.rs -> sivo; tehnička greška -> narandžasto
  const MALA_DO = 5;
  const SREDNJA_DO = 10;
  const BOJE = {
    nema:        { bg: '#dc3545', tekst: '#fff' },
    mala:        { bg: '#ffc107', tekst: '#212529' },
    srednja:     { bg: '#a4c639', tekst: '#212529' },
    velika:      { bg: '#28a745', tekst: '#fff' },
    nijeUPonudi: { bg: '#adb5bd', tekst: '#212529' },
    greska:      { bg: '#fd7e14', tekst: '#212529' }
  };

  function oboji(badge, kljuc) {
    const b = BOJE[kljuc];
    badge.style.background = b.bg;
    badge.style.color = b.tekst;
    badge.classList.toggle('gembird-nema', kljuc === 'nema');
    badge.classList.toggle('gembird-nije-u-ponudi', kljuc === 'nijeUPonudi');
  }

  function posaljiPoruku(url) {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ action: 'proveriGembird', url }, odg => {
        if (chrome.runtime.lastError || !odg || !odg.success) resolve(null);
        else resolve(odg.data);
      });
    });
  }

  function ocisti(t) {
    return (t || '').replace(/\s+/g, ' ').trim();
  }

  function skratiNaziv(t) {
    return ocisti(t).replace(/\s*[-–|]\s*Gembird d\.?o\.?o\.?\s*$/i, '');
  }

  function procitajNaziv(doc) {
    const h1 = doc.querySelector('h1');
    if (h1 && ocisti(h1.textContent)) return skratiNaziv(h1.textContent);
    const title = doc.querySelector('title');
    return title ? skratiNaziv(title.textContent.split('|')[0]) : '';
  }

  function procitajPodatke(doc, rezervniNaziv) {
    const stanjeEl = doc.querySelector('.product-available-amount span');
    if (!stanjeEl) return null;
    const cenaEl = doc.querySelector('.product-preview-price-new') || doc.querySelector('.product-preview-price');
    // <li>Mesto pakovanja artikla: RA142, RA141, RA191</li>
    const mestoEl = [...doc.querySelectorAll('li')].find(li => /^\s*Mesto pakovanja/i.test(li.textContent));
    const mesto = mestoEl ? ocisti(mestoEl.textContent).replace(/^Mesto pakovanja( artikla)?:?\s*/i, '') : '';
    return {
      mesto,
      stanje: ocisti(stanjeEl.textContent),
      cena: cenaEl ? ocisti(cenaEl.textContent.replace('Cena:', '').replace(/"/g, '')) : 'nema cene',
      naziv: procitajNaziv(doc) || rezervniNaziv || ''
    };
  }

  async function proveriEan(ean) {
    const html = await posaljiPoruku(`https://www.gembird.rs/search/${ean}/0/0/false/0`);
    if (!html) return { greska: 'mrežna greška' };

    const doc = parser.parseFromString(html, 'text/html');
    const direktno = procitajPodatke(doc);
    if (direktno) return direktno;

    // Pretraga nije dala stanje -> nađi link ka artiklu i otvori ga
    const a = [...doc.querySelectorAll('a[href]')].find(x => {
      const h = x.getAttribute('href');
      return h.includes('/artikal/') || h.includes('/proizvod/') || h.includes('/product/');
    });
    if (!a) return { greska: 'artikal nije u ponudi na Gembirdu', nijeUPonudi: true };

    const href = a.getAttribute('href');
    const url = href.startsWith('http') ? href : 'https://www.gembird.rs' + href;
    const html2 = await posaljiPoruku(url);
    if (!html2) return { greska: 'greška pri otvaranju artikla' };

    return procitajPodatke(parser.parseFromString(html2, 'text/html'), ocisti(a.textContent))
      || { greska: 'nema info o količini' };
  }

  function prikazi(badge, r) {
    if (r.greska) {
      badge.textContent = (r.nijeUPonudi ? '⛔ ' : '⚠️ ') + r.greska;
      oboji(badge, r.nijeUPonudi ? 'nijeUPonudi' : 'greska');
      return;
    }
    const s = r.stanje.replace(/\s+/g, '').toLowerCase();
    const mnogo = s.includes('>') || s.includes('vise') || s.includes('više');
    const kolicina = parseInt(s.replace(/\D/g, ''), 10) || 0;
    const ima = mnogo || kolicina > 0;
    // "> 10" znači bar 11 komada
    const efektivno = mnogo ? kolicina + 1 : kolicina;

    badge.textContent = '';
    const red1 = document.createElement('div');
    const malo = ima && !mnogo && kolicina <= MALA_DO;
    red1.textContent = !ima
      ? `❌ Nema na stanju (0 kom.) | 💰 ${r.cena}`
      : malo
        ? `🟡 Malo na stanju: ${kolicina} kom. | 💰 ${r.cena}`
        : `✅ Stanje: ${mnogo ? r.stanje : kolicina + ' kom.'} | 💰 ${r.cena}`;
    red1.style.whiteSpace = SUZENA ? 'normal' : 'nowrap';
    badge.appendChild(red1);

    if (r.naziv) {
      const red2 = document.createElement('div');
      red2.textContent = '📦 ' + r.naziv;
      Object.assign(red2.style, { fontWeight: 'normal', fontSize: '13px', opacity: '0.95', marginTop: '4px' });
      badge.appendChild(red2);
    }
    if (PRIKAZI_MESTO) {
      const red3 = document.createElement('div');
      red3.className = 'gembird-mesto';
      red3.textContent = '📍 Mesto pakovanja: ' + (r.mesto || 'nema podatka');
      Object.assign(red3.style, { fontWeight: 'bold', fontSize: '13px', marginTop: '4px' });
      badge.appendChild(red3);
    }
    if (!ima) oboji(badge, 'nema');
    else if (!mnogo && efektivno <= MALA_DO) oboji(badge, 'mala');
    else if (efektivno <= SREDNJA_DO) oboji(badge, 'srednja');
    else oboji(badge, 'velika');
  }

  function napraviBadge() {
    const b = document.createElement('div');
    b.className = 'gembird-stanje';
    b.textContent = '⏳ Proveravam Gembird...';
    Object.assign(b.style, {
      display: 'block', boxSizing: 'border-box', width: 'max-content',
      minWidth: '320px', maxWidth: '460px', marginTop: RAZMAK_OD_EAN, padding: '8px 12px',
      borderRadius: '10px', background: '#343a40', color: '#fff',
      fontSize: '14px', fontWeight: 'bold', lineHeight: '1.45', textAlign: 'left',
      whiteSpace: 'normal', position: 'relative', zIndex: '10',
      boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
    });
    if (SUZENA) {
      Object.assign(b.style, { minWidth: '0', width: SIRINA_SUZENE, maxWidth: SIRINA_SUZENE });
    }
    return b;
  }

  // Pri štampi (crno-beli štampač): bela oznaka, crn tekst i debeo okvir;
  // kad artikla nema na stanju okvir je isprekidan. Na ekranu ostaju boje.
  function dodajStilZaStampu() {
    if (document.getElementById('gembird-stampa-css')) return;
    const st = document.createElement('style');
    st.id = 'gembird-stampa-css';
    st.textContent = `
      @media print {
        .gembird-stanje {
          background: #fff !important;
          color: #000 !important;
          border: 2px solid #000 !important;
          box-shadow: none !important;
        }
        .gembird-stanje.gembird-nema { border-style: dashed !important; }
        .gembird-stanje.gembird-nije-u-ponudi { border-style: dotted !important; }
        .gembird-stanje .gembird-mesto { font-size: 15px !important; }
      }`;
    (document.head || document.documentElement).appendChild(st);
  }

  // Tekst samog elementa, bez teksta njegove dece
  function sopstveniTekst(el) {
    return [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(' ').trim();
  }

  function nadjiEan(tekst) {
    const m = tekst.match(/^(\d{12,14})$/) || tekst.match(/EAN:?\s*(\d{12,14})\b/i);
    return m ? m[1] : null;
  }

  // Gde ide oznaka; vraća false ako oznaka za ovaj element/red već postoji
  function ubaciBadge(el, badge) {
    if (el.tagName === 'TD') {
      const tr = el.parentElement;
      if (JE_SLIP) {
        // Picking slip: oznaka ide u novi red ispod artikla, da ne razvuče usku kolonu
        if (tr.dataset.gembirdRed) return false;
        tr.dataset.gembirdRed = '1';
        const noviRed = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = tr.children.length;
        td.appendChild(badge);
        noviRed.appendChild(td);
        tr.insertAdjacentElement('afterend', noviRed);
      } else {
        if (el.querySelector(':scope > .gembird-stanje')) return false;
        el.appendChild(badge);
      }
    } else {
      const sledeci = el.nextElementSibling;
      if (sledeci && sledeci.classList.contains('gembird-stanje')) return false;
      el.insertAdjacentElement('afterend', badge);
    }
    return true;
  }

  function skeniraj() {
    if (!document.body) return;
    dodajStilZaStampu();
    document.body.querySelectorAll('*').forEach(el => {
      if (PRESKOCI.has(el.tagName) || el.dataset.gembirdObradjen || el.closest('.gembird-stanje')) return;
      const ean = nadjiEan(sopstveniTekst(el));
      if (!ean) return;

      el.dataset.gembirdObradjen = '1';

      // Isti EAN se u jednom redu tabele može pojaviti na dva mesta (npr. ispod slike i u koloni EAN).
      // Oznaku dobija samo prvo pojavljivanje u tom redu.
      const red = el.closest('tr, [role="row"], [class*="__row"]');
      if (red) {
        const videni = red.dataset.gembirdEan ? red.dataset.gembirdEan.split(',') : [];
        if (videni.includes(ean)) return;
        red.dataset.gembirdEan = [...videni, ean].join(',');
      }

      const badge = napraviBadge();
      if (!ubaciBadge(el, badge)) return;

      if (!cache.has(ean)) cache.set(ean, proveriEan(ean));
      cache.get(ean).then(r => prikazi(badge, r));
    });
  }

  // Paneli se učitavaju dinamički (a slip se upisuje u prazan prozor),
  // pa pratimo promene na celom dokumentu, ne samo na body-ju
  let tajmer;
  new MutationObserver(() => {
    clearTimeout(tajmer);
    tajmer = setTimeout(skeniraj, 300);
  }).observe(document, { childList: true, subtree: true });

  skeniraj();
})();
