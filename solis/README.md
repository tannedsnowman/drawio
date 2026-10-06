# Solis shapes

Fork of [jgraph/drawio](https://github.com/jgraph/drawio) with a Solis shape library
(hybrid inverter, PV inverter, battery, meter, relay, IGBT, CT, breakers, ATS, overview icons,
converter circuits, wires...) plus hybrid-internals templates (blocks and circuit, 1ph LV / 3ph HV).
Templates are groups: select one and use Arrange > Ungroup to edit each part.

- Edit shapes in `solis/build-library.mjs`, then run `node solis/build-library.mjs`.
- That rebuilds `src/main/webapp/solis/solis-library.xml` and the Solis block in
  `src/main/webapp/js/PreConfig.js`, which loads the library by default.
- `solis-shapes.json` is a machine-readable catalog (styles + named ports) for tools that generate diagrams.
- The library files can also be opened in any draw.io via File > Open Library.

Changes from upstream: `solis/`, `src/main/webapp/solis/`, `src/main/webapp/js/PreConfig.js`.
Upstream licence (Apache 2.0) is unchanged in `LICENSE`.
