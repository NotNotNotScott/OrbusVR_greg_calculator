define([], function(){
	function create({simulator, ui, tools}){
		// Tileset combination generation, ranking, calculation estimates, and refinement.

		let timeItWillTakeToCalculateTilesets;
		let REPEAT_FIGHT_TILESETS_COUNT;
		let FILTER_TILESETS_BELOW_PERCENT;
		let FILTER_START_IDX_TILESETS_BELOW_PERCENT;
		let allPossibleTilesetGroupsGlobal;
		let sortedTilesetsByDps;
		let finetunedTilesetGroups;

		function obtainAllPossibleTilesetCombinations(possibleTiles){
			let allPossibleTilesets = tools.createAllPossibleVariations(possibleTiles, 3);
			// allPossibleTilesets = allPossibleTilesets.concat(tools.createAllPossibleVariations(possibleTiles, 4));
			for(let i=0;i<allPossibleTilesets.length;i++){
				allPossibleTilesets[i] = allPossibleTilesets[i].join("");
			}

			// Remove any impossible tilesets.
			if(possibleTiles.indexOf("0") >= 0){
				for(let i=allPossibleTilesets.length-1;i>=0;i--){
					if(allPossibleTilesets[i].indexOf("0") > 0){
						allPossibleTilesets.splice(i, 1);
					}
				}
			}

			let newAllPossibleTilesetGroups = tools.createAllPossibleCombinations(allPossibleTilesets, 5);

			return newAllPossibleTilesetGroups;
		}

		function prepareTilesetResults(results){
			results.sort( function compare( a, b ) {
			if ( a.dps < b.dps ){
				return 1;
			}
			if ( a.dps > b.dps ){
				return -1;
				}
				return 0;
			});
			return results;
		}

		function findAndRankAllTilesetGroups(allPossibleTilesetGroups){
			const startTime = Date.now();
			let results = [];
			for(let i=0;i<allPossibleTilesetGroups.length;i++){
				let tilesets = allPossibleTilesetGroups[i];

				const calcData = simulator.doAllCalculations(tilesets, REPEAT_FIGHT_TILESETS_COUNT, FILTER_TILESETS_BELOW_PERCENT, FILTER_START_IDX_TILESETS_BELOW_PERCENT);
				if(calcData !== false){
					results.push({
						dps:calcData.dps,
						tilesets:tilesets,
						averageBoost: calcData.tilesetData.totalTilesetPercent.toFixed(2),
						minBoost: calcData.tilesetData.minTotalTilesetPercent.toFixed(2),
						maxBoost: calcData.tilesetData.maxTotalTilesetPercent.toFixed(2)
					});
				}
			}

			let preSortedTilesetsByDps = prepareTilesetResults(results);

			if(preSortedTilesetsByDps.length > 0){
				sortedTilesetsByDps = preSortedTilesetsByDps;
				ui.populateTilesetRankingResults(sortedTilesetsByDps);

				console.log(sortedTilesetsByDps);
			}
			else{
				ui.showNoMatchingTilesets();
				return false;
			}
			ui.showTilesetCalculationSummary(Date.now()-startTime, sortedTilesetsByDps.length);
			return true;
		}

		function prepareFindingBestTilesets(possibleTiles){
			const TARGET_MAX_CALC_TIME = 1500;
			const BASE_CALC_COUNT = 100;

			let timePassed=0;
			let calculations = 0;
			let maxRepeatFight = REPEAT_FIGHT_TILESETS_COUNT;

			let startTime = Date.now();
			simulator.doAllCalculations(possibleTiles[0], BASE_CALC_COUNT);
			let initialTimePassed = (Date.now()-startTime) * maxRepeatFight / BASE_CALC_COUNT;

			const steps = Math.max(1, Math.min(possibleTiles.length/5, TARGET_MAX_CALC_TIME/initialTimePassed));
			const indexShiftEachStep = Math.max(1, parseInt(possibleTiles.length/steps));

			startTime = Date.now();
			for(let i=0;i<possibleTiles.length;i+=indexShiftEachStep){
				const result = simulator.doAllCalculations(possibleTiles[i], maxRepeatFight, FILTER_TILESETS_BELOW_PERCENT, FILTER_START_IDX_TILESETS_BELOW_PERCENT);
				calculations+=maxRepeatFight;
				timePassed = Date.now()-startTime;
			}

			let maxCalculations = possibleTiles.length*REPEAT_FIGHT_TILESETS_COUNT;
			let localTimeItWillTakeToCalculateTilesets = maxCalculations/calculations * timePassed;

			timeItWillTakeToCalculateTilesets = tools.millisecondsToTimeRemaining(localTimeItWillTakeToCalculateTilesets);
			ui.showTilesetCalculationEstimate(possibleTiles.length, timeItWillTakeToCalculateTilesets);
		}

		function prepareTilesetSearch(){
			const tilesetState = ui.getTilesetPromptState();
			if(tilesetState == 0 || tilesetState == 1){
				let possibleTiles = ui.readPossibleTiles();
				const MAX_POSSIBLE_TILES = 5;
				if(possibleTiles.length > MAX_POSSIBLE_TILES){
					ui.showStatus("<span style='color:#F00'>Sorry. The max allowed of tiles are "+MAX_POSSIBLE_TILES+". Or the program will just crash for having to many options xD</span>");
				} else{
					readSearchOptions();
					allPossibleTilesetGroupsGlobal = obtainAllPossibleTilesetCombinations(possibleTiles);
					prepareFindingBestTilesets(allPossibleTilesetGroupsGlobal);
					ui.setTilesetPromptState(1);
				}
			}
			else if(tilesetState == 2 || tilesetState == 3){
				finetunedTilesetGroups = [];
				let theTopSize = ui.readRefinementCount();
				for(let i=0;i<Math.min(theTopSize, sortedTilesetsByDps.length);i++){
					finetunedTilesetGroups.push(sortedTilesetsByDps[i].tilesets);
				}

				readSearchOptions();

				if(finetunedTilesetGroups.length > 0){
					prepareFindingBestTilesets(finetunedTilesetGroups);
					ui.setTilesetPromptState(3);
				}
				else{
					ui.showStatus("<span style='color:#F00'>There are no tiles left to use. Reset calculation...</span>");
				}
			}
		}

		function startTilesetSearch(){
			const tilesetState = ui.getTilesetPromptState();
			if(tilesetState == 1){
				if(findAndRankAllTilesetGroups(allPossibleTilesetGroupsGlobal)){
					ui.setTilesetPromptState(2);
				}
			} else if(tilesetState == 3){
				if(findAndRankAllTilesetGroups(finetunedTilesetGroups)){
					ui.setTilesetPromptState(2);
				}
			} else{
				ui.showStatus("Press the check button first before continuing...");
			}
		}

		function readSearchOptions(){
			const options = ui.readTilesetSearchOptions();
			REPEAT_FIGHT_TILESETS_COUNT = options.repeatFightCount;
			FILTER_TILESETS_BELOW_PERCENT = options.filterBelowPercent;
			FILTER_START_IDX_TILESETS_BELOW_PERCENT = options.filterStartIndex;
		}
		return {prepareTilesetSearch: prepareTilesetSearch, startTilesetSearch: startTilesetSearch};
	}

	return {create: create};
});
