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

const portsOf = new Map(); // stencil xml -> [[name, fx, fy]]

function stencil(name, w, h, ports, body) {
  const xml = stencilXml(name, w, h, ports, body);
  portsOf.set(xml, ports.map(([n, x, y], i) => [n || `P${i + 1}`, +(x / w).toFixed(4), +(y / h).toFixed(4)]));
  return xml;
}

function stencilXml(name, w, h, ports, body) {
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
const keyOf = (title) => title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const add = (title, w, h, xml, label = '', extra = '', desc = '') =>
  shapes.push({ key: keyOf(title), title, w, h, xml, label, extra, desc, ports: portsOf.get(xml) });

add('Hybrid inverter', 220, 176, block('Solis hybrid inverter', 220, 176, {
  left: [['PV1+', 34], ['PV1−', 50], ['PV2+', 66], ['PV2−', 82], ['BAT+', 110], ['BAT−', 126]],
  right: [['GRID L', 34], ['GRID N', 50], ['GRID PE', 66], ['BACKUP L', 110], ['BACKUP N', 126], ['BACKUP PE', 142]],
  top: [['PE', 110]],
  bottom: [['CT', 70], ['METER', 110], ['BMS', 150]],
}), 'Hybrid\nInverter', BLOCK,
'BACKUP PE is bonded to BACKUP N inside the inverter (N-PE relay) when it runs off-grid.');

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

// ---- installation blocks ----
add('ATS', 200, 140, block('ATS', 200, 140, {
  left: [['GRID L', 40], ['GRID N', 56], ['INV L', 94], ['INV N', 110]],
  right: [['OUT L', 66], ['OUT N', 82]],
}) .replace('</foreground>',
  seg(88, 60, 100, 60) + seg(88, 96, 100, 96) + seg(128, 74, 101, 61) + seg(128, 74, 150, 74) + '</foreground>'),
'ATS', 'verticalAlign=top;fontStyle=1;spacingTop=14;',
'Automatic transfer switch (external changeover). Switches BOTH live and neutral between the GRID supply and the inverter backup (INV) supply; OUT feeds the backup loads.');
// ATS changes the stencil body after block() ran, so copy its ports to the new xml.
shapes.at(-1).ports = [...portsOf.values()].at(-1);

add('Distribution board', 160, 120, block('Distribution board', 160, 120, {
  left: [['L', 40], ['N', 60], ['PE', 80]],
  right: [['OUT1 L', 30], ['OUT1 N', 46], ['OUT2 L', 74], ['OUT2 N', 90]],
}), 'DB', BLOCK, 'Consumer unit / distribution board feeding a group of loads.');

add('Terminal bar', 160, 40, stencil('Terminal bar', 160, 40,
  [['IN', 0, 17], ...[1, 2, 3, 4, 5, 6].map((i) => [`${i}`, 3 + 22 * i, 40])],
  seg(0, 17, 10, 17) + `${rect(10, 12, 140, 10)}<fillstroke/>` +
  [1, 2, 3, 4, 5, 6].map((i) => seg(3 + 22 * i, 22, 3 + 22 * i, 40) + `${ellipse(3 + 22 * i - 3, 14, 6, 6)}<stroke/>`).join('')),
'N bar', 'verticalLabelPosition=top;verticalAlign=bottom;labelBackgroundColor=none;fontStyle=1;',
'Neutral or earth terminal bar. Label it e.g. "Grid N bar", "Backup N bar", "E bar" so separate neutrals are clear.');

add('Transformer', 60, 90, stencil('Transformer', 60, 90, [['HV', 30, 0], ['LV', 30, 90]],
  seg(30, 0, 30, 10) + `${ellipse(10, 10, 40, 40)}<stroke/>${ellipse(10, 40, 40, 40)}<stroke/>` + seg(30, 80, 30, 90)),
'T1', 'labelPosition=right;verticalLabelPosition=middle;align=left;verticalAlign=middle;labelBackgroundColor=none;');

// ---- icons (overview drawings like the LCD / brochure pictures) ----
const ICON = 'verticalLabelPosition=bottom;verticalAlign=top;labelBackgroundColor=none;';
{
  const rays = [0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
    const r = (a * Math.PI) / 180, c = 13, f = (v) => +v.toFixed(1);
    return seg(f(c + 12 * Math.cos(r)), f(c + 12 * Math.sin(r)), f(c + 16 * Math.cos(r)), f(c + 16 * Math.sin(r)));
  }).join('');
  const xAt = (y, x0) => +(x0 - ((y - 30) * 10) / 46).toFixed(1);
  add('PV array (icon)', 100, 80, stencil('PV array icon', 100, 80, [['DC', 100, 53]],
    `${ellipse(6, 6, 14, 14)}<stroke/>` + rays +
    poly([[30, 30], [96, 30], [86, 76], [20, 76]], true) + '<fillstroke/>' +
    [45.3, 60.7].map((y) => seg(xAt(y, 30), y, xAt(y, 96), y)).join('') +
    [52, 74].map((x) => seg(x, 30, x - 10, 76)).join('') + seg(91, 53, 100, 53)), 'PV', ICON);
}

add('Inverter (icon)', 120, 80, stencil('Inverter icon', 120, 80,
  [['DC', 0, 40], ['AC', 120, 40], ['BAT', 40, 80], ['COM', 40, 0]],
  `<roundrect x="0" y="0" w="120" h="80" arcsize="6"/><fillstroke/>` +
  `<fillcolor color="#666666"/>${rect(78, 3, 39, 74)}<fill/><fillcolor color="fill"/>` +
  `${rect(14, 14, 26, 16)}<stroke/>` + text('solis', 8, 70, 'left', 8)), 'Inverter', ICON);

add('Battery (icon)', 50, 80, stencil('Battery icon', 50, 80, [['DC', 25, 0]],
  `${rect(18, 0, 14, 6)}<fillstroke/><roundrect x="5" y="6" w="40" h="74" arcsize="12"/><fillstroke/>` +
  [0, 1, 2, 3].map((i) => solid(rect(11, 14 + i * 16, 28, 11))).join('')), 'Battery', ICON);

add('Grid pylon (icon)', 70, 100, stencil('Grid pylon', 70, 100, [['AC', 0, 40]],
  seg(15, 100, 30, 10) + seg(55, 100, 40, 10) + seg(30, 10, 40, 10) + seg(35, 10, 35, 2) +
  seg(5, 25, 65, 25) + seg(10, 45, 60, 45) + seg(5, 25, 5, 32) + seg(65, 25, 65, 32) + seg(10, 45, 10, 52) + seg(60, 45, 60, 52) +
  seg(24, 50, 50, 78) + seg(46, 50, 20, 78) + seg(27, 25, 43, 45) + seg(43, 25, 27, 45)), 'Grid', ICON);

add('Smart meter (icon)', 50, 70, stencil('Smart meter icon', 50, 70,
  [['IN', 5, 40], ['OUT', 45, 40], ['COM', 25, 70]],
  `<roundrect x="5" y="5" w="40" h="60" arcsize="12"/><fillstroke/>${rect(12, 14, 26, 14)}<fillstroke/>` +
  seg(18, 65, 18, 70) + seg(32, 65, 32, 70)), 'Meter', ICON);

add('EPM (icon)', 90, 60, stencil('EPM icon', 90, 60, [['CT', 5, 35], ['NET', 85, 35], ['COM', 45, 55]],
  `<roundrect x="5" y="15" w="80" h="40" arcsize="10"/><fillstroke/>${rect(15, 25, 24, 14)}<fillstroke/>` + seg(75, 15, 75, 2)),
'EPM', ICON, 'Solis Export Power Manager: controls export of one or more inverters using a CT or meter.');

add('Data stick (icon)', 30, 60, stencil('Data stick', 30, 60, [['COM', 15, 60]],
  `${rect(8, 14, 14, 46)}<fillstroke/>` +
  `<path>${move(22, 8)}<arc rx="6" ry="6" x-axis-rotation="0" large-arc-flag="0" sweep-flag="1" x="28" y="14"/></path><stroke/>` +
  `<path>${move(22, 2)}<arc rx="12" ry="12" x-axis-rotation="0" large-arc-flag="0" sweep-flag="1" x="34" y="14"/></path><stroke/>`),
'Data stick', ICON, 'WiFi / 4G / LAN logger that sends inverter data to SolisCloud.');

add('Cloud (icon)', 100, 60, stencil('Cloud', 100, 60, [['NET', 0, 48], ['NET2', 50, 60]],
  `<path>${move(20, 55)}` +
  `<arc rx="15" ry="15" x-axis-rotation="0" large-arc-flag="0" sweep-flag="1" x="22" y="28"/>` +
  `<arc rx="17" ry="17" x-axis-rotation="0" large-arc-flag="0" sweep-flag="1" x="52" y="18"/>` +
  `<arc rx="16" ry="16" x-axis-rotation="0" large-arc-flag="0" sweep-flag="1" x="80" y="30"/>` +
  `<arc rx="13" ry="13" x-axis-rotation="0" large-arc-flag="0" sweep-flag="1" x="82" y="55"/><close/></path><fillstroke/>`),
'SolisCloud', 'verticalLabelPosition=middle;verticalAlign=middle;labelBackgroundColor=none;fontSize=10;');

add('Monitor (icon)', 80, 70, stencil('Monitor', 80, 70, [['NET', 5, 28]],
  `${rect(5, 5, 70, 45)}<fillstroke/>` + seg(40, 50, 40, 60) + seg(25, 62, 55, 62)), 'Monitoring', ICON);

// ---- power-electronics building blocks (inside a hybrid) ----
const f1 = (v) => +v.toFixed(1);
const capV = (x, y1, y2, m = (y1 + y2) / 2) =>
  seg(x, y1, x, m - 3) + seg(x - 8, m - 3, x + 8, m - 3) + seg(x - 8, m + 3, x + 8, m + 3) + seg(x, m + 3, x, y2);
const indH = (x1, x2, y) => {
  const step = (x2 - x1) / 3;
  return `<path>${move(x1, y)}` + [1, 2, 3].map((i) =>
    `<arc rx="${f1(step / 2)}" ry="${f1(step / 2)}" x-axis-rotation="0" large-arc-flag="0" sweep-flag="1" x="${f1(x1 + step * i)}" y="${y}"/>`).join('') +
    '</path><stroke/>';
};
const diodeH = (x1, x2, y) => {
  const c = (x1 + x2) / 2;
  return seg(x1, y, c - 5, y) + solid(poly([[c - 5, y - 6], [c - 5, y + 6], [c + 5, y]], true)) + seg(c + 5, y - 6, c + 5, y + 6) + seg(c + 5, y, x2, y);
};
// Horizontal wire from x1 to x2 at y that hops over vertical wires at hopXs.
const hopWire = (x1, x2, y, hopXs) =>
  `<path>${move(x1, y)}` + hopXs.map((h) =>
    `${line(h - 5, y)}<arc rx="5" ry="5" x-axis-rotation="0" large-arc-flag="0" sweep-flag="1" x="${h + 5}" y="${y}"/>`).join('') +
  `${line(x2, y)}</path><stroke/>`;
// Vertical IGBT, collector at (x,yT), emitter at (x,yB), gate on the left, optional anti-parallel diode on the right.
function igbtV(x, yT, yB, diode = true) {
  const m = (yT + yB) / 2;
  let s = seg(x, yT, x, m - 10) + seg(x, m - 10, x - 8, m - 6) + seg(x - 8, m - 10, x - 8, m + 10) +
    seg(x - 8, m + 6, x, m + 10) + seg(x, m + 10, x, yB) + seg(x - 11, m - 7, x - 11, m + 7) + seg(x - 17, m, x - 11, m) +
    solid(poly([[f1(x - 1.6), f1(m + 9.2)], [f1(x - 6.1), f1(m + 9.2)], [f1(x - 4.3), f1(m + 5.6)]], true));
  if (diode) {
    s += poly([[x, m - 14], [x + 10, m - 14], [x + 10, m + 14], [x, m + 14]]) + '<stroke/>' +
      solid(poly([[x + 4, m + 5], [x + 16, m + 5], [x + 10, m - 5]], true)) + seg(x + 4, m - 5, x + 16, m - 5);
  }
  return s;
}
const PE_SYM = 'labelBackgroundColor=none;';

add('MPPT boost converter', 160, 100, stencil('Boost converter', 160, 100,
  [['IN+', 0, 20], ['IN-', 0, 80], ['OUT+', 160, 20], ['OUT-', 160, 80]],
  seg(0, 20, 35, 20) + capV(20, 20, 80) + indH(35, 75, 20) + seg(75, 20, 90, 20) + igbtV(90, 20, 80, false) +
  diodeH(90, 125, 20) + seg(125, 20, 160, 20) + capV(140, 20, 80) + seg(0, 80, 160, 80)),
'Boost (MPPT)', SYMBOL, 'PV boost converter that does MPPT and lifts PV voltage up to the DC bus.');

add('Buck-boost DC-DC (HV battery)', 160, 100, stencil('Buck-boost DC-DC', 160, 100,
  [['BAT+', 0, 20], ['BAT-', 0, 80], ['BUS+', 160, 20], ['BUS-', 160, 80]],
  seg(0, 20, 25, 20) + capV(12, 20, 80) + seg(25, 20, 25, 50) + indH(25, 75, 50) + seg(75, 50, 110, 50) +
  igbtV(110, 20, 50) + igbtV(110, 50, 80) + seg(110, 20, 160, 20) + capV(145, 20, 80) + seg(0, 80, 160, 80)),
'Bidirectional DC/DC', SYMBOL, 'Non-isolated bidirectional buck-boost between a high-voltage battery and the DC bus.');

add('Isolated DC-DC (LV battery)', 240, 110, stencil('Isolated DC-DC', 240, 110,
  [['BAT+', 0, 15], ['BAT-', 0, 95], ['BUS+', 240, 15], ['BUS-', 240, 95]],
  seg(0, 15, 45, 15) + seg(0, 95, 45, 95) + capV(15, 15, 95) +
  `${rect(45, 10, 40, 90)}<stroke/>` + text('DC', 65, 45, 'center', 8) + seg(52, 62, 78, 48) + text('AC', 65, 68, 'center', 8) +
  seg(85, 35, 105, 35) + seg(85, 75, 105, 75) +
  `<path>${move(105, 35)}` + [1, 2, 3].map((i) => `<arc rx="6.7" ry="6.7" x-axis-rotation="0" large-arc-flag="0" sweep-flag="1" x="105" y="${f1(35 + 13.33 * i)}"/>`).join('') + '</path><stroke/>' +
  seg(117, 30, 117, 80) + seg(123, 30, 123, 80) +
  `<path>${move(135, 35)}` + [1, 2, 3].map((i) => `<arc rx="6.7" ry="6.7" x-axis-rotation="0" large-arc-flag="0" sweep-flag="0" x="135" y="${f1(35 + 13.33 * i)}"/>`).join('') + '</path><stroke/>' +
  text('HF', 120, 22, 'center', 8) +
  seg(135, 35, 155, 35) + seg(135, 75, 155, 75) +
  `${rect(155, 10, 40, 90)}<stroke/>` + text('AC', 175, 45, 'center', 8) + seg(162, 62, 188, 48) + text('DC', 175, 68, 'center', 8) +
  seg(195, 15, 240, 15) + seg(195, 95, 240, 95) + capV(225, 15, 95)),
'Isolated DC/DC (HF transformer)', SYMBOL, 'Isolated bidirectional DC/DC with a high-frequency transformer, used for low-voltage (48 V) batteries.');

add('H-bridge 1ph', 180, 160, stencil('H-bridge', 180, 160,
  [['DC+', 0, 10], ['DC-', 0, 150], ['L', 180, 72], ['N', 180, 88]],
  seg(0, 10, 130, 10) + seg(0, 150, 130, 150) + capV(20, 10, 150) +
  [70, 130].map((x) => igbtV(x, 10, 66) + seg(x, 66, x, 94) + igbtV(x, 94, 150)).join('') +
  hopWire(70, 180, 72, [130]) + seg(130, 88, 180, 88)),
'Inverter (H-bridge)', SYMBOL, 'Single-phase full bridge (4 IGBTs) that makes AC from the DC bus.');

add('3-leg bridge 3ph', 240, 160, stencil('3-leg bridge', 240, 160,
  [['DC+', 0, 10], ['DC-', 0, 150], ['L1', 240, 70], ['L2', 240, 80], ['L3', 240, 90], ['N', 240, 100]],
  seg(0, 10, 180, 10) + seg(0, 150, 180, 150) + capV(20, 10, 80) + capV(20, 80, 150) +
  [80, 130, 180].map((x) => igbtV(x, 10, 66) + seg(x, 66, x, 94) + igbtV(x, 94, 150)).join('') +
  hopWire(80, 240, 70, [130, 180]) + hopWire(130, 240, 80, [180]) + seg(180, 90, 240, 90) +
  hopWire(20, 240, 100, [80, 130, 180])),
'Inverter (3-leg bridge)', SYMBOL, 'Three-phase bridge (6 IGBTs); N comes from the split DC-link capacitors.');

add('LC filter 1ph', 120, 80, stencil('LC filter', 120, 80,
  [['L in', 0, 20], ['N in', 0, 60], ['L out', 120, 20], ['N out', 120, 60]],
  seg(0, 20, 20, 20) + indH(20, 60, 20) + seg(60, 20, 120, 20) + seg(0, 60, 120, 60) + capV(85, 20, 60)),
'LC filter', SYMBOL);

add('LC filter 3ph', 140, 150, stencil('LC filter 3ph', 140, 150,
  [['L1 in', 0, 15], ['L2 in', 0, 50], ['L3 in', 0, 85], ['N in', 0, 125],
    ['L1 out', 140, 15], ['L2 out', 140, 50], ['L3 out', 140, 85], ['N out', 140, 125]],
  [15, 50, 85].map((y) => seg(0, y, 20, y) + indH(20, 55, y) + seg(55, y, 140, y)).join('') + seg(0, 125, 140, 125) +
  capV(80, 15, 125, 32) + capV(100, 50, 125, 67) + capV(120, 85, 125, 105)),
'LC filter', SYMBOL);

add('Relay pair', 100, 24, stencil('Relay pair', 100, 24, [['P1', 0, 16], ['P2', 100, 16]],
  seg(0, 16, 15, 16) + seg(15, 16, 40, 4) + seg(38, 16, 55, 16) + seg(55, 16, 80, 4) + seg(78, 16, 100, 16)),
'Relay', 'verticalLabelPosition=top;verticalAlign=bottom;labelBackgroundColor=none;fontSize=9;spacingBottom=-6;', 'Two relay contacts in series, as used for grid and backup relays.');

add('Terminal', 12, 12, stencil('Terminal', 12, 12, [['IN', 0, 6], ['OUT', 12, 6]],
  `${ellipse(0, 0, 12, 12)}<fillstroke/>`), '', 'labelPosition=left;verticalLabelPosition=middle;align=right;verticalAlign=middle;fontSize=10;labelBackgroundColor=none;whiteSpace=nowrap;');

// ---- templates: groups of separate cells (Arrange > Ungroup to edit each part) ----
const shapeByKey = (k) => shapes.find((s) => s.key === k);
const templates = [];

function template(title, cells, edges) {
  const minX = Math.min(...cells.map((c) => c.x)), minY = Math.min(...cells.map((c) => c.y));
  cells = cells.map((c) => ({ ...c, x: c.x - minX + 10, y: c.y - minY + 10 }));
  const out = [];
  let maxX = 0, maxY = 0;
  cells.forEach((c) => {
    const s = c.key ? shapeByKey(c.key) : null;
    const w = c.w ?? s.w, h = c.h ?? s.h;
    maxX = Math.max(maxX, c.x + w);
    maxY = Math.max(maxY, c.y + h);
    const style = c.style ?? `${shapeStyle(s)}`;
    out.push(`<mxCell id="${c.id}" value="${esc(c.label ?? s?.label ?? '').replace(/\n/g, '&#10;')}" style="${esc(style)}" vertex="1" parent="g"><mxGeometry x="${c.x}" y="${c.y}" width="${w}" height="${h}" as="geometry"/></mxCell>`);
  });
  const byId = Object.fromEntries(cells.map((c) => [c.id, c]));
  const portXY = (id, port) => {
    const c = byId[id];
    if (!c.key || !port) return null;
    const p = shapeByKey(c.key).ports.find(([n]) => n === port);
    if (!p) throw new Error(`${title}: no port ${port} on ${c.key}`);
    return [p[1], p[2]];
  };
  edges.forEach(([s, sp, t, tp, type, label = '', viaX], i) => {
    const a = portXY(s, sp), b = portXY(t, tp);
    let style = WIRE + WIRE_COLORS[type];
    if (a) style += `exitX=${a[0]};exitY=${a[1]};exitDx=0;exitDy=0;exitPerimeter=0;`;
    if (b) style += `entryX=${b[0]};entryY=${b[1]};entryDx=0;entryDy=0;entryPerimeter=0;`;
    if (label) style += 'fontSize=9;labelBackgroundColor=default;';
    let pts = '';
    if (viaX != null && b) {
      const tc = cells.find((c) => c.id === t), th = tc.h ?? shapeByKey(tc.key).h;
      pts = `<Array as="points"><mxPoint x="${viaX - minX + 10}" y="${tc.y + b[1] * th}"/></Array>`;
    }
    out.push(`<mxCell id="e${i}" value="${esc(label)}" style="${esc(style)}" edge="1" parent="g" source="${s}" target="${t}"><mxGeometry relative="1" as="geometry">${pts}</mxGeometry></mxCell>`);
  });
  const w = maxX + 20, h = maxY + 20;
  templates.push({
    xml: cellXml(`<mxCell id="g" value="" style="group" vertex="1" connectable="0" parent="1"><mxGeometry width="${w}" height="${h}" as="geometry"/></mxCell>${out.join('')}`),
    w, h, title,
  });
}

const WIRE = 'endArrow=none;html=1;rounded=0;edgeStyle=orthogonalEdgeStyle;strokeWidth=2;';
const wires = [
  ['Wire: AC live (L)', '#8B4513', '', 'L'],
  ['Wire: AC neutral (N)', '#1F5FBF', '', 'N'],
  ['Wire: earth (PE)', '#2E9E3E', '', 'PE'],
  ['Wire: DC +', '#D62828', '', 'DC+'],
  ['Wire: DC −', '#222222', '', 'DC-'],
  ['Wire: AC (single line)', '#D62828', '', 'AC'],
  ['Wire: comms (RS485 / CAN)', '#7B3FB5', 'dashed=1;strokeWidth=1.5;', 'COMMS'],
  ['Wire: CT signal', '#E07A00', 'dashed=1;dashPattern=8 4;strokeWidth=1.5;', 'CT'],
  ['Wire: internet', '#888888', 'dashed=1;dashPattern=2 4;strokeWidth=1.5;', 'NET'],
];

// ---- assemble ----
const cellXml = (inner) =>
  `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${inner}</root></mxGraphModel>`;

const styleOf = ({ xml, extra }) => `shape=stencil(${compress(xml)});html=1;whiteSpace=wrap;strokeWidth=2;${extra}`;

const shapeStyle = styleOf;
const WIRE_COLORS = Object.fromEntries(wires.map(([, color, extra, type]) => [type, `strokeColor=${color};${extra}`]));
const TITLE = 'text;html=1;fontSize=14;fontStyle=1;align=left;verticalAlign=middle;';
const BOX = 'rounded=1;whiteSpace=wrap;html=1;fontSize=11;strokeWidth=1.5;';
const PV_BOX = `${BOX}fillColor=#fff2cc;strokeColor=#d6b656;`;
const BAT_BOX = `${BOX}fillColor=#d5e8d4;strokeColor=#82b366;`;
const BUS_BOX = `${BOX}fillColor=#f5f5f5;strokeColor=#666666;horizontal=0;fontStyle=1;`;
const INV_BOX = `${BOX}fillColor=#dae8fc;strokeColor=#6c8ebf;`;
const RELAY_BOX = `${BOX}fillColor=#ffe6cc;strokeColor=#d79b00;`;
const CTRL_BOX = `${BOX}dashed=1;fillColor=none;`;
const term = (id, x, y, label) => ({ id, key: 'terminal', x, y, label });
// Output terminal: label on the right.
const termR = (id, x, y, label) => ({ ...term(id, x, y, label), style: `${styleOf(shapeByKey('terminal'))}labelPosition=right;align=left;spacingLeft=4;` });

// Simple block versions
function blockTemplate(title, threePhase) {
  const acs = threePhase ? ['L1', 'L2', 'L3', 'N'] : ['L', 'N'];
  const gridY = (i) => 60 + i * 26, bkY = (i) => 230 + i * 26;
  const cells = [
    { id: 't', x: 0, y: -10, w: 520, h: 26, style: TITLE, label: title },
    term('pv1p', 20, 44, 'PV1+'), term('pv1n', 20, 74, 'PV1−'), term('pv2p', 20, 144, 'PV2+'), term('pv2n', 20, 174, 'PV2−'),
    term('batp', 20, 264, 'BAT+'), term('batn', 20, 294, 'BAT−'),
    { id: 'b1', x: 90, y: 30, w: 120, h: 70, style: PV_BOX, label: 'MPPT1 boost' },
    { id: 'b2', x: 90, y: 130, w: 120, h: 70, style: PV_BOX, label: 'MPPT2 boost' },
    { id: 'bat', x: 90, y: 250, w: 120, h: 70, style: BAT_BOX,
      label: threePhase ? 'Buck-boost DC/DC\n(non-isolated, HV battery)' : 'Isolated DC/DC\n(HF transformer, LV battery)' },
    { id: 'bus', x: 260, y: 30, w: 40, h: 290, style: BUS_BOX, label: 'DC bus' },
    { id: 'inv', x: 340, y: 130, w: 120, h: 80, style: INV_BOX, label: threePhase ? '3-leg bridge\n(6 IGBTs)' : 'H-bridge\n(4 IGBTs)' },
    { id: 'lc', x: 500, y: 130, w: 80, h: 80, style: INV_BOX, label: 'LC filter' },
    { id: 'gr', x: 630, y: 50, w: 100, h: 70, style: RELAY_BOX, label: `Grid relays\n(${acs.join(' ')})` },
    { id: 'emc', x: 770, y: 50, w: 60, h: 70, style: INV_BOX, label: 'EMC' },
    { id: 'br', x: 630, y: 220, w: 100, h: 70, style: RELAY_BOX, label: `Backup relays\n(${acs.join(' ')})` },
    { id: 'npe', x: 770, y: 330, w: 90, h: 50, style: RELAY_BOX, label: 'N-PE relay\n(closes off-grid)' },
    { id: 'dsp', x: 340, y: 330, w: 240, h: 50, style: CTRL_BOX, label: 'DSP control (master + slave): MPPT, battery, inverter PWM, relays' },
    ...acs.map((a, i) => termR(`g${a}`, 900, gridY(i), `GRID ${a}`)), termR('gPE', 900, gridY(acs.length), 'GRID PE'),
    ...acs.map((a, i) => termR(`k${a}`, 900, bkY(i), `BACKUP ${a}`)), termR('kPE', 900, bkY(acs.length) + 50, 'BACKUP PE'),
  ];
  const edges = [
    ['pv1p', 'OUT', 'b1', null, 'DC+'], ['pv1n', 'OUT', 'b1', null, 'DC-'],
    ['pv2p', 'OUT', 'b2', null, 'DC+'], ['pv2n', 'OUT', 'b2', null, 'DC-'],
    ['batp', 'OUT', 'bat', null, 'DC+'], ['batn', 'OUT', 'bat', null, 'DC-'],
    ['b1', null, 'bus', null, 'DC+'], ['b2', null, 'bus', null, 'DC+'], ['bat', null, 'bus', null, 'DC+'],
    ['bus', null, 'inv', null, 'DC+'], ['inv', null, 'lc', null, 'AC'],
    ['lc', null, 'gr', null, 'AC'], ['lc', null, 'br', null, 'AC'], ['gr', null, 'emc', null, 'AC'],
    ...acs.map((a) => ['emc', null, `g${a}`, 'IN', a === 'N' ? 'N' : 'L']),
    ...acs.map((a) => ['br', null, `k${a}`, 'IN', a === 'N' ? 'N' : 'L']),
    ['kN', 'IN', 'npe', null, 'N'], ['npe', null, 'kPE', 'IN', 'PE'], ['gPE', 'IN', 'kPE', 'IN', 'PE'],
    ['dsp', null, 'inv', null, 'COMMS'],
  ];
  template(title, cells, edges);
}

// Circuit versions built from the converter shapes
function circuitTemplate(title, threePhase) {
  const acs = threePhase ? ['L1', 'L2', 'L3', 'N'] : ['L', 'N'];
  const bat = threePhase
    ? { id: 'bat', key: 'buck_boost_dc_dc_hv_battery', x: 100, y: 320 }
    : { id: 'bat', key: 'isolated_dc_dc_lv_battery', x: 60, y: 320 };
  const batPorts = threePhase ? [340, 400] : [335, 415];
  const inv = threePhase ? { id: 'inv', key: '3_leg_bridge_3ph', x: 380, y: 150 } : { id: 'inv', key: 'h_bridge_1ph', x: 380, y: 150 };
  const lc = threePhase ? { id: 'lc', key: 'lc_filter_3ph', x: 670, y: 205 } : { id: 'lc', key: 'lc_filter_1ph', x: 600, y: 202 };
  const lcIn = threePhase ? [220, 255, 290, 330] : [222, 262];
  const rx = threePhase ? 850 : 760, tx = rx + 150;
  const bk0 = lcIn[lcIn.length - 1] + 80, bkStep = 44;
  const rel = (id, port, label) => ({ id, key: 'relay_pair', x: rx, y: port - 16, label });
  const cells = [
    { id: 't', x: 0, y: 0, w: 600, h: 26, style: TITLE, label: title },
    { id: 'b1', key: 'mppt_boost_converter', x: 100, y: 40, label: 'MPPT1 boost' },
    { id: 'b2', key: 'mppt_boost_converter', x: 100, y: 180, label: 'MPPT2 boost' },
    bat, inv, lc,
    term('pv1p', 20, 54, 'PV1+'), term('pv1n', 20, 114, 'PV1−'), term('pv2p', 20, 194, 'PV2+'), term('pv2n', 20, 254, 'PV2−'),
    term('batp', 20, batPorts[0] - 6, 'BAT+'), term('batn', 20, batPorts[1] - 6, 'BAT−'),
    ...acs.map((a, i) => rel(`rg${a}`, lcIn[i], `Grid relay ${a}`)),
    ...acs.map((a, i) => rel(`rb${a}`, bk0 + i * bkStep, `Backup relay ${a}`)),
    { ...rel('rnpe', bk0 + acs.length * bkStep + 10, 'N-PE relay (closes off-grid)'), style: `${styleOf(shapeByKey('relay_pair'))}verticalLabelPosition=bottom;verticalAlign=top;spacingTop=-4;` },
    ...acs.map((a, i) => termR(`g${a}`, tx, lcIn[i] - 6, `GRID ${a}`)),
    termR('gPE', tx, lcIn[acs.length - 1] + 34, 'GRID PE'),
    ...acs.map((a, i) => termR(`k${a}`, tx, bk0 + i * bkStep - 6, `BACKUP ${a}`)),
    termR('kPE', tx, bk0 + acs.length * bkStep + 10 - 6, 'BACKUP PE'),
  ];
  const batIn = ['BAT+', 'BAT-'], batOut = ['BUS+', 'BUS-'];
  const invAc = threePhase ? ['L1', 'L2', 'L3', 'N'] : ['L', 'N'];
  const lcInP = threePhase ? ['L1 in', 'L2 in', 'L3 in', 'N in'] : ['L in', 'N in'];
  const lcOutP = threePhase ? ['L1 out', 'L2 out', 'L3 out', 'N out'] : ['L out', 'N out'];
  const wt = (a) => (a === 'N' ? 'N' : 'L');
  const edges = [
    ['pv1p', 'OUT', 'b1', 'IN+', 'DC+'], ['pv1n', 'OUT', 'b1', 'IN-', 'DC-'],
    ['pv2p', 'OUT', 'b2', 'IN+', 'DC+'], ['pv2n', 'OUT', 'b2', 'IN-', 'DC-'],
    ['batp', 'OUT', 'bat', batIn[0], 'DC+'], ['batn', 'OUT', 'bat', batIn[1], 'DC-'],
    ['b1', 'OUT+', 'inv', 'DC+', 'DC+'], ['b1', 'OUT-', 'inv', 'DC-', 'DC-'],
    ['b2', 'OUT+', 'inv', 'DC+', 'DC+'], ['b2', 'OUT-', 'inv', 'DC-', 'DC-'],
    ['bat', batOut[0], 'inv', 'DC+', 'DC+'], ['bat', batOut[1], 'inv', 'DC-', 'DC-'],
    ...invAc.map((a, i) => ['inv', a, 'lc', lcInP[i], wt(a)]),
    ...acs.map((a, i) => ['lc', lcOutP[i], `rg${a}`, 'P1', wt(a)]),
    ...acs.map((a, i) => ['lc', lcOutP[i], `rb${a}`, 'P1', wt(a), '', rx - 50 + i * 9]),
    ...acs.map((a) => [`rg${a}`, 'P2', `g${a}`, 'IN', wt(a)]),
    ...acs.map((a) => [`rb${a}`, 'P2', `k${a}`, 'IN', wt(a)]),
    ['rbN', 'P2', 'rnpe', 'P1', 'N'], ['rnpe', 'P2', 'kPE', 'IN', 'PE'], ['gPE', 'IN', 'kPE', 'IN', 'PE'],
  ];
  template(title, cells, edges);
}

blockTemplate('Hybrid internals – blocks, 1ph LV battery', false);
blockTemplate('Hybrid internals – blocks, 3ph HV battery', true);
circuitTemplate('Hybrid internals – circuit, 1ph LV battery', false);
circuitTemplate('Hybrid internals – circuit, 3ph HV battery', true);

const library = shapes.map((s) => ({
  xml: cellXml(`<mxCell id="2" value="${esc(s.label).replace(/\n/g, '&#10;')}" style="${esc(styleOf(s))
  }" vertex="1" parent="1"><mxGeometry width="${s.w}" height="${s.h}" as="geometry"/></mxCell>`),
  w: s.w, h: s.h, title: s.title, aspect: 'fixed',
}));

// Machine-readable catalog for tools that generate diagrams (e.g. the training site's AI drawer).
const catalog = {
  shapes: Object.fromEntries(shapes.map((s) => [s.key, {
    title: s.title, w: s.w, h: s.h, label: s.label, desc: s.desc || undefined,
    ports: Object.fromEntries(s.ports.map(([n, x, y]) => [n, [x, y]])),
    style: styleOf(s),
  }])),
  wires: Object.fromEntries(wires.map(([title, color, extra, type]) => [type, { title, style: `${WIRE}strokeColor=${color};${extra}` }])),
};

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
writeFileSync(join(webapp, 'solis/solis-hybrid-internals.xml'),
  `<mxlibrary title="Solis – hybrid internals">${JSON.stringify(templates).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</mxlibrary>
`);
writeFileSync(join(webapp, 'solis/solis-shapes.json'), JSON.stringify(catalog));

const config = {
  defaultLibraries: 'solis;general',
  libraries: [{
    title: { main: 'Solis' },
    entries: [{
      id: 'solis',
      title: { main: 'Solis' },
      desc: { main: 'Solis schematic shapes and wires' },
      libs: [
        { title: { main: 'Solis' }, data: library, expand: true },
        { title: { main: 'Solis – hybrid internals' }, data: templates, expand: true },
      ],
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

console.log(`${shapes.length} shapes + ${wires.length} wires + ${templates.length} templates`);
