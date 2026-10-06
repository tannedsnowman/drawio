# Solis shapes

Fork of [jgraph/drawio](https://github.com/jgraph/drawio) with a Solis shape library
(hybrid inverter, PV inverter, battery, meter, relay, IGBT, CT, breakers, wires...).

- Edit shapes in `solis/build-library.mjs`, then run `node solis/build-library.mjs`.
- That rebuilds `src/main/webapp/solis/solis-library.xml` and the Solis block in
  `src/main/webapp/js/PreConfig.js`, which loads the library by default.
- The library file can also be opened in any draw.io via File > Open Library.

Changes from upstream: `solis/`, `src/main/webapp/solis/`, `src/main/webapp/js/PreConfig.js`.
Upstream licence (Apache 2.0) is unchanged in `LICENSE`.
