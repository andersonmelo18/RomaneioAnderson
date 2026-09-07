/* ======================================================================
   SPX.fetchRoadRoute — busca, no OSRM (serviço público gratuito, o mesmo
   motor de rotas usado por vários apps de entrega), a geometria da linha
   seguindo as ruas de verdade, na ordem de visita já definida.

   Isso NUNCA decide a ordem das paradas (isso é o optimizer.js) — só pega
   a sequência pronta e desenha a linha certa entre um ponto e outro, em
   vez de uma linha reta cortando quarteirão.

   Se falhar por qualquer motivo (sem internet, servidor fora do ar, rota
   grande demais, CORS bloqueado), devolve null. Quem chamou continua com
   a linha reta que já tinha desenhado — a tela nunca trava esperando isso.
====================================================================== */
(function (SPX) {
  'use strict';

  var OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving/';
  var TIMEOUT_MS = 15000;
  /* Acima disso o pedido (URL + processamento) fica grande demais para o
     serviço público de demonstração — melhor nem tentar e já ficar na
     linha reta do que esperar um erro. */
  var MAX_POINTS = 300;

  function fetchRoadRoute(points) {
    if (!points || points.length < 2 || points.length > MAX_POINTS || typeof fetch !== 'function') {
      return Promise.resolve(null);
    }
    var coords = points
      .map(function (p) { return p.lon + ',' + p.lat; })
      .join(';');
    var url = OSRM_BASE + coords + '?overview=full&geometries=geojson';

    var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, TIMEOUT_MS) : null;

    return fetch(url, controller ? { signal: controller.signal } : {})
      .then(function (res) {
        if (timer) clearTimeout(timer);
        if (!res.ok) return null;
        return res.json();
      })
      .then(function (data) {
        if (!data || data.code !== 'Ok' || !data.routes || !data.routes[0] || !data.routes[0].geometry) return null;
        var raw = data.routes[0].geometry.coordinates || [];
        if (raw.length < 2) return null;
        return raw.map(function (c) { return { lat: c[1], lon: c[0] }; });
      })
      .catch(function () {
        if (timer) clearTimeout(timer);
        return null; // sem internet, servidor fora do ar, CORS bloqueado etc.
      });
  }

  SPX.fetchRoadRoute = fetchRoadRoute;
})(window.SPX = window.SPX || {});
