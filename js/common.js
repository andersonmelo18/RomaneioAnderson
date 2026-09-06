/* ======================================================================
   Roteirizador SPX — utilidades compartilhadas entre as duas páginas
   (Importar Planilha e Criar Planilha). Este arquivo não depende de
   nenhum elemento específico de uma página — só funções puras e
   constantes usadas nos dois lugares.
====================================================================== */

/* Normaliza texto para comparação: minúsculas, sem acento, sem pontuação. */
function normalizeKey(s){
  return (s===undefined||s===null?'':String(s))
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/[^a-z0-9]+/g,' ')
    .trim();
}

/* Aviso rápido no rodapé da tela. */
function toast(msg, ms){
  const el = document.getElementById('toast');
  if(!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(function(){ el.classList.remove('show'); }, ms||2600);
}

/* Distância em km entre duas coordenadas (fórmula de haversine). */
function haversine(lat1,lon1,lat2,lon2){
  const R=6371;
  const dLat=(lat2-lat1)*Math.PI/180, dLon=(lon2-lon1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}

/* Sinônimos de cabeçalho reconhecidos ao importar/colar uma planilha. */
const HEADER_SYNONYMS = {
  atId: ['at id','atid'],
  sequence: ['sequence','sequencia','seq'],
  stop: ['stop','parada'],
  spxTn: ['spx tn','spxtn','tracking number','tn','tracking'],
  address: ['destination address','endereco de destino','endereco','address','endereco completo'],
  neighborhood: ['neighborhood','bairro'],
  city: ['city','cidade'],
  zip: ['zipcode postal code','zipcode','postal code','cep'],
  addressType: ['address type','tipo de endereco','tipo'],
  corridorCage: ['corridor cage','corridor','cage'],
  lat: ['latitude','lat'],
  lon: ['longitude','lon','lng']
};

const FIELD_LABELS = {
  sequence:'Sequence', atId:'AT ID', stop:'Stop', spxTn:'SPX TN', neighborhood:'Bairro / Neighborhood',
  city:'City', zip:'Zipcode / Postal code', addressType:'Address Type', corridorCage:'Corridor Cage',
  lat:'Latitude', lon:'Longitude'
};

/* Ordem de exibição na tela "o que você quer ver ao chegar".
   Sequence vem logo antes de Stop, igual à listagem do app real. */
const FIELD_ORDER = ['sequence','stop','atId','spxTn','neighborhood','city','zip','addressType','corridorCage','lat','lon'];

/* Detecta, pelo cabeçalho da planilha, qual coluna corresponde a cada campo conhecido. */
function detectColumns(headerRow){
  const map = {};
  (headerRow||[]).forEach(function(h, idx){
    const norm = normalizeKey(h);
    if(!norm) return;
    for(const key in HEADER_SYNONYMS){
      if(map[key]!==undefined) continue;
      if(HEADER_SYNONYMS[key].some(function(syn){ return normalizeKey(syn)===norm; })){
        map[key]=idx;
      }
    }
  });
  return map;
}

/* Formata uma data como DD-MM-AAAA (padrão usado no nome do arquivo/rota). */
function fmtDatePtBr(d){
  const dd=String(d.getDate()).padStart(2,'0'), mm=String(d.getMonth()+1).padStart(2,'0'), yy=d.getFullYear();
  return dd+'-'+mm+'-'+yy;
}
