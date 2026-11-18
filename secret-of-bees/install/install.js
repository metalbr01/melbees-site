// Fixed destinations only. Query parameters never choose a redirect target.
(function () {
  'use strict';
  var ua = navigator.userAgent || '';
  var ipad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  var destination = 'https://melbees.games/secret-of-bees/';
  if (!ipad && /iPhone/.test(ua)) {
    destination = 'https://apps.apple.com/app/id6824653080?ct=diario';
  } else if (!ipad && /Android/.test(ua)) {
    destination = 'https://play.google.com/store/apps/details?id=com.melbees.secretofbees&utm_source=diario&utm_campaign=qr';
  }
  location.replace(destination);
})();
