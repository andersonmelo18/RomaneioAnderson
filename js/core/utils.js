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
    streetSimilarity: streetSimilarity
  };
})(window.SPX = window.SPX || {});
