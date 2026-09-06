/* ======================================================================
   SPX.ui.stopList — lista de paradas do painel (igual à lista do Spoke:
   número, rua em negrito, complemento/cidade e o marcador de status)
====================================================================== */
(function (SPX) {
  'use strict';

  var U = SPX.utils;
  SPX.ui = SPX.ui || {};

  function detailLine(stop) {
    return [stop.number, stop.complement, stop.city].filter(Boolean).join(', ');
  }

  function rowHtml(stop, opts) {
    var tags = [];
    if (stop.spxTn) tags.push('<span>🏷 ' + U.escapeHtml(stop.spxTn) + '</span>');
    if (opts.mode !== 'planning' && stop.eta) {
      tags.push('<span>· ' + U.fmtClock(stop.eta) + '</span>');
    }

    var flag = '';
    if (stop.lat === null || stop.lon === null) {
      flag = '<div class="no-geo">📍 sem localização</div>';
    } else if (stop.suspect) {
      flag = '<div class="suspect-geo">⚠️ longe do resto da rota — confira</div>';
    } else if (stop.geoPrecision === 'estimado') {
      flag = '<div class="estimate-geo">📍 posição estimada pelo bairro — confira</div>';
    } else if (stop.geoPrecision === 'approx') {
      flag = '<div class="approx-geo">📍 posição aproximada da rua</div>';
    }

    var reorder = opts.refining
      ? '<div class="reorder">' +
        '<button data-move="up" data-uid="' + stop.uid + '" title="Subir">▲</button>' +
        '<button data-move="down" data-uid="' + stop.uid + '" title="Descer">▼</button>' +
        '</div>'
      : '<div class="state"><span class="dot"></span></div>';

    return '<div class="stop-row ' + stop.status + (opts.currentUid === stop.uid ? ' is-next' : '') +
      '" data-uid="' + stop.uid + '">' +
      '<div class="num">' + U.escapeHtml(stop.id) + '</div>' +
      '<div class="info">' +
      '<div class="street">' + U.escapeHtml(stop.street || stop.address) + '</div>' +
      '<div class="detail">' + U.escapeHtml(detailLine(stop)) + '</div>' +
      (tags.length ? '<div class="tn">' + tags.join(' ') + '</div>' : '') +
      flag +
      '</div>' + reorder + '</div>';
  }

  function startRowHtml(model, mode) {
    if (!model.startPoint || mode === 'planning') return '';
    return '<div class="start-row">' +
      '<div class="num">' + U.escapeHtml(U.fmtClock(model.startedAt || new Date())) + '</div>' +
      '<div class="info">' +
      '<div class="street">Ponto de partida</div>' +
      '<div class="detail">' + U.escapeHtml(model.startPoint.label || 'Posição do GPS usada ao otimizar') + '</div>' +
      '</div></div>';
  }

  /* Desenha a lista inteira e liga os cliques. */
  function render(container, model, opts) {
    opts = opts || {};
    var stops = model.ordered();
    var filter = (opts.filter || '').trim().toLowerCase();
    if (filter) {
      stops = stops.filter(function (s) {
        return (s.address + ' ' + s.spxTn + ' ' + s.neighborhood + ' ' + s.id).toLowerCase().indexOf(filter) !== -1;
      });
    }

    if (!stops.length) {
      container.innerHTML = '<div class="empty-state"><p>Nenhuma parada encontrada.</p></div>';
      return;
    }

    container.innerHTML = startRowHtml(model, opts.mode) +
      stops.map(function (s) { return rowHtml(s, opts); }).join('');

    container.querySelectorAll('.stop-row').forEach(function (row) {
      row.addEventListener('click', function (ev) {
        if (ev.target.closest('[data-move]')) return;
        if (opts.onOpen) opts.onOpen(Number(row.getAttribute('data-uid')));
      });
    });

    container.querySelectorAll('[data-move]').forEach(function (btn) {
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (opts.onMove) {
          opts.onMove(Number(btn.getAttribute('data-uid')),
            btn.getAttribute('data-move') === 'up' ? -1 : 1);
        }
      });
    });
  }

  SPX.ui.stopList = { render: render, detailLine: detailLine };
})(window.SPX = window.SPX || {});
