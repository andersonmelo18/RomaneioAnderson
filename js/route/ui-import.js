/* ======================================================================
   SPX.ui.importWizard — as duas telas de importação do Spoke
   1) "O Roteirizador precisa de ajuda para importar sua rota."
   2) "Além das informações de endereço, selecione o que mais você quer ver
      ao chegar" — com todas as caixas desmarcadas.
====================================================================== */
(function (SPX) {
  'use strict';

  var U = SPX.utils;
  SPX.ui = SPX.ui || {};

  var elIntro, elFields, elList, onFinish, state;

  function init() {
    elIntro = document.getElementById('wizardIntro');
    elFields = document.getElementById('wizardFields');
    elList = document.getElementById('fieldsList');
    if (!elIntro) return;

    document.getElementById('wizardCancel').addEventListener('click', close);
    document.getElementById('wizardNext').addEventListener('click', showFields);
    document.getElementById('wizardBack').addEventListener('click', function () {
      elFields.classList.remove('show');
      elIntro.classList.add('show');
    });
    document.getElementById('wizardFinish').addEventListener('click', function () {
      var checked = Array.prototype.slice
        .call(elList.querySelectorAll('input[type=checkbox]:checked'))
        .map(function (el) { return el.value; });
      close();
      if (onFinish) onFinish(checked);
    });
  }

  function open(rows, columnMap, done) {
    state = { rows: rows, columnMap: columnMap };
    onFinish = done;
    elFields.classList.remove('show');
    elIntro.classList.add('show');
  }

  function close() {
    elIntro.classList.remove('show');
    elFields.classList.remove('show');
  }

  function showFields() {
    elIntro.classList.remove('show');

    var available = SPX.columns.WIZARD_ORDER.filter(function (k) {
      return state.columnMap[k] !== undefined;
    });

    /* Planilha simples demais: não há o que perguntar. */
    if (!available.length) {
      close();
      if (onFinish) onFinish([]);
      return;
    }

    elList.innerHTML = '';
    available.forEach(function (key) {
      var colIdx = state.columnMap[key];
      var samples = [];
      for (var i = 1; i < state.rows.length && samples.length < 3; i++) {
        var v = state.rows[i][colIdx];
        if (v !== undefined && v !== '' && v !== '-') samples.push(v);
      }
      var label = document.createElement('label');
      label.className = 'field-check';
      label.innerHTML =
        '<input type="checkbox" value="' + key + '">' +
        '<div><div class="fname">' + U.escapeHtml(SPX.columns.LABELS[key] || key) + '</div>' +
        '<div class="fsample">' + U.escapeHtml(samples.join(', ')) + '</div></div>';
      elList.appendChild(label);
    });

    elFields.classList.add('show');
  }

  SPX.ui.importWizard = { init: init, open: open, close: close };
})(window.SPX = window.SPX || {});
