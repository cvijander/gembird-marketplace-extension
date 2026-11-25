// Pozadina: radi fetch ka gembird.rs i vraća HTML content skripti
chrome.runtime.onMessage.addListener((poruka, posiljalac, odgovori) => {
  if (poruka.action !== 'proveriGembird') return;
  if (!poruka.url || !poruka.url.startsWith('https://www.gembird.rs/')) {
    odgovori({ success: false, error: 'Nedozvoljen URL' });
    return;
  }
  fetch(poruka.url)
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
    .then(data => odgovori({ success: true, data }))
    .catch(e => odgovori({ success: false, error: String(e) }));
  return true; // odgovor stiže asinhrono
});
