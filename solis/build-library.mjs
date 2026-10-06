// Builds the Solis shape library for draw.io.
//   node solis/build-library.mjs
// Writes:
//   src/main/webapp/solis/solis-library.xml  (importable library: File > Open Library)
//   src/main/webapp/js/PreConfig.js          (Solis block between the SOLIS markers)
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const webapp = join(root, 'src/main/webapp');

const compress = (s) => deflateRawSync(Buffer.from(encodeURIComponent(s))).toString('base64');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---- stencil helpers (all coords in the shape's own w x h units) ----
const move = (x, y) => `<move x="${x}" y="${y}"/>`;
const line = (x, y) => `<line x="${x}" y="${y}"/>`;
const seg = (x1, y1, x2, y2) => `<path>${move(x1, y1)}${line(x2, y2)}</path><stroke/>`;
const poly = (pts, close = false) =>
  `<path>${move(...pts[0])}${pts.slice(1).map((p) => line(...p)).join('')}${close ? '<close/>' : ''}</path>`;
const rect = (x, y, w, h) => `<rect x="${x}" y="${y}" w="${w}" h="${h}"/>`;
const ellipse = (x, y, w, h) => `<ellipse x="${x}" y="${y}" w="${w}" h="${h}"/>`;
const solid = (shape) => `<fillcolor color="stroke"/>${shape}<fillstroke/><fillcolor color="fill"/>`;
const dashed = (inner) => `<dashed dashed="1"/><dashpattern pattern="3 3"/>${inner}<dashed dashed="0"/>`;
const text = (str, x, y, align = 'center', size = 9) =>
  `<fontsize size="${size}"/><text str="${esc(str)}" x="${x}" y="${y}" align="${align}" valign="middle" localized="0" vertical="0" flip-shape="0"/>`;

function stencil(name, w, h, ports, body) {
  const cons = ports
    .map(([n, x, y]) => `<constraint x="${+(x / w).toFixed(4)}" y="${+(y / h).toFixed(4)}" perimeter="0" name="${esc(n)}"/>`)
    .join('');
  return `<shape name="${esc(name)}" w="${w}" h="${h}" aspect="variable" strokewidth="inherit">` +
    `<connections>${cons}</connections><background/><foreground>${body}</foreground></shape>`;
}

// Block with port stubs. ports: {left:[[label,y]], right:[...], top:[[label,x]], bottom:[...]}
function block(name, w, h, sides) {
  const p = 12; // stub length
  const ports = [];
  let body = `${rect(p, p, w - 2 * p, h - 2 * p)}<fillstroke/>`;
  for (const [l, y] of sides.left || []) {
    body += seg(0, y, p, y) + text(l, p + 4, y, 'left');
    ports.push([l, 0, y]);
  }
  for (const [l, y] of sides.right || []) {
    body += seg(w - p, y, w, y) + text(l, w - p - 4, y, 'right');
    ports.push([l, w, y]);
  }
  for (const [l, x] of sides.top || []) {
    body += seg(x, 0, x, p) + text(l, x, p + 8);
    ports.push([l, x, 0]);
  }
  for (const [l, x] of sides.bottom || []) {
    body += seg(x, h - p, x, h) + text(l, x, h - p - 8);
    ports.push([l, x, h]);
  }
  return stencil(name, w, h, ports, body);
}

// ---- shapes ----
const SYMBOL = 'verticalLabelPosition=bottom;verticalAlign=top;labelBackgroundColor=none;';
const BLOCK = 'verticalAlign=middle;fontStyle=1;';
const shapes = [];
const add = (title, w, h, xml, label = '', extra = '') => shapes.push({ title, w, h, xml, label, extra });

add('Hybrid inverter', 220, 160, block('Solis hybrid inverter', 220, 160, {
  left: [['PV1+', 34], ['PV1−', 50], ['PV2+', 66], ['PV2−', 82], ['BAT+', 110], ['BAT−', 126]],
  right: [['GRID L', 34], ['GRID N', 50], ['BACKUP L', 110], ['BACKUP N', 126]],
  top: [['PE', 110]],
  bottom: [['CT', 70], ['METER', 110], ['BMS', 150]],
}), 'Hybrid\nInverter', BLOCK);

add('PV inverter', 200, 140, block('Solis PV inverter', 200, 140, {
  left: [['PV1+', 34], ['PV1−', 50], ['PV2+', 90], ['PV2−', 106]],
  right: [['L', 50], ['N', 90]],
  top: [['PE', 100]],
  bottom: [['COM', 100]],
}), 'PV\nInverter', BLOCK);

add('Battery pack', 140, 100, block('Battery pack', 140, 100, {
  left: [['BAT+', 38], ['BAT−', 62]],
  right: [['CAN', 38], ['RS485', 62]],
}), 'Battery', BLOCK);

add('Energy meter', 120, 90, block('Energy meter', 120, 90, {
  left: [['L in', 34], ['N in', 56]],
  right: [['L out', 34], ['N out', 56]],
  bottom: [['A', 48], ['B', 72]],
}), 'Meter', BLOCK);

add('PV module', 80, 110, stencil('PV module', 80, 110, [['+', 25, 0], ['−', 55, 0]],
  `${rect(10, 15, 60, 90)}<fillstroke/>` +
  [30, 50].map((x) => seg(x, 15, x, 105)).join('') +
  [37.5, 60, 82.5].map((y) => seg(10, y, 70, y)).join('') +
  seg(25, 0, 25, 15) + seg(55, 0, 55, 15) + text('+', 19, 6) + text('−', 61, 6)), '', SYMBOL);

add('Battery (symbol)', 80, 40, stencil('Battery', 80, 40, [['+', 0, 20], ['−', 80, 20]],
  seg(0, 20, 30, 20) + seg(30, 4, 30, 36) + seg(38, 12, 38, 28) + seg(46, 4, 46, 36) + seg(54, 12, 54, 28) +
  seg(54, 20, 80, 20) + text('+', 22, 8) + text('−', 62, 8)), '', SYMBOL);

add('Relay coil', 80, 30, stencil('Relay coil', 80, 30, [['A1', 0, 15], ['A2', 80, 15]],
  seg(0, 15, 20, 15) + `${rect(20, 4, 40, 22)}<fillstroke/>` + seg(60, 15, 80, 15)), 'K1', SYMBOL);

add('Relay contact NO', 80, 30, stencil('Contact NO', 80, 30, [['', 0, 24], ['', 80, 24]],
  seg(0, 24, 25, 24) + seg(25, 24, 58, 6) + seg(55, 24, 80, 24)), '', SYMBOL);

add('Relay contact NC', 80, 30, stencil('Contact NC', 80, 30, [['', 0, 14], ['', 80, 14]],
  seg(0, 14, 25, 14) + seg(25, 14, 58, 26) + seg(55, 14, 55, 27) + seg(55, 14, 80, 14)), '', SYMBOL);

add('Relay (coil + contact)', 100, 80, stencil('Relay', 100, 80,
  [['11', 0, 15], ['14', 100, 15], ['A1', 0, 65], ['A2', 100, 65]],
  seg(0, 15, 35, 15) + seg(35, 15, 68, 2) + seg(65, 15, 100, 15) +
  seg(0, 65, 30, 65) + `${rect(30, 55, 40, 20)}<fillstroke/>` + seg(70, 65, 100, 65) +
  dashed(seg(50, 55, 50, 9))), 'K1', SYMBOL);

add('Contactor', 80, 30, stencil('Contactor', 80, 30, [['', 0, 24], ['', 80, 24]],
  seg(0, 24, 25, 24) + seg(25, 24, 58, 6) + seg(55, 24, 80, 24) +
  `<path>${move(55, 24)}<arc rx="4" ry="4" x-axis-rotation="0" large-arc-flag="0" sweep-flag="1" x="55" y="16"/></path><stroke/>`), 'KM1', SYMBOL);

{
  // IGBT with anti-parallel diode. Emitter arrow points out of the device.
  const ax = 38, ay = 62, bx = 60, by = 78;
  const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
  const tip = [ax + 0.85 * dx, ay + 0.85 * dy], base = [tip[0] - 8 * ux, tip[1] - 8 * uy];
  const nx = -uy * 3.5, ny = ux * 3.5;
  const r = (v) => +v.toFixed(2);
  const arrow = poly([[r(tip[0]), r(tip[1])], [r(base[0] + nx), r(base[1] + ny)], [r(base[0] - nx), r(base[1] - ny)]], true);
  add('IGBT + diode', 100, 100, stencil('IGBT', 100, 100, [['C', 60, 0], ['E', 60, 100], ['G', 0, 50]],
    seg(0, 50, 30, 50) + seg(30, 32, 30, 68) + seg(38, 25, 38, 75) +
    seg(38, 38, 60, 22) + seg(60, 22, 60, 0) + seg(38, 62, 60, 78) + seg(60, 78, 60, 100) + solid(arrow) +
    poly([[60, 10], [86, 10], [86, 42]]) + '<stroke/>' + poly([[60, 90], [86, 90], [86, 58]]) + '<stroke/>' +
    solid(poly([[78, 58], [94, 58], [86, 42]], true)) + seg(78, 42, 94, 42) +
    text('C', 66, 4, 'left', 8) + text('E', 66, 96, 'left', 8) + text('G', 4, 44, 'left', 8)), 'Q1', SYMBOL);
}

add('Diode', 60, 30, stencil('Diode', 60, 30, [['A', 0, 15], ['K', 60, 15]],
  seg(0, 15, 20, 15) + solid(poly([[20, 5], [20, 25], [40, 15]], true)) + seg(40, 5, 40, 25) + seg(40, 15, 60, 15)), 'D1', SYMBOL);

add('Capacitor', 60, 30, stencil('Capacitor', 60, 30, [['', 0, 15], ['', 60, 15]],
  seg(0, 15, 27, 15) + seg(27, 3, 27, 27) + seg(33, 3, 33, 27) + seg(33, 15, 60, 15)), 'C1', SYMBOL);

add('Inductor', 80, 24, stencil('Inductor', 80, 24, [['', 0, 18], ['', 80, 18]],
  `<path>${move(0, 18)}${line(10, 18)}` +
  [25, 40, 55, 70].map((x) => `<arc rx="7.5" ry="7.5" x-axis-rotation="0" large-arc-flag="0" sweep-flag="1" x="${x}" y="18"/>`).join('') +
  `${line(80, 18)}</path><stroke/>`), 'L1', SYMBOL);

add('Resistor', 80, 24, stencil('Resistor', 80, 24, [['', 0, 12], ['', 80, 12]],
  seg(0, 12, 20, 12) + `${rect(20, 4, 40, 16)}<fillstroke/>` + seg(60, 12, 80, 12)), 'R1', SYMBOL);

add('Fuse', 60, 20, stencil('Fuse', 60, 20, [['', 0, 10], ['', 60, 10]],
  `${rect(15, 4, 30, 12)}<fillstroke/>` + seg(0, 10, 60, 10)), 'F1', SYMBOL);

add('Breaker (MCB)', 80, 30, stencil('Breaker', 80, 30, [['', 0, 24], ['', 80, 24]],
  seg(0, 24, 25, 24) + seg(25, 24, 58, 6) + seg(55, 24, 80, 24) + seg(51, 20, 59, 28) + seg(51, 28, 59, 20)), 'QF1', SYMBOL);

add('Isolator / DC switch', 80, 30, stencil('Isolator', 80, 30, [['', 0, 24], ['', 80, 24]],
  seg(0, 24, 25, 24) + seg(25, 24, 58, 6) + seg(55, 24, 80, 24) + seg(55, 18, 55, 30)), 'QS1', SYMBOL);

add('CT clamp', 70, 50, stencil('CT', 70, 50, [['P1', 0, 20], ['P2', 70, 20], ['S1', 29, 50], ['S2', 41, 50]],
  seg(0, 20, 70, 20) + `${ellipse(23, 5, 24, 30)}<stroke/>` + seg(29, 34, 29, 50) + seg(41, 34, 41, 50) +
  solid(poly([[62, 20], [55, 16.5], [55, 23.5]], true))), 'CT', SYMBOL);

add('Grid (AC source)', 60, 60, stencil('Grid', 60, 60, [['L', 30, 0], ['N', 30, 60], ['', 0, 30], ['', 60, 30]],
  `${ellipse(0, 0, 60, 60)}<fillstroke/>` +
  `<path>${move(14, 30)}<curve x1="20" y1="14" x2="26" y2="14" x3="30" y3="30"/><curve x1="34" y1="46" x2="40" y2="46" x3="46" y3="30"/></path><stroke/>`),
  'Grid', SYMBOL);

add('Generator', 60, 60, stencil('Generator', 60, 60, [['L', 30, 0], ['N', 30, 60], ['', 0, 30], ['', 60, 30]],
  `${ellipse(0, 0, 60, 60)}<fillstroke/><fontstyle style="1"/>` + text('G', 30, 30, 'center', 22) + '<fontstyle style="0"/>'),
  'Generator', SYMBOL);

add('Load (house)', 80, 90, stencil('Load', 80, 90, [['L', 32, 90], ['N', 48, 90]],
  poly([[0, 40], [40, 4], [80, 40]]) + '<stroke/>' + `${rect(10, 36, 60, 54)}<fillstroke/>` + `${rect(32, 62, 16, 28)}<stroke/>`),
  'Loads', SYMBOL);

add('Earth', 40, 36, stencil('Earth', 40, 36, [['PE', 20, 0]],
  seg(20, 0, 20, 18) + seg(4, 18, 36, 18) + seg(10, 25, 30, 25) + seg(16, 32, 24, 32)), '', SYMBOL);

{
  const n = 9, w = 240;
  const ports = [];
  for (let i = 0; i < n; i++) {
    const x = 20 + (i * (w - 40)) / (n - 1);
    ports.push(['', x, 0], ['', x, 8]);
  }
  add('Busbar', w, 8, stencil('Busbar', w, 8, [['', 0, 4], ['', w, 4], ...ports],
    solid(rect(0, 0, w, 8))), '', SYMBOL);
}

// ---- wires ----
const WIRE = 'endArrow=none;html=1;rounded=0;edgeStyle=orthogonalEdgeStyle;strokeWidth=2;';
const wires = [
  ['Wire: AC live (L)', '#8B4513', ''],
  ['Wire: AC neutral (N)', '#1F5FBF', ''],
  ['Wire: earth (PE)', '#2E9E3E', ''],
  ['Wire: DC +', '#D62828', ''],
  ['Wire: DC −', '#222222', ''],
  ['Wire: comms (RS485 / CAN)', '#7B3FB5', 'dashed=1;strokeWidth=1.5;'],
  ['Wire: CT signal', '#E07A00', 'dashed=1;dashPattern=8 4;strokeWidth=1.5;'],
];

// ---- assemble ----
const cellXml = (inner) =>
  `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${inner}</root></mxGraphModel>`;

const library = shapes.map(({ title, w, h, xml, label, extra }) => ({
  xml: cellXml(`<mxCell id="2" value="${esc(label).replace(/\n/g, '&#10;')}" style="${
    esc(`shape=stencil(${compress(xml)});html=1;whiteSpace=wrap;strokeWidth=2;${extra}`)
  }" vertex="1" parent="1"><mxGeometry width="${w}" height="${h}" as="geometry"/></mxCell>`),
  w, h, title, aspect: 'fixed',
}));

for (const [title, color, extra] of wires) {
  library.push({
    xml: cellXml(`<mxCell id="2" value="" style="${esc(`${WIRE}strokeColor=${color};${extra}`)}" edge="1" parent="1">` +
      `<mxGeometry width="100" height="20" relative="1" as="geometry">` +
      `<mxPoint y="10" as="sourcePoint"/><mxPoint x="100" y="10" as="targetPoint"/></mxGeometry></mxCell>`),
    w: 100, h: 20, title,
  });
}

const libXml = `<mxlibrary title="Solis">${JSON.stringify(library).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</mxlibrary>\n`;
mkdirSync(join(webapp, 'solis'), { recursive: true });
writeFileSync(join(webapp, 'solis/solis-library.xml'), libXml);

const config = {
  defaultLibraries: 'solis;general',
  libraries: [{
    title: { main: 'Solis' },
    entries: [{
      id: 'solis',
      title: { main: 'Solis' },
      desc: { main: 'Solis schematic shapes and wires' },
      libs: [{ title: { main: 'Solis' }, data: library, expand: true }],
    }],
  }],
};

const preConfigPath = join(webapp, 'js/PreConfig.js');
const start = '// SOLIS-CONFIG-START', end = '// SOLIS-CONFIG-END';
let pre = readFileSync(preConfigPath, 'utf8');
const block_ = `${start}\nwindow.DRAWIO_CONFIG = ${JSON.stringify(config)};\n${end}`;
pre = pre.includes(start)
  ? pre.replace(new RegExp(`${start}[\\s\\S]*${end}`), block_)
  : pre.replace(/window\.DRAWIO_CONFIG = null;[^\n]*\n/, `${block_}\n`);
writeFileSync(preConfigPath, pre);

console.log(`${shapes.length} shapes + ${wires.length} wires`);
