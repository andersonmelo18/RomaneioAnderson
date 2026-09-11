/* ======================================================================
   SPX.createMapView — camada de mapa.
   Sem chave: Leaflet + OpenStreetMap. Com chave do Google: mapa do Google
   (mesmo visual do Spoke). As telas usam sempre a mesma interface.
====================================================================== */
(function (SPX) {
  'use strict';

  var U = SPX.utils;

  /* Carrega a API JavaScript do Google uma única vez. */
  var googleLoading = null;
  function loadGoogleMaps(key) {
    if (window.google && window.google.maps) return Promise.resolve();
    if (googleLoading) return googleLoading;
    googleLoading = new Promise(function (resolve, reject) {
      var cbName = '__spxGoogleReady';
      window[cbName] = function () { resolve(); };
      var s = document.createElement('script');
      s.async = true;
      s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(key) +
        '&language=pt-BR&region=BR&callback=' + cbName;
      s.onerror = function () {
        googleLoading = null;
        reject(new Error('Falha ao carregar o Google Maps (verifique a chave).'));
      };
      document.head.appendChild(s);
    });
    return googleLoading;
  }
  SPX.loadGoogleMaps = loadGoogleMaps;

  var COLORS = {
    pending: null,        // usa a cor do tema, lida do CSS
    delivered: '#1E8E3E',
    failed: '#D93025',
    start: '#202124',
    suspect: '#E37400'
  };

  function themeColor() {
    var v = getComputedStyle(document.documentElement).getPropertyValue('--pin');
    return (v || '#EE4D2D').trim();
  }

  function colorFor(status) {
    return COLORS[status] || themeColor();
  }

  /* Paradas no mesmo prédio caem na mesma coordenada e ficariam uma sobre a
     outra. Espalha em leque só para exibição — a coordenada real não muda. */
  function fanOut(pins) {
    var groups = {};
    pins.forEach(function (p) {
      var k = p.lat.toFixed(5) + ',' + p.lon.toFixed(5);
      (groups[k] = groups[k] || []).push(p);
    });
    Object.keys(groups).forEach(function (k) {
      var g = groups[k];
      if (g.length === 1) { g[0].dLat = g[0].lat; g[0].dLon = g[0].lon; return; }
      var baseLat = g[0].lat, baseLon = g[0].lon;
      var latCos = Math.cos(baseLat * Math.PI / 180) || 1;
      var radius = 0.00007 + g.length * 0.000008;
      g.forEach(function (p, i) {
        var ang = (2 * Math.PI * i / g.length) - Math.PI / 2;
        p.dLat = baseLat + radius * Math.sin(ang);
        p.dLon = baseLon + (radius * Math.cos(ang)) / latCos;
      });
    });
    return pins;
  }

  /* ------------------------------ Leaflet ------------------------------ */
  function defaultCenter() {
    return U.stateCenter(SPX.settings.get('state'));
  }

  function LeafletView(el, opts) {
    var c = defaultCenter();
    this.map = L.map(el, { zoomControl: true, attributionControl: true })
      .setView([c.lat, c.lon], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap'
    }).addTo(this.map);
    this.markers = L.layerGroup().addTo(this.map);
    this.line = null;
    this.selfMarker = null;
    this.onPinClick = opts.onPinClick || function () {};
    this.bounds = [];
    var self = this;
    setTimeout(function () { self.map.invalidateSize(); }, 120);
  }

  /* "Onde estamos": um pontinho azul de posição atual, igual ao do Maps —
     separado dos pinos de entrega e nunca entra no enquadramento automático
     (senão o mapa ficaria pulando enquanto o motorista dirige). */
  LeafletView.prototype.setSelfPosition = function (lat, lon) {
    if (lat === null || lon === null) return this.clearSelfPosition();
    if (this.selfMarker) { this.selfMarker.setLatLng([lat, lon]); return; }
    var icon = L.divIcon({ className: '', iconSize: [18, 18], iconAnchor: [9, 9], html: '<div class="self-pos"></div>' });
    this.selfMarker = L.marker([lat, lon], { icon: icon, zIndexOffset: 2000, interactive: false }).addTo(this.map);
  };
  LeafletView.prototype.clearSelfPosition = function () {
    if (this.selfMarker) { this.map.removeLayer(this.selfMarker); this.selfMarker = null; }
  };

  LeafletView.prototype.setPins = function (pins) {
    var self = this;
    this.markers.clearLayers();
    this.bounds = [];
    fanOut(pins.filter(function (p) { return p.lat !== null && p.lon !== null; }))
      .forEach(function (p) {
        var cls = 'pin' + (p.status === 'delivered' ? ' delivered' : p.status === 'failed' ? ' failed' : '') +
          (p.current ? ' current' : '') + (p.isStart ? ' start' : '') + (p.suspect ? ' suspect' : '') +
          (p.estimated ? ' estimated' : '');
        var icon = L.divIcon({
          className: '', iconSize: [28, 34], iconAnchor: [14, 34],
          html: '<div class="' + cls + '">' + U.escapeHtml(p.label) + '</div>'
        });
        var m = L.marker([p.dLat, p.dLon], { icon: icon, zIndexOffset: p.current ? 1000 : 0 })
          .addTo(self.markers);
        m.on('click', function () { self.onPinClick(p.uid); });
        self.bounds.push([p.dLat, p.dLon]);
      });
  };

  LeafletView.prototype.setRoute = function (points) {
    if (this.line) { this.map.removeLayer(this.line); this.line = null; }
    if (!points || points.length < 2) return;
    this.line = L.polyline(points.map(function (p) { return [p.lat, p.lon]; }),
      { color: themeColor(), weight: 4, opacity: .75 }).addTo(this.map);
  };

  /* No celular o painel cobre a parte de baixo do mapa: o enquadramento
     precisa reservar esse espaço para os pinos não ficarem escondidos. */
  function bottomInset() {
    if (window.innerWidth > 900) return 0;
    var panel = document.querySelector('.panel');
    return panel ? Math.min(panel.offsetHeight + 12, window.innerHeight * 0.7) : 0;
  }

  LeafletView.prototype.fitAll = function () {
    if (!this.bounds.length) return;
    this.map.fitBounds(this.bounds, {
      paddingTopLeft: [40, 50],
      paddingBottomRight: [40, 40 + bottomInset()],
      maxZoom: 17
    });
  };

  LeafletView.prototype.focus = function (lat, lon) {
    this.map.setView([lat, lon], Math.max(this.map.getZoom(), 17), { animate: true });
  };

  LeafletView.prototype.invalidate = function () { this.map.invalidateSize(); };

  /* ------------------------------ Google ------------------------------ */
  function svgPin(label, color) {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="34" height="42" viewBox="0 0 34 42">' +
      '<path d="M17 41 L11 32 h12 Z" fill="' + color + '"/>' +
      '<rect x="2" y="1" width="30" height="31" rx="8" fill="' + color + '" stroke="#fff" stroke-width="2"/>' +
      '<text x="17" y="22" font-family="Arial,Helvetica,sans-serif" font-size="13" font-weight="bold" ' +
      'fill="#ffffff" text-anchor="middle">' + String(label).replace(/[<>&]/g, '') + '</text></svg>';
    return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
  }

  function GoogleView(el, opts) {
    var c = defaultCenter();
    this.map = new google.maps.Map(el, {
      center: { lat: c.lat, lng: c.lon }, zoom: 13,
      mapTypeControl: false, streetViewControl: false, fullscreenControl: false
    });
    this.markers = [];
    this.line = null;
    this.selfMarker = null;
    this.onPinClick = opts.onPinClick || function () {};
    this.boundsObj = null;
  }

  GoogleView.prototype.setSelfPosition = function (lat, lon) {
    if (lat === null || lon === null) return this.clearSelfPosition();
    if (this.selfMarker) { this.selfMarker.setPosition({ lat: lat, lng: lon }); return; }
    this.selfMarker = new google.maps.Marker({
      position: { lat: lat, lng: lon }, map: this.map, clickable: false, zIndex: 2000,
      icon: {
        path: google.maps.SymbolPath.CIRCLE, scale: 8,
        fillColor: '#4285F4', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2
      }
    });
  };
  GoogleView.prototype.clearSelfPosition = function () {
    if (this.selfMarker) { this.selfMarker.setMap(null); this.selfMarker = null; }
  };

  GoogleView.prototype.setPins = function (pins) {
    var self = this;
    this.markers.forEach(function (m) { m.setMap(null); });
    this.markers = [];
    this.boundsObj = new google.maps.LatLngBounds();
    var any = false;
    fanOut(pins.filter(function (p) { return p.lat !== null && p.lon !== null; }))
      .forEach(function (p) {
        var m = new google.maps.Marker({
          position: { lat: p.dLat, lng: p.dLon },
          map: self.map,
          icon: {
            url: svgPin(p.label, colorFor(p.isStart ? 'start' : p.suspect ? 'suspect' : p.status)),
            anchor: new google.maps.Point(17, 42)
          },
          opacity: p.estimated ? 0.7 : 1,
          zIndex: p.current ? 1000 : undefined
        });
        m.addListener('click', function () { self.onPinClick(p.uid); });
        self.markers.push(m);
        self.boundsObj.extend({ lat: p.dLat, lng: p.dLon });
        any = true;
      });
    this.hasPins = any;
  };

  GoogleView.prototype.setRoute = function (points) {
    if (this.line) { this.line.setMap(null); this.line = null; }
    if (!points || points.length < 2) return;
    this.line = new google.maps.Polyline({
      path: points.map(function (p) { return { lat: p.lat, lng: p.lon }; }),
      strokeColor: themeColor(), strokeOpacity: .8, strokeWeight: 4, map: this.map
    });
  };

  GoogleView.prototype.fitAll = function () {
    if (!this.hasPins || !this.boundsObj) return;
    this.map.fitBounds(this.boundsObj, { top: 50, left: 40, right: 40, bottom: 40 + bottomInset() });
  };

  GoogleView.prototype.focus = function (lat, lon) {
    this.map.panTo({ lat: lat, lng: lon });
    this.map.setZoom(Math.max(this.map.getZoom(), 17));
  };

  GoogleView.prototype.invalidate = function () {
    google.maps.event.trigger(this.map, 'resize');
  };

  /* --------------------------- fábrica --------------------------- */
  /* Devolve uma promessa com a visão de mapa pronta. Se a chave do Google
     falhar por qualquer motivo, cai no Leaflet sem quebrar a tela. */
  function createMapView(el, opts) {
    opts = opts || {};
    var key = (SPX.settings.get('googleKey') || '').trim();
    if (!key) return Promise.resolve(new LeafletView(el, opts));
    return loadGoogleMaps(key)
      .then(function () { return new GoogleView(el, opts); })
      .catch(function () {
        U.toast('Chave do Google não funcionou — usando o mapa gratuito.', 4000);
        return new LeafletView(el, opts);
      });
  }

  SPX.createMapView = createMapView;
})(window.SPX = window.SPX || {});
