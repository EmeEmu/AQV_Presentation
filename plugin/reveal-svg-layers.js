// reveal-svg-layers.js
// A tiny Reveal.js plugin that reveals SVG "layers" (e.g., Inkscape groups)
// step-by-step using fragments. Works with inline SVG or by loading from data-src.
// Author: you 💫

/*
Markup options (pick one container per SVG):

1) Load external SVG (same-origin or CORS-enabled):
   <section>
     <div class="r-svg-layers"
          data-src="figures/diagram.svg"
          data-base="Axes,Grid"
          data-include="Intro,Step 1,Step 2,Step 3"
          data-order="document|reverse">
     </div>
   </section>

2) Use inline SVG (already in the HTML):
   <section>
     <div class="r-svg-layers" data-order="reverse">
       <svg> ... Inkscape layers ... </svg>
     </div>
   </section>

How it decides “layers”:
- Inkscape groups like: <g inkscape:groupmode="layer" inkscape:label="Layer 1">...</g>
- Fallbacks: <g groupmode="layer"> or any <g> with an id (used as a label)

Controls (via data-* on the container):
- data-src="path.svg"            -> fetch & inline the SVG
- data-base="L1,L2"              -> layers to keep visible at all times
- data-include="A,B,C"           -> only these layers will step (in this order)
- data-order="document|reverse"  -> order to step layers if include not set
- data-fragment-class="fade-in"  -> optional fragment style class to apply

Behavior:
- The plugin hides all step layers initially, shows "base" layers, and creates
  invisible fragment placeholders. As each fragment becomes visible (Next/Prev),
  the corresponding layer is toggled visible/hidden. Works with normal Reveal
  fragment navigation and progress.
*/

export default function SvgLayersPlugin(userOptions = {}) {
  const defaults = {
    selector: '.r-svg-layers', // container selector
    fragmentClass: '',         // default extra fragment class
  };
  const options = { ...defaults, ...userOptions };

  let deck = null;
  let teardownFns = [];

  // CSS to keep our fragment placeholders non-intrusive
  const STYLE_ID = 'reveal-svg-layers-style';
  const ensureStyle = () => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .rsvg-fragment { display:inline-block; width:0; height:0; overflow:hidden; }
      /* Hidden SVG layer toggle */
      .rsvg-hidden { visibility: hidden; }
    `;
    document.head.appendChild(style);
  };

  // Utils
  const uniqId = (() => {
    let c = 0;
    return (prefix = 'rsvg') => `${prefix}-${++c}`;
  })();

  const toList = (attrVal) =>
    (attrVal || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

  const getInkscapeLabel = (el) =>
    el.getAttribute('inkscape:label') ||
    el.getAttribute('data-label') ||
    el.id ||
    '';

  const qsa = (root, sel) => Array.from(root.querySelectorAll(sel));

  function findLayers(svgEl) {
    // Prefer Inkscape layers
    const inkscapeLayers = qsa(svgEl, 'g[inkscape\\:groupmode="layer"], g[groupmode="layer"]');
    if (inkscapeLayers.length) return inkscapeLayers;

    // Fallback: treat top-level <g> with an id as a "layer"
    const topLevelGroups = qsa(svgEl, ':scope > g[id]');
    if (topLevelGroups.length) return topLevelGroups;

    // Final fallback: any <g> children
    return qsa(svgEl, 'g');
  }

  function hideLayer(el) {
    el.classList.add('rsvg-hidden');
  }
  function showLayer(el) {
    el.classList.remove('rsvg-hidden');
  }

  function buildSteps({ container, svg, fragmentClass }) {
    const allLayers = findLayers(svg);

    const includeList = toList(container.getAttribute('data-include'));
    const baseList    = toList(container.getAttribute('data-base'));
    const order       = (container.getAttribute('data-order') || 'document').toLowerCase();
    const extraFrag   = container.getAttribute('data-fragment-class') || fragmentClass || '';

    // Partition into base + step layers
    const baseSet = new Set(baseList.map(s => s.toLowerCase()));
    const includeSet = new Set(includeList.map(s => s.toLowerCase()));

    const byName = (el) => getInkscapeLabel(el).toLowerCase();

    let baseLayers = [];
    let stepLayers = [];

    for (const g of allLayers) {
      const name = byName(g);
      if (baseSet.has(name)) baseLayers.push(g);
      else stepLayers.push(g);
    }

    // If include=... provided, use that exact order/subset
    if (includeList.length) {
      const mapByName = new Map(stepLayers.map(el => [byName(el), el]));
      stepLayers = includeList
        .map(n => mapByName.get(n.toLowerCase()))
        .filter(Boolean);
    } else {
      if (order === 'reverse') stepLayers.reverse();
    }

    // Initial visibility
    baseLayers.forEach(showLayer);
    stepLayers.forEach(hideLayer);

    // Create invisible fragment anchors for each step
    const uid = uniqId('rsvgc');
    const placeholders = stepLayers.map((layerEl, i) => {
      const span = document.createElement('span');
      span.className = `fragment rsvg-fragment${extraFrag ? ' ' + extraFrag : ''}`;
      span.setAttribute('data-rsvg-uid', uid);
      span.setAttribute('data-rsvg-index', String(i));
      // Store a direct ref for speed
      span.__rsvgLayer = layerEl;
      container.appendChild(span);
      return span;
    });

    // Sync with current fragment state (e.g., when jumping around)
    const syncFromVisibleFragments = () => {
      // Hide all step layers, then show those whose fragment is currently visible
      stepLayers.forEach(hideLayer);
      placeholders.forEach(ph => {
        if (ph.classList.contains('visible')) showLayer(ph.__rsvgLayer);
      });
    };

    // Event handlers for this container
    const onFragmentShown = (ev) => {
      const ph = ev.fragment;
      if (ph && ph.getAttribute('data-rsvg-uid') === uid) {
        showLayer(ph.__rsvgLayer);
      }
    };
    const onFragmentHidden = (ev) => {
      const ph = ev.fragment;
      if (ph && ph.getAttribute('data-rsvg-uid') === uid) {
        hideLayer(ph.__rsvgLayer);
      }
    };
    const onSlideChanged = (ev) => {
      // Only act if our container is in the current slide
      const current = ev.currentSlide;
      if (current && current.contains(container)) {
        syncFromVisibleFragments();
      }
    };

    deck.on('fragmentshown', onFragmentShown);
    deck.on('fragmenthidden', onFragmentHidden);
    deck.on('slidechanged',  onSlideChanged);

    // Keep for teardown
    teardownFns.push(() => {
      deck.off('fragmentshown', onFragmentShown);
      deck.off('fragmenthidden', onFragmentHidden);
      deck.off('slidechanged', onSlideChanged);
      // Clean placeholders (optional)
      placeholders.forEach(ph => ph.remove());
      // Reset visibility
      stepLayers.forEach(showLayer);
    });

    // Initial sync (e.g., deep-linked to a fragment)
    syncFromVisibleFragments();
  }

  async function inlineExternalSvg(container, srcUrl) {
    const res = await fetch(srcUrl);
    if (!res.ok) throw new Error(`Failed to load SVG: ${srcUrl}`);
    const text = await res.text();

    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'image/svg+xml');
    const svg = document.importNode(doc.documentElement, true);
    // Make sure the SVG scales like an <img> by default
    if (!svg.getAttribute('width') && !svg.getAttribute('height')) {
      svg.setAttribute('style', 'max-width:100%; height:auto; display:block;');
    }
    container.appendChild(svg);
    return svg;
  }

  async function initContainer(container) {
    // Already processed?
    if (container.__rsvgProcessed) return;
    container.__rsvgProcessed = true;

    // Find or load an SVG
    let svg = container.querySelector('svg');
    const src = container.getAttribute('data-src');
    if (!svg && src) {
      try {
        svg = await inlineExternalSvg(container, src);
      } catch (e) {
        console.error('[svg-layers] ' + e.message);
        return;
      }
    }
    if (!svg) return; // nothing to do

    // Build fragments + behaviors
    buildSteps({
      container,
      svg,
      fragmentClass: options.fragmentClass,
    });
  }

  return {
    id: 'svg-layers',

    init: async (revealDeck) => {
      deck = revealDeck;
      ensureStyle();

      const root = deck.getRevealElement();
      const containers = Array.from(
        root.querySelectorAll(options.selector)
      );

      // Initialize each container (external loads may be async)
      await Promise.all(containers.map(initContainer));
    },

    destroy: () => {
      teardownFns.forEach((fn) => {
        try { fn(); } catch {}
      });
      teardownFns = [];
    },
  };
}

