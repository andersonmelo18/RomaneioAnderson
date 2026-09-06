/* ======================================================================
   SPX.columns — reconhecimento automático das colunas da planilha
====================================================================== */
(function (SPX) {
  'use strict';

  var nk = SPX.utils.normalizeKey;

  /* Sinônimos aceitos para cada campo conhecido. */
  var SYNONYMS = {
    atId: ['at id', 'atid', 'id da rota'],
    sequence: ['sequence', 'sequencia', 'seq', 'ordem'],
    stop: ['stop', 'parada'],
    spxTn: ['spx tn', 'spxtn', 'tracking number', 'tn', 'tracking', 'codigo de rastreio'],
    address: ['destination address', 'endereco de destino', 'endereco', 'address', 'endereco completo'],
    neighborhood: ['neighborhood', 'bairro'],
    city: ['city', 'cidade'],
    zip: ['zipcode postal code', 'zipcode', 'postal code', 'cep'],
    addressType: ['address type', 'tipo de endereco', 'tipo'],
    corridorCage: ['corridor cage', 'corridor', 'cage', 'gaiola'],
    lat: ['latitude', 'lat'],
    lon: ['longitude', 'lon', 'lng']
  };

  var LABELS = {
    atId: 'AT ID',
    sequence: 'Sequence',
    stop: 'Stop',
    spxTn: 'SPX TN',
    address: 'Destination Address',
    neighborhood: 'Bairro',
    city: 'City',
    zip: 'Zipcode/Postal code',
    addressType: 'Address Type',
    corridorCage: 'Corridor Cage',
    lat: 'Latitude',
    lon: 'Longitude'
  };

  /* Ordem exibida na 2ª tela do wizard, igual ao print do Spoke:
     AT ID, Sequence, Stop, SPX TN, Bairro, City, Zipcode...
     (Destination Address não entra: o endereço é sempre mostrado.) */
  var WIZARD_ORDER = ['atId', 'sequence', 'stop', 'spxTn', 'neighborhood', 'city',
    'zip', 'addressType', 'corridorCage', 'lat', 'lon'];

  function detect(headerRow) {
    var map = {};
    (headerRow || []).forEach(function (h, idx) {
      var norm = nk(h);
      if (!norm) return;
      Object.keys(SYNONYMS).forEach(function (key) {
        if (map[key] !== undefined) return;
        if (SYNONYMS[key].some(function (syn) { return nk(syn) === norm; })) map[key] = idx;
      });
    });
    return map;
  }

  SPX.columns = {
    SYNONYMS: SYNONYMS,
    LABELS: LABELS,
    WIZARD_ORDER: WIZARD_ORDER,
    detect: detect
  };
})(window.SPX = window.SPX || {});
