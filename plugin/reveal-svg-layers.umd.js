/* plugin/reveal-svg-layers.umd.js */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) { define([], function () { return factory(root); }); }
  else if (typeof module === 'object' && module.exports) { module.exports = factory(root); }
  else { root.SvgLayers = factory(root); }
}(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  var options = root.SvgLayersOptions || { selector: '.r-svg-layers', fragmentClass: '' };
  var deck = null;
  var teardownFns = [];
  var STYLE_ID = 'reveal-svg-layers-style';

  function ensureStyle () {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = '.rsvg-fragment{display:inline-block;width:0;height:0;overflow:hidden}.rsvg-hidden{visibility:hidden}';
    document.head.appendChild(style);
  }

  var uniqId = (function(){ var c=0; return function(prefix){ return (prefix||'rsvg')+'-'+(++c); }; })();
  function toList(v){ return (v||'').split(',').map(function(s){return s.trim();}).filter(Boolean); }
  function qsa(rootEl, sel){ return Array.prototype.slice.call(rootEl.querySelectorAll(sel)); }
  function getLabel(el){ return el.getAttribute('inkscape:label') || el.getAttribute('data-label') || el.id || ''; }
  function findLayers(svg){
    var a = qsa(svg,'g[inkscape\\:groupmode="layer"],g[groupmode="layer"]');
    if (a.length) return a;
    var b = qsa(svg,':scope > g[id]');
    if (b.length) return b;
    return qsa(svg,'g');
  }
  function hideLayer(el){ el.classList.add('rsvg-hidden'); }
  function showLayer(el){ el.classList.remove('rsvg-hidden'); }


  function buildSteps(ctx){
    var container = ctx.container, svg = ctx.svg, fragmentClass = ctx.fragmentClass;
    var allLayers = findLayers(svg);

    var includeList = toList(container.getAttribute('data-include'));
    var baseList    = toList(container.getAttribute('data-base'));
    var order       = (container.getAttribute('data-order') || 'document').toLowerCase();
    var extraFrag   = container.getAttribute('data-fragment-class') || fragmentClass || '';

    var baseSet = new Set(baseList.map(function(s){return s.toLowerCase();}));
    function byName(g){ return getLabel(g).toLowerCase(); }

    // Split into base layers and non-base candidates
    var baseLayers = [], candidates = [];
    allLayers.forEach(function(g){
      (baseSet.has(byName(g)) ? baseLayers : candidates).push(g);
    });

    // 1) Hide ALL non-base layers up front
    candidates.forEach(hideLayer);

    // 2) Decide which hidden candidates should be stepped as fragments
    var stepLayers = candidates.slice();
    if (includeList.length){
      var mapBy = new Map(candidates.map(function(el){ return [byName(el), el]; }));
      stepLayers = includeList.map(function(n){ return mapBy.get(n.toLowerCase()); }).filter(Boolean);
    } else if (order === 'reverse'){
      stepLayers.reverse();
    }

    // 3) Show base layers
    baseLayers.forEach(showLayer);

    // Create invisible fragment anchors for each step
    var uid = uniqId('rsvgc');
    var placeholders = stepLayers.map(function(layerEl, i){
      var span = document.createElement('span');
      span.className = 'fragment rsvg-fragment' + (extraFrag ? (' ' + extraFrag) : '');
      span.setAttribute('data-rsvg-uid', uid);
      span.setAttribute('data-rsvg-index', String(i));
      span.__rsvgLayer = layerEl;
      container.appendChild(span);
      return span;
    });

    function syncFromVisibleFragments(){
      // Keep ALL non-base hidden unless its fragment is visible
      candidates.forEach(hideLayer);
      placeholders.forEach(function(ph){
        if (ph.classList.contains('visible')) showLayer(ph.__rsvgLayer);
      });
      // base layers always visible
      baseLayers.forEach(showLayer);
    }

    function onFragmentShown(ev){
      var ph = ev.fragment;
      if (ph && ph.getAttribute('data-rsvg-uid') === uid) showLayer(ph.__rsvgLayer);
    }
    function onFragmentHidden(ev){
      var ph = ev.fragment;
      if (ph && ph.getAttribute('data-rsvg-uid') === uid) hideLayer(ph.__rsvgLayer);
    }
    function onSlideChanged(ev){
      var current = ev.currentSlide;
      if (current && current.contains(container)) syncFromVisibleFragments();
    }

    deck.on('fragmentshown', onFragmentShown);
    deck.on('fragmenthidden', onFragmentHidden);
    deck.on('slidechanged',  onSlideChanged);

    teardownFns.push(function(){
      try{ deck.off('fragmentshown', onFragmentShown); }catch(e){}
      try{ deck.off('fragmenthidden', onFragmentHidden); }catch(e){}
      try{ deck.off('slidechanged', onSlideChanged); }catch(e){}
      placeholders.forEach(function(ph){ ph.remove(); });
      // restore visibility on teardown
      candidates.forEach(showLayer);
    });

    // Initial sync (handles deep-linking to a fragment)
    syncFromVisibleFragments();
  }

  function inlineExternalSvg(container, srcUrl){
    return fetch(srcUrl).then(function(res){
      if (!res.ok) throw new Error('Failed to load SVG: ' + srcUrl);
      return res.text();
    }).then(function(text){
      var parser = new DOMParser();
      var doc = parser.parseFromString(text, 'image/svg+xml');
      var svg = document.importNode(doc.documentElement, true);
      if (!svg.getAttribute('width') && !svg.getAttribute('height')){
        svg.setAttribute('style','max-width:100%; height:auto; display:block;');
      }
      container.appendChild(svg);
      return svg;
    });
  }

  function initContainer(container){
    if (container.__rsvgProcessed) return Promise.resolve();
    container.__rsvgProcessed = true;

    var svg = container.querySelector('svg');
    var src = container.getAttribute('data-src');

    var p = Promise.resolve();
    if (!svg && src) p = inlineExternalSvg(container, src).then(function(s){ svg = s; });

    return p.then(function(){
      if (!svg) return;
      buildSteps({ container: container, svg: svg, fragmentClass: options.fragmentClass });
    }).catch(function(e){
      console.error('[svg-layers] ' + e.message);
    });
  }

  var plugin = {
    id: 'svg-layers',
    init: function (revealDeck) {
      deck = revealDeck;
      ensureStyle();
      var rootEl = deck.getRevealElement();
      var containers = qsa(rootEl, options.selector || '.r-svg-layers');
      return Promise.all(containers.map(initContainer));
    },
    destroy: function(){
      teardownFns.forEach(function(fn){ try{ fn(); }catch(e){} });
      teardownFns = [];
    }
  };

  return plugin;
}));

