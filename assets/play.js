/* Store buttons. LIVE = false hides every Google Play button (the listing is public since 2026-10-06).
   Links carry the visitor's origin into the Play referrer: ?s=instagram (or utm_source=...) becomes
   utm_source=instagram, so the Play Console's UTM report credits the channel that sent the visit; the same
   channel becomes the Microsoft Store link's cid (campaign id in Partner Center), cid=site by default. */
(function () {
  var LIVE = true;
  var d = document.documentElement;
  if (!LIVE) d.className += " play-soon";
  function clean(v) { return v && /^[a-z0-9_-]{1,40}$/i.test(v) ? v.toLowerCase() : null; }
  function arg(q, a, b) { var m = q.match(new RegExp("[?&](?:" + a + "|" + b + ")=([^&#]*)")); return m ? clean(decodeURIComponent(m[1])) : null; }
  document.addEventListener("DOMContentLoaded", function () {
    var q = location.search || "";
    var src = arg(q, "s", "utm_source"), med = arg(q, "m", "utm_medium"), cam = arg(q, "c", "utm_campaign");
    if (!src && !med && !cam) return;
    var ref = "utm_source=" + (src || "site") + "&utm_medium=" + (med || (src ? "social" : "web")) + "&utm_campaign=" + (cam || "portas_abertas");
    var links = document.querySelectorAll("a.play");
    for (var i = 0; i < links.length; i++) {
      links[i].href = "https://play.google.com/store/apps/details?id=com.melbees.secretofbees&referrer=" + encodeURIComponent(ref);
    }
    var ms = document.querySelectorAll("a.msstore, a.msstore-id");
    for (var k = 0; k < ms.length; k++) {
      ms[k].href = "https://apps.microsoft.com/detail/9N72MD72DQBP?cid=" + (src || "site");
    }
    var inner = document.querySelectorAll("a.keep-src");
    for (var j = 0; j < inner.length; j++) {
      var h = inner[j].getAttribute("href");
      if (h && h.indexOf("?") < 0) inner[j].setAttribute("href", h + q);
    }
  });
})();
