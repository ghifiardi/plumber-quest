// src/editor/editor.js
// Dev level editor boot (?editor=1). Builds DOM, owns the model + edit loop, wires
// tools/palette/property-panel/validate/play/export. Reuses the game sprite atlas.
import { buildSprites } from '../render/sprites.js';
import { blankModel, paintTile, eraseTile, floodFill, placeEntity, moveEntity, deleteEntity, setEntityProp, resize } from './model.js';
import { definitionToEditorModel, editorModelToModuleText, TILE_LEGEND } from './serialize.js';
import { validateModel } from './validate.js';
import { drawEditor, screenToTile } from './render.js';
import { entityAt, snap, editableComponentsForType } from './input.js';
import { startPlaytest } from './playtest.js';
import DEMO1 from '../levels/ecs/demo-1.js';
import DEMO2 from '../levels/ecs/demo-2.js';
import LEVEL1 from '../levels/ecs/level-1.js';
import LEVEL2 from '../levels/ecs/level-2.js';
import { TILE } from '../engine/constants.js';

const ENTITY_TYPES = ['player','platform','spring','conveyor','checkpoint','finish','enemy'];
const PROP_SCHEMA = {   // schema-driven property panel (fixed descriptors)
  mover:    [['dist',0,512,16],['speed',0,200,5]],
  conveyor: [['pushX',-160,160,10]],
  bouncer:  [['bounceV',100,600,10]],
  walker:   [['speed',0,200,5],['dir',-1,1,2]],
  trigger:  [['spawnX',0,4096,16],['spawnY',0,512,16]],
  transform:[['w',16,256,16],['h',16,256,16]],
};

export function boot() {
  document.body.innerHTML = '';   // editor takes over (game never booted)
  document.title = 'ECS Editor';
  const sprites = buildSprites(1);
  let model = definitionToEditorModel(DEMO2);
  let tool = 'paint', tileKind = 'ground', entType = 'enemy', selection = null;
  let playActive = false;   // suspends editor input while a playtest is live (input isolation)
  const view = { panX: 0, zoom: 24, w: 0, h: 0 };

  const bar = el('div', { id:'ed-bar' }); const canvas = el('canvas', { id:'ed-canvas' });
  const status = el('div', { id:'ed-status' }); const props = el('div', { id:'ed-props' });
  document.body.append(bar, canvas, props, status);
  const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
  function fit() { view.w = canvas.width = window.innerWidth; view.h = canvas.height = Math.max(240, model.meta.h*view.zoom); }
  window.addEventListener('resize', fit);

  for (const t of ['paint','erase','fill','select','place']) bar.append(btn(t, () => { tool = t; }));
  for (const ch in TILE_LEGEND) if (TILE_LEGEND[ch] !== 'empty') bar.append(btn(TILE_LEGEND[ch], () => { tool='paint'; tileKind = TILE_LEGEND[ch]; }));
  const eSel = el('select'); for (const t of ENTITY_TYPES) eSel.append(el('option', { value:t, textContent:t })); eSel.value = entType;
  eSel.onchange = () => { entType = eSel.value; }; bar.append(eSel);
  const LEVELS = { 'demo-1':DEMO1, 'demo-2':DEMO2, 'level-1':LEVEL1, 'level-2':LEVEL2 };
  const lvl = el('select'); [...Object.keys(LEVELS), 'blank'].forEach(n => lvl.append(el('option',{value:n,textContent:n})));
  lvl.value = 'demo-2'; lvl.onchange = () => { model = lvl.value==='blank' ? blankModel() : definitionToEditorModel(LEVELS[lvl.value]); selection=null; syncMeta(); fit(); renderProps(); }; bar.append(lvl);
  // name + size controls (wired to model.meta + resize)
  const nameInp = el('input', { type:'text', title:'level name', size:10 }); nameInp.onchange = () => { model.meta.name = nameInp.value; }; bar.append(nameInp);
  const wInp = el('input', { type:'number', min:4, max:200, title:'width (tiles)' });
  const hInp = el('input', { type:'number', min:4, max:60, title:'height (tiles)' });
  const applySize = () => { resize(model, Number(wInp.value)||model.meta.w, Number(hInp.value)||model.meta.h); selection=null; syncMeta(); fit(); renderProps(); refreshStatus(); };
  wInp.onchange = applySize; hInp.onchange = applySize; bar.append(wInp, hInp);
  function syncMeta() { nameInp.value = model.meta.name; wInp.value = model.meta.w; hInp.value = model.meta.h; }
  bar.append(btn('Validate', refreshStatus));
  bar.append(btn('Play', play));
  bar.append(btn('Copy', () => { const r = validateModel(model); if (!r.ok) return refreshStatus(); navigator.clipboard?.writeText(editorModelToModuleText(model)); status.textContent = 'Copied module to clipboard.'; }));
  bar.append(btn('Download', () => { const r = validateModel(model); if (!r.ok) return refreshStatus(); download(`${model.meta.name||'level'}.js`, editorModelToModuleText(model)); }));

  let dragging = -1;
  canvas.addEventListener('pointerdown', (ev) => {
    const rect = canvas.getBoundingClientRect();
    const worldX = (ev.clientX-rect.left)/view.zoom*TILE + view.panX, worldY = (ev.clientY-rect.top)/view.zoom*TILE;
    const { col, row } = screenToTile(view, ev.clientX-rect.left, ev.clientY-rect.top);
    if (tool === 'paint') paintTile(model, col, row, tileKind);
    else if (tool === 'erase') eraseTile(model, col, row);
    else if (tool === 'fill') floodFill(model, col, row, tileKind);
    else if (tool === 'place') { selection = placeEntity(model, entType, snap(worldX), snap(worldY)); renderProps(); }
    else if (tool === 'select') { selection = entityAt(model, worldX, worldY); dragging = selection; renderProps(); }
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (dragging < 0) return; const rect = canvas.getBoundingClientRect();
    moveEntity(model, dragging, snap((ev.clientX-rect.left)/view.zoom*TILE + view.panX), snap((ev.clientY-rect.top)/view.zoom*TILE));
  });
  window.addEventListener('pointerup', () => { dragging = -1; });
  window.addEventListener('keydown', (ev) => {
    if (playActive) return;   // playtest owns input while live — don't pan/delete the editor model
    if (ev.target && /^(INPUT|SELECT|TEXTAREA)$/.test(ev.target.tagName)) return;   // let form fields type
    if (ev.key === 'Delete' && selection != null) { deleteEntity(model, selection); selection = null; renderProps(); }
    else if (ev.key === 'ArrowRight') view.panX += TILE; else if (ev.key === 'ArrowLeft') view.panX = Math.max(0, view.panX - TILE);
  });

  function renderProps() {
    props.innerHTML = '';
    if (selection == null || !model.entities[selection]) return;
    const e = model.entities[selection];
    props.append(el('div', { textContent: `${e.type} @ ${e.x},${e.y}` }));
    // schema-driven: editable components come from the entity TYPE, so newly placed
    // entities (just {type,x,y}) still expose their fields; the bag is seeded on first edit.
    for (const comp of editableComponentsForType(e.type)) {
      if (!PROP_SCHEMA[comp]) continue;
      for (const [field, min, max, step] of PROP_SCHEMA[comp]) {
        const cur = (e[comp] && e[comp][field]) ?? '';
        const inp = el('input', { type:'number', min, max, step, value: cur });
        inp.onchange = () => { setEntityProp(model, selection, `${comp}.${field}`, Number(inp.value)); refreshStatus(); };
        props.append(el('label', { textContent: `${comp}.${field}` }), inp);
      }
    }
  }
  function refreshStatus() { const r = validateModel(model); status.textContent = (r.ok ? 'VALID' : 'INVALID: ' + r.errors.join('; ')) + (r.warnings.length ? '  ⚠ ' + r.warnings.join('; ') : ''); }
  function play() {
    if (playActive) return;                       // ignore duplicate Play clicks while live
    const r = validateModel(model); if (!r.ok) return refreshStatus();
    playActive = true;                            // suspend editor input during playtest
    startPlaytest(model, () => { playActive = false; });
  }

  syncMeta(); fit(); refreshStatus(); renderProps();
  (function loop() { if (!playActive) drawEditor(ctx, model, sprites, view, selection); requestAnimationFrame(loop); })();
}

function el(tag, props={}) { const n = document.createElement(tag); Object.assign(n, props); return n; }
function btn(label, onclick) { const b = el('button', { textContent: label }); b.onclick = onclick; return b; }
function download(name, text) { const a = el('a', { href: URL.createObjectURL(new Blob([text], {type:'text/javascript'})), download: name }); a.click(); }
