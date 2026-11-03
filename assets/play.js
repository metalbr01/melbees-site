/* Store buttons and the Daily's buttons (#589). LIVE = false hides every Google Play button (the listing is public
   since 2026-10-06).
   Links carry the visitor's origin: ?s=instagram (or utm_source=...), ?m= (utm_medium) and ?c= (utm_campaign).
   - Play: the referrer becomes utm_source=instagram..., so the Play Console's UTM report credits the channel.
   - Microsoft Store: cid=<s>_<c> (campaign id in Partner Center), cid=<s> with no c; the page's own cid
     (cid=site) when the visit brought nothing.
   - The Daily (every a[href^="https://diario."] and a[href^="https://daily."]): the received utm_* (utm_content
     too) are added to the link, so the Daily's GA4 credits the channel and not a bare melbees.games referrer. A visit
     that brought nothing gets utm_source=site&utm_medium=web&utm_campaign=botao_site. The link keeps its own query
     (?lang=es): a received key replaces the link's, a default fills only a key the link lacks, no key twice. */
(function () {
  var LIVE = true;
  var d = document.documentElement;
  if (!LIVE) d.className += " play-soon";
  var TAGS = ["utm_source", "utm_medium", "utm_campaign", "utm_content"];
  function clean(v) { return v && /^[a-z0-9_-]{1,40}$/i.test(v) ? v.toLowerCase() : null; }
  function arg(q, a, b) {
    var m = q.match(new RegExp("[?&](?:" + a + "|" + b + ")=([^&#]*)"));
    if (!m) return null;
    try { return clean(decodeURIComponent(m[1])); } catch (e) { return null; }
  }
  // href with the tags merged into its query: got[k] replaces the link's k, def[k] fills a k the link lacks.
  function tagged(href, got, def) {
    var h = href.indexOf("#"), hash = h < 0 ? "" : href.slice(h), u = h < 0 ? href : href.slice(0, h);
    var i = u.indexOf("?"), base = i < 0 ? u : u.slice(0, i), parts = i < 0 ? [] : u.slice(i + 1).split("&");
    var out = [], seen = {};
    for (var p = 0; p < parts.length; p++) {
      if (!parts[p]) continue;
      var k = parts[p].split("=")[0];
      if (TAGS.indexOf(k) < 0) { out.push(parts[p]); continue; }
      if (seen[k]) continue;
      seen[k] = true;
      out.push(got[k] ? k + "=" + got[k] : parts[p]);
    }
    for (var t = 0; t < TAGS.length; t++) {
      var key = TAGS[t], v = got[key] || def[key];
      if (!seen[key] && v) out.push(key + "=" + v);
    }
    return base + (out.length ? "?" + out.join("&") : "") + hash;
  }
  document.addEventListener("DOMContentLoaded", function () {
    var q = location.search || "";
    var src = arg(q, "s", "utm_source"), med = arg(q, "m", "utm_medium"), cam = arg(q, "c", "utm_campaign");
    var ct = arg(q, "utm_content", "utm_content");
    var got = { utm_source: src, utm_medium: med, utm_campaign: cam, utm_content: ct };
    var def = { utm_source: "site", utm_medium: src ? "social" : "web", utm_campaign: "botao_site" };
    var daily = document.querySelectorAll('a[href^="https://diario."], a[href^="https://daily."]');
    for (var n = 0; n < daily.length; n++) {
      daily[n].setAttribute("href", tagged(daily[n].getAttribute("href"), got, def));
    }
    if (!src && !med && !cam && !ct) return;
    var inner = document.querySelectorAll("a.keep-src");
    for (var j = 0; j < inner.length; j++) {
      var h = inner[j].getAttribute("href");
      if (h && h.indexOf("?") < 0) inner[j].setAttribute("href", h + q);
    }
    if (!src && !med && !cam) return;
    var ref = "utm_source=" + (src || "site") + "&utm_medium=" + (med || (src ? "social" : "web")) + "&utm_campaign=" + (cam || "portas_abertas");
    var links = document.querySelectorAll("a.play");
    for (var i = 0; i < links.length; i++) {
      links[i].href = "https://play.google.com/store/apps/details?id=com.melbees.secretofbees&referrer=" + encodeURIComponent(ref);
    }
    var ms = document.querySelectorAll("a.msstore, a.msstore-id");
    for (var k = 0; k < ms.length; k++) {
      ms[k].href = "https://apps.microsoft.com/detail/9N72MD72DQBP?cid=" + (src || "site") + (cam ? "_" + cam : "");
    }
  });
})();
