/* ======================================================================
   SPX.ui.stopSheet — painel de detalhe da parada, igual ao print do Spoke:
   endereço em destaque, "1/125, 10:39", os botões Navegar / Não entregue /
   Entregue e as linhas de informação (incluindo "ID 1 · Originally 1ª").
====================================================================== */
(function (SPX) {
  'use strict';

  var U = SPX.utils;
  SPX.ui = SPX.ui || {};

  var sheet, backdrop, handlers = {}, current = null, ctx = {};

  function init(h) {
    handlers = h || {};
    sheet = document.getElementById('stopSheet');
    backdrop = document.getElementById('sheetBackdrop');
    if (!sheet) return;
    backdrop.addEventListener('click', close);
    document.getElementById('stopSheetClose').addEventListener('click', close);

    sheet.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-act]');
      if (!btn || !current) return;
      var act = btn.getAttribute('data-act');
      if (act === 'navigate') navigate(current);
      else if (act === 'delivered') setStatus('delivered');
      else if (act === 'failed') setStatus('failed');
      else if (act === 'edit') { var e = current.uid; close(); if (handlers.onEdit) handlers.onEdit(e); }
      else if (act === 'duplicate') { var u = current.uid; close(); if (handlers.onDuplicate) handlers.onDuplicate(u); }
      else if (act === 'remove') {
        if (confirm('Remover esta parada da rota?\n\n' + current.address)) {
          var uid = current.uid; close();
          if (handlers.onRemove) handlers.onRemove(uid);
        }
      } else if (act === 'maps') {
        openMaps(current);
      }
    });
  }

  function setStatus(status) {
    if (!current) return;
    var next = current.status === status ? 'pending' : status;
    current.status = next;
    if (handlers.onStatus) handlers.onStatus(current.uid, next);
    render();
  }

  /* Abre a navegação no Google Maps: por coordenada quando ela é confiável,
     senão pelo texto do endereço (o próprio Google resolve na hora). */
  function navigate(stop) {
    var url;
    if (stop.lat !== null && stop.lon !== null && stop.geoPrecision !== 'approx') {
      url = 'https://www.google.com/maps/dir/?api=1&destination=' + stop.lat + ',' + stop.lon;
    } else {
      var q = [stop.address, stop.neighborhood, stop.city || 'João Pessoa', 'PB'].filter(Boolean).join(', ');
      url = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(q);
    }
    window.open(url, '_blank');
  }

  function openMaps(stop) {
    var q = [stop.address, stop.neighborhood, stop.city || 'João Pessoa', 'PB'].filter(Boolean).join(', ');
    window.open('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q), '_blank');
  }

  function infoRow(icon, label, value, act) {
    if (value === undefined || value === null || value === '') return '';
    return '<' + (act ? 'button' : 'div') + ' class="sheet-row' + (act ? ' tappable" data-act="' + act + '"' : '"') + '>' +
      '<span class="ico">' + icon + '</span>' +
      '<span class="body">' +
      (label ? '<span class="label">' + U.escapeHtml(label) + '</span>' : '') +
      '<span class="value">' + value + '</span></span>' +
      (act ? '<span class="chev">›</span>' : '') +
      '</' + (act ? 'button' : 'div') + '>';
  }

  /* Linha de ação (sem rótulo em cima), como "Editar parada" no Spoke. */
  function actionRow(icon, text, act) {
    return infoRow(icon, '', U.escapeHtml(text), act);
  }

  function render() {
    if (!current) return;
    var s = current;
    document.getElementById('stopSheetTitle').textContent =
      [s.street, s.number].filter(Boolean).join(', ') || s.address;

    var sub = ctx.position + '/' + ctx.total + (s.eta ? ', ' + U.fmtClock(s.eta) : '');
    document.getElementById('stopSheetSub').innerHTML =
      '<span class="dot"></span><span>' + U.escapeHtml(sub) + '</span>';

    var bNav = sheet.querySelector('[data-act="navigate"]');
    var bFail = sheet.querySelector('[data-act="failed"]');
    var bOk = sheet.querySelector('[data-act="delivered"]');
    bNav.className = 'act primary';
    bFail.className = 'act' + (s.status === 'failed' ? ' on-fail' : '');
    bOk.className = 'act' + (s.status === 'delivered' ? ' on-ok' : '');

    var sel = ctx.selectedFields || [];
    var rows = '';

    var complementLine = [s.complement, s.city].filter(Boolean).join(', ');
    rows += infoRow('🗺️', 'Endereço', U.escapeHtml(complementLine || s.address), 'maps');

    if (sel.indexOf('spxTn') > -1) rows += infoRow('🏷️', 'SPX TN', U.escapeHtml(s.spxTn));
    if (sel.indexOf('atId') > -1) rows += infoRow('🧾', 'AT ID', U.escapeHtml(s.atId));
    if (sel.indexOf('stop') > -1) rows += infoRow('📦', 'Stop', U.escapeHtml(s.stopGroup));
    if (sel.indexOf('sequence') > -1) rows += infoRow('#️⃣', 'Sequence', U.escapeHtml(s.originalSequence));
    if (sel.indexOf('neighborhood') > -1) rows += infoRow('🏘️', 'Bairro', U.escapeHtml(s.neighborhood));
    if (sel.indexOf('city') > -1) rows += infoRow('🌆', 'City', U.escapeHtml(s.city));
    if (sel.indexOf('zip') > -1) rows += infoRow('✉️', 'CEP', U.escapeHtml(s.zip));
    if (sel.indexOf('addressType') > -1) rows += infoRow('🏠', 'Address Type', U.escapeHtml(s.addressType));
    if (sel.indexOf('corridorCage') > -1) rows += infoRow('🧰', 'Corridor / Cage', U.escapeHtml(s.corridorCage));
    if (sel.indexOf('lat') > -1 && s.lat !== null) rows += infoRow('📐', 'Latitude', s.lat.toFixed(6));
    if (sel.indexOf('lon') > -1 && s.lon !== null) rows += infoRow('📐', 'Longitude', s.lon.toFixed(6));

    var idValue = U.escapeHtml(s.id);
    if (Number(s.id) !== Number(s.originalSequence)) {
      idValue += ' <span class="muted">Originally ' + U.ordinalPt(s.originalSequence) + '</span>';
    }
    rows += infoRow('🆔', 'ID', idValue);

    if (s.lat === null || s.lon === null) {
      rows += infoRow('📍', 'Localização',
        '<span style="color:var(--danger)">endereço não encontrado no mapa — use Navegar</span>');
    } else if (s.suspect) {
      rows += infoRow('⚠️', 'Localização',
        '<span style="color:#A65B00">esse pino está bem longe do resto da rota — confira o endereço antes de navegar</span>');
    } else if (s.geoPrecision === 'estimado') {
      rows += infoRow('📍', 'Localização',
        '<span style="color:#A65B00">posição estimada pelo bairro, não achamos o endereço exato — confira antes de navegar</span>');
    }

    rows += actionRow('✏️', 'Editar parada', 'edit');
    rows += actionRow('📄', 'Duplicar parada', 'duplicate');
    rows += actionRow('🗑️', 'Remover parada', 'remove');

    document.getElementById('stopSheetRows').innerHTML = rows + '<div class="sheet-space"></div>';
  }

  function open(stop, context) {
    current = stop;
    ctx = context || {};
    render();
    backdrop.classList.add('show');
    sheet.classList.add('show');
  }

  function close() {
    sheet.classList.remove('show');
    backdrop.classList.remove('show');
    current = null;
  }

  function isOpen() { return !!current; }

  SPX.ui.stopSheet = { init: init, open: open, close: close, isOpen: isOpen, render: render };
})(window.SPX = window.SPX || {});
