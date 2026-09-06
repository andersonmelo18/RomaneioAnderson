/* ======================================================================
   SPX.RouteModel — estado da rota: paradas, ordem, IDs e status
====================================================================== */
(function (SPX) {
  'use strict';

  var U = SPX.utils;

  var uidSeq = 1;

  function cellOf(row, columnMap, key) {
    var idx = columnMap[key];
    if (idx === undefined) return '';
    var v = row[idx];
    return (v === undefined || v === null) ? '' : v;
  }

  function toNumber(v) {
    if (v === '' || v === null || v === undefined) return null;
    var n = parseFloat(String(v).replace(',', '.'));
    return isNaN(n) ? null : n;
  }

  /* "9e000b17-05092026_ANDERSON_MELO_DE_ANDRADE"
     → "05-09-2026 ANDERSON MELO DE ANDRADE" (mesmo título que o app mostra). */
  function prettyTitle(fileLabel) {
    var t = String(fileLabel || '').trim();
    t = t.replace(/^[0-9a-f]{6,12}-/i, '');          // prefixo de upload
    t = t.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
    var m = t.match(/^(\d{2})(\d{2})(\d{4})\s+(.*)$/);
    if (m) return m[1] + '-' + m[2] + '-' + m[3] + ' ' + m[4];
    return t || 'Rota importada';
  }

  function RouteModel() {
    this.stops = [];
    this.meta = { fileLabel: 'Rota importada', title: '', driver: '', date: new Date() };
    this.startPoint = null;   // {lat, lon, label}
    this.optimized = false;
    this.startedAt = null;
    this.selectedFields = [];
    this.metrics = null;      // {km, minutes, savedKm, savedMinutes}
  }

  /* Monta as paradas a partir das linhas da planilha (linha 0 = cabeçalho). */
  RouteModel.prototype.buildFromRows = function (rows, columnMap, fileLabel) {
    var self = this;
    this.stops = [];
    this.optimized = false;
    this.metrics = null;
    this.meta.fileLabel = fileLabel || 'Rota importada';

    /* Linhas com Sequence vazia ou "-" (item que não entrou na rota) entram
       depois das numeradas, sem colidir com os IDs que vieram da planilha. */
    var maxSeq = 0;
    rows.slice(1).forEach(function (row) {
      var n = toNumber(cellOf(row, columnMap, 'sequence'));
      if (n !== null && n > maxSeq) maxSeq = n;
    });
    var extraSeq = maxSeq;

    rows.slice(1).forEach(function (row, idx) {
      var address = String(cellOf(row, columnMap, 'address') || '').trim();
      if (!address) {
        /* Linha realmente vazia (sobra no fim da planilha) — não é parada,
           ignora. Mas se a linha tem outros dados (SPX TN, sequência...) e só
           o endereço ficou em branco, a parada NÃO some da lista: melhor
           aparecer marcada "sem endereço" do que sumir sem o motorista notar. */
        var hasOtherData = ['atId', 'sequence', 'stop', 'spxTn', 'neighborhood', 'city', 'zip']
          .some(function (k) { return String(cellOf(row, columnMap, k) || '').trim() !== ''; });
        if (!hasOtherData) return;
        address = '(endereço não veio na planilha)';
      }

      var seqRaw = cellOf(row, columnMap, 'sequence');
      var seqNum = toNumber(seqRaw);
      var hasSeq = seqNum !== null;
      if (!hasSeq) seqNum = ++extraSeq;
      var parts = U.splitAddress(address);

      var lat = toNumber(cellOf(row, columnMap, 'lat'));
      var lon = toNumber(cellOf(row, columnMap, 'lon'));
      var hasCoords = lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

      self.stops.push({
        uid: uidSeq++,
        originalSequence: seqNum,
        id: seqNum,
        order: idx,
        unsequenced: !hasSeq,
        stopGroup: cellOf(row, columnMap, 'stop'),
        atId: cellOf(row, columnMap, 'atId'),
        spxTn: cellOf(row, columnMap, 'spxTn'),
        address: address,
        street: parts.street,
        number: parts.number,
        complement: parts.complement,
        neighborhood: cellOf(row, columnMap, 'neighborhood'),
        city: cellOf(row, columnMap, 'city'),
        zip: cellOf(row, columnMap, 'zip'),
        addressType: cellOf(row, columnMap, 'addressType'),
        corridorCage: cellOf(row, columnMap, 'corridorCage'),
        lat: hasCoords ? lat : null,
        lon: hasCoords ? lon : null,
        geoSource: hasCoords ? 'sheet' : null,   // 'sheet' | 'google' | 'osm' | null
        geoPrecision: hasCoords ? 'exact' : null, // 'exact' | 'approx' | null
        suspect: false,                           // true = coordenada longe do resto da rota
        status: 'pending',                        // 'pending' | 'delivered' | 'failed'
        eta: null
      });
    });

    /* A ordem inicial é a sequência original da planilha. */
    this.stops.sort(function (a, b) { return a.originalSequence - b.originalSequence; });
    this.stops.forEach(function (s, i) { s.order = i; });
    this.flagDistanceOutliers();

    /* Título no formato do app: "05-09-2026 NOME DO MOTORISTA". */
    this.meta.title = prettyTitle(this.meta.fileLabel);
    return this.stops;
  };

  /* Monta as paradas a partir de linhas já em objeto (usado pelo "Usar esta rota agora"). */
  RouteModel.prototype.buildFromObjects = function (list, label) {
    var self = this;
    this.stops = [];
    this.optimized = false;
    this.metrics = null;
    this.meta.fileLabel = label || 'Rota criada';
    this.meta.title = this.meta.fileLabel;
    list.forEach(function (r, idx) {
      var address = String(r.address || '').trim();
      if (!address) return;
      var parts = U.splitAddress(address);
      self.stops.push({
        uid: uidSeq++,
        originalSequence: toNumber(r.sequence) || (idx + 1),
        id: toNumber(r.sequence) || (idx + 1),
        order: idx,
        stopGroup: r.stop || '',
        atId: r.atId || '',
        spxTn: r.spxTn || '',
        address: address,
        street: parts.street,
        number: parts.number,
        complement: parts.complement,
        neighborhood: r.neighborhood || '',
        city: r.city || '',
        zip: r.zip || '',
        addressType: r.addressType || '',
        corridorCage: '',
        lat: null, lon: null, geoSource: null, geoPrecision: null, suspect: false,
        status: 'pending', eta: null
      });
    });
    this.stops.sort(function (a, b) { return a.originalSequence - b.originalSequence; });
    this.stops.forEach(function (s, i) { s.order = i; });
    return this.stops;
  };

  RouteModel.prototype.ordered = function () {
    return this.stops.slice().sort(function (a, b) { return a.order - b.order; });
  };

  RouteModel.prototype.located = function () {
    return this.stops.filter(function (s) { return s.lat !== null && s.lon !== null; });
  };

  /* Marca paradas cuja coordenada (da planilha ou já geocodificada) está
     muito longe do resto da rota — não some o pino, só avisa, porque pode
     ser uma parada realmente distante; mas na dúvida o motorista confere
     antes de confiar cegamente no mapa. */
  RouteModel.prototype.flagDistanceOutliers = function () {
    var pts = this.located();
    if (pts.length < 5) { pts.forEach(function (s) { s.suspect = false; }); return; }
    var lat0 = U.median(pts.map(function (s) { return s.lat; }));
    var lon0 = U.median(pts.map(function (s) { return s.lon; }));
    var dists = pts.map(function (s) { return U.haversine(lat0, lon0, s.lat, s.lon); });
    var medDist = U.median(dists) || 0;
    var threshold = Math.max(3, medDist * 6);
    pts.forEach(function (s, i) { s.suspect = dists[i] > threshold; });
  };

  RouteModel.prototype.unlocated = function () {
    return this.stops.filter(function (s) { return s.lat === null || s.lon === null; });
  };

  RouteModel.prototype.byUid = function (uid) {
    return this.stops.find(function (s) { return s.uid === Number(uid); }) || null;
  };

  /* Aplica uma nova ordem (lista de uids) e normaliza o campo order. */
  RouteModel.prototype.applyOrder = function (uids) {
    var self = this;
    uids.forEach(function (uid, i) {
      var s = self.byUid(uid);
      if (s) s.order = i;
    });
    this.normalizeOrder();
  };

  RouteModel.prototype.normalizeOrder = function () {
    this.ordered().forEach(function (s, i) { s.order = i; });
  };

  /* Sobe/desce uma parada na lista (botão "Refinar"). */
  RouteModel.prototype.move = function (uid, delta) {
    var list = this.ordered();
    var i = list.findIndex(function (s) { return s.uid === Number(uid); });
    var j = i + delta;
    if (i < 0 || j < 0 || j >= list.length) return false;
    var tmp = list[i];
    list[i] = list[j];
    list[j] = tmp;
    list.forEach(function (s, k) { s.order = k; });
    return true;
  };

  /* "Redefinir IDs de parada": renumera 1..N na ordem atual,
     mantendo originalSequence para exibir "Originally Nª". */
  RouteModel.prototype.renumberIds = function () {
    this.ordered().forEach(function (s, i) { s.id = i + 1; });
  };

  RouteModel.prototype.remove = function (uid) {
    var i = this.stops.findIndex(function (s) { return s.uid === Number(uid); });
    if (i < 0) return false;
    this.stops.splice(i, 1);
    this.normalizeOrder();
    return true;
  };

  RouteModel.prototype.duplicate = function (uid) {
    var s = this.byUid(uid);
    if (!s) return null;
    var copy = Object.assign({}, s, { uid: uidSeq++, status: 'pending', eta: null });
    var list = this.ordered();
    var i = list.findIndex(function (x) { return x.uid === s.uid; });
    list.splice(i + 1, 0, copy);
    this.stops.push(copy);
    list.forEach(function (x, k) { x.order = k; });
    return copy;
  };

  /* Atualiza campos editáveis; se o endereço mudar, a coordenada é descartada. */
  RouteModel.prototype.update = function (uid, fields) {
    var s = this.byUid(uid);
    if (!s) return null;
    var addressChanged = fields.address !== undefined && fields.address !== s.address;
    Object.assign(s, fields);
    if (addressChanged) {
      var parts = U.splitAddress(s.address);
      s.street = parts.street;
      s.number = parts.number;
      s.complement = parts.complement;
      s.lat = null; s.lon = null; s.geoSource = null; s.geoPrecision = null;
    }
    return s;
  };

  RouteModel.prototype.stats = function () {
    var delivered = 0, failed = 0, pending = 0, unlocated = 0;
    this.stops.forEach(function (s) {
      if (s.status === 'delivered') delivered++;
      else if (s.status === 'failed') failed++;
      else pending++;
      if (s.lat === null || s.lon === null) unlocated++;
    });
    return {
      total: this.stops.length,
      delivered: delivered, failed: failed, pending: pending,
      unlocated: unlocated, located: this.stops.length - unlocated
    };
  };

  /* Próxima parada pendente na ordem da rota. */
  RouteModel.prototype.nextPending = function () {
    return this.ordered().find(function (s) { return s.status === 'pending'; }) || null;
  };

  /* Linhas para exportar no layout oficial + status. */
  RouteModel.prototype.toExportAoA = function () {
    var header = SPX.sheetIO.EXPORT_HEADER.concat(['Status', 'Original Sequence']);
    var atId = this.stops.length && this.stops[0].atId
      ? this.stops[0].atId
      : SPX.sheetIO.generateAtId(this.meta.date || new Date());
    var statusPt = { pending: 'Pendente', delivered: 'Entregue', failed: 'Não entregue' };
    var aoa = [header];
    this.ordered().forEach(function (s) {
      aoa.push([
        s.atId || atId, s.id, s.stopGroup, s.spxTn, s.address,
        s.neighborhood, s.city, s.zip,
        s.lat === null ? '' : s.lat, s.lon === null ? '' : s.lon,
        s.addressType, statusPt[s.status] || s.status, s.originalSequence
      ]);
    });
    return aoa;
  };

  SPX.RouteModel = RouteModel;
})(window.SPX = window.SPX || {});
