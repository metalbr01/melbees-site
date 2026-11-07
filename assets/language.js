/* A URL always keeps its own language. Preferences only offer another URL. */
(function () {
  var current = document.documentElement.getAttribute('data-idioma');
  var links = document.querySelectorAll('.langs a[data-idioma]');
  var routes = {};
  var names = { pt: 'Continuar em português', en: 'Continue in English', es: 'Continuar en español', fr: 'Continuer en français' };
  var q = new URLSearchParams(location.search);
  function language(value) {
    var code = String(value || '').toLowerCase().split(/[-_]/)[0];
    return /^(pt|en|es|fr)$/.test(code) ? code : null;
  }
  function destination(path, chosen) {
    var url = new URL(path, location.href);
    url.search = location.search;
    url.hash = location.hash;
    // Keep the legacy parameter consistent with the explicitly chosen URL.
    if (url.searchParams.has('lang')) url.searchParams.set('lang', chosen);
    return url.pathname + url.search + url.hash;
  }
  for (var i = 0; i < links.length; i++) {
    var a = links[i];
    var code = a.getAttribute('data-idioma');
    routes[code] = a.getAttribute('href');
    a.setAttribute('href', destination(routes[code], code));
    a.addEventListener('click', function () {
      try { localStorage.setItem('melbees-lang', this.getAttribute('data-idioma')); } catch (e) {}
    });
  }
  var preferred = language(q.get('lang'));
  if (!preferred) { try { preferred = language(localStorage.getItem('melbees-lang')); } catch (e) {} }
  if (!preferred) {
    var browserLanguages = navigator.languages || [navigator.language];
    for (var j = 0; j < browserLanguages.length && !preferred; j++) preferred = language(browserLanguages[j]);
  }
  if (!preferred || preferred === current || !routes[preferred]) return;
  var key = 'melbees-dismiss-' + current + '-' + preferred;
  try { if (sessionStorage.getItem(key)) return; } catch (e) {}
  var banner = document.getElementById('language-suggestion');
  var suggestion = document.getElementById('language-suggestion-link');
  suggestion.setAttribute('href', destination(routes[preferred], preferred));
  suggestion.textContent = names[preferred];
  suggestion.setAttribute('lang', preferred === 'pt' ? 'pt-BR' : preferred);
  document.getElementById('language-dismiss').addEventListener('click', function () {
    banner.hidden = true;
    try { sessionStorage.setItem(key, '1'); } catch (e) {}
  });
  banner.hidden = false;
})();
