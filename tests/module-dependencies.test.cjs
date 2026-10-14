// Run with: node tests/module-dependencies.test.cjs
// Optional before/after check: node tests/module-dependencies.test.cjs --compare-before <snapshot-directory>
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const comparisonIndex = process.argv.indexOf('--compare-before');
const comparisonRoot = comparisonIndex === -1 ? null : path.resolve(process.argv[comparisonIndex + 1]);

function createBrowser(seed, beforeRoot) {
  const elements = {}, timers = new Map(), charts = [], drawCalls = [], logs = [], modules = {}, instances = {};
  let nextTimer = 1, clock = 0, loadingFile = '';
  function element(id) {
    return elements[id] ||= {
      value: id === 'classData' ? 'mage' : '', innerHTML: '', style: {}, attributes: {}, classes: [], children: [], events: {}, width: 1800, height: 400,
      addEventListener(event, callback) { this.events[event] = callback; },
      setAttribute(name, value) { this.attributes[name] = value; },
      removeAttribute(name) { delete this.attributes[name]; },
      appendChild(child) { this.children.push(child); },
      classList: {
        add(name) { const el = element(id); if (!el.classes.includes(name)) el.classes.push(name); },
        remove(name) { const el = element(id); el.classes = el.classes.filter(item => item !== name); },
      },
      options: { add(option) { element(id).children.push(option); } },
      getContext() {
        return {
          canvas: this,
          fillRect(...args) { drawCalls.push(['fill', id, ...args]); },
          strokeRect(...args) { drawCalls.push(['stroke', id, ...args]); },
        };
      },
    };
  }
  const sandbox = {
    console: { log(...args) { logs.push(JSON.stringify(args)); } }, localStorage: {}, document: { getElementById: element },
    Option: function(text) { this.text = text; },
    Chart: function(canvas, options) {
      let data;
      Object.defineProperty(this, 'data', { get() { return data; }, set(value) { data = { datasets: [], ...value }; } });
      this.data = options.data || {}; this.updates = 0; this.update = () => this.updates++; charts.push(this);
    },
    setTimeout(callback, delay) { const id = nextTimer++; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); }, seed, logs,
  };
  sandbox.$ = selector => {
    const el = element(selector.slice(1));
    return {
      val(value) { if (arguments.length) { el.value = value; return this; } return el.value; },
      click(callback) { el.events.click = callback; return this; },
      css(value) { Object.assign(el.style, value); return this; }, html(value) { el.innerHTML = value; return this; },
      empty() { el.children = []; return this; }, append(value) { el.children.push(value); return this; },
    };
  };
  sandbox.$.each = (items, callback) => items.forEach((item, key) => callback(key, item));
  sandbox.renderjson = items => JSON.stringify(items);
  sandbox.renderjson.set_icons = () => {}; sandbox.renderjson.set_show_to_level = () => {};
  vm.createContext(sandbox);
  const run = code => vm.runInContext(code, sandbox);
  function read(file) {
    const oldPath = beforeRoot && path.join(beforeRoot, file);
    return fs.readFileSync(oldPath && fs.existsSync(oldPath) ? oldPath : path.join(root, file), 'utf8');
  }
  function load(file) {
    if (modules[file]) return modules[file];
    const previous = loadingFile; loadingFile = file;
    run(read(file)); loadingFile = previous;
    // Record constructed instances to test their public APIs without application globals.
    if (modules[file]?.create) {
      const create = modules[file].create;
      modules[file].create = function(options) { return instances[file] = create(options); };
    }
    return modules[file];
  }
  sandbox.define = (deps, factory) => {
    const file = loadingFile;
    modules[file] = factory(...deps.map(dep => load(path.posix.normalize(path.posix.join(path.posix.dirname(file), dep)) + '.js')));
  };
  sandbox.require = (deps, callback) => callback(...deps.map(dep => load(path.posix.normalize(dep) + '.js')));
  run('Math.random=function(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};');
  sandbox.tick = () => ++clock; run('Date.now=tick;');
  for (const file of ['Tools.js', 'loadConstants.js', 'loadouts.js']) load(file);
  if (beforeRoot) for (const file of ['AttackPatternParser.js', 'FightSimulator.js', 'TilesetOptimizer.js', 'CalculationUI.js']) load(file);
  load('index.js');
  function flush() {
    let count = 0;
    while (timers.size) {
      assert.ok(++count <= 20, 'Unexpected timer loop');
      const [id, timer] = timers.entries().next().value; timers.delete(id); timer.callback();
    }
  }
  function snapshot(result) {
    sandbox.result = result;
    const results = beforeRoot
      ? JSON.parse(run('JSON.stringify({totalDamageDataPoints,minMaxData:typeof minMaxData === "undefined" ? undefined : minMaxData,minTriggeredTiles:minStringStoringAllTiles,maxTriggeredTiles:maxStringStoringAllTiles})'))
      : instances['FightSimulator.js'].getResults();
    return JSON.stringify({ result: JSON.parse(run('JSON.stringify({result,seed})')), results,
      tilesetState: beforeRoot ? run('tilesetState') : instances['CalculationUI.js'].getTilesetPromptState(),
      charts: charts.map(chart => ({data: chart.data, updates: chart.updates})), elements, drawCalls, logs, timers: [...timers.values()].map(timer => timer.delay) });
  }
  return { run, flush, snapshot, modules, instances, element, click: id => element(id).events.click(), sandbox };
}

let comparisons = 0;
for (const seed of [1, 42, 987654321]) {
  const current = createBrowser(seed);
  const before = comparisonRoot && createBrowser(seed, comparisonRoot);
  function compare(label, currentResult, beforeResult) {
    if (before) { assert.deepStrictEqual(JSON.parse(current.snapshot(currentResult)), JSON.parse(before.snapshot(beforeResult)), label); comparisons++; }
  }
  compare('startup');
  current.flush(); before?.flush(); compare('initial calculation');
  assert.equal(current.element('loadingText').style.visibility, 'collapse');
  assert.ok(current.instances['FightSimulator.js'].getResults().minMaxData.highestTotal > 0);
  for (const name of ['doAllCalculations', 'getAttackPatterns', 'clone', 'chartFilling', 'tilesetState', 'totalDamageDataPoints', 'minMaxData', 'labelsAxisX', 'MAX_TIME_SECONDS']) {
    assert.equal(current.run('typeof ' + name), 'undefined', name + ' must remain private');
  }
  const loadouts = JSON.parse(current.run('JSON.stringify(Object.entries(res).flatMap(([name,loadouts])=>Object.keys(loadouts).map(loadout=>[name,loadout])))'));
  for (const [className, loadoutName] of loadouts) {
    const setup = `$('#classData').val(${JSON.stringify(className)});localStorage[loadoutsKey]=JSON.stringify(res);injectLoadout(${JSON.stringify(loadoutName)});`;
    current.run(setup); before?.run(setup);
    const result = current.instances['FightSimulator.js'].doAllCalculations(current.instances['CalculationUI.js'].retreiveCurrentInterfaceTilesets(), 3);
    const oldResult = before?.run('doAllCalculations(retreiveCurrentInterfaceTilesets(),3)');
    assert.ok(result.dps > 0, className + ': ' + loadoutName);
    compare(className + ': ' + loadoutName, result, oldResult);
  }
  current.run("$('#calcCount').val(3);"); before?.run("$('#calcCount').val(3);");
  current.instances['CalculationUI.js'].calculateFightAndPopulateUI(); before?.run('calculateFightAndPopulateUI();');
  current.flush(); before?.flush(); compare('manual calculation');
  for (const id of ['openFindBestTilesetButton', 'closeFindTilesetButton', 'resetTilesetsButton', 'startFindingTheBestTilesetCombinations']) {
    current.click(id); before?.click(id); compare(id);
  }
  const setupSearch = "$('#possibleTiles').val('ABC');$('#repeatFightCount').val(2);$('#filterBelowTilesetPercent').val(-1);$('#filterStartIdxBelowTilesetPercent').val(1);";
  current.run(setupSearch); before?.run(setupSearch);
  for (const id of ['checkTilesetsButton', 'startFindingTheBestTilesetCombinations', 'checkTilesetsButton', 'startFindingTheBestTilesetCombinations']) {
    current.click(id); before?.click(id); compare('search/refinement ' + id);
  }
  assert.equal(current.instances['CalculationUI.js'].getTilesetPromptState(), 2);
  assert.ok(current.element('bestResultTilesetsJson').children.length > 0);
  current.run("$('#recalculateTopTileset').val(0);"); before?.run("$('#recalculateTopTileset').val(0);");
  current.click('checkTilesetsButton'); before?.click('checkTilesetsButton'); compare('empty refinement');
  current.click('resetTilesetsButton'); before?.click('resetTilesetsButton');
  current.run("$('#filterBelowTilesetPercent').val(10000);"); before?.run("$('#filterBelowTilesetPercent').val(10000);");
  current.click('checkTilesetsButton'); before?.click('checkTilesetsButton'); compare('early-stop estimate');
  current.click('startFindingTheBestTilesetCombinations'); before?.click('startFindingTheBestTilesetCombinations'); compare('no matches');
  assert.match(current.element('worseResultTilesetsJson').innerHTML, /No tilesets met/);
  current.click('resetTilesetsButton'); before?.click('resetTilesetsButton');
  current.run("$('#possibleTiles').val('ABCDEF');"); before?.run("$('#possibleTiles').val('ABCDEF');");
  current.click('checkTilesetsButton'); before?.click('checkTilesetsButton'); compare('too many possible tiles');
  assert.match(current.element('tilesetsStatusMsg').innerHTML, /max allowed/);
  // Creating a second simulator must not overwrite the first instance's accumulated results.
  const firstSimulator = current.instances['FightSimulator.js'];
  const firstResults = JSON.stringify(firstSimulator.getResults());
  const settings = { tilesetsEnabled: false, critChance: 0, critDamage: 1.5, critMultiplier: 1, weaponAffixBoosts: 1, weaponLevel: 30, weaponPlusLevel: 0 };
  const isolated = current.modules['FightSimulator.js'].create({
    readInput: () => ({ className: 'fixture', attackPattern: '', settings }),
    loadAttacksOfClass: (name, data) => { data.classData = { attackTypes: {} }; }, hitChartData: { min: {}, max: {} },
  });
  isolated.doAllCalculations([], 1);
  assert.equal(JSON.stringify(firstSimulator.getResults()), firstResults);
}
console.log('Module dependency, instance isolation, built-in loadout, UI, and optimizer checks passed.' + (comparisonRoot ? ' ' + comparisons + ' seeded before/after comparisons passed.' : ''));
