/* ======================================================================
   SPX.geocoder — descobre a coordenada de endereços que vieram sem ela.

   Regra de ouro deste arquivo: é melhor NÃO marcar um pino do que marcar no
   lugar errado. Todo resultado passa por um filtro de sanidade antes de virar
   pino no mapa — foi a falta desse filtro que fazia ruas diferentes caírem
   todas no mesmo ponto (o centro do bairro devolvido pelo serviço gratuito).
====================================================================== */
(function (SPX) {
  'use strict';

  var U = SPX.utils;

  /* Tipos de resultado que NÃO servem como endereço de entrega. */
  var REJECTED_TYPES = ['city', 'town', 'village', 'municipality', 'suburb', 'neighbourhood',
    'quarter', 'district', 'locality', 'county', 'state', 'region', 'administrative',
    'postcode', 'postal_code', 'island', 'hamlet'];

  function isRejectedType(type) {
    return REJECTED_TYPES.indexOf(String(type || '').toLowerCase()) !== -1;
  }

  /* -------------------- provedor gratuito: Nominatim -------------------- */
  function nominatimLookup(q) {
    var params = new URLSearchParams({
      format: 'json', limit: '1', countrycodes: 'br', addressdetails: '1',
      city: q.city || SPX.settings.get('city'),
      state: q.state || U.stateName(SPX.settings.get('state')),
      country: 'Brasil'
    });
    /* O Nominatim espera "número nome-da-rua" no campo street. */
    params.set('street', q.number ? (q.number + ' ' + q.street) : q.street);
    if (q.zip) params.set('postalcode', String(q.zip).replace(/[^0-9-]/g, ''));

    return fetchJson('https://nominatim.openstreetmap.org/search?' + params.toString())
      .then(function (data) {
        if (!data || !data.length) return null;
        var r = data[0];
        var addr = r.address || {};
        return {
          lat: parseFloat(r.lat),
          lon: parseFloat(r.lon),
          type: r.type,
          street: addr.road || addr.pedestrian || addr.footway || '',
          houseNumber: addr.house_number || '',
          neighborhood: addr.suburb || addr.neighbourhood || addr.quarter || addr.city_district || '',
          source: 'osm'
        };
      });
  }

  /* -------------------- provedor gratuito: Photon (reserva) -------------------- */
  function photonLookup(q, center) {
    var text = [q.number ? (q.street + ' ' + q.number) : q.street,
      q.city || SPX.settings.get('city'), q.state || U.stateName(SPX.settings.get('state'))].join(', ');
    var params = new URLSearchParams({ q: text, limit: '3', lang: 'pt' });
    if (center) { params.set('lat', String(center.lat)); params.set('lon', String(center.lon)); }

    return fetchJson('https://photon.komoot.io/api/?' + params.toString())
      .then(function (data) {
        if (!data || !data.features || !data.features.length) return null;
        var f = data.features.find(function (x) {
          return ['house', 'street'].indexOf(String(x.properties.type || '').toLowerCase()) !== -1;
        }) || data.features[0];
        var p = f.properties || {};
        return {
          lat: f.geometry.coordinates[1],
          lon: f.geometry.coordinates[0],
          type: p.type,
          street: p.street || p.name || '',
          houseNumber: p.housenumber || '',
          neighborhood: p.district || p.suburb || p.locality || '',
          source: 'osm'
        };
      });
  }

  function fetchJson(url) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 9000);
    return fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } })
      .then(function (res) { clearTimeout(timer); return res.ok ? res.json() : null; })
      .catch(function () { clearTimeout(timer); return null; });
  }

  /* -------------------- provedor Google (quando há chave) -------------------- */
  function googleLookup(q) {
    return new Promise(function (resolve) {
      var geocoder = new google.maps.Geocoder();
      var text = [q.number ? (q.street + ', ' + q.number) : q.street,
        q.neighborhood, q.city || SPX.settings.get('city'),
        q.state || SPX.settings.get('state'), 'Brasil'].filter(Boolean).join(', ');
      geocoder.geocode({
        address: text,
        region: 'br',
        componentRestrictions: { country: 'BR' }
      }, function (results, status) {
        if (status !== 'OK' || !results || !results.length) return resolve(null);
        var r = results[0];
        var loc = r.geometry.location;
        var comp = r.address_components || [];
        var route = (comp.find(function (c) { return c.types.indexOf('route') !== -1; }) || {}).long_name || '';
        var num = (comp.find(function (c) { return c.types.indexOf('street_number') !== -1; }) || {}).long_name || '';
        var lt = r.geometry.location_type;
        /* APPROXIMATE = centro de bairro/cidade: não serve como endereço. */
        if (lt === 'APPROXIMATE') return resolve(null);
        resolve({
          lat: loc.lat(), lon: loc.lng(),
          type: lt === 'GEOMETRIC_CENTER' ? 'street' : 'house',
          precision: (lt === 'ROOFTOP' || lt === 'RANGE_INTERPOLATED') ? 'exact' : 'approx',
          street: route, houseNumber: num, source: 'google'
        });
      });
    });
  }

  /* Carrega a API JavaScript do Google (a REST não pode ser chamada do navegador). */
  function ensureGoogle(key) {
    if (window.google && window.google.maps && window.google.maps.Geocoder) return Promise.resolve(true);
    if (SPX.loadGoogleMaps) return SPX.loadGoogleMaps(key).then(function () { return true; });
    return Promise.resolve(false);
  }

  /* Duas ruas de nomes iguais podem existir em bairros bem diferentes da
     mesma cidade (foi exatamente o caso relatado: endereço certo em Gramame,
     resultado devolvido numa rua de mesmo nome lá em Mangabeira). O raio a
     partir do centro da rota inteira é largo demais para pegar isso — por
     isso, além dele, exigimos que o resultado fique perto de pelo menos uma
     parada cuja localização já é conhecida (da planilha ou já confirmada). */
  var NEAREST_ANCHOR_MAX_KM = 8;

  function nearestAnchorKm(candidate, anchors) {
    if (!anchors || !anchors.length) return null;
    var best = Infinity;
    for (var i = 0; i < anchors.length; i++) {
      var d = U.haversine(anchors[i].lat, anchors[i].lon, candidate.lat, candidate.lon);
      if (d < best) best = d;
    }
    return best;
  }

  /* Centro (mediana) das âncoras que declaram o MESMO bairro da planilha —
     usado só como último recurso, quando a busca de verdade não achou nada.
     É seguro porque só usa pontos que a própria rota já confirmou. */
  function bairroCentroid(anchors, neighborhood) {
    var key = U.normalizeKey(neighborhood);
    if (!key) return null;
    var pts = anchors.filter(function (a) { return U.normalizeKey(a.neighborhood) === key; });
    if (!pts.length) return null;
    return { lat: U.median(pts.map(function (p) { return p.lat; })), lon: U.median(pts.map(function (p) { return p.lon; })) };
  }

  /* -------------------- filtro de sanidade -------------------- */
  function validate(candidate, query, center, maxKm, anchors) {
    if (!candidate || isNaN(candidate.lat) || isNaN(candidate.lon)) {
      return { ok: false, reason: 'sem resultado' };
    }
    if (isRejectedType(candidate.type)) {
      return { ok: false, reason: 'resultado é centro de bairro/cidade' };
    }
    if (candidate.street && U.streetSimilarity(query.street, candidate.street) < 0.5) {
      return { ok: false, reason: 'rua devolvida diferente da pedida' };
    }
    if (center) {
      var d = U.haversine(center.lat, center.lon, candidate.lat, candidate.lon);
      if (d > maxKm) return { ok: false, reason: 'fora do raio da rota (' + d.toFixed(1) + ' km)' };
    }
    var nearest = nearestAnchorKm(candidate, anchors);
    if (nearest !== null && nearest > NEAREST_ANCHOR_MAX_KM) {
      return { ok: false, reason: 'longe de qualquer parada já confirmada (' + nearest.toFixed(1) + ' km)' };
    }
    /* O nome do bairro que a planilha usa raramente bate 100% com o que o
       mapa devolve (a Shopee e o OpenStreetMap não dividem os bairros do
       mesmo jeito) — por isso só usamos isso como pista quando ainda não há
       NENHUMA parada confirmada por perto para servir de prova melhor. Uma
       vez que existe uma parada próxima confirmada, a proximidade vale mais
       do que o rótulo do bairro. */
    if (nearest === null && query.neighborhood && candidate.neighborhood &&
        U.streetSimilarity(query.neighborhood, candidate.neighborhood) === 0) {
      return { ok: false, reason: 'bairro devolvido (' + candidate.neighborhood + ') diferente do esperado' };
    }
    return { ok: true };
  }

  /* Centro de referência: mediana das paradas que já têm coordenada. */
  function referenceCenter(stops) {
    var lats = [], lons = [];
    stops.forEach(function (s) {
      if (s.lat !== null && s.lon !== null) { lats.push(s.lat); lons.push(s.lon); }
    });
    if (!lats.length) return null;
    return { lat: U.median(lats), lon: U.median(lons) };
  }

  /* Processa "items" com no máximo "limit" chamadas de "worker" em paralelo
     ao mesmo tempo — é isso que faz o mapa preencher com vários pinos de
     uma vez em vez de um por um. Nenhum provedor além do Nominatim exige
     esperar a vez; não tem por que tratar todo mundo como se exigisse. */
  function mapPool(items, limit, worker) {
    return new Promise(function (resolve) {
      if (!items.length) return resolve();
      var next = 0, done = 0;
      function runOne() {
        var i = next++;
        if (i >= items.length) return;
        Promise.resolve(worker(items[i], i)).catch(function () {}).then(function () {
          done++;
          if (done >= items.length) resolve();
          else runOne();
        });
      }
      for (var k = 0; k < Math.min(limit, items.length); k++) runOne();
    });
  }

  /* -------------------- rotina principal -------------------- */
  /* Busca a coordenada das paradas que estão sem. Agrupa por rua+número,
     então um prédio com 25 pacotes gasta uma busca só. */
  async function geocodeStops(stops, options) {
    var opts = options || {};
    var onProgress = opts.onProgress || function () {};
    var isCancelled = opts.isCancelled || function () { return false; };
    var googleKey = (SPX.settings.get('googleKey') || '').trim();

    var pending = stops.filter(function (s) { return s.lat === null || s.lon === null; });
    if (!pending.length) return { located: 0, failed: 0, groups: 0 };

    var useGoogle = false;
    if (googleKey) {
      try { useGoogle = await ensureGoogle(googleKey); } catch (e) { useGoogle = false; }
      if (!useGoogle) U.toast('Não consegui usar a chave do Google — seguindo com a busca gratuita.', 4000);
    }

    var center = referenceCenter(stops);
    var maxKm = center ? 20 : 45;

    /* Agrupa por rua+número+cidade. */
    var groups = {};
    var order = [];
    pending.forEach(function (s) {
      var key = U.normalizeKey(U.addressCore(s.address)) + '|' + U.normalizeKey(s.city);
      if (!groups[key]) { groups[key] = []; order.push(key); }
      groups[key].push(s);
    });

    var accepted = [];   // {members, lat, lon, coreKey, precision, source}
    var failed = 0;

    /* Paradas cuja localização já é conhecida (vieram com coordenada da
       planilha) servem de "âncora": um resultado longe de todas elas é
       suspeito, mesmo caindo dentro do raio largo da rota inteira. Cresce à
       medida que mais endereços vão sendo confirmados nesta mesma rodada. */
    var anchors = stops
      .filter(function (s) { return s.lat !== null && s.lon !== null; })
      .map(function (s) { return { lat: s.lat, lon: s.lon, neighborhood: s.neighborhood }; });

    /* Só o Nominatim exige ~1 busca/s no total. Em vez de fazer TODA busca
       esperar essa cota (o que deixava até uma rota pequena lenta, um
       endereço de cada vez), ele agora só entra como reforço: todo grupo
       tenta primeiro o Photon, que não tem esse limite e roda em paralelo.
       O Nominatim fica de reserva, numa fila única que respeita o 1/s dele,
       só para os grupos que o Photon não resolveu — é isso que faz a
       maioria dos pinos aparecer no mapa quase instantaneamente, sobrando a
       fila lenta apenas para os casos difíceis de verdade. */
    var lastNominatimAt = 0;
    async function rawNominatim(query) {
      var wait = 1000 - (Date.now() - lastNominatimAt);
      if (wait > 0) await U.sleep(wait);
      var r = await nominatimLookup(query);
      lastNominatimAt = Date.now();
      return r;
    }
    var nominatimChain = Promise.resolve();
    function queuedNominatim(query) {
      var p = nominatimChain.then(function () { return rawNominatim(query); });
      nominatimChain = p.catch(function () { return null; });
      return p;
    }

    /* Tenta os provedores disponíveis para uma consulta e devolve o primeiro
       resultado que passar no filtro de sanidade. Com chave do Google, só
       ele entra (rápido, sem fila). Sem chave: Photon primeiro (paralelo);
       só espera na fila do Nominatim se o Photon não resolver. */
    async function lookupBest(query) {
      if (useGoogle) {
        var g = await googleLookup(query);
        return { candidate: g, verdict: g ? validate(g, query, center, maxKm, anchors) : { ok: false, reason: 'não encontrado' } };
      }
      var p = await photonLookup(query, center);
      var pv = p ? validate(p, query, center, maxKm, anchors) : { ok: false, reason: 'não encontrado' };
      if (pv.ok) return { candidate: p, verdict: pv };

      var n = await queuedNominatim(query);
      var nv = n ? validate(n, query, center, maxKm, anchors) : { ok: false, reason: 'não encontrado' };
      return nv.ok ? { candidate: n, verdict: nv } : { candidate: p, verdict: pv };
    }

    var doneCount = 0;

    async function processGroup(key) {
      if (isCancelled()) return;
      var members = groups[key];
      var rep = members[0];

      var query = {
        street: rep.street || rep.address,
        number: rep.number,
        neighborhood: rep.neighborhood,
        city: rep.city || SPX.settings.get('city'),
        zip: rep.zip
      };

      var first = await lookupBest(query);
      var candidate = first.candidate;
      var verdict = first.verdict;
      var precisionOverride = null;

      /* O serviço às vezes não acha o NÚMERO exato da casa, mas acha a rua.
         Antes de desistir, tenta de novo só com o nome da rua — um ponto no
         meio da rua certa é bem melhor do que nenhum pino. */
      if (!verdict.ok && query.number) {
        var streetQuery = { street: query.street, number: '', neighborhood: query.neighborhood, city: query.city, zip: '' };
        var second = await lookupBest(streetQuery);
        if (second.verdict.ok) {
          candidate = second.candidate;
          verdict = second.verdict;
          precisionOverride = 'approx';
        }
      }

      if (verdict.ok) {
        var entry = {
          members: members, lat: candidate.lat, lon: candidate.lon,
          streetKey: U.normalizeKey(query.street), source: candidate.source, estimated: false,
          precision: precisionOverride || candidate.precision || (candidate.houseNumber ? 'exact' : 'approx')
        };
        accepted.push(entry);
        /* Aplica na hora para o pino já aparecer no mapa enquanto o resto roda. */
        entry.members.forEach(function (s) {
          s.lat = entry.lat; s.lon = entry.lon;
          s.geoSource = entry.source; s.geoPrecision = entry.precision;
        });
        anchors.push({ lat: entry.lat, lon: entry.lon, neighborhood: rep.neighborhood });
        if (opts.onResult) opts.onResult();
      } else {
        /* Último recurso: nenhum serviço achou nada de jeito nenhum. Em vez de
           deixar a parada sem NENHUM pino, usa o centro das paradas já
           confirmadas do MESMO bairro (ou, na falta dele, o centro da rota
           inteira) como posição estimada — sempre marcada como tal, nunca
           escondida. Só fica mesmo sem pino se a rota inteira ainda não tem
           nenhuma coordenada confirmada (bem no começo de uma planilha sem
           coordenada nenhuma). */
        var estimate = bairroCentroid(anchors, rep.neighborhood) || center;
        if (estimate) {
          var estEntry = {
            members: members, lat: estimate.lat, lon: estimate.lon,
            streetKey: U.normalizeKey(query.street), source: 'estimate', estimated: true,
            precision: 'estimado'
          };
          accepted.push(estEntry);
          estEntry.members.forEach(function (s) {
            s.lat = estEntry.lat; s.lon = estEntry.lon;
            s.geoSource = estEntry.source; s.geoPrecision = estEntry.precision;
          });
          if (opts.onResult) opts.onResult();
        } else {
          failed += members.length;
          members.forEach(function (s) { s.geoSource = null; s.geoPrecision = null; });
        }
      }

      if (center === null && accepted.length === 1 && !accepted[0].estimated) {
        center = { lat: accepted[0].lat, lon: accepted[0].lon };
        maxKm = 25;
      }

      doneCount++;
      onProgress(doneCount, order.length, pending.length);
    }

    /* Até 6 grupos em paralelo — rápido o bastante para sentir instantâneo
       em rotas do tamanho normal, sem exagerar na carga dos serviços
       públicos gratuitos (o Nominatim continua limitado a 1/s pela fila
       acima, não importa quantos grupos estejam rodando ao mesmo tempo). */
    await mapPool(order, 6, processGroup);
    if (isCancelled()) return { cancelled: true, located: 0, failed: 0, groups: order.length };

    /* Última checagem: se RUAS DIFERENTES devolveram a MESMA coordenada, o
       serviço caiu num ponto genérico (centro do bairro). Desfaz esses pinos.
       As "estimado" ficam de fora dessa checagem de propósito: elas SÃO um
       ponto único compartilhado por ruas diferentes do mesmo bairro — é
       exatamente o que uma estimativa por bairro deveria fazer, não um sinal
       de erro do serviço gratuito. */
    var located = 0;
    var realAccepted = accepted.filter(function (a) { return !a.estimated; });
    accepted.filter(function (a) { return a.estimated; }).forEach(function (a) { located += a.members.length; });

    var byCoord = {};
    realAccepted.forEach(function (a) {
      var k = a.lat.toFixed(4) + ',' + a.lon.toFixed(4);
      (byCoord[k] = byCoord[k] || []).push(a);
    });

    Object.keys(byCoord).forEach(function (k) {
      var bucket = byCoord[k];
      var distinctStreets = {};
      bucket.forEach(function (a) { distinctStreets[a.streetKey] = true; });

      if (Object.keys(distinctStreets).length >= 3) {
        bucket.forEach(function (a) {
          a.members.forEach(function (s) {
            s.lat = null; s.lon = null; s.geoSource = null; s.geoPrecision = null;
          });
          failed += a.members.length;
        });
        return; // coordenada suspeita: não vira pino
      }
      bucket.forEach(function (a) { located += a.members.length; });
    });

    /* Segunda passada, sem nenhuma busca nova: ruas difíceis de achar que
       calharam de aparecer BEM NO INÍCIO da planilha (antes de qualquer
       parada da rota ter sido confirmada) não tinham nenhuma âncora ainda
       pra estimativa por bairro funcionar. Agora que a rota inteira já foi
       processada, tenta de novo com tudo que já se sabe — é assim que se
       evita ficar com uma sequência de "sem localização" só por causa da
       ordem em que os endereços vieram na planilha. */
    var stragglers = stops.filter(function (s) { return s.lat === null || s.lon === null; });
    if (stragglers.length) {
      var finalAnchors = stops
        .filter(function (s) { return s.lat !== null && s.lon !== null && s.geoPrecision !== 'estimado'; })
        .map(function (s) { return { lat: s.lat, lon: s.lon, neighborhood: s.neighborhood }; });
      var finalCenter = center || referenceCenter(stops.filter(function (s) { return s.geoPrecision !== 'estimado'; }));
      if (finalAnchors.length) {
        stragglers.forEach(function (s) {
          var est = bairroCentroid(finalAnchors, s.neighborhood) || finalCenter;
          if (!est) return;
          s.lat = est.lat; s.lon = est.lon; s.geoSource = 'estimate'; s.geoPrecision = 'estimado';
          located++; failed--;
        });
      }
    }

    if (opts.onResult) opts.onResult();
    return { located: located, failed: failed, groups: order.length, provider: useGoogle ? 'google' : 'osm' };
  }

  SPX.geocoder = {
    geocodeStops: geocodeStops,
    nominatimLookup: nominatimLookup,
    photonLookup: photonLookup,
    validate: validate,
    referenceCenter: referenceCenter
  };
})(window.SPX = window.SPX || {});
