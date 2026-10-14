// Composition root: load modules, supply application input, and wire the interface.
require(["./js/simulation/FightSimulator", "./js/ui/CalculationUI", "./js/optimization/TilesetOptimizer", "./js/ui/ChartInitializer"],
function(FightSimulator, CalculationUI, TilesetOptimizer, ChartInitializer){
	function readSettings(){
		return {
			tilesetsEnabled: globalTilesetsEnabledFlag,
			randomizedChargedStrikes: globalRandomizedStartLocationChargedStrikes,
			critChance: globalArmourCritChance,
			critMultiplier: globalDpsMultiplierFromCritting,
			usingChargedStrikes: globalUsingChargedStrikes,
			critDamage: globalArmourCritDamage,
			averagingCrits: globalAveragingCritsFlag,
			usingBleed: globalUsingBleed,
			weaponAffixBoosts: globalWeaponAffixBoosts,
			weaponLevel: globalWeaponLvl,
			weaponPlusLevel: globalWeaponPlusLvl,
			bleedDamageIncrease: BLEED_ACTUAL_DMG_INC
		};
	}

	ChartInitializer.initializeAllClassData(CalculationUI.createAxisLabels());
	const simulator = FightSimulator.create({
		readInput: function(){return {className: $("#classData").val(), attackPattern: $("#attacks").val(), settings: readSettings()};},
		loadAttacksOfClass: ChartInitializer.loadAttacksOfClass.bind(ChartInitializer),
		hitChartData: {min: minHitSpecificData, max: maxHitSpecificData}
	});
	const ui = CalculationUI.create({simulator: simulator, chartInitializer: ChartInitializer,
		charts: {dps: dpsChart, minDps: minDpsChart, maxDps: maxDpsChart, minHit: minHitChart, maxHit: maxHitChart},
		readSettings: readSettings, formatDuration: millisecondsToTimeRemaining});
	const optimizer = TilesetOptimizer.create({simulator: simulator, ui: ui,
		tools: {createAllPossibleVariations: createAllPossibleVariations,
			createAllPossibleCombinations: createAllPossibleCombinations,
			millisecondsToTimeRemaining: millisecondsToTimeRemaining}});

	document.getElementById("resetTilesetsButton").addEventListener("click", function(){ui.setTilesetPromptState(0);});
	document.getElementById("calculateButton").addEventListener("click", function(){ui.preStartCalculation();});
	document.getElementById("openFindBestTilesetButton").addEventListener("click", function(){ui.openForm();});
	document.getElementById("closeFindTilesetButton").addEventListener("click", function(){ui.closeForm();});
	document.getElementById("checkTilesetsButton").addEventListener("click", function(){optimizer.prepareTilesetSearch();});
	document.getElementById("startFindingTheBestTilesetCombinations").addEventListener("click", function(){optimizer.startTilesetSearch();});

	$("#togglePots").click(function(){
		if(ui.isCalculating() == false){
			globalUsingPotsFlag = !globalUsingPotsFlag;
			updatePotsHtml(globalUsingPotsFlag);
			refreshLoadout();
			loadAllCharts();
		}
	});

	$("#toggleTilesets").click(function(){
		if(ui.isCalculating() == false){
			globalTilesetsEnabledFlag = !globalTilesetsEnabledFlag;
			updateTilesets(globalTilesetsEnabledFlag);
			loadAllCharts();
		}
	});

	ui.preStartCalculation();
});
