/* ======================================================================
   SPX.app — máquina de telas do roteirizador
   VAZIO → (wizard) → PLANEJANDO → (otimizar) → PRÉVIA → (confirmar) → ATIVA
====================================================================== */
(function (SPX) {
  'use strict';

  var U = SPX.utils;

  var model = new SPX.RouteModel();
  var mapView = null;
  var mode = 'empty';          // 'empty' | 'planning' | 'preview' | 'active'
  var refining = false;
  var geoToken = 0;
  var routeLineToken = 0;
  var lastSavings = null;

  var el = {};

  /* ------------------------------------------------------------------ */
  /* Inicialização                                                       */
  /* ------------------------------------------------------------------ */
  function init() {
    el.viewEmpty = document.getElementById('viewEmpty');
    el.viewRoute = document.getElementById('viewRoute');
    el.stopList = document.getElementById('stopList');
    el.routeTitle = document.getElementById('routeTitle');
    el.routeMetrics = document.getElementById('routeMetrics');
    el.panelFoot = document.getElementById('panelFoot');
    el.fileInput = document.getElementById('fileInput');
    el.savingsChip = document.getElementById('savingsChip');
    el.savingsText = document.getElementById('savingsText');
    el.geoProgress = document.getElementById('geoProgress');
    el.geoText = document.getElementById('geoText');
    el.search = document.getElementById('searchInput');

    SPX.ui.importWizard.init();
    SPX.ui.stopSheet.init({
      onStatus: onStopStatusChanged,
      onEdit: openEditModal,
      onDuplicate: function (uid) { model.duplicate(uid); refresh(); U.toast('Parada duplicada.'); },
      onRemove: function (uid) { model.remove(uid); refresh(); U.toast('Parada removida.'); }
    });

    el.fileInput.addEventListener('change', function (ev) {
      var file = ev.target.files[0];
      if (file) handleFile(file);
      ev.target.value = '';
    });
    document.getElementById('btnImport').addEventListener('click', function () { el.fileInput.click(); });

    document.getElementById('btnMenu').addEventListener('click', openMenu);
    document.getElementById('menuBackdrop').addEventListener('click', closeMenu);
    document.getElementById('savingsClose').addEventListener('click', function () {
      el.savingsChip.classList.remove('show');
    });
    el.search.addEventListener('input', function () { renderList(); });

    initMenuActions();
    initSettingsModal();
    initEditModal();

    SPX.createMapView(document.getElementById('map'), {
      onPinClick: openStop
    }).then(function (view) {
      mapView = view;
      refresh();
    });

    /* Rota vinda da aba "Criar Planilha" pelo botão "Usar esta rota agora". */
    var handoff = null;
    try { handoff = JSON.parse(sessionStorage.getItem('spxHandoffRoute') || 'null'); } catch (e) { handoff = null; }
    if (handoff && handoff.rows && handoff.rows.length) {
      sessionStorage.removeItem('spxHandoffRoute');
      model.buildFromObjects(handoff.rows, handoff.label || 'Rota criada');
      model.selectedFields = ['spxTn'];
      mode = 'planning';
      refresh();
      startGeocoding();
    } else {
      setMode('empty');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Importação                                                          */
  /* ------------------------------------------------------------------ */
  function handleFile(file) {
    SPX.sheetIO.readFile(file).then(function (rows) {
      if (!rows.length) { U.toast('Planilha vazia.'); return; }
      var columnMap = SPX.columns.detect(rows[0]);
      if (columnMap.address === undefined) {
        U.toast('Não encontrei a coluna "Destination Address" nessa planilha.', 4500);
        return;
      }
      var label = file.name.replace(/\.[^.]+$/, '');
      SPX.ui.importWizard.open(rows, columnMap, function (selectedFields) {
        model = new SPX.RouteModel();
        model.buildFromRows(rows, columnMap, label);
        model.selectedFields = selectedFields;
        if (!model.stops.length) { U.toast('Nenhuma parada válida na planilha.'); return; }
        lastSavings = null;
        el.savingsChip.classList.remove('show');
        setMode('planning');
        U.toast(model.stops.length + ' paradas importadas.');
        startGeocoding();
      });
    }).catch(function (err) {
      U.toast(err.message || 'Erro ao ler o arquivo.');
    });
  }

  /* ------------------------------------------------------------------ */
  /* Geocodificação das paradas sem coordenada                           */
  /* ------------------------------------------------------------------ */
  function startGeocoding() {
    var pending = model.unlocated();
    if (!pending.length) return;

    geoToken++;
    var myToken = geoToken;
    el.geoProgress.classList.add('show');
    el.geoText.textContent = 'Localizando endereços…';

    SPX.geocoder.geocodeStops(model.stops, {
      isCancelled: function () { return myToken !== geoToken; },
      onProgress: function (done, total, packages) {
        el.geoText.textContent = 'Localizando endereços… ' + done + '/' + total +
          ' ruas (' + packages + ' pacotes)';
      },
      onResult: function () { refresh(); }
    }).then(function (res) {
      if (myToken !== geoToken) return;
      el.geoProgress.classList.remove('show');
      model.flagDistanceOutliers();
      refresh();
      if (res.cancelled) return;
      if (res.failed > 0) {
        U.toast(res.failed + ' endereço(s) não foram encontrados no mapa — aparecem marcados na lista.', 5000);
      } else if (res.located > 0) {
        U.toast('Todos os endereços foram localizados.');
      }
    }).catch(function () {
      el.geoProgress.classList.remove('show');
      U.toast('Não consegui consultar o serviço de localização (sem internet?).', 4500);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Ponto de partida                                                    */
  /* ------------------------------------------------------------------ */
  function resolveStartPoint() {
    var startMode = SPX.settings.get('startMode');
    var first = model.ordered().find(function (s) { return s.lat !== null; });

    if (startMode === 'first' || !navigator.geolocation) {
      return Promise.resolve(first ? { lat: first.lat, lon: first.lon, label: 'Primeira parada da planilha' } : null);
    }
    if (startMode === 'fixed') {
      var addr = SPX.settings.get('startAddress');
      if (!addr) {
        return Promise.resolve(first ? { lat: first.lat, lon: first.lon, label: 'Primeira parada da planilha' } : null);
      }
      return SPX.geocoder.nominatimLookup({ street: addr })
        .then(function (r) {
          return r ? { lat: r.lat, lon: r.lon, label: addr }
            : (first ? { lat: first.lat, lon: first.lon, label: 'Primeira parada da planilha' } : null);
        });
    }
    /* Se o navegador já sabe que a localização foi negada, nem espera o GPS. */
    var precheck = (navigator.permissions && navigator.permissions.query)
      ? navigator.permissions.query({ name: 'geolocation' }).catch(function () { return null; })
      : Promise.resolve(null);

    return precheck.then(function (perm) {
      if (perm && perm.state === 'denied') {
        return first ? { lat: first.lat, lon: first.lon, label: 'Primeira parada (GPS negado)' } : null;
      }
      return askGps(first);
    });
  }

  function askGps(first) {
    return new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        resolve(first ? { lat: first.lat, lon: first.lon, label: 'Primeira parada (GPS indisponível)' } : null);
      }, 6000);
      navigator.geolocation.getCurrentPosition(function (pos) {
        if (done) return;
        done = true; clearTimeout(timer);
        resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, label: 'Posição do GPS usada ao otimizar' });
      }, function () {
        if (done) return;
        done = true; clearTimeout(timer);
        resolve(first ? { lat: first.lat, lon: first.lon, label: 'Primeira parada (GPS negado)' } : null);
      }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Otimização                                                          */
  /* ------------------------------------------------------------------ */
  function optimizeRoute() {
    if (model.located().length < 2) {
      U.toast('Preciso de pelo menos 2 paradas com localização para otimizar.', 4000);
      return;
    }
    U.toast('Calculando a melhor ordem…', 1500);
    resolveStartPoint().then(function (start) {
      model.startPoint = start;
      var before = SPX.optimizer.computeMetrics(model.ordered(), start, SPX.settings.all());
      var result = SPX.optimizer.optimize(model.stops, start);

      model.applyOrder(result.order.map(function (s) { return s.uid; }));
      model.renumberIds();
      model.optimized = true;

      var after = SPX.optimizer.computeMetrics(model.ordered(), start, SPX.settings.all());
      model.metrics = after;

      var savedKm = Math.max(0, before.km - after.km);
      var savedMin = Math.max(0, before.minutes - after.minutes);
      lastSavings = savedKm > 0.05
        ? 'Economizou ' + U.fmtKm(savedKm) + ', ' + U.fmtDuration(savedMin)
        : null;

      setMode('preview');
    });
  }

  function recomputeMetrics() {
    model.metrics = SPX.optimizer.computeMetrics(model.ordered(), model.startPoint, Object.assign(
      {}, SPX.settings.all(), { startTime: model.startedAt || new Date() }
    ));
  }

  /* ------------------------------------------------------------------ */
  /* Telas                                                               */
  /* ------------------------------------------------------------------ */
  function setMode(next) {
    mode = next;
    refining = false;
    if (next === 'active') startWatchingPosition(); else stopWatchingPosition();
    refresh();
  }

  /* ------------------------------------------------------------------ */
  /* "Onde estamos" — pontinho de posição ao vivo durante a rota ativa    */
  /* ------------------------------------------------------------------ */
  var watchId = null;
  function startWatchingPosition() {
    if (watchId !== null || !navigator.geolocation) return;
    watchId = navigator.geolocation.watchPosition(
      function (pos) { if (mapView) mapView.setSelfPosition(pos.coords.latitude, pos.coords.longitude); },
      function () { /* sem permissão/sinal: só não mostra o pontinho, não atrapalha o resto */ },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
  }
  function stopWatchingPosition() {
    if (watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    if (mapView) mapView.clearSelfPosition();
  }

  function refresh() {
    el.viewEmpty.classList.toggle('active', mode === 'empty');
    el.viewRoute.classList.toggle('active', mode !== 'empty');
    if (mode === 'empty') { if (mapView) { mapView.setPins([]); mapView.setRoute(null); } return; }

    renderHeader();
    renderList();
    renderFooter();
    renderMap();
    renderPrintSheet();

    if (lastSavings && mode === 'preview') {
      el.savingsText.textContent = lastSavings;
      el.savingsChip.classList.add('show');
    }
  }

  function renderHeader() {
    var st = model.stats();
    el.routeTitle.textContent = model.meta.title || model.meta.fileLabel;

    if (mode === 'planning') {
      el.routeMetrics.innerHTML = '<b>' + st.total + ' paradas</b>' +
        (st.unlocated ? ' · ' + st.unlocated + ' sem localização' : '');
    } else {
      var m = model.metrics || SPX.optimizer.computeMetrics(model.ordered(), model.startPoint, SPX.settings.all());
      var txt = '<b>' + U.fmtDuration(m.minutes) + '</b> • ' + st.total + ' paradas • ' + U.fmtKm(m.km);
      if (mode === 'active') txt += ' • ' + st.delivered + '/' + st.total + ' entregues';
      el.routeMetrics.innerHTML = txt;
    }
  }

  function renderList() {
    var next = model.nextPending();
    SPX.ui.stopList.render(el.stopList, model, {
      mode: mode,
      refining: refining,
      filter: el.search ? el.search.value : '',
      currentUid: mode === 'active' && next ? next.uid : null,
      onOpen: openStop,
      onMove: function (uid, delta) {
        if (model.move(uid, delta)) { recomputeMetrics(); refresh(); }
      },
      onNavigate: function (uid) {
        var s = model.byUid(uid);
        if (s) U.openExternal(U.mapsDirectionsUrl(s));
      }
    });
  }

  function renderFooter() {
    var st = model.stats();
    if (mode === 'planning') {
      el.panelFoot.innerHTML =
        '<button class="btn btn-primary btn-lg btn-block" id="btnOptimize">🔄 Otimizar rota</button>';
      document.getElementById('btnOptimize').addEventListener('click', optimizeRoute);

    } else if (mode === 'preview') {
      if (refining) {
        el.panelFoot.innerHTML =
          '<button class="btn btn-ghost" id="btnReopt">🔄 Reotimizar</button>' +
          '<button class="btn btn-primary" style="margin-left:auto" id="btnRefineDone">Concluir ajustes</button>';
        document.getElementById('btnRefineDone').addEventListener('click', function () {
          refining = false; model.renumberIds(); recomputeMetrics(); refresh();
        });
        document.getElementById('btnReopt').addEventListener('click', optimizeRoute);
      } else {
        var m = model.metrics || {};
        el.panelFoot.innerHTML =
          '<span class="total">' + U.fmtDuration(m.minutes || 0) + '</span>' +
          '<button class="btn btn-outline" id="btnRefine">Refinar</button>' +
          '<button class="btn btn-primary" style="margin-left:auto" id="btnConfirm">Confirmar</button>';
        document.getElementById('btnRefine').addEventListener('click', function () {
          refining = true; refresh(); U.toast('Use as setas para reordenar as paradas.', 3500);
        });
        document.getElementById('btnConfirm').addEventListener('click', function () {
          model.startedAt = new Date();
          recomputeMetrics();
          setMode('active');
          U.toast('Rota iniciada. Bom trabalho!');
        });
      }

    } else if (mode === 'active') {
      var pend = st.pending;
      el.panelFoot.innerHTML =
        '<span class="total">' + st.delivered + '/' + st.total + '</span>' +
        '<button class="btn btn-primary" style="margin-left:auto" id="btnNext"' +
        (pend ? '' : ' disabled') + '>Próxima parada</button>';
      var btn = document.getElementById('btnNext');
      if (btn) btn.addEventListener('click', function () {
        var n = model.nextPending();
        if (n) openStop(n.uid); else U.toast('Todas as paradas foram finalizadas!');
      });
    }
  }

  function renderMap() {
    if (!mapView) return;
    var next = model.nextPending();
    var pins = model.ordered().map(function (s) {
      return {
        uid: s.uid, lat: s.lat, lon: s.lon, label: s.id, status: s.status,
        suspect: !!s.suspect, estimated: s.geoPrecision === 'estimado',
        current: mode === 'active' && next && next.uid === s.uid
      };
    });
    if (model.startPoint && mode !== 'planning') {
      pins.unshift({
        uid: -1, lat: model.startPoint.lat, lon: model.startPoint.lon,
        label: '', status: 'pending', isStart: true
      });
    }
    mapView.setPins(pins);

    var showLine = SPX.settings.get('showRouteLine') && mode !== 'planning';
    routeLineToken++;
    if (showLine) {
      var pts = [];
      if (model.startPoint) pts.push({ lat: model.startPoint.lat, lon: model.startPoint.lon });
      model.ordered().forEach(function (s) {
        if (s.lat !== null && s.lon !== null) pts.push({ lat: s.lat, lon: s.lon });
      });
      /* Desenha na hora a linha reta (nunca deixa sem linha esperando a
         internet) e, se der certo, troca pela linha seguindo as ruas de
         verdade assim que o serviço de rotas responder. */
      mapView.setRoute(pts);
      if (SPX.fetchRoadRoute && pts.length >= 2) {
        var myToken = routeLineToken;
        SPX.fetchRoadRoute(pts).then(function (roadPts) {
          if (myToken !== routeLineToken || !mapView) return; // tela mudou nesse meio tempo
          if (roadPts && roadPts.length >= 2) mapView.setRoute(roadPts);
        });
      }
    } else {
      mapView.setRoute(null);
    }
    mapView.fitAll();
  }

  function openStop(uid) {
    var stop = model.byUid(uid);
    if (!stop) return;

    /* Rota em andamento: avisa que a parada aberta não é a próxima da
       sequência, mas deixa entregar fora de ordem do mesmo jeito — é comum
       o motorista adiantar uma entrega que está no caminho. */
    if (mode === 'active' && stop.status === 'pending') {
      var next = model.nextPending();
      if (next && next.uid !== stop.uid) {
        U.toast('Você pulou a parada ' + next.id + ' — ' +
          (next.street || next.address) + ', que era a próxima da sequência.', 4500);
      }
    }

    var list = model.ordered();
    SPX.ui.stopSheet.open(stop, {
      position: list.findIndex(function (s) { return s.uid === stop.uid; }) + 1,
      total: list.length,
      selectedFields: model.selectedFields
    });
    if (mapView && stop.lat !== null) mapView.focus(stop.lat, stop.lon);
  }

  /* Ao marcar Entregue/Não entregue durante a rota ativa, segue direto para
     a próxima parada pendente — sem precisar fechar e tocar de novo. */
  function onStopStatusChanged(uid, status) {
    refresh();
    if (mode !== 'active' || (status !== 'delivered' && status !== 'failed')) return;
    var next = model.nextPending();
    setTimeout(function () {
      if (next) openStop(next.uid);
      else { SPX.ui.stopSheet.close(); U.toast('Todas as paradas foram finalizadas!'); }
    }, 350);
  }

  /* ------------------------------------------------------------------ */
  /* Menu ⋮                                                              */
  /* ------------------------------------------------------------------ */
  function openMenu() {
    document.getElementById('menuBackdrop').classList.add('show');
    document.getElementById('menuSheet').classList.add('show');
    var lineItem = document.getElementById('miToggleLine');
    if (lineItem) {
      lineItem.querySelector('.txt').textContent =
        (SPX.settings.get('showRouteLine') ? 'Ocultar' : 'Mostrar') + ' linha da rota';
    }
  }
  function closeMenu() {
    document.getElementById('menuBackdrop').classList.remove('show');
    document.getElementById('menuSheet').classList.remove('show');
  }

  function initMenuActions() {
    var acts = {
      miReoptimize: function () { optimizeRoute(); },
      miRenumber: function () {
        model.renumberIds(); refresh(); U.toast('IDs das paradas redefinidos na ordem atual.');
      },
      miToggleLine: function () {
        SPX.settings.set({ showRouteLine: !SPX.settings.get('showRouteLine') });
        refresh();
      },
      miImport: function () { el.fileInput.click(); },
      miPrint: function () { window.print(); },
      miExport: function () {
        if (!model.stops.length) { U.toast('Não há rota para exportar.'); return; }
        var name = (model.meta.title || 'rota') + ' (otimizada).xlsx';
        SPX.sheetIO.writeAoA(model.toExportAoA(), name);
        U.toast('Planilha exportada: ' + name, 4000);
      },
      miSettings: function () { openSettings(); },
      miClear: function () {
        if (!confirm('Remover todas as paradas e voltar para a tela inicial?')) return;
        geoToken++;
        model = new SPX.RouteModel();
        lastSavings = null;
        el.savingsChip.classList.remove('show');
        el.geoProgress.classList.remove('show');
        setMode('empty');
      }
    };
    Object.keys(acts).forEach(function (id) {
      var node = document.getElementById(id);
      if (node) node.addEventListener('click', function () { closeMenu(); acts[id](); });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Configurações                                                       */
  /* ------------------------------------------------------------------ */
  function initSettingsModal() {
    var backdrop = document.getElementById('settingsBackdrop');
    document.getElementById('btnSettings').addEventListener('click', openSettings);
    document.getElementById('settingsClose').addEventListener('click', function () {
      backdrop.classList.remove('show');
    });
    document.getElementById('settingsCancel').addEventListener('click', function () {
      backdrop.classList.remove('show');
    });
    backdrop.addEventListener('click', function (ev) {
      if (ev.target === backdrop) backdrop.classList.remove('show');
    });

    document.querySelectorAll('#themeSeg .seg-opt').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('#themeSeg .seg-opt').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        SPX.settings.applyTheme(btn.getAttribute('data-theme'));
      });
    });
    document.querySelectorAll('#startSeg .seg-opt').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('#startSeg .seg-opt').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        document.getElementById('startAddressField').style.display =
          btn.getAttribute('data-start') === 'fixed' ? 'block' : 'none';
      });
    });

    document.getElementById('settingsSave').addEventListener('click', function () {
      var theme = document.querySelector('#themeSeg .seg-opt.active').getAttribute('data-theme');
      var startMode = document.querySelector('#startSeg .seg-opt.active').getAttribute('data-start');
      var prevKey = SPX.settings.get('googleKey');
      var prevState = SPX.settings.get('state');
      var newKey = document.getElementById('googleKey').value.trim();
      var newState = document.getElementById('settingsState').value;
      var newCity = document.getElementById('settingsCity').value.trim();

      SPX.settings.set({
        theme: theme,
        startMode: startMode,
        startAddress: document.getElementById('startAddress').value.trim(),
        city: newCity || SPX.settings.DEFAULTS.city,
        state: newState || SPX.settings.DEFAULTS.state,
        googleKey: newKey,
        avgSpeed: clampNum(document.getElementById('avgSpeed').value, 5, 80, SPX.settings.DEFAULTS.avgSpeed),
        stopMinutes: clampNum(document.getElementById('stopMinutes').value, 0, 30, SPX.settings.DEFAULTS.stopMinutes)
      });
      backdrop.classList.remove('show');
      if (model.stops.length) { recomputeMetrics(); }
      refresh();

      if (newKey !== prevKey || newState !== prevState) {
        U.toast('Configurações salvas. Recarregue a página para atualizar o mapa.', 5000);
      } else {
        U.toast('Configurações salvas.');
      }
    });
  }

  /* Número dentro de [min,max]; usa "fallback" se o campo vier vazio ou não-numérico
     (em vez de aceitar qualquer valor digitado, mesmo fora do intervalo esperado). */
  function clampNum(v, min, max, fallback) {
    var n = Number(v);
    if (v === '' || isNaN(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function openSettings() {
    var s = SPX.settings.all();
    document.querySelectorAll('#themeSeg .seg-opt').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-theme') === s.theme);
    });
    document.querySelectorAll('#startSeg .seg-opt').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-start') === s.startMode);
    });
    document.getElementById('startAddressField').style.display = s.startMode === 'fixed' ? 'block' : 'none';
    document.getElementById('startAddress').value = s.startAddress || '';
    document.getElementById('settingsCity').value = s.city || '';
    document.getElementById('settingsState').value = s.state || 'PB';
    document.getElementById('googleKey').value = s.googleKey || '';
    document.getElementById('avgSpeed').value = s.avgSpeed;
    document.getElementById('stopMinutes').value = s.stopMinutes;
    document.getElementById('settingsBackdrop').classList.add('show');
  }

  /* ------------------------------------------------------------------ */
  /* Editar parada                                                       */
  /* ------------------------------------------------------------------ */
  var editingUid = null;
  function initEditModal() {
    var backdrop = document.getElementById('editBackdrop');
    document.getElementById('editClose').addEventListener('click', function () { backdrop.classList.remove('show'); });
    document.getElementById('editCancel').addEventListener('click', function () { backdrop.classList.remove('show'); });
    document.getElementById('editSave').addEventListener('click', function () {
      if (editingUid === null) return;
      var newAddress = document.getElementById('editAddress').value.trim();
      var stop = model.byUid(editingUid);
      var changed = stop && newAddress !== stop.address;
      model.update(editingUid, {
        address: newAddress,
        neighborhood: document.getElementById('editNeighborhood').value.trim(),
        spxTn: document.getElementById('editTn').value.trim()
      });
      backdrop.classList.remove('show');
      refresh();
      if (changed) { U.toast('Endereço alterado — localizando de novo…'); startGeocoding(); }
      else U.toast('Parada atualizada.');
    });
  }

  function openEditModal(uid) {
    var s = model.byUid(uid);
    if (!s) return;
    editingUid = uid;
    document.getElementById('editAddress').value = s.address;
    document.getElementById('editNeighborhood').value = s.neighborhood || '';
    document.getElementById('editTn').value = s.spxTn || '';
    document.getElementById('editBackdrop').classList.add('show');
  }

  /* ------------------------------------------------------------------ */
  /* Folha de impressão                                                  */
  /* ------------------------------------------------------------------ */
  function renderPrintSheet() {
    var target = document.getElementById('printSheet');
    if (!target) return;
    var m = model.metrics;
    var st = model.stats();
    var head = '<div class="print-head"><h1>' + U.escapeHtml(model.meta.title || 'Rota') + '</h1>' +
      '<div class="meta">' + st.total + ' paradas' +
      (m ? ' • ' + U.fmtDuration(m.minutes) + ' • ' + U.fmtKm(m.km) : '') +
      ' • impresso em ' + U.fmtDatePtBr(new Date()) + '</div></div>';

    var rows = model.ordered().map(function (s) {
      return '<tr><td>' + U.escapeHtml(s.id) + '</td>' +
        '<td>' + U.escapeHtml(s.street) + (s.number ? ', ' + U.escapeHtml(s.number) : '') + '</td>' +
        '<td>' + U.escapeHtml(s.complement || '') + '</td>' +
        '<td>' + U.escapeHtml(s.neighborhood || '') + '</td>' +
        '<td>' + U.escapeHtml(s.spxTn || '') + '</td>' +
        '<td>' + (s.eta ? U.fmtClock(s.eta) : '') + '</td>' +
        '<td></td></tr>';
    }).join('');

    target.innerHTML = head +
      '<table class="print-table"><thead><tr>' +
      '<th>ID</th><th>Endereço</th><th>Complemento</th><th>Bairro</th><th>SPX TN</th><th>Previsto</th><th>OK</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>';
  }

  SPX.app = { init: init, model: function () { return model; } };
  document.addEventListener('DOMContentLoaded', init);
})(window.SPX = window.SPX || {});
