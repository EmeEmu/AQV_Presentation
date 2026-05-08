/*
 * Floating Debug Helper for reveal.js (v3)
 * - Drag anywhere with ALT/OPTION key (does not change layout)
 * - Tiny corner grip for drag without modifiers (no extra padding)
 * - Resize via CSS resize handle (no layout shift)
 * - HUD shows left/top (% + px) and width/height (px)
 * - Initial authored --floating-* values are preserved; mirroring happens only after intentional drag/resize
 */
(function(){
  'use strict';

  const processed = new WeakSet();

  function injectStyles(){
    if(document.querySelector('style[data-floating-dev-helper]')) return; // avoid duplicates
    const css = `
      .reveal .floating.debug{ 
        resize: both; 
        overflow: auto; 
        cursor: default; 
        touch-action: none; /* allow pointer drag without touch scrolling fighting */
        --floating-bg: rgba(0,128,255,0.08);
        border: var(--floating-border-width) var(--floating-border-style) var(--floating-border-color);
        border-radius: var(--floating-radius);
        /* no extra padding; keep layout identical to non-debug */
      }
      /* Corner drag grip (no layout impact) */
      .reveal .floating.debug .floating-grip{
        position: absolute; top: 4px; left: 4px; width: 14px; height: 14px;
        background: rgba(0,0,0,0.15);
        border: 1px dashed rgba(0,0,0,0.35);
        border-radius: 3px;
        cursor: move;
        z-index: 3;
      }
      .reveal .floating.debug .floating-grip:hover{ background: rgba(0,0,0,0.25); }

      /* HUD */
      .reveal .floating.debug .floating-hud{
        position: absolute;
        right: 6px; bottom: 6px;
        font: 12px/1.3 var(--r-main-font);
        background: rgba(0,0,0,0.55);
        color: #fff;
        padding: 6px 8px;
        border-radius: 6px;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        z-index: 3;
        pointer-events: auto;
      }
      .reveal .floating.debug .floating-hud button{
        font: 11px/1 var(--r-main-font);
        padding: 4px 6px;
        background: rgba(255,255,255,0.15);
        border: 0;
        border-radius: 4px;
        color: #fff;
        cursor: pointer;
      }
      .reveal .floating.debug .floating-hud button:hover{ background: rgba(255,255,255,0.25); }
    `;
    const style = document.createElement('style');
    style.setAttribute('data-floating-dev-helper', '');
    style.textContent = css;
    document.head.appendChild(style);
  }

  function getScale(slide){
    const rect = slide.getBoundingClientRect();
    const scaleX = rect.width / slide.clientWidth;
    return scaleX || 1;
  }

  function ensurePositioningContext(slide){
    const cs = getComputedStyle(slide);
    if(cs.position === 'static') slide.style.position = 'relative';
  }

  function addGrip(el){
    if(el.querySelector('.floating-grip')) return;
    const grip = document.createElement('div');
    grip.className = 'floating-grip';
    grip.setAttribute('data-floating-grip', '');
    el.appendChild(grip);
    return grip;
  }

  function addHud(el, slide){
    if(el.querySelector('.floating-hud')) return;
    const hud = document.createElement('div');
    hud.className = 'floating-hud';
    const info = document.createElement('span');
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = 'Copy vars';
    hud.appendChild(info);
    hud.appendChild(copy);
    el.appendChild(hud);
    el.__hudInfo = info;

    copy.addEventListener('click', ()=>{
      const m = measure(el, slide);
      const text = `--floating-left: ${m.leftPct.toFixed(1)}%; --floating-top: ${m.topPct.toFixed(1)}%; --floating-w: ${Math.round(m.width)}px; --floating-h: ${Math.round(m.height)}px;`;
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(text).then(()=>{
          copy.textContent = 'Copied!';
          setTimeout(()=> copy.textContent = 'Copy vars', 900);
        }).catch(()=>{ window.prompt('Copy CSS variables:', text); });
      } else {
        window.prompt('Copy CSS variables:', text);
      }
    });
  }

  function measure(el, slide){
    const rect = el.getBoundingClientRect();
    const srect = slide.getBoundingClientRect();
    const scale = getScale(slide);
    const left = (rect.left - srect.left) / scale;
    const top  = (rect.top  - srect.top ) / scale;
    const width  = rect.width  / scale;
    const height = rect.height / scale;
    const leftPct = (left / slide.clientWidth) * 100;
    const topPct  = (top  / slide.clientHeight) * 100;
    return { left, top, width, height, leftPct, topPct };
  }

  function updateHudAndVars(el, slide, mirror){
    const m = measure(el, slide);
    if(el.__hudInfo){
      el.__hudInfo.textContent = `ALT-drag or use corner grip  |  left: ${m.leftPct.toFixed(1)}% (${Math.round(m.left)}px)  top: ${m.topPct.toFixed(1)}% (${Math.round(m.top)}px)  w: ${Math.round(m.width)}px  h: ${Math.round(m.height)}px`;
    }
    if(mirror){
      el.style.setProperty('--floating-left', `${m.leftPct.toFixed(1)}%`);
      el.style.setProperty('--floating-top',  `${m.topPct.toFixed(1)}%`);
      el.style.setProperty('--floating-w',    `${Math.round(m.width)}px`);
      el.style.setProperty('--floating-h',    `${Math.round(m.height)}px`);
    }
  }

  function enableDrag(el, slide){
    const grip = el.querySelector('.floating-grip');
    let startX, startY, startLeft, startTop, dragging = false;

    const startDrag = (e)=>{
      const cs = getComputedStyle(el);
      startLeft = parseFloat(cs.left) || 0;
      startTop  = parseFloat(cs.top)  || 0;
      startX = e.clientX; startY = e.clientY;
      dragging = true;
      e.preventDefault();
      if(el.setPointerCapture && e.pointerId !== undefined) el.setPointerCapture(e.pointerId);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp, { once: true });
    };

    const onMove = (e)=>{
      if(!dragging) return;
      const scale = getScale(slide);
      const dx = (e.clientX - startX) / scale;
      const dy = (e.clientY - startY) / scale;
      el.style.left = (startLeft + dx) + 'px';
      el.style.top  = (startTop  + dy) + 'px';
      updateHudAndVars(el, slide, false);
    };

    const onUp = ()=>{
      dragging = false;
      window.removeEventListener('pointermove', onMove);
      updateHudAndVars(el, slide, true);
    };

    if(grip){
      grip.addEventListener('pointerdown', startDrag);
    }

    // ALT/Option-drag anywhere inside the floating box (capture to win over children)
    el.addEventListener('pointerdown', (e)=>{
      if(!e.altKey) return; // require modifier to avoid stealing normal interactions
      startDrag(e);
    }, true);
  }

  function observeResize(el, slide){
    if(el.__floatingRo){ try{ el.__floatingRo.disconnect(); }catch(e){} }
    const ro = new ResizeObserver(()=> updateHudAndVars(el, slide, false));
    ro.observe(el);
    el.__floatingRo = ro;
  }

  function initOne(el){
    const slide = el.closest('section');
    if(!slide) return;
    ensurePositioningContext(slide);
    addGrip(el);
    addHud(el, slide);
    enableDrag(el, slide);
    observeResize(el, slide);
    // Wait a frame or two to ensure Reveal has applied scaling & CSS vars
    requestAnimationFrame(()=> requestAnimationFrame(()=> updateHudAndVars(el, slide, false)));
    processed.add(el);
  }

  function initAll(){
    injectStyles();
    document.querySelectorAll('.reveal .floating.debug').forEach(el=>{
      if(!processed.has(el)) initOne(el); else updateHudAndVars(el, el.closest('section'), false);
    });
  }

  function hookReveal(){
    if(window.Reveal && typeof window.Reveal.on === 'function'){
      window.Reveal.on('ready', ()=>{ initAll(); });
      window.Reveal.on('slidechanged', ()=>{ initAll(); });
    }
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', ()=>{ hookReveal(); initAll(); });
  } else {
    hookReveal(); initAll();
  }
})();

