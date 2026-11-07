/* Preserve complete campaign queries on internal navigation, including cid-only visits. */
(function () {
  document.addEventListener('DOMContentLoaded', function () {
    if (!location.search) return;
    var received = new URLSearchParams(location.search);
    var links = document.querySelectorAll('a.keep-src');
    for (var i = 0; i < links.length; i++) {
      var url = new URL(links[i].getAttribute('href'), location.href);
      if (url.origin !== location.origin) continue;
      received.forEach(function (value, key) { url.searchParams.set(key, value); });
      links[i].setAttribute('href', url.pathname + url.search + url.hash);
    }
    // play.js retains precedence for its source/campaign-derived Microsoft cid.
    var cid = received.get('cid');
    if (!cid || !/^[a-z0-9_-]{1,80}$/i.test(cid)) return;
    function valid(key) { return /^[a-z0-9_-]{1,40}$/i.test(received.get(key) || ''); }
    if (['s', 'utm_source', 'c', 'utm_campaign'].some(valid)) return;
    var stores = document.querySelectorAll('a.msstore, a.msstore-id');
    for (var j = 0; j < stores.length; j++) {
      var store = new URL(stores[j].getAttribute('href'));
      store.searchParams.set('cid', cid);
      stores[j].setAttribute('href', store.href);
    }
  });
})();
