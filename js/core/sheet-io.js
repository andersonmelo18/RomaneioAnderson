/* ======================================================================
   SPX.sheetIO — leitura e escrita de planilhas .xlsx (via SheetJS)
====================================================================== */
(function (SPX) {
  'use strict';

  /* Lê o arquivo escolhido pelo usuário e devolve as linhas cruas (array de arrays). */
  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('Não foi possível ler o arquivo.')); };
      reader.onload = function (evt) {
        try {
          var wb = XLSX.read(new Uint8Array(evt.target.result), { type: 'array' });
          var sheet = wb.Sheets[wb.SheetNames[0]];
          var rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
          resolve(rows);
        } catch (err) {
          reject(new Error('Arquivo inválido. Confirme que é uma planilha .xlsx.'));
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  /* Cabeçalho oficial da planilha do roteirizador (mesma ordem do arquivo da Shopee),
     mais as colunas extras que a gente aproveita. */
  var EXPORT_HEADER = ['AT ID', 'Sequence', 'Stop', 'SPX TN', 'Destination Address',
    'Bairro', 'City', 'Zipcode/Postal code', 'Latitude', 'Longitude', 'Address Type'];

  var EXPORT_WIDTHS = [{ wch: 16 }, { wch: 9 }, { wch: 6 }, { wch: 17 }, { wch: 44 },
    { wch: 18 }, { wch: 14 }, { wch: 15 }, { wch: 11 }, { wch: 11 }, { wch: 12 }];

  function writeAoA(aoa, fileName, widths) {
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = widths || EXPORT_WIDTHS;
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, fileName);
  }

  /* Gera um AT ID no mesmo formato do arquivo oficial: AT + AAAAMMDD + 5 caracteres. */
  function generateAtId(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    var rand = Math.random().toString(36).substring(2, 7).toUpperCase();
    return 'AT' + y + m + day + rand;
  }

  SPX.sheetIO = {
    readFile: readFile,
    writeAoA: writeAoA,
    generateAtId: generateAtId,
    EXPORT_HEADER: EXPORT_HEADER,
    EXPORT_WIDTHS: EXPORT_WIDTHS
  };
})(window.SPX = window.SPX || {});
