/* ======================================================================
   SPX.settings — preferências do aplicativo (tema, chave do mapa, ritmo)
   Guarda SÓ configuração do app. Não guarda endereços nem correções de pino.
====================================================================== */
(function (SPX) {
  'use strict';

  var KEY = 'spxRoteirizadorConfig_v1';

  var DEFAULTS = {
    theme: 'shopee',     // 'shopee' | 'spoke'
    googleKey: '',       // opcional: liga mapa e geocodificação do Google
    avgSpeed: 22,        // km/h médios no trânsito urbano
    stopMinutes: 1.2,    // minutos parados por entrega (ritmo parecido com o do Spoke)
    startMode: 'gps',    // 'gps' | 'fixed' | 'first'
    startAddress: '',    // usado quando startMode = 'fixed'
    showRouteLine: true  // linha ligando as paradas depois de otimizar
  };

  var cache = null;

  function all() {
    if (cache) return cache;
    var stored = {};
    try { stored = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { stored = {}; }
    cache = Object.assign({}, DEFAULTS, stored);
    return cache;
  }

  function get(name) { return all()[name]; }

  function set(values) {
    var cur = all();
    Object.keys(values).forEach(function (k) { cur[k] = values[k]; });
    cache = cur;
    try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch (e) { /* modo privado */ }
    if (values.theme) applyTheme(values.theme);
    return cur;
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme || get('theme'));
  }

  function toggleTheme() {
    var next = get('theme') === 'shopee' ? 'spoke' : 'shopee';
    set({ theme: next });
    return next;
  }

  /* Aplica o tema o quanto antes para não piscar a cor errada. */
  applyTheme();

  SPX.settings = {
    DEFAULTS: DEFAULTS,
    all: all,
    get: get,
    set: set,
    applyTheme: applyTheme,
    toggleTheme: toggleTheme
  };
})(window.SPX = window.SPX || {});
