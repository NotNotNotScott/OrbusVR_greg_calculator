define(["../simulation/FightSimulator"], function(FightSimulator){
	const {MAX_TIME_SECONDS, STEP_SIZE, MINIMUM_TILESET_LENGTH, MAX_AVAILABLE_TILESETS, START_DRAWING_AFTER_X_SECONDS} = FightSimulator.constants;

	function createAxisLabels(){
		const labels = [];
		const decimalCount = Math.floor(STEP_SIZE) === STEP_SIZE ? 0 : STEP_SIZE.toString().split(".")[1].length || 0;
		for(let i=0;i<MAX_TIME_SECONDS/STEP_SIZE;i++){
			labels.push((STEP_SIZE*i).toFixed(decimalCount));
		}
		return labels;
	}

	function create({simulator, chartInitializer, charts, readSettings, formatDuration}){
		// Calculation charts, statistics, loading indicators, and tileset prompt display.

		let tilesetState = 0;
		let statusMsgTilesets = document.getElementById("tilesetsStatusMsg");
		let REPEAT_FIGHT_COUNT;

		function clearTilesetStatsInterface(){
			// Clear to empty data.
			for(var i=1;i<=MAX_AVAILABLE_TILESETS;i++){
				$("#tileset_percent_"+i).val("");
				$("#tileset_number_of_procs_"+i).val("");
				$("#tileset_avgint_"+i).val("");
			}

			$("#tileset_percent_total").val("");
			$("#min_tileset_percent_total").val("");
			$("#max_tileset_percent_total").val("");
			$("#min_triggered_tiles").val("");
			$("#max_triggered_tiles").val("");
		}

		function populateTilesetStatsTable(calcData){
			const results = simulator.getResults();
			if(readSettings().tilesetsEnabled){
				for(var i=0;i<calcData.tilesetData.usedTilesets.length;i++){
					var tileset = calcData.tilesetData.usedTilesets[i];
					$("#tileset_percent_"+tileset.idx).val(tileset.percentBoost.toFixed(2));
					$("#tileset_number_of_procs_"+tileset.idx).val(tileset.number_of_procs.toLocaleString());
					$("#tileset_avgint_"+tileset.idx).val(tileset.averageInterference.toFixed(2));
				}

				$("#tileset_percent_total").val(calcData.tilesetData.totalTilesetPercent.toFixed(2));

				$("#min_tileset_percent_total").val(calcData.tilesetData.minTotalTilesetPercent.toFixed(2));
				$("#max_tileset_percent_total").val(calcData.tilesetData.maxTotalTilesetPercent.toFixed(2));
				$("#min_triggered_tiles").val(results.minTriggeredTiles);
				$("#max_triggered_tiles").val(results.maxTriggeredTiles);
			}
		}

		function populateTilesetProcChart(graphSpecificData, calcData){
			var you = document.getElementById("line_chart");

			// Prepare the canvas to draw on.
			var minCanvas = document.getElementById("min_tiles_graph");
			var minCtx = minCanvas.getContext("2d");
			minCtx.canvas.width = (you.width);
			minCtx.canvas.height = 100;
			minCtx.stokeStyle = "#FF0000";
			minCtx.fillStyle = graphSpecificData.borderColor;
			minCtx.strokeRect(0, 0, minCtx.canvas.width, 100);


			// Draw all the tilesets their proc times
			for(var i=0;i<calcData.tilesetData.usedTilesets.length;i++){
				var tileset = calcData.tilesetData.usedTilesets[i];
				var totalTilesetUptime = (tileset.condition.length-1)*2;
				var widthTileset = totalTilesetUptime / MAX_TIME_SECONDS * minCtx.canvas.width;
				for(var i2=0;i2<tileset.minRunProccedInfoList.length;i2++){
					var startLocX = tileset.minRunProccedInfoList[i2].time / MAX_TIME_SECONDS * minCtx.canvas.width;
					minCtx.fillRect(startLocX, i*20, widthTileset, 20);
					minCtx.strokeRect(startLocX, i*20, widthTileset, 20);
				}
			}

			// Prepare the canvas to draw on.
			var maxCanvas = document.getElementById("max_tiles_graph");
			var maxCtx = maxCanvas.getContext("2d");
			maxCtx.canvas.width = (you.width);
			maxCtx.canvas.height = 100;
			maxCtx.stokeStyle = "#FF0000";
			maxCtx.fillStyle = graphSpecificData.borderColor;
			maxCtx.strokeRect(0, 0, maxCtx.canvas.width, 100);


			// Draw all the tilesets their proc times
			for(var i=0;i<calcData.tilesetData.usedTilesets.length;i++){
				var tileset = calcData.tilesetData.usedTilesets[i];
				var totalTilesetUptime = (tileset.condition.length-1)*2;
				var widthTileset = totalTilesetUptime / MAX_TIME_SECONDS * maxCtx.canvas.width;
				for(var i2=0;i2<tileset.maxRunProccedInfoList.length;i2++){
					var startLocX = tileset.maxRunProccedInfoList[i2].time / MAX_TIME_SECONDS * maxCtx.canvas.width;
					maxCtx.fillRect(startLocX, i*20, widthTileset, 20);
					maxCtx.strokeRect(startLocX, i*20, widthTileset, 20);
				}
			}
		}

		function fillDpsGraphData(graphData, totalDamageDataPoints, REPEAT_FIGHT_COUNT){
			graphData.data = [];
			var totalTotalDamage = 0;
			var totalDamage = 0;
			for(var i=0;i<totalDamageDataPoints.length;i++){
				if(totalDamageDataPoints[i] != undefined){
					totalDamage+=totalDamageDataPoints[i];
					let timePassed = i/10.0;
					var dps = Math.round(totalDamage/REPEAT_FIGHT_COUNT / timePassed);
					if(parseFloat(timePassed) >= START_DRAWING_AFTER_X_SECONDS){
						graphData.data.push(
							{
								x:timePassed,
								y:dps
							}
						);
					}
				}
			}
		}

		function retreiveCurrentInterfaceTilesets(){
			let usedTilesets = [];
			if(readSettings().tilesetsEnabled){
				for(let i=1;i<MAX_AVAILABLE_TILESETS+1;i++){
					let tilesetData = $("#tileset"+i).val();
					if(tilesetData != undefined){
						tilesetData = tilesetData.replace(/ /g,'');
						if(tilesetData.length >= MINIMUM_TILESET_LENGTH){
							usedTilesets[i] = tilesetData;
						}
					}
				}
			}
			return usedTilesets;
		}

		function initializeGraphData(){
			const loadoutName = $("#loadoutName").val();

			// Reset the data
			let graphSpecificData = chartInitializer.getEmptyChartDatasets(loadoutName);
			charts.dps.data.datasets[0] = graphSpecificData;
			return graphSpecificData;
		}

		function populateDpsGraphs(graphSpecificData, calcData){
			const results = simulator.getResults();
			let minGraphSpecificData = JSON.parse(JSON.stringify(graphSpecificData));
			let maxGraphSpecificData = JSON.parse(JSON.stringify(graphSpecificData));

			// Make all draw points of the graph showing the dps over time. (the whole reason for all the above code xD)
			fillDpsGraphData(graphSpecificData, results.totalDamageDataPoints, REPEAT_FIGHT_COUNT);
			fillDpsGraphData(minGraphSpecificData, results.minMaxData.lowestRunDataPoints, 1);
			fillDpsGraphData(maxGraphSpecificData, results.minMaxData.highestRunDataPoints, 1);
			charts.minDps.data.datasets[0] = minGraphSpecificData;
			charts.maxDps.data.datasets[0] = maxGraphSpecificData;
		}

		function calculateFightAndPopulateUI(){
			let graphSpecificData = initializeGraphData();
			if(graphSpecificData == undefined){return;}

			clearTilesetStatsInterface();

			setTimeout(function(){
				const tilesets = retreiveCurrentInterfaceTilesets();

				REPEAT_FIGHT_COUNT = parseInt($("#calcCount").val());
				REPEAT_FIGHT_COUNT = REPEAT_FIGHT_COUNT != undefined ? REPEAT_FIGHT_COUNT : 1;
				const calcData = simulator.doAllCalculations(tilesets, REPEAT_FIGHT_COUNT);

				populateDpsGraphs(graphSpecificData, calcData);
				populateTilesetStatsTable(calcData);
				populateTilesetProcChart(graphSpecificData, calcData);

				charts.dps.update();

				charts.minDps.update();
				charts.minHit.update();

				charts.maxDps.update();
				charts.maxHit.update();
				console.log(calcData);
			}, 50);
		}

		let updateEditTextTimemout = null;
		let chartFilling = false;
		let startLoadingIconFunc = function(){
			chartFilling = false;
			$("#loadingText").css({visibility: "inherit"});
		};
		let clearLoadingIconFunc = function(){
			chartFilling = false;
			$("#loadingText").css({visibility: "collapse"});
		};

		function preStartCalculation(){
			if(chartFilling == false){
				clearTimeout(updateEditTextTimemout);
				clearLoadingIconFunc();
				updateEditTextTimemout = setTimeout(function(){
					chartFilling = true;
					startLoadingIconFunc();
					setTimeout(function(){
						calculateFightAndPopulateUI();
						setTimeout(clearLoadingIconFunc, 500); // Make the "Calculation..." show at-least for some time.
					}, 100);
				}, 900);
			}
		}

		function setTilesetPromptState(newState){
			if(newState == 0){
				document.getElementById("possibleTiles").removeAttribute("readonly");
				document.getElementById("tilesetsStatusMsg").innerHTML = "";
				document.getElementById("redoTilesetCalculationContainer").style.display = "none";
				document.getElementById("resetTilesetsButton").classList.remove("active-button");
				document.getElementById("startFindingTheBestTilesetCombinations").classList.remove("active-button");
			}
			else if(newState == 1){
				document.getElementById("possibleTiles").removeAttribute("readonly");
				document.getElementById("tilesetsStatusMsg").style.display = "block";
				document.getElementById("redoTilesetCalculationContainer").style.display = "none";
				document.getElementById("resetTilesetsButton").classList.remove("active-button");
				document.getElementById("startFindingTheBestTilesetCombinations").classList.add("active-button");
				document.getElementById("startFindingTheBestTilesetCombinations").innerHTML = "Yes (Start calculation)";
			}
			else if(newState == 2){
				document.getElementById("possibleTiles").setAttribute("readonly", true);
				document.getElementById("redoTilesetCalculationContainer").style.display = "inline-block";
				document.getElementById("resetTilesetsButton").classList.add("active-button");
				document.getElementById("startFindingTheBestTilesetCombinations").classList.remove("active-button");
			}
			else if(newState == 3){
				document.getElementById("possibleTiles").setAttribute("readonly", true);
				document.getElementById("tilesetsStatusMsg").style.display = "block";
				document.getElementById("redoTilesetCalculationContainer").style.display = "inline-block";
				document.getElementById("resetTilesetsButton").classList.add("active-button");
				document.getElementById("startFindingTheBestTilesetCombinations").classList.add("active-button");
				document.getElementById("startFindingTheBestTilesetCombinations").innerHTML = "Yes (Finetune calculation)";
			}
			tilesetState = newState;
		}

		function readTilesetSearchOptions(){
			let repeatFightCount = parseInt($("#repeatFightCount").val());
			if(repeatFightCount < 1){repeatFightCount = 1;}
			const filterBelowPercent = parseFloat($("#filterBelowTilesetPercent").val());
			let filterStartIndex = parseInt($("#filterStartIdxBelowTilesetPercent").val()) - 1;
			if(filterStartIndex < 0){filterStartIndex = 0;}
			return {repeatFightCount: repeatFightCount, filterBelowPercent: filterBelowPercent, filterStartIndex: filterStartIndex};
		}

		function openForm() {
		  document.getElementById("myForm").style.display = "block";
		}

		function populateTilesetRankingResults(sortedTilesetsByDps){
			document.getElementById("recalculateTopTileset").value = sortedTilesetsByDps.length;

			renderjson.set_icons('+', '-');
			renderjson.set_show_to_level(1);
			document.getElementById('bestResultTilesetsJson').innerHTML = "";
			document.getElementById('worseResultTilesetsJson').innerHTML = "";

			let best10 = sortedTilesetsByDps.slice(0, 10);
			let worse10 = sortedTilesetsByDps.slice(Math.max(10, sortedTilesetsByDps.length-10), sortedTilesetsByDps.length);

			document.getElementById('bestResultTilesetsJson').appendChild(renderjson(best10));
			document.getElementById('worseResultTilesetsJson').appendChild(renderjson(worse10));
		}

		function showNoMatchingTilesets(){
			document.getElementById('worseResultTilesetsJson').innerHTML = "<span style='color:#F00'>No tilesets met your criteria... Not keeping the current tilesets...</span>";
		}

		function showTilesetCalculationSummary(elapsedTime, resultCount){
			statusMsgTilesets.innerHTML = "<b>Calculation took:"+formatDuration(elapsedTime) + ". Found "+resultCount + " tilesets.</b>";
		}

		function showTilesetCalculationEstimate(combinationCount, estimatedTime){
			statusMsgTilesets.innerHTML = "There are <b>"+combinationCount+"</b> inique combinations and it will take approximately <b>"+estimatedTime+"</b>. Are you sure?";
		}

		return {
			preStartCalculation: preStartCalculation,
			calculateFightAndPopulateUI: calculateFightAndPopulateUI,
			isCalculating: function(){return chartFilling;},
			getTilesetPromptState: function(){return tilesetState;},
			setTilesetPromptState: setTilesetPromptState,
			readTilesetSearchOptions: readTilesetSearchOptions,
			readPossibleTiles: function(){return document.getElementById("possibleTiles").value.replaceAll(" ", "").split("");},
			readRefinementCount: function(){return parseInt(document.getElementById("recalculateTopTileset").value);},
			showStatus: function(message){statusMsgTilesets.innerHTML = message;},
			populateTilesetRankingResults: populateTilesetRankingResults,
			showNoMatchingTilesets: showNoMatchingTilesets,
			showTilesetCalculationSummary: showTilesetCalculationSummary,
			showTilesetCalculationEstimate: showTilesetCalculationEstimate,
			retreiveCurrentInterfaceTilesets: retreiveCurrentInterfaceTilesets,
			openForm: openForm,
			closeForm: function(){document.getElementById("myForm").style.display = "none";}
		};
	}

	return {create: create, createAxisLabels: createAxisLabels};
});
