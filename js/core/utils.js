/* ======================================================================
   SPX.utils — funções puras usadas em todo o projeto
====================================================================== */
(function (SPX) {
  'use strict';

  /* Texto normalizado para comparação: minúsculo, sem acento, sem pontuação. */
  function normalizeKey(s) {
    return (s === undefined || s === null ? '' : String(s))
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function escapeHtml(s) {
    return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function escapeAttr(s) {
    return String(s === undefined || s === null ? '' : s).replace(/"/g, '&quot;');
  }

  var toastTimer = null;
  function toast(msg, ms) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, ms || 2800);
  }

  /* Distância em km entre duas coordenadas. */
  function haversine(lat1, lon1, lat2, lon2) {
    var R = 6371;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  /* "2h56min" / "35min" */
  function fmtDuration(minutes) {
    var m = Math.max(0, Math.round(minutes));
    var h = Math.floor(m / 60);
    var r = m % 60;
    return h > 0 ? (h + 'h' + String(r).padStart(2, '0') + 'min') : (r + 'min');
  }

  /* "14,3 km" */
  function fmtKm(km) {
    return (Math.round(km * 10) / 10).toFixed(1).replace('.', ',') + ' km';
  }

  /* "10:39" */
  function fmtClock(date) {
    if (!date) return '';
    return String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
  }

  /* "06-09-2026" */
  function fmtDatePtBr(d) {
    return String(d.getDate()).padStart(2, '0') + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' + d.getFullYear();
  }

  /* "1ª" — usado no "Originally 1ª", igual ao "Originally 1st" do Spoke. */
  function ordinalPt(n) {
    return Math.round(Number(n) || 0) + 'ª';
  }

  /* "Rua Inácio Albino Neto, 240, Bl.9-101"
     → {street:'Rua Inácio Albino Neto', number:'240', complement:'Bl.9-101'} */
  function splitAddress(addr) {
    var parts = String(addr || '').split(',').map(function (p) { return p.trim(); }).filter(Boolean);
    return {
      street: parts[0] || '',
      number: parts[1] || '',
      complement: parts.slice(2).join(', ')
    };
  }

  /* "rua + número" — chave usada para agrupar pacotes do mesmo prédio. */
  function addressCore(addr) {
    var p = splitAddress(addr);
    return p.number ? (p.street + ', ' + p.number) : p.street;
  }

  /* Mediana de uma lista de números. */
  function median(values) {
    if (!values.length) return null;
    var v = values.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(v.length / 2);
    return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
  }

  /* Compara dois nomes de rua ignorando prefixos (rua/av/etc.) e conectivos.
     Usado para recusar um resultado de geocodificação de outra rua. */
  var STREET_STOPWORDS = ['rua', 'r', 'avenida', 'av', 'travessa', 'tv', 'alameda', 'al',
    'praca', 'pca', 'rodovia', 'estrada', 'via', 'de', 'da', 'do', 'das', 'dos', 'e'];

  function streetTokens(name) {
    return normalizeKey(name).split(' ').filter(function (t) {
      return t && STREET_STOPWORDS.indexOf(t) === -1;
    });
  }

  /* 0..1 — proporção dos termos pedidos que aparecem no nome devolvido. */
  function streetSimilarity(requested, returned) {
    var a = streetTokens(requested);
    var b = streetTokens(returned);
    if (!a.length || !b.length) return 0;
    var hit = a.filter(function (t) {
      return b.some(function (u) { return u === t || (t.length > 4 && u.indexOf(t) === 0); });
    }).length;
    return hit / a.length;
  }

  /* Estados brasileiros: usados no seletor de Configurações e para montar o
     texto de busca (Nominatim/Google esperam o nome por extenso do estado,
     não a sigla). Também guarda a coordenada da capital, usada como centro
     inicial do mapa antes de qualquer parada ser importada. */
  var BR_STATES = [
    { uf: 'AC', name: 'Acre', lat: -9.9750, lon: -67.8243 },
    { uf: 'AL', name: 'Alagoas', lat: -9.6498, lon: -35.7089 },
    { uf: 'AP', name: 'Amapá', lat: 0.0349, lon: -51.0694 },
    { uf: 'AM', name: 'Amazonas', lat: -3.1190, lon: -60.0217 },
    { uf: 'BA', name: 'Bahia', lat: -12.9777, lon: -38.5016 },
    { uf: 'CE', name: 'Ceará', lat: -3.7172, lon: -38.5433 },
    { uf: 'DF', name: 'Distrito Federal', lat: -15.7939, lon: -47.8828 },
    { uf: 'ES', name: 'Espírito Santo', lat: -20.3155, lon: -40.3128 },
    { uf: 'GO', name: 'Goiás', lat: -16.6869, lon: -49.2648 },
    { uf: 'MA', name: 'Maranhão', lat: -2.5307, lon: -44.3068 },
    { uf: 'MT', name: 'Mato Grosso', lat: -15.6014, lon: -56.0979 },
    { uf: 'MS', name: 'Mato Grosso do Sul', lat: -20.4697, lon: -54.6201 },
    { uf: 'MG', name: 'Minas Gerais', lat: -19.9167, lon: -43.9345 },
    { uf: 'PA', name: 'Pará', lat: -1.4558, lon: -48.4902 },
    { uf: 'PB', name: 'Paraíba', lat: -7.2050, lon: -34.8700 },
    { uf: 'PR', name: 'Paraná', lat: -25.4284, lon: -49.2733 },
    { uf: 'PE', name: 'Pernambuco', lat: -8.0476, lon: -34.8770 },
    { uf: 'PI', name: 'Piauí', lat: -5.0892, lon: -42.8019 },
    { uf: 'RJ', name: 'Rio de Janeiro', lat: -22.9068, lon: -43.1729 },
    { uf: 'RN', name: 'Rio Grande do Norte', lat: -5.7945, lon: -35.2110 },
    { uf: 'RS', name: 'Rio Grande do Sul', lat: -30.0346, lon: -51.2177 },
    { uf: 'RO', name: 'Rondônia', lat: -8.7619, lon: -63.9039 },
    { uf: 'RR', name: 'Roraima', lat: 2.8235, lon: -60.6758 },
    { uf: 'SC', name: 'Santa Catarina', lat: -27.5954, lon: -48.5480 },
    { uf: 'SP', name: 'São Paulo', lat: -23.5505, lon: -46.6333 },
    { uf: 'SE', name: 'Sergipe', lat: -10.9472, lon: -37.0731 },
    { uf: 'TO', name: 'Tocantins', lat: -10.2491, lon: -48.3243 }
  ];

  var BR_STATES_BY_UF = {};
  BR_STATES.forEach(function (s) { BR_STATES_BY_UF[s.uf] = s; });

  /* "PB" → "Paraíba" (usado nas buscas de endereço). */
  function stateName(uf) {
    var s = BR_STATES_BY_UF[String(uf || '').toUpperCase()];
    return s ? s.name : (uf || '');
  }

  /* Coordenada da capital do estado — centro inicial do mapa antes de
     qualquer parada existir. Cai em Brasília se a sigla for desconhecida. */
  function stateCenter(uf) {
    var s = BR_STATES_BY_UF[String(uf || '').toUpperCase()] || BR_STATES_BY_UF.DF;
    return { lat: s.lat, lon: s.lon };
  }

  /* Texto de endereço para busca no Maps quando não há coordenada confiável
     (usa cidade/estado configurados em Ajustes como resto do texto). */
  function addressQueryText(stop) {
    return [stop.address, stop.neighborhood, stop.city || SPX.settings.get('city'),
      SPX.settings.get('state')].filter(Boolean).join(', ');
  }

  /* URL de ROTA (Navegar): pela coordenada quando ela é confiável — mais
     rápido e exato que texto — senão pelo endereço, que o próprio Google
     Maps resolve na hora. */
  function mapsDirectionsUrl(stop) {
    if (stop.lat !== null && stop.lon !== null && stop.geoPrecision !== 'approx') {
      return 'https://www.google.com/maps/dir/?api=1&destination=' + stop.lat + ',' + stop.lon;
    }
    return 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(addressQueryText(stop));
  }

  /* URL de BUSCA (ver no mapa, sem calcular rota). */
  function mapsSearchUrl(stop) {
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(addressQueryText(stop));
  }

  /* Abre um link externo (Maps) de um jeito que funciona tanto numa aba de
     navegador comum quanto rodando como app instalado (PWA em tela cheia):
     nesse modo o celular costuma bloquear window.open (não existe "nova
     aba"), então a troca de local acontece na própria janela — o telefone
     mesmo assim entrega para o app do Google Maps quando instalado. */
  function openExternal(url) {
    window.location.href = url;
  }

  SPX.utils = {
    normalizeKey: normalizeKey,
    escapeHtml: escapeHtml,
    escapeAttr: escapeAttr,
    toast: toast,
    haversine: haversine,
    sleep: sleep,
    fmtDuration: fmtDuration,
    fmtKm: fmtKm,
    fmtClock: fmtClock,
    fmtDatePtBr: fmtDatePtBr,
    ordinalPt: ordinalPt,
    splitAddress: splitAddress,
    addressCore: addressCore,
    median: median,
    streetSimilarity: streetSimilarity,
    BR_STATES: BR_STATES,
    stateName: stateName,
    stateCenter: stateCenter,
    mapsDirectionsUrl: mapsDirectionsUrl,
    mapsSearchUrl: mapsSearchUrl,
    openExternal: openExternal
  };
})(window.SPX = window.SPX || {});
