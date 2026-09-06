/* ======================================================================
   Roteirizador SPX — página "Criar Planilha" (romaneio → xlsx)
   Depende de: common.js, XLSX (vendor/xlsx.full.min.js)
====================================================================== */
(function(){
  "use strict";

  let rows = []; // {sequence, stop, spxTn, address, neighborhood, addressType}

  const dateInput = document.getElementById('routeDate');
  const today = new Date();
  dateInput.value = today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');

  function splitLine(line){
    let parts = line.split('\t');
    if(parts.length<3) parts = line.split(/\s{2,}/);
    if(parts.length<3) parts = line.split(/[;,]/);
    return parts.map(function(p){ return p.trim(); });
  }

  function parseRomaneio(text){
    const lines = text.split(/\r?\n/).map(function(l){ return l.trim(); }).filter(function(l){ return l.length; });
    if(!lines.length) return [];
    let dataLines = lines;
    const firstParts = splitLine(lines[0]).map(normalizeKey);
    const headerWords = ['sequence','spx','destination','address','neighborhood','bairro','type','stop','tn'];
    const looksHeader = firstParts.some(function(c){ return headerWords.some(function(h){ return c.indexOf(h)>-1; }); });
    let colMap = null;
    if(looksHeader){
      colMap = detectColumns(splitLine(lines[0]));
      dataLines = lines.slice(1);
    }
    const out = [];
    dataLines.forEach(function(line){
      const cols = splitLine(line);
      if(cols.length<3) return;
      let seq, stop, tn, addr, nb, type;
      if(colMap){
        seq = colMap.sequence!==undefined ? cols[colMap.sequence] : '';
        stop = colMap.stop!==undefined ? cols[colMap.stop] : '';
        tn = colMap.spxTn!==undefined ? cols[colMap.spxTn] : '';
        addr = colMap.address!==undefined ? cols[colMap.address] : '';
        nb = colMap.neighborhood!==undefined ? cols[colMap.neighborhood] : '';
        type = colMap.addressType!==undefined ? cols[colMap.addressType] : '';
      } else if(cols.length>=6){
        seq=cols[0]; stop=cols[1]; tn=cols[2]; addr=cols[3]; nb=cols[4]; type=cols[5];
      } else {
        seq=cols[0]; tn=cols[1]; addr=cols[2]; nb=cols[3]; type=cols[4]||'';
        stop='';
      }
      if(!addr) return;
      out.push({
        sequence: seq || (out.length+1),
        stop: stop || '',
        spxTn: tn || '',
        address: addr || '',
        neighborhood: nb || '',
        addressType: (type||'HOME').toUpperCase().indexOf('OFFICE')>-1 ? 'OFFICE' : ((type||'HOME').toUpperCase().indexOf('OTHER')>-1?'OTHER':'HOME')
      });
    });
    return out;
  }

  function recomputeStopNumbers(){
    let stopCounter = 0;
    let lastAddr = null;
    rows.forEach(function(r){
      if(r.stop!=='' && r.stop!=null && !isNaN(parseFloat(r.stop))){
        lastAddr = normalizeKey(r.address);
        stopCounter = Math.max(stopCounter, parseFloat(r.stop));
        return;
      }
      const nk = normalizeKey(r.address);
      if(nk!==lastAddr){ stopCounter++; lastAddr = nk; }
      r.stop = stopCounter;
    });
  }

  function renderPreview(){
    recomputeStopNumbers();
    const body = document.getElementById('previewBody');
    body.innerHTML='';
    rows.forEach(function(r, i){
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td><input data-i="'+i+'" data-f="sequence" value="'+escapeAttr(r.sequence)+'" style="width:48px;"></td>'+
        '<td><input data-i="'+i+'" data-f="stop" value="'+escapeAttr(r.stop)+'" style="width:42px;"></td>'+
        '<td><input data-i="'+i+'" data-f="spxTn" value="'+escapeAttr(r.spxTn)+'"></td>'+
        '<td><input data-i="'+i+'" data-f="address" value="'+escapeAttr(r.address)+'"></td>'+
        '<td><input data-i="'+i+'" data-f="neighborhood" value="'+escapeAttr(r.neighborhood)+'"></td>'+
        '<td><select data-i="'+i+'" data-f="addressType">'+
          ['HOME','OFFICE','OTHER'].map(function(t){ return '<option'+(r.addressType===t?' selected':'')+'>'+t+'</option>'; }).join('')+
        '</select></td>'+
        '<td><button class="row-del" data-del="'+i+'">✕</button></td>';
      body.appendChild(tr);
    });
    document.getElementById('rowCountPill').textContent = rows.length+' linhas';

    body.querySelectorAll('input,select').forEach(function(el){
      el.addEventListener('change', function(){
        const i = parseInt(el.getAttribute('data-i'));
        const f = el.getAttribute('data-f');
        rows[i][f] = el.value;
        renderPreview();
      });
    });
    body.querySelectorAll('[data-del]').forEach(function(el){
      el.addEventListener('click', function(){
        rows.splice(parseInt(el.getAttribute('data-del')),1);
        renderPreview();
      });
    });
  }
  function escapeAttr(s){ return String(s===undefined?'':s).replace(/"/g,'&quot;'); }

  document.getElementById('btnParse').addEventListener('click', function(){
    const text = document.getElementById('romaneioInput').value;
    const parsed = parseRomaneio(text);
    if(!parsed.length){ toast('Não consegui identificar linhas válidas no texto colado.'); return; }
    rows = parsed;
    renderPreview();
    toast(parsed.length+' linhas processadas.');
  });

  document.getElementById('btnClearAll').addEventListener('click', function(){
    if(!confirm('Limpar todas as linhas da prévia?')) return;
    rows=[];
    document.getElementById('romaneioInput').value='';
    renderPreview();
  });

  document.getElementById('btnAddRow').addEventListener('click', function(){
    const addr = document.getElementById('mAddr').value.trim();
    if(!addr){ toast('Informe o endereço.'); return; }
    rows.push({
      sequence: document.getElementById('mSeq').value || (rows.length+1),
      stop:'',
      spxTn: document.getElementById('mTn').value.trim(),
      address: addr,
      neighborhood: document.getElementById('mBairro').value.trim(),
      addressType: document.getElementById('mType').value
    });
    document.getElementById('mSeq').value='';
    document.getElementById('mTn').value='';
    document.getElementById('mAddr').value='';
    document.getElementById('mBairro').value='';
    renderPreview();
  });

  function generateAtId(d){
    const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
    const rand = Math.random().toString(36).substring(2,7).toUpperCase();
    return 'AT'+y+m+day+rand;
  }

  document.getElementById('btnExport').addEventListener('click', function(){
    if(!rows.length){ toast('Não há linhas para exportar. Processe o romaneio primeiro.'); return; }
    recomputeStopNumbers();
    const driverName = (document.getElementById('driverName').value || 'MOTORISTA').trim().toUpperCase();
    const city = document.getElementById('defaultCity').value.trim() || 'João Pessoa';
    const dParts = dateInput.value.split('-');
    const dateObj = new Date(parseInt(dParts[0]), parseInt(dParts[1])-1, parseInt(dParts[2]));
    const atId = generateAtId(dateObj);

    const header = ['AT ID','Sequence','Stop','SPX TN','Destination Address','Bairro','City','Zipcode/Postal code','Latitude','Longitude','Address Type'];
    const data = [header];
    rows.forEach(function(r){
      data.push([atId, r.sequence, r.stop, r.spxTn, r.address, r.neighborhood, city, '', '', '', r.addressType]);
    });
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{wch:16},{wch:8},{wch:6},{wch:17},{wch:42},{wch:18},{wch:14},{wch:14},{wch:11},{wch:11},{wch:12}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const fileName = fmtDatePtBr(dateObj)+' '+driverName+'.xlsx';
    XLSX.writeFile(wb, fileName);
    toast('Planilha gerada: '+fileName);
  });

  renderPreview();
})();
