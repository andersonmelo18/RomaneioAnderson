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
      city: q.city || 'João Pessoa', state: 'Paraíba', country: 'Brasil'
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
    var text = [q.number ? (q.street + ' ' + q.number) : q.street, q.city || 'João Pessoa', 'Paraíba'].join(', ');
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
        q.neighborhood, q.city || 'João Pessoa', 'PB', 'Brasil'].filter(Boolean).join(', ');
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
    /* Mesmo nome de rua, bairro diferente do informado na planilha — provável
       homônimo em outra parte da cidade. */
    if (query.neighborhood && candidate.neighborhood &&
        U.streetSimilarity(query.neighborhood, candidate.neighborhood) === 0) {
      return { ok: false, reason: 'bairro devolvido (' + candidate.neighborhood + ') diferente do esperado' };
    }
    if (center) {
      var d = U.haversine(center.lat, center.lon, candidate.lat, candidate.lon);
      if (d > maxKm) return { ok: false, reason: 'fora do raio da rota (' + d.toFixed(1) + ' km)' };
    }
    var nearest = nearestAnchorKm(candidate, anchors);
    if (nearest !== null && nearest > NEAREST_ANCHOR_MAX_KM) {
      return { ok: false, reason: 'longe de qualquer parada já confirmada (' + nearest.toFixed(1) + ' km)' };
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
      .map(function (s) { return { lat: s.lat, lon: s.lon }; });

    for (var g = 0; g < order.length; g++) {
      if (isCancelled()) return { cancelled: true, located: 0, failed: 0, groups: order.length };
      var members = groups[order[g]];
      var rep = members[0];
      onProgress(g + 1, order.length, pending.length);

      var query = {
        street: rep.street || rep.address,
        number: rep.number,
        neighborhood: rep.neighborhood,
        city: rep.city || 'João Pessoa',
        zip: rep.zip
      };

      var candidate = null;
      if (useGoogle) {
        candidate = await googleLookup(query);
      } else {
        candidate = await nominatimLookup(query);
        var check = candidate ? validate(candidate, query, center, maxKm, anchors) : { ok: false };
        if (!check.ok) {
          await U.sleep(1100);                     // política do Nominatim: 1 busca/s
          candidate = await photonLookup(query, center);
        }
      }

      var verdict = candidate ? validate(candidate, query, center, maxKm, anchors) : { ok: false, reason: 'não encontrado' };
      if (verdict.ok) {
        var entry = {
          members: members, lat: candidate.lat, lon: candidate.lon,
          streetKey: U.normalizeKey(query.street), source: candidate.source,
          precision: candidate.precision || (candidate.houseNumber ? 'exact' : 'approx')
        };
        accepted.push(entry);
        /* Aplica na hora para o pino já aparecer no mapa enquanto o resto roda. */
        entry.members.forEach(function (s) {
          s.lat = entry.lat; s.lon = entry.lon;
          s.geoSource = entry.source; s.geoPrecision = entry.precision;
        });
        anchors.push({ lat: entry.lat, lon: entry.lon });
        if (opts.onResult) opts.onResult();
      } else {
        failed += members.length;
        members.forEach(function (s) { s.geoSource = null; s.geoPrecision = null; });
      }

      /* O serviço gratuito aceita ~1 busca por segundo; com o Google não há espera. */
      if (!useGoogle && g < order.length - 1) await U.sleep(1100);
      if (center === null && accepted.length === 1) {
        center = { lat: accepted[0].lat, lon: accepted[0].lon };
        maxKm = 25;
      }
    }

    /* Última checagem: se RUAS DIFERENTES devolveram a MESMA coordenada, o
       serviço caiu num ponto genérico (centro do bairro). Desfaz esses pinos. */
    var byCoord = {};
    accepted.forEach(function (a) {
      var k = a.lat.toFixed(4) + ',' + a.lon.toFixed(4);
      (byCoord[k] = byCoord[k] || []).push(a);
    });

    var located = 0;
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
