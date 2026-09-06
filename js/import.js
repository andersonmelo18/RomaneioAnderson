/* ======================================================================
   Roteirizador SPX — página "Importar Planilha"
   Depende de: common.js, XLSX (vendor/xlsx.full.min.js), Leaflet (vendor/leaflet.js)
====================================================================== */
(function(){
  "use strict";

  const state = {
    rawRows: null,
    columnMap: {},
    selectedFields: [],
    stops: [],
    fileLabel: 'Rota importada',
    importToken: 0 // incrementado a cada importação/reset, usado para cancelar geocodificação antiga
  };

  const fileInput = document.getElementById('fileInput');
  fileInput.addEventListener('change', function(e){
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = function(evt){
      try{
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, {type:'array'});
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, {header:1, raw:true, defval:''});
        if(!rows.length){ toast('Planilha vazia.'); return; }
        state.rawRows = rows;
        state.columnMap = detectColumns(rows[0]);
        if(state.columnMap.address===undefined || state.columnMap.sequence===undefined){
          toast('Não foi possível identificar as colunas "Sequence" e "Destination Address". Verifique o arquivo.');
          return;
        }
        state.fileLabel = file.name.replace(/\.[^.]+$/,'');
        openWizardIntro();
      }catch(err){
        console.error(err);
        toast('Erro ao ler o arquivo. Confirme que é um .xlsx válido.');
      }
    };
    reader.readAsArrayBuffer(file);
  });

  /* ---- Wizard: "o que você quer ver ao chegar" ---- */
  const wizardIntro = document.getElementById('wizardIntro');
  const wizardFields = document.getElementById('wizardFields');

  function openWizardIntro(){ wizardIntro.classList.remove('hidden'); }
  document.getElementById('wizardCancel').addEventListener('click', function(){
    wizardIntro.classList.add('hidden');
    fileInput.value='';
  });
  document.getElementById('wizardNext1').addEventListener('click', function(){
    wizardIntro.classList.add('hidden');
    const extraKeys = FIELD_ORDER.filter(function(k){ return state.columnMap[k]!==undefined; });
    if(extraKeys.length===0){
      finalizeImport([]);
      return;
    }
    const list = document.getElementById('fieldsList');
    list.innerHTML = '';
    extraKeys.forEach(function(key){
      const colIdx = state.columnMap[key];
      const samples = [];
      for(let i=1;i<state.rawRows.length && samples.length<3;i++){
        const v = state.rawRows[i][colIdx];
        if(v!==undefined && v!=='' && v!=='-') samples.push(v);
      }
      const row = document.createElement('label');
      row.className='field-check';
      row.innerHTML = '<input type="checkbox" value="'+key+'">'+
        '<div><div class="fname">'+(FIELD_LABELS[key]||key)+'</div>'+
        '<div class="fsample">'+samples.join(', ')+'</div></div>';
      list.appendChild(row);
    });
    wizardFields.classList.remove('hidden');
  });
  document.getElementById('wizardBack').addEventListener('click', function(){
    wizardFields.classList.add('hidden');
    wizardIntro.classList.remove('hidden');
  });
  document.getElementById('wizardFinish').addEventListener('click', function(){
    const checked = Array.prototype.slice.call(wizardFields.querySelectorAll('input[type=checkbox]:checked'))
      .map(function(el){ return el.value; });
    wizardFields.classList.add('hidden');
    finalizeImport(checked);
  });

  function cell(row, key){
    const idx = state.columnMap[key];
    if(idx===undefined) return '';
    const v = row[idx];
    return (v===undefined||v===null) ? '' : v;
  }

  function sleep(ms){ return new Promise(function(resolve){ setTimeout(resolve, ms); }); }

  /* ---- Geocodificação (só roda para linhas sem Latitude/Longitude na planilha) ----
     Usa o serviço público e gratuito Nominatim (OpenStreetMap), com busca
     ESTRUTURADA (rua/cidade/estado separados) em vez de texto livre — isso reduz
     erro de interpretação do endereço. Não existe chave nem custo, mas também não
     há garantia de encontrar o número exato do prédio em condomínios/loteamentos
     informais: quando isso acontece, a parada fica marcada como "sem localização"
     em vez de aparecer no lugar errado no mapa. */
  function addressCore(address){
    const parts = String(address||'').split(',').map(function(p){ return p.trim(); }).filter(Boolean);
    return parts.length>=2 ? (parts[0]+', '+parts[1]) : (parts[0]||address);
  }

  function geocodeAddress(street, city){
    return new Promise(function(resolve){
      const controller = new AbortController();
      const timer = setTimeout(function(){ controller.abort(); }, 8000);
      const params = new URLSearchParams({
        format:'json', limit:'1', countrycodes:'br',
        street: street, city: city||'João Pessoa', state:'Paraíba', country:'Brasil'
      });
      fetch('https://nominatim.openstreetmap.org/search?'+params.toString(), {
        signal:controller.signal, headers:{'Accept':'application/json'}
      })
        .then(function(res){ return res.ok ? res.json() : null; })
        .then(function(data){
          clearTimeout(timer);
          if(data && data.length){ resolve({lat:parseFloat(data[0].lat), lon:parseFloat(data[0].lon)}); }
          else resolve(null);
        })
        .catch(function(){ clearTimeout(timer); resolve(null); });
    });
  }

  /* Um mesmo prédio costuma ter várias entregas (apartamentos diferentes).
     Em vez de geocodificar cada linha, agrupamos por "rua + número" e fazemos
     UMA busca por grupo — isso é o que torna o processo rápido mesmo com
     dezenas de pacotes, já que o limite do serviço gratuito é de ~1 busca
     por segundo (ir mais rápido que isso arrisca a busca ser bloqueada). */
  async function runGeocoding(list, myToken){
    const banner = document.getElementById('geoProgressBanner');
    const text = document.getElementById('geoProgressText');

    const groups = {};
    const groupOrder = [];
    list.forEach(function(s){
      const key = normalizeKey(addressCore(s.address))+'|'+normalizeKey(s.city||'joao pessoa');
      if(!groups[key]){ groups[key]=[]; groupOrder.push(key); }
      groups[key].push(s);
    });

    banner.style.display='flex';
    for(let g=0; g<groupOrder.length; g++){
      if(myToken!==state.importToken){ banner.style.display='none'; return; } // uma nova importação começou — cancela
      const members = groups[groupOrder[g]];
      const rep = members[0];
      text.textContent = '🔎 Localizando endereços no mapa... '+(g+1)+'/'+groupOrder.length+' ruas ('+list.length+' pacotes)';
      const res = await geocodeAddress(addressCore(rep.address), rep.city);
      if(myToken!==state.importToken){ banner.style.display='none'; return; }
      members.forEach(function(s){
        if(res){ s.lat = res.lat; s.lon = res.lon; s.geoFailed = false; }
        else { s.geoFailed = true; }
      });
      renderAll();
      if(g<groupOrder.length-1) await sleep(1100);
    }
    banner.style.display='none';
    const failedCount = list.filter(function(s){ return s.geoFailed; }).length;
    if(failedCount){
      toast(failedCount+' endereço(s) não foram localizados automaticamente — use o botão "Navegar" para abrir no Google Maps.', 4500);
    } else if(list.length){
      toast('Todos os endereços foram localizados no mapa.');
    }
  }

  async function finalizeImport(selectedFields){
    state.importToken++;
    const myToken = state.importToken;
    state.selectedFields = selectedFields;
    const rows = state.rawRows.slice(1);
    const stops = [];
    rows.forEach(function(row, idx){
      const address = String(cell(row,'address')||'').trim();
      if(!address) return;
      const seqRaw = cell(row,'sequence');
      const seqNum = parseFloat(seqRaw);
      const hasSeq = seqRaw!=='' && seqRaw!=='-' && !isNaN(seqNum);
      let lat = parseFloat(cell(row,'lat'));
      let lon = parseFloat(cell(row,'lon'));
      if(isNaN(lat) || isNaN(lon)){ lat=null; lon=null; }
      stops.push({
        rowIndex: idx,
        atId: cell(row,'atId'),
        sequence: hasSeq ? seqNum : (idx+1),
        originalSequence: hasSeq ? seqNum : (idx+1),
        newSequence: null,
        stopNum: cell(row,'stop'),
        spxTn: cell(row,'spxTn'),
        address: address,
        neighborhood: cell(row,'neighborhood'),
        city: cell(row,'city'),
        zip: cell(row,'zip'),
        addressType: cell(row,'addressType'),
        corridorCage: cell(row,'corridorCage'),
        lat: lat, lon: lon,
        geoFailed: false,
        status: 'pending',
        hasSeq: hasSeq
      });
    });
    if(!stops.length){ toast('Nenhuma parada válida encontrada na planilha.'); return; }

    stops.sort(function(a,b){ return a.sequence-b.sequence; });
    state.stops = stops;
    document.getElementById('uploadCard').style.display='none';
    document.getElementById('routeScreen').style.display='block';
    document.getElementById('routeTitle').textContent = state.fileLabel;
    initMap();
    renderAll();
    toast('Planilha importada: '+stops.length+' paradas.');

    const toGeocode = stops.filter(function(s){ return s.lat==null; });
    if(toGeocode.length){
      await runGeocoding(toGeocode, myToken);
    }
  }

  document.getElementById('btnNewImport').addEventListener('click', function(){
    state.importToken++; // cancela qualquer geocodificação em andamento da importação anterior
    document.getElementById('routeScreen').style.display='none';
    document.getElementById('uploadCard').style.display='block';
    fileInput.value='';
    state.stops=[];
    state.rawRows=null;
    state.columnMap={};
    state.selectedFields=[];
    document.getElementById('savingsBanner').style.display='none';
    document.getElementById('geoProgressBanner').style.display='none';
    document.getElementById('stopList').innerHTML='';
    document.getElementById('routeStats').textContent='0 paradas';
    document.getElementById('routeTitle').textContent='Rota importada';
    if(markersLayer) markersLayer.clearLayers();
    closeSheet();
  });

  /* ---- Mapa ---- */
  let map=null, markersLayer=null;
  function initMap(){
    if(map) return;
    map = L.map('map').setView([-7.2050,-34.8700], 14);
    window.__spxMap = map;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom:19, attribution:'&copy; OpenStreetMap'
    }).addTo(map);
    markersLayer = L.layerGroup().addTo(map);
    setTimeout(function(){ map.invalidateSize(); }, 100);
  }

  function statusColor(s){
    if(s.status==='delivered') return '#1E8E3E';
    if(s.status==='not_delivered') return '#D5342E';
    return '#EE4D2D';
  }

  /* Paradas que caem exatamente na mesma coordenada (mesmo prédio) ficariam
     uma em cima da outra e só a de cima seria clicável. Espalhamos essas em
     um pequeno leque ao redor do ponto real — a coordenada verdadeira (usada
     para navegar) continua sendo a exata, isso é só para exibição. */
  function computeDisplayPositions(){
    const groups = {};
    state.stops.forEach(function(s){
      if(s.lat==null || s.lon==null) return;
      const key = s.lat.toFixed(5)+','+s.lon.toFixed(5);
      (groups[key] = groups[key]||[]).push(s);
    });
    Object.keys(groups).forEach(function(key){
      const group = groups[key];
      const n = group.length;
      if(n===1){
        group[0]._dLat = group[0].lat;
        group[0]._dLon = group[0].lon;
        return;
      }
      const baseLat = group[0].lat, baseLon = group[0].lon;
      const latCos = Math.cos(baseLat*Math.PI/180) || 1;
      const radiusDeg = 0.00006 + n*0.000008;
      group.forEach(function(s, i){
        const angle = (2*Math.PI*i/n) - Math.PI/2;
        s._dLat = baseLat + radiusDeg*Math.sin(angle);
        s._dLon = baseLon + (radiusDeg*Math.cos(angle))/latCos;
      });
    });
  }

  function renderMarkers(){
    computeDisplayPositions();
    markersLayer.clearLayers();
    const bounds=[];
    state.stops.forEach(function(s){
      if(s.lat==null || s.lon==null) return; // sem localização — só aparece na lista
      const icon = L.divIcon({
        className:'', iconSize:[30,30], iconAnchor:[15,30],
        html:'<div class="pin" style="background:'+statusColor(s)+'"><span>'+(s.newSequence||s.sequence)+'</span></div>'
      });
      const marker = L.marker([s._dLat,s._dLon], {icon:icon}).addTo(markersLayer);
      marker.on('click', function(){ openStopDetail(s); });
      bounds.push([s._dLat,s._dLon]);
    });
    if(bounds.length) map.fitBounds(bounds, {padding:[36,36]});
  }

  function renderStopsList(){
    const list = document.getElementById('stopList');
    list.innerHTML='';
    const ordered = state.stops.slice().sort(function(a,b){ return (a.newSequence||a.sequence)-(b.newSequence||b.sequence); });
    ordered.forEach(function(s){
      const row = document.createElement('div');
      row.className = 'stop-row '+s.status;
      const tags = [];
      if(s.neighborhood) tags.push('<span class="tag">'+escapeHtml(s.neighborhood)+'</span>');
      if(s.spxTn) tags.push('<span class="tag">'+escapeHtml(s.spxTn)+'</span>');
      if(s.newSequence && s.newSequence!==s.originalSequence) tags.push('<span class="tag orig">Originally '+ordinal(s.originalSequence)+'</span>');
      if(s.lat==null) tags.push('<span class="tag" style="background:#FDEAEA;color:#B23A34;">📍 sem localização</span>');
      row.innerHTML =
        '<div class="badge">'+(s.newSequence||s.sequence)+'</div>'+
        '<div class="info">'+
          '<div class="addr">'+escapeHtml(s.address)+'</div>'+
          '<div class="meta">'+escapeHtml(s.neighborhood||'')+(s.addressType?' • '+escapeHtml(s.addressType):'')+'</div>'+
          '<div class="tags">'+tags.join('')+'</div>'+
        '</div>';
      row.addEventListener('click', function(){ openStopDetail(s); });
      list.appendChild(row);
    });
    document.getElementById('routeStats').textContent = ordered.length+' paradas';
  }

  function ordinal(n){ return Math.round(n)+'ª'; }
  function escapeHtml(s){
    return String(s===undefined?'':s).replace(/[&<>"']/g, function(c){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
    });
  }

  function renderAll(){ renderMarkers(); renderStopsList(); }

  /* ---- Otimizar rota (algoritmo do vizinho mais próximo) ---- */
  document.getElementById('btnOptimize').addEventListener('click', function(){
    const all = state.stops;
    const routable = all.filter(function(s){ return s.lat!=null && s.lon!=null; });
    const nonRoutable = all.filter(function(s){ return s.lat==null || s.lon==null; });
    if(routable.length<2){ toast('Não há paradas suficientes com localização para otimizar.'); return; }
    const before = routable.slice().sort(function(a,b){ return a.sequence-b.sequence; });
    const distBefore = totalDistance(before);

    const start = before[0];
    let remaining = routable.filter(function(s){ return s!==start; });
    const ordered = [start];
    let current = start;
    while(remaining.length){
      let bestIdx=0, bestDist=Infinity;
      remaining.forEach(function(s,i){
        const d = haversine(current.lat,current.lon,s.lat,s.lon);
        if(d<bestDist){ bestDist=d; bestIdx=i; }
      });
      current = remaining.splice(bestIdx,1)[0];
      ordered.push(current);
    }
    ordered.forEach(function(s,i){ s.newSequence = i+1; });
    nonRoutable.slice().sort(function(a,b){ return a.sequence-b.sequence; })
      .forEach(function(s,i){ s.newSequence = ordered.length+i+1; });

    const distAfter = totalDistance(ordered);
    const savedKm = Math.max(0, distBefore-distAfter);
    const banner = document.getElementById('savingsBanner');
    if(savedKm>0.05){
      document.getElementById('savingsText').textContent =
        '✅ Economizou '+savedKm.toFixed(1)+' km otimizando a rota';
      banner.style.display='flex';
    } else {
      banner.style.display='none';
    }
    renderAll();
    if(nonRoutable.length){
      toast('Rota otimizada. '+nonRoutable.length+' parada(s) sem localização ficaram no fim da lista.', 4000);
    } else {
      toast('Rota otimizada com sucesso.');
    }
  });
  document.getElementById('closeSavings').addEventListener('click', function(){
    document.getElementById('savingsBanner').style.display='none';
  });

  function totalDistance(list){
    let d=0;
    for(let i=1;i<list.length;i++){ d+=haversine(list[i-1].lat,list[i-1].lon,list[i].lat,list[i].lon); }
    return d;
  }

  document.getElementById('btnStart').addEventListener('click', function(){
    const next = state.stops.slice().sort(function(a,b){ return (a.newSequence||a.sequence)-(b.newSequence||b.sequence); })
      .find(function(s){ return s.status==='pending'; });
    if(!next){ toast('Todas as paradas já foram finalizadas.'); return; }
    openStopDetail(next);
  });

  /* ---- Painel de detalhe da parada ---- */
  let currentStop = null;
  const sheet = document.getElementById('stopSheet');
  const backdrop = document.getElementById('sheetBackdrop');

  function openStopDetail(stop){
    currentStop = stop;
    document.getElementById('sheetTitle').textContent = stop.address;
    const idx = state.stops.slice().sort(function(a,b){ return (a.newSequence||a.sequence)-(b.newSequence||b.sequence); }).indexOf(stop)+1;
    document.getElementById('sheetSub').textContent = idx+'/'+state.stops.length +
      (stop.neighborhood ? ' • '+stop.neighborhood : '');

    const rowsWrap = document.getElementById('sheetRows');
    const sel = state.selectedFields;
    let rowsHtml = '';
    function addRow(k,v){ if(v!==undefined && v!==null && v!=='') rowsHtml += '<div class="sheet-row"><div class="k">'+k+'</div><div class="v">'+escapeHtml(v)+'</div></div>'; }
    if(sel.indexOf('sequence')>-1) addRow('Sequence', stop.originalSequence);
    if(sel.indexOf('stop')>-1) addRow('Stop', stop.stopNum);
    if(sel.indexOf('atId')>-1) addRow('AT ID', stop.atId);
    if(sel.indexOf('spxTn')>-1) addRow('SPX TN', stop.spxTn);
    if(sel.indexOf('neighborhood')>-1) addRow('Bairro', stop.neighborhood);
    if(sel.indexOf('city')>-1) addRow('Cidade', stop.city);
    if(sel.indexOf('zip')>-1) addRow('CEP', stop.zip);
    if(sel.indexOf('addressType')>-1) addRow('Tipo de endereço', stop.addressType);
    if(sel.indexOf('corridorCage')>-1) addRow('Corridor / Cage', stop.corridorCage);
    if(sel.indexOf('lat')>-1) addRow('Latitude', stop.lat!=null ? stop.lat.toFixed(6) : '');
    if(sel.indexOf('lon')>-1) addRow('Longitude', stop.lon!=null ? stop.lon.toFixed(6) : '');
    if(stop.newSequence && stop.newSequence!==stop.originalSequence){
      rowsHtml += '<div class="sheet-row"><div class="k">ID</div><div class="v">'+stop.newSequence+' <span style="color:#999;font-weight:500;">(Originally '+ordinal(stop.originalSequence)+')</span></div></div>';
    } else {
      rowsHtml += '<div class="sheet-row"><div class="k">ID</div><div class="v">'+(stop.newSequence||stop.sequence)+'</div></div>';
    }
    if(stop.lat==null){
      rowsHtml += '<div class="sheet-row"><div class="k">Localização</div><div class="v" style="color:#D6431F;">📍 endereço não localizado no mapa</div></div>';
    }
    rowsWrap.innerHTML = rowsHtml;

    updateStatusButtons();
    backdrop.classList.add('show');
    sheet.classList.add('show');
  }
  function closeSheet(){
    sheet.classList.remove('show');
    backdrop.classList.remove('show');
    currentStop=null;
  }
  document.getElementById('sheetClose').addEventListener('click', closeSheet);
  backdrop.addEventListener('click', closeSheet);

  function updateStatusButtons(){
    const bNao = document.getElementById('btnNaoEntregue');
    const bSim = document.getElementById('btnEntregue');
    bNao.classList.toggle('active-status', currentStop && currentStop.status==='not_delivered');
    bSim.classList.toggle('active-status', currentStop && currentStop.status==='delivered');
    bNao.classList.toggle('btn-danger', currentStop && currentStop.status==='not_delivered');
    bSim.classList.toggle('btn-success', currentStop && currentStop.status==='delivered');
  }

  document.getElementById('btnNavegar').addEventListener('click', function(){
    if(!currentStop) return;
    let url;
    if(currentStop.lat!=null){
      url = 'https://www.google.com/maps/dir/?api=1&destination='+currentStop.lat+','+currentStop.lon;
    } else {
      const q = encodeURIComponent(currentStop.address+', '+(currentStop.neighborhood||'')+', '+(currentStop.city||'João Pessoa'));
      url = 'https://www.google.com/maps/dir/?api=1&destination='+q;
    }
    window.open(url, '_blank');
  });
  document.getElementById('btnNaoEntregue').addEventListener('click', function(){
    if(!currentStop) return;
    currentStop.status = currentStop.status==='not_delivered' ? 'pending' : 'not_delivered';
    updateStatusButtons(); renderAll();
  });
  document.getElementById('btnEntregue').addEventListener('click', function(){
    if(!currentStop) return;
    currentStop.status = currentStop.status==='delivered' ? 'pending' : 'delivered';
    updateStatusButtons(); renderAll();
  });

})();
