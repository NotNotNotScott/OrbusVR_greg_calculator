# OrbusVR_greg_calculator
This program simulates the attack patterns done of multiple classes in the game OrbusVR. This includes different attack types and the triggering of tilesets.

# How to use the program.
## Download the zip from this webpage.
![image](https://user-images.githubusercontent.com/10028040/186525120-afd1ba43-a0bc-4efa-a5b7-d5fda12a1115.png)

## Unzip it
![image](https://user-images.githubusercontent.com/10028040/186525518-26a55cef-b10e-4661-a67e-ad95dacebc0f.png)

## Open index.html with a browser by right clicking the file and selecting to "open with" your browser of choice. (Google Chrome, Microsoft Edge, etc)
![image](https://user-images.githubusercontent.com/10028040/186525651-d7d1f917-0dc0-4c2a-a4e2-c095db371ab1.png)

## Code structure

`index.js` loads the RequireJS modules and supplies their runtime dependencies:

- `AttackPatternParser.js` parses attack strings and exports the cloning helper used by class hooks.
- `FightSimulator.js` imports the parser and attack constructor. Each simulator owns its calculation state and exposes results through `getResults()`.
- `CalculationUI.js` imports the simulator's constants and accepts a simulator instance, chart references, settings reader, and duration formatter.
- `TilesetOptimizer.js` accepts simulator and UI instances plus the combination and time helpers.

The existing loadout settings and chart globals are connected to these interfaces in `index.js`. The four modules do not share mutable globals with each other.

Run the module integration checks with `node tests/module-dependencies.test.cjs`. They exercise the real class modules and built-in loadouts using a simulated browser interface.
