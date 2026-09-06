/* ======================================================================
   SPX.optimizer — ordem de visita e estimativas de tempo/distância
   Vizinho mais próximo + refinamento 2-opt (roda instantâneo com 125 paradas).
====================================================================== */
(function (SPX) {
  'use strict';

  var U = SPX.utils;

  function dist(a, b) { return U.haversine(a.lat, a.lon, b.lat, b.lon); }

  /* Comprimento total do percurso, começando no ponto de partida (se houver). */
  function pathLength(seq, start) {
    var total = 0;
    var prev = start || null;
    for (var i = 0; i < seq.length; i++) {
      if (prev) total += dist(prev, seq[i]);
      prev = seq[i];
    }
    return total;
  }

  function nearestNeighbor(stops, start) {
    var remaining = stops.slice();
    var out = [];
    var current = start;
    while (remaining.length) {
      var bestIdx = 0;
      if (current) {
        var best = Infinity;
        for (var i = 0; i < remaining.length; i++) {
          var d = dist(current, remaining[i]);
          if (d < best) { best = d; bestIdx = i; }
        }
      }
      current = remaining.splice(bestIdx, 1)[0];
      out.push(current);
    }
    return out;
  }

  /* 2-opt: desfaz cruzamentos do percurso. Limitado por tempo para não travar. */
  function twoOpt(seq, start, budgetMs) {
    if (seq.length < 4) return seq;
    var deadline = Date.now() + (budgetMs || 600);
    var improved = true;
    while (improved) {
      improved = false;
      for (var i = 0; i < seq.length - 1; i++) {
        if (Date.now() > deadline) return seq;
        for (var k = i + 1; k < seq.length; k++) {
          var a = i === 0 ? start : seq[i - 1];
          if (!a) continue;
          var b = seq[i];
          var c = seq[k];
          var d = seq[k + 1] || null;

          var before = dist(a, b) + (d ? dist(c, d) : 0);
          var after = dist(a, c) + (d ? dist(b, d) : 0);
          if (after + 1e-9 < before) {
            var slice = seq.slice(i, k + 1).reverse();
            Array.prototype.splice.apply(seq, [i, slice.length].concat(slice));
            improved = true;
          }
        }
      }
    }
    return seq;
  }

  /* Devolve a ordem otimizada das paradas com coordenada.
     As sem coordenada saem no fim, mantendo a ordem original. */
  function optimize(stops, start) {
    var located = stops.filter(function (s) { return s.lat !== null && s.lon !== null; });
    var unlocated = stops.filter(function (s) { return s.lat === null || s.lon === null; })
      .sort(function (a, b) { return a.originalSequence - b.originalSequence; });

    if (located.length < 2) return { order: located.concat(unlocated), improvedKm: 0 };

    var beforeSeq = located.slice().sort(function (a, b) { return a.order - b.order; });
    var beforeKm = pathLength(beforeSeq, start);

    var seq = nearestNeighbor(located, start);
    seq = twoOpt(seq, start, 600);
    var afterKm = pathLength(seq, start);

    /* Se por algum motivo piorar, mantém a ordem anterior. */
    if (afterKm > beforeKm) { seq = beforeSeq; afterKm = beforeKm; }

    return {
      order: seq.concat(unlocated),
      beforeKm: beforeKm,
      afterKm: afterKm,
      improvedKm: Math.max(0, beforeKm - afterKm)
    };
  }

  /* Distância/tempo do percurso e horário previsto de cada parada.
     Distância de rua ≈ linha reta × 1,35 (fator urbano). */
  var ROAD_FACTOR = 1.35;

  function computeMetrics(orderedStops, start, options) {
    var opt = options || {};
    var speed = Number(opt.avgSpeed) > 0 ? Number(opt.avgSpeed) : 22;
    var stopMin = Number(opt.stopMinutes) >= 0 ? Number(opt.stopMinutes) : 1.2;
    var clock = opt.startTime ? new Date(opt.startTime) : new Date();

    var located = orderedStops.filter(function (s) { return s.lat !== null && s.lon !== null; });
    var straightKm = pathLength(located, start);
    var roadKm = straightKm * ROAD_FACTOR;

    var prev = start || null;
    var cursor = new Date(clock.getTime());
    orderedStops.forEach(function (s) {
      if (s.lat !== null && s.lon !== null) {
        if (prev) {
          var legKm = dist(prev, s) * ROAD_FACTOR;
          cursor = new Date(cursor.getTime() + (legKm / speed) * 3600 * 1000);
        }
        prev = s;
      }
      s.eta = new Date(cursor.getTime());
      cursor = new Date(cursor.getTime() + stopMin * 60 * 1000);
    });

    var driveMin = (roadKm / speed) * 60;
    var serviceMin = orderedStops.length * stopMin;

    return {
      km: roadKm,
      driveMinutes: driveMin,
      serviceMinutes: serviceMin,
      minutes: driveMin + serviceMin,
      finishAt: cursor
    };
  }

  SPX.optimizer = {
    optimize: optimize,
    computeMetrics: computeMetrics,
    pathLength: pathLength,
    ROAD_FACTOR: ROAD_FACTOR
  };
})(window.SPX = window.SPX || {});
