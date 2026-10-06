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

// ---- wires ----
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
writeFileSync(join(webapp, 'solis/solis-shapes.json'), JSON.stringify(catalog));

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
