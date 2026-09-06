/* ======================================================================
   SPX.builder — página "Criar Planilha": romaneio digitado → .xlsx no
   mesmo formato da planilha oficial do roteirizador.
====================================================================== */
(function (SPX) {
  'use strict';

  var U = SPX.utils;
  var rows = [];

  function el(id) { return document.getElementById(id); }

  /* Separa a linha colada: TAB primeiro (cópia de planilha), depois 2+ espaços,
     depois ponto e vírgula. Vírgula não serve: o endereço já usa vírgula. */
  function splitLine(line) {
    var parts = line.split('\t');
    if (parts.length < 3) parts = line.split(/\s{2,}/);
    if (parts.length < 3) parts = line.split(';');
    return parts.map(function (p) { return p.trim(); });
  }

  function normalizeType(t) {
    var up = String(t || 'HOME').toUpperCase();
    if (up.indexOf('OFFICE') > -1) return 'OFFICE';
    if (up.indexOf('OTHER') > -1) return 'OTHER';
    return 'HOME';
  }

  function parseRomaneio(text) {
    var lines = text.split(/\r?\n/).map(function (l) { return l.trim(); })
      .filter(function (l) { return l.length; });
    if (!lines.length) return [];

    var dataLines = lines;
    var colMap = null;
    var headerWords = ['sequence', 'spx', 'destination', 'address', 'neighborhood',
      'bairro', 'type', 'stop', 'tn'];
    var firstCells = splitLine(lines[0]).map(U.normalizeKey);
    var looksHeader = firstCells.some(function (c) {
      return headerWords.some(function (h) { return c.indexOf(h) > -1; });
    });
    if (looksHeader) {
      colMap = SPX.columns.detect(splitLine(lines[0]));
      dataLines = lines.slice(1);
    }

    var out = [];
    dataLines.forEach(function (line) {
      var cols = splitLine(line);
      if (cols.length < 3) return;
      var seq, stop, tn, addr, nb, type;

      if (colMap) {
        seq = colMap.sequence !== undefined ? cols[colMap.sequence] : '';
        stop = colMap.stop !== undefined ? cols[colMap.stop] : '';
        tn = colMap.spxTn !== undefined ? cols[colMap.spxTn] : '';
        addr = colMap.address !== undefined ? cols[colMap.address] : '';
        nb = colMap.neighborhood !== undefined ? cols[colMap.neighborhood] : '';
        type = colMap.addressType !== undefined ? cols[colMap.addressType] : '';
      } else if (cols.length >= 6) {
        /* Sequence, Stop, SPX TN, Endereço, Bairro, Tipo */
        seq = cols[0]; stop = cols[1]; tn = cols[2]; addr = cols[3]; nb = cols[4]; type = cols[5];
      } else {
        /* Sequence, SPX TN, Endereço, Bairro, Tipo */
        seq = cols[0]; tn = cols[1]; addr = cols[2]; nb = cols[3]; type = cols[4] || ''; stop = '';
      }

      if (!addr) return;
      out.push({
        sequence: seq || (out.length + 1),
        stop: stop || '',
        spxTn: tn || '',
        address: addr,
        neighborhood: nb || '',
        addressType: normalizeType(type)
      });
    });
    return out;
  }

  /* "Stop" agrupa pacotes do mesmo endereço, exatamente como no arquivo oficial:
     o número só muda quando o endereço muda. */
  function recomputeStops() {
    var counter = 0;
    var lastAddr = null;
    rows.forEach(function (r) {
      if (r.stop !== '' && r.stop !== null && !isNaN(parseFloat(r.stop))) {
        lastAddr = U.normalizeKey(r.address);
        counter = Math.max(counter, parseFloat(r.stop));
        return;
      }
      var nk = U.normalizeKey(r.address);
      if (nk !== lastAddr) { counter++; lastAddr = nk; }
      r.stop = counter;
    });
  }

  function render() {
    recomputeStops();
    var body = el('previewBody');
    body.innerHTML = rows.map(function (r, i) {
      return '<tr>' +
        '<td><input data-i="' + i + '" data-f="sequence" value="' + U.escapeAttr(r.sequence) + '" style="width:52px"></td>' +
        '<td><input data-i="' + i + '" data-f="stop" value="' + U.escapeAttr(r.stop) + '" style="width:46px"></td>' +
        '<td><input data-i="' + i + '" data-f="spxTn" value="' + U.escapeAttr(r.spxTn) + '"></td>' +
        '<td><input data-i="' + i + '" data-f="address" value="' + U.escapeAttr(r.address) + '"></td>' +
        '<td><input data-i="' + i + '" data-f="neighborhood" value="' + U.escapeAttr(r.neighborhood) + '"></td>' +
        '<td><select data-i="' + i + '" data-f="addressType">' +
        ['HOME', 'OFFICE', 'OTHER'].map(function (t) {
          return '<option' + (r.addressType === t ? ' selected' : '') + '>' + t + '</option>';
        }).join('') + '</select></td>' +
        '<td><button class="row-del" data-del="' + i + '" title="Remover linha">✕</button></td>' +
        '</tr>';
    }).join('');

    el('rowCountPill').textContent = rows.length + (rows.length === 1 ? ' linha' : ' linhas');
    var stops = rows.length ? Math.max.apply(null, rows.map(function (r) { return Number(r.stop) || 0; })) : 0;
    el('stopCountPill').textContent = stops + (stops === 1 ? ' parada' : ' paradas');

    body.querySelectorAll('input,select').forEach(function (node) {
      node.addEventListener('change', function () {
        rows[Number(node.getAttribute('data-i'))][node.getAttribute('data-f')] = node.value;
        render();
      });
    });
    body.querySelectorAll('[data-del]').forEach(function (node) {
      node.addEventListener('click', function () {
        rows.splice(Number(node.getAttribute('data-del')), 1);
        render();
      });
    });
  }

  function currentDate() {
    var parts = (el('routeDate').value || '').split('-');
    if (parts.length !== 3) return new Date();
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }

  function buildAoA() {
    recomputeStops();
    var city = el('defaultCity').value.trim() || 'João Pessoa';
    var atId = SPX.sheetIO.generateAtId(currentDate());
    var aoa = [SPX.sheetIO.EXPORT_HEADER];
    rows.forEach(function (r) {
      aoa.push([atId, r.sequence, r.stop, r.spxTn, r.address, r.neighborhood,
        city, '', '', '', r.addressType]);
    });
    return aoa;
  }

  function init() {
    var today = new Date();
    el('routeDate').value = today.getFullYear() + '-' +
      String(today.getMonth() + 1).padStart(2, '0') + '-' +
      String(today.getDate()).padStart(2, '0');

    el('btnParse').addEventListener('click', function () {
      var parsed = parseRomaneio(el('romaneioInput').value);
      if (!parsed.length) { U.toast('Não consegui identificar linhas válidas no texto colado.', 4000); return; }
      rows = parsed;
      render();
      U.toast(parsed.length + ' linhas processadas.');
    });

    el('btnClearAll').addEventListener('click', function () {
      if (!rows.length && !el('romaneioInput').value) return;
      if (!confirm('Limpar o texto e todas as linhas da prévia?')) return;
      rows = [];
      el('romaneioInput').value = '';
      render();
    });

    el('btnAddRow').addEventListener('click', function () {
      var addr = el('mAddr').value.trim();
      if (!addr) { U.toast('Informe o endereço.'); return; }
      rows.push({
        sequence: el('mSeq').value || (rows.length + 1),
        stop: '',
        spxTn: el('mTn').value.trim(),
        address: addr,
        neighborhood: el('mBairro').value.trim(),
        addressType: el('mType').value
      });
      ['mSeq', 'mTn', 'mAddr', 'mBairro'].forEach(function (id) { el(id).value = ''; });
      render();
      el('mAddr').focus();
    });

    el('btnExport').addEventListener('click', function () {
      if (!rows.length) { U.toast('Não há linhas para exportar. Processe o romaneio primeiro.'); return; }
      var driver = (el('driverName').value || 'MOTORISTA').trim().toUpperCase();
      var name = U.fmtDatePtBr(currentDate()) + ' ' + driver + '.xlsx';
      SPX.sheetIO.writeAoA(buildAoA(), name);
      U.toast('Planilha gerada: ' + name, 4000);
    });

    el('btnUseNow').addEventListener('click', function () {
      if (!rows.length) { U.toast('Processe o romaneio primeiro.'); return; }
      recomputeStops();
      var driver = (el('driverName').value || 'MOTORISTA').trim().toUpperCase();
      var city = el('defaultCity').value.trim() || 'João Pessoa';
      var payload = {
        label: U.fmtDatePtBr(currentDate()) + ' ' + driver,
        rows: rows.map(function (r) {
          return {
            sequence: r.sequence, stop: r.stop, spxTn: r.spxTn, address: r.address,
            neighborhood: r.neighborhood, city: city, addressType: r.addressType
          };
        })
      };
      try {
        sessionStorage.setItem('spxHandoffRoute', JSON.stringify(payload));
        window.location.href = 'index.html';
      } catch (e) {
        U.toast('Não consegui enviar a rota. Gere o .xlsx e importe na outra aba.', 4500);
      }
    });

    render();
  }

  SPX.builder = { init: init, parseRomaneio: parseRomaneio, buildAoA: buildAoA };
  document.addEventListener('DOMContentLoaded', init);
})(window.SPX = window.SPX || {});
