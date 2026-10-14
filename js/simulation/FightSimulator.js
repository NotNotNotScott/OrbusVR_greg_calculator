define(["./AttackPatternParser", "../classes/Attack"], function(AttackPatternParser, AttackModule){
	// Fight simulation, timing constants, and accumulated calculation results.

	const MAX_TIME_SECONDS = 230;

	// Warning: This value can not change currently (a few bits of code have hardcoded behavior around 0.1 stepsize,
	// if that is still the case... No need to change this anyway.
	const STEP_SIZE = 0.1;

	// Block any tilesets that are shorter than 3.
	const MINIMUM_TILESET_LENGTH = 3;

	// Specify how many tilesets are possible to have (4 armour pieces + 1 weapon)
	const MAX_AVAILABLE_TILESETS = 5;

	// Specifies how many tilesets can be up at the same time.
	const MAX_ALLOWED_ACTIVE_TILESETS = 3;

	// Specifies how much dps a tileset boosts without interference.
	// In theory there is a system in place that would increase or decrease this 10%
	// which is dependant on how rare the tiles are that are used. But in practice most useful tilesets
	// seem to end up to always be a 10% boost. (future research needed for maybe any useful higher boost tileset?)
	const DEFAULT_TILESET_BOOST = 0.10;

	// Making tilesets expire a bit faster than reality, because in reality no human can do every action
	// with an exact timing which doesn't lose time. This way you don't get a false hope of a tileset
	// being useful while in fact it is in reality impossible to use.
	// (Example: a tileset that will expire in 0.1 seconds but a charged piercing shot hits the target.
	// In reality human error did not make that 0.1 seconds remaining)
	const TILESET_HUMAN_UPTIME_CORRECTION = 0.2;

	// Constant making sure not more then 5 hits per second tiles can trigger.
	const MAX_HIT_COUNT = 5;

	// Don't draw the charts of the first X seconds because of extreme dps on such short timeframes.
	const START_DRAWING_AFTER_X_SECONDS = 5;

	// A dot takes this amount of time before it triggers the next tick. This is important for accuracy of the program.
	// Note, the found time seems to vary and get more than the current value depending on the DoT type.
	// (example of DoTs: Mage DoT, Shaman DoT, Heal DoT)
	const TIME_SPACING_DOTS = 1.06;
	const Attack = AttackModule.Attack;
	const ATTACK_NORMAL = 0;
	const ATTACK_DOT = 1;
	const ATTACK_HITS_PER_SECOND = 3;

	function create({readInput, loadAttacksOfClass, hitChartData}){
		let minCalcData;
		let maxCalcData;
		let totalDamageDataPoints;
		let minMaxData;
		let minStringStoringAllTiles;
		let maxStringStoringAllTiles;
		let input;
		let settings;
		const minHitSpecificData = hitChartData.min;
		const maxHitSpecificData = hitChartData.max;

		function updateTotalTilesetPercent(calcData){
			let totalNonTilesetDmg = calcData.addedTotalDamage-calcData.tilesetData.addedDmgTilesets;
			calcData.tilesetData.totalTilesetPercent = calcData.tilesetData.addedDmgTilesets*100.0/totalNonTilesetDmg;
		}

		function updateTilesetData(calcData){
			if(settings.tilesetsEnabled){
				let totalNonTilesetDmg = calcData.addedTotalDamage-calcData.tilesetData.addedDmgTilesets;
				for(var i=0;i<calcData.tilesetData.usedTilesets.length;i++){
					let tileset = calcData.tilesetData.usedTilesets[i];
					tileset.percentBoost = tileset.addedDmg*100.0/totalNonTilesetDmg;

					let sumInt = tileset.interferenceList.reduce((a,b) => a + b, 0);
					tileset.averageInterference = sumInt/ tileset.interferenceList.length;
				}

				updateTotalTilesetPercent(calcData);

				minCalcData = {tilesetData:{}};
				maxCalcData = {tilesetData:{}};
				minCalcData.addedTotalDamage = minMaxData.lowestTotal;
				maxCalcData.addedTotalDamage = minMaxData.highestTotal;
				minCalcData.tilesetData.addedDmgTilesets = minMaxData.lowestRunAddedTilesetDmg;
				maxCalcData.tilesetData.addedDmgTilesets = minMaxData.highestRunAddedTilesetDmg;

				calcData.tilesetData.minTotalTilesetPercent = minCalcData.tilesetData.addedDmgTilesets*100.0/(minCalcData.addedTotalDamage-minCalcData.tilesetData.addedDmgTilesets);
				calcData.tilesetData.maxTotalTilesetPercent = maxCalcData.tilesetData.addedDmgTilesets*100.0/(maxCalcData.addedTotalDamage-maxCalcData.tilesetData.addedDmgTilesets);
			}
		}

		const ROW_OF_HITS_PER_SEC = "999";
		function calculateOneFight(calcData, fightIndex){
			const fight = initializeFightState(calcData);
			let nextAttack;
			while((nextAttack = takeNextFightAttack(fight)) !== null){
				const {attack, targetPatternData} = nextAttack;
				const multipliers = calculateAttackMultipliers(attack, targetPatternData, calcData, fight, fightIndex);
				const damageBoost = getActiveDamageBoost(fight);
				expireActiveTilesets(attack, fight);
				const addedDamage = calculateAttackDamage(attack, calcData, fight, multipliers, damageBoost);
				recordAttackDamage(attack, fight, addedDamage);
				scheduleAttackDots(attack, fight);
				applyAttackDamageBoost(attack, fight);
				const triggeredTiles = collectTriggeredTiles(attack, fight);
				triggerFightTilesets(triggeredTiles, fight);
			}
			return finishFight(calcData, fight);
		}

		function initializeFightState(calcData){
			// Keep mutable simulation data together so each helper works on the same fight.
			const fight = {};
			fight.localStoringAllTiles = '';
			fight.localHitChartData = {data: [], pointBackgroundColor: [], customLabels: []};
			fight.localTotalDamageDataPoints = [];
			fight.localAddedDmgTilesets = 0;

			// Set charged strikes start count. If randomized a random rotation can not be influenced
			fight.chargedStrikesCount = settings.randomizedChargedStrikes ? parseInt(Math.random()*11-1) : -1;

			calcData.critChance = settings.critChance;
			calcData.dpsMultiplierFromCritting = settings.critMultiplier;

			// Convert the raw string of actions to actual data.
			fight.attackPatternsData = AttackPatternParser.getAttackPatterns(input.attackPattern, calcData.classData);

			fight.prevNormalAttackTimePassed = -100; // Minus number to trigger start of combat tile.

			addHitsPerSecondPattern(fight.attackPatternsData);

			// Initialize variables.
			fight.timePassed = 0;
			fight.totalDamage = 0;
			fight.hitCount = 0;
			fight.dmgBoosts = [];
			fight.activeDots = [];

			// Initialize active tilesets.
			fight.usedTilesets = calcData.tilesetData.usedTilesets;
			fight.activeTilesets = [];
			fight.localProccedInfoLists = [];
			for (var i = 0; i < fight.usedTilesets.length; i++) {
				fight.usedTilesets[i].conditionLeft = fight.usedTilesets[i].condition;
				fight.usedTilesets[i].conditionStartTime = 0;
				fight.usedTilesets[i].interferenceCount = -1;
				fight.localProccedInfoLists[i] = [];
			}

			return fight;
		}

		function addHitsPerSecondPattern(attackPatternsData){
			// Generate a random startFrame from where the hits a second tiles start triggering and
			// make them seperate attacks that trigger the hits per second tiles.
			let newAttackPattern = [];
			for(var i2=0;i2<MAX_TIME_SECONDS;i2++){
				var newAttack = new Attack(1, 0, false, 	0, 0, 0,  	0, 0, 0,  	0, 10, "","");
				newAttack.type = ATTACK_HITS_PER_SECOND;
				newAttackPattern.push(newAttack);
			}
			attackPatternsData[ROW_OF_HITS_PER_SEC] = {
				patternTimePassed:Math.random()-1,
				patternIdx:0,
				pattern: newAttackPattern
			};
		}

		function takeNextFightAttack(fight){
			// Find out in which attack pattern row is the closest is for the next timeframe.
			var closestTimePassed = MAX_TIME_SECONDS;
			var targetPatternData=null;
			for (var key in fight.attackPatternsData) {
				var attackPatternData = fight.attackPatternsData[key];
				if(attackPatternData.patternIdx < attackPatternData.pattern.length){
					var newTimePassed = attackPatternData.patternTimePassed + attackPatternData.pattern[attackPatternData.patternIdx].time;
					if(newTimePassed < closestTimePassed){
						closestTimePassed = newTimePassed;
						targetPatternData = attackPatternData;
					}
				}
			}

			// When last attack found of all attack patterns, exit loop.
			if(targetPatternData == null || closestTimePassed > MAX_TIME_SECONDS){
				return null;
			}

			var attackPattern = targetPatternData.pattern;
			var attack = attackPattern[targetPatternData.patternIdx];
			fight.timePassed=closestTimePassed;

			// Set the next index of attack of that pattern. (keeping track how many attack have been done in that attack row)
			targetPatternData.patternIdx++;
			targetPatternData.patternTimePassed = closestTimePassed;

			return {attack: attack, targetPatternData: targetPatternData};
		}

		function calculateAttackMultipliers(attack, targetPatternData, calcData, fight, fightIndex){
			// Execute a function call before calculating if crit has been done.
			var modifierFuncBoostPercent = 1;
			if(attack.preModifierFunc != undefined){
				modifierFuncBoostPercent = attack.preModifierFunc(attack, targetPatternData, calcData, fight.timePassed, fightIndex);
			}

			var chargedStrikesWillCrit = false;
			if(fight.chargedStrikesCount >= 9 && attack.hitCount > 0){
				fight.chargedStrikesCount = -1;
				chargedStrikesWillCrit = true;
			}

			// Only attacks that are hitting add to the charged strikes counter. (only when charged strikes is enabled though)
			if(settings.usingChargedStrikes && attack.hitCount > 0){
				fight.chargedStrikesCount++;
			}

			// Determine if this hit is going to crit.
			var critBoostPercent = 1;
			if(attack.canCrit){
				// Is crit
				if(Math.random() <= calcData.critChance || (chargedStrikesWillCrit && attack.hitCount > 0)){
					attack.isCritting = true;
					critBoostPercent = settings.critDamage;
				} else{
					attack.isCritting = false;
				}
				// This removes all the randomizer of dps from critting itself. This way the dps is more accurate on average.
				if(settings.averagingCrits && (!chargedStrikesWillCrit && attack.hitCount > 0)){
					critBoostPercent = calcData.dpsMultiplierFromCritting;
				}
			}

			// Execute a function call after calculating if crit has been done.
			if(attack.modifierFunc != undefined){
				modifierFuncBoostPercent *= attack.modifierFunc(attack, targetPatternData, calcData, fight.timePassed);
			}

			return {modifier: modifierFuncBoostPercent, crit: critBoostPercent};
		}

		function getActiveDamageBoost(fight){
			var addedDmgBoostPercent = 1.0;
			// Loop through all current active damage boosts and update their number for this timeframe.
			// (damage boosting is also affecting currently ticking dots)
			for (var id in fight.dmgBoosts) {
				if (Object.prototype.hasOwnProperty.call(fight.dmgBoosts, id)) {
					// Remove boosts that are past their due date.
					while(fight.timePassed > fight.dmgBoosts[id].expire[0]){
						fight.dmgBoosts[id].expire.shift();
					}

					for(var i3=0;i3<fight.dmgBoosts[id].expire.length;i3++){
						addedDmgBoostPercent*= fight.dmgBoosts[id].amount;
					}
				}
			}

			return addedDmgBoostPercent;
		}

		function expireActiveTilesets(attack, fight){
			if(attack.type == ATTACK_NORMAL){

				// Go through all current tileset procs and remove the expired ones.
				// Expires later for a tileset that is longer.
				// 3 long = 4 seconds
				// 4 long = 6 seconds
				// 5 long = 8 seconds
				for(var i3=fight.activeTilesets.length-1;i3>=0;i3--){
					var tilesetTimePassed = fight.timePassed-fight.activeTilesets[i3].time;
					var totalTilesetUptime = (fight.activeTilesets[i3].tileset.condition.length-1)*2;
					if(tilesetTimePassed > totalTilesetUptime-TILESET_HUMAN_UPTIME_CORRECTION){ // Seems to still count even over 4 secs. Like 4.1ish
						fight.activeTilesets.splice(i3, 1);
					}
				}

			}
		}

		function calculateAttackDamage(attack, calcData, fight, multipliers, damageBoost){
			var addedTilesetDamagePercent = 1.0;
			// Calculate the added damage by doing most boosts time the default damage of the attack.
			const BLEED_BOOST = (settings.usingBleed) ? 1+settings.bleedDamageIncrease*settings.critMultiplier : 1;
			const NO_CRIT_DMG = attack.damage * damageBoost*multipliers.modifier*BLEED_BOOST;
			const NO_TILESET_DMG = NO_CRIT_DMG*settings.weaponAffixBoosts + NO_CRIT_DMG*(multipliers.crit-1);

			if(settings.tilesetsEnabled){
				var targetTilesets = fight.activeTilesets;
				if(attack.type == ATTACK_DOT){
					targetTilesets = attack.dotTiles; // Hitchhiked variable for active tilesets variable.
				}

				// Calculate total tileset added damage.
				for(var i3=targetTilesets.length-1;i3>=0;i3--){
					const tilesetBoostAmount = targetTilesets[i3].tilesetBoostAmount;
					addedTilesetDamagePercent += tilesetBoostAmount;
					targetTilesets[i3].tileset.addedDmg += NO_TILESET_DMG * tilesetBoostAmount;
					calcData.tilesetData.addedDmgTilesets += NO_TILESET_DMG * tilesetBoostAmount;
					fight.localAddedDmgTilesets += NO_TILESET_DMG * tilesetBoostAmount;
				}

			}

			return NO_TILESET_DMG*addedTilesetDamagePercent;
		}

		function recordAttackDamage(attack, fight, addedDamage){
			// Add to total damage.
			fight.totalDamage += addedDamage;
			if(addedDamage != 0){
				fight.localHitChartData.data.push({x:fight.timePassed, y:addedDamage});
				fight.localHitChartData.pointBackgroundColor.push("#118800");
				fight.localHitChartData.customLabels.push(["DAMAGE:"+parseInt(addedDamage), "tiles:"+attack.tiles]);
			}

			// Draw dps graph, but only when either time or damage is going forward.
			if(attack.damage > 0 || (attack.time > 0 && attack.dotTimes > 0)){
				var newPointTimeX = (Math.floor(fight.timePassed*10)/10);
				var damageTimeLocX = parseInt(newPointTimeX*10);
				if(totalDamageDataPoints[damageTimeLocX] == undefined){
					totalDamageDataPoints[damageTimeLocX] = 0;
				}
				totalDamageDataPoints[damageTimeLocX]+=addedDamage;
				if(fight.localTotalDamageDataPoints[damageTimeLocX] == undefined){
					fight.localTotalDamageDataPoints[damageTimeLocX] = 0;
				}
				fight.localTotalDamageDataPoints[damageTimeLocX]+=addedDamage;
			}
		}

		function scheduleAttackDots(attack, fight){
			// Attacks with DoT effect will affect the list of attacks were every second
			// a new DoT attack is added for specified DoT dotTimes amount.
			if(attack.dotTimes > 0){

				// Initialize the object that tracks active DoT's of this DoT ID. (attackID)
				if(fight.activeDots[attack.attackID] == undefined){
					fight.activeDots[attack.attackID] = {currentTarget:0, maxTarget:(attack.dotMaxActive-1)};
				}
				// Remember the current index of the DoT that is applied. So overriding DoT's with same ID can
				// be replaced later on in the calculations.
				else{
					fight.activeDots[attack.attackID].currentTarget++;
					// Loop back around the ID to the first if dotMaxActive has reached max.
					if(fight.activeDots[attack.attackID].currentTarget > fight.activeDots[attack.attackID].maxTarget){
						fight.activeDots[attack.attackID].currentTarget = 0;
					}
				}

				// Add the DoT's increased damage from tilesets
				var copyTilesetStats = [];
				for(var i4=0;i4<fight.activeTilesets.length;i4++){
					copyTilesetStats.push({
						"tileset":fight.activeTilesets[i4].tileset,
						"tilesetBoostAmount":fight.activeTilesets[i4].tilesetBoostAmount
					});
				}

				var ROW_OF_DOT = "100_"+attack.attackID+"_"+fight.activeDots[attack.attackID].currentTarget;
				fight.attackPatternsData[ROW_OF_DOT] = {patternTimePassed:fight.timePassed, patternIdx:0};
				var attackDotPattern = [];
				for(var i2=0;i2<attack.dotTimes;i2++){
					var newDotAttack;
					if(attack.spawnsNormalAttack === true){
						newDotAttack = new Attack(TIME_SPACING_DOTS, attack.dotDamage, true, 0, 0, 0,  0, 0, 0,  1, attack.attackID, attack.dotTiles, copyTilesetStats);
						newDotAttack.type = ATTACK_NORMAL;
					} else{
						newDotAttack = new Attack(TIME_SPACING_DOTS, attack.dotDamage, true, 0, 0, 0,  0, 0, 0,  0, attack.attackID, attack.dotTiles, copyTilesetStats);
						newDotAttack.type = ATTACK_DOT;
						newDotAttack.dotID = fight.activeDots[attack.attackID].currentTarget;
					}

					attackDotPattern.push(newDotAttack);
				}
				fight.attackPatternsData[ROW_OF_DOT].pattern = attackDotPattern;
			}
		}

		function applyAttackDamageBoost(attack, fight){
			// Only real attacks have affect on some calculations (DoT's do not). So do calculations
			// in this IF statement that only change when a normal attack has been done.
			if(attack.type == ATTACK_NORMAL){
				// Calculate the damage boost addition of this attack.
				if(attack.dmgBoostMaxActive > 0){
					if(fight.dmgBoosts[attack.attackID] == undefined){
						fight.dmgBoosts[attack.attackID] = {amount:attack.dmgBoostAmount, expire:[]};
					}
					// Add a new boost.
					fight.dmgBoosts[attack.attackID].expire.push(fight.timePassed+attack.dmgBoostStayTime);
					// Remove boosts that get overwritten.
					while(fight.dmgBoosts[attack.attackID].expire.length > attack.dmgBoostMaxActive){
						fight.dmgBoosts[attack.attackID].expire.shift();
					}
				}
			}
		}

		function collectTriggeredTiles(attack, fight){
			// Make a variable keeping track of all tiles that are triggered on this attack.
			// First tiles are direct tiles from the attack. New tiles will be added after this.
			var newTriggeredTiles = attack.tiles;

			// Add delay tiles for not hitting the enemy on time.
			if(attack.hitCount > 0){
				var gapBetweenAttacks = fight.timePassed-fight.prevNormalAttackTimePassed;
				if(gapBetweenAttacks >= 1){
					if(gapBetweenAttacks >= 6){
						newTriggeredTiles = "0" + newTriggeredTiles; // Start combat
					}
					else if(gapBetweenAttacks >= 4){
						newTriggeredTiles = "9" + newTriggeredTiles; // 4 to 6 seconds delay
					}
					else if(gapBetweenAttacks >= 3){
						newTriggeredTiles = "8" + newTriggeredTiles; // Helix
					}
					else if(gapBetweenAttacks >= 2){
						newTriggeredTiles = "7" + newTriggeredTiles; // I
					}
					else{
						newTriggeredTiles = "6" + newTriggeredTiles; // Z
					}
				}
				fight.prevNormalAttackTimePassed = fight.timePassed;
			}

			// When more then a second passed since the last hits per second tiles has been determined.
			// Triggered by a dummy attack exactly timed on the hits per second moment.
			if(attack.type == ATTACK_HITS_PER_SECOND){
				// If less then 2 seconds passed hit detection is allowed.
				if(fight.hitCount > 1){
					newTriggeredTiles = Math.min(fight.hitCount, MAX_HIT_COUNT) + newTriggeredTiles;
				}
				fight.hitCount = 0;
			}

			// Do hits per second calculations which can only change when a normal attack does damage.
			// This also adds new tiles to the triggered tiles (the hits per second tiles)
			if(attack.hitCount > 0){
				fight.hitCount += attack.hitCount;
			}

			fight.localStoringAllTiles+=newTriggeredTiles;

			return newTriggeredTiles;
		}

		function triggerFightTilesets(newTriggeredTiles, fight){
			// Check for all tilesets adding in the new tiles and see if they proc (and proc the tileset if
			// they do)
			for(var i2=0;i2<fight.usedTilesets.length;i2++){
				var tileset = fight.usedTilesets[i2];

				// Reset the detection of tileset triggering if the whole tileset did not trigger after 6 seconds.
				if(fight.timePassed - tileset.conditionStartTime >= 6){
					tileset.conditionLeft = tileset.condition;
				}

				// Go through new available tiles to see if the
				// tileset procs
				for(var i3=0;i3<newTriggeredTiles.length;i3++){
					var tile = newTriggeredTiles[i3];
					// If the first tile does not match with the current tileset condition then add interference.

					if(!tileset.conditionLeft.startsWith(tile)){
						tileset.interferenceCount++;
					}
					// If the first tile matches remove the first tile from the condition till the condition is empty
					else{

						// On the very first tile proccing, the interference has to be reset to 0 and the start of
						// detecting the tileset has to be remembered (to cancel the tileset trigger on 6+ seconds)
						if(tileset.conditionLeft == tileset.condition){
							tileset.conditionStartTime = fight.timePassed;
							tileset.interferenceCount = 0;
						}

						// Remove first character.
						tileset.conditionLeft = tileset.conditionLeft.replace(tile, '');

						// All tiles were available in tileset so the tileset PROC's!
						if(tileset.conditionLeft.length == 0){
							activateFightTileset(tileset, fight.localProccedInfoLists[i2], fight);
							break;
						}
					}
				}
			}
		}

		function activateFightTileset(tileset, proccedInfoList, fight){
			tileset.number_of_procs += 1;
			tileset.interferenceList.push(Math.min(9, tileset.interferenceCount));
			tileset.conditionLeft = tileset.condition; // Reset back for next trigger.

			tileset.interferenceCount = (tileset.interferenceCount > 9 ? 9 : tileset.interferenceCount);

			// Add the tileset to one of the procced tilesets.
			fight.activeTilesets.push({
				time: fight.timePassed,
				tileset: tileset,
				tilesetBoostAmount: DEFAULT_TILESET_BOOST - 0.01*tileset.interferenceCount
			});

			// Remove the first triggered tileset if a forth tileset is introduced.
			if(fight.activeTilesets.length > MAX_ALLOWED_ACTIVE_TILESETS){
				fight.activeTilesets.shift();
			}

			proccedInfoList.push({
				time: fight.timePassed
			});
		}

		function finishFight(calcData, fight){
			if(minMaxData.lowestTotal === -1 || fight.totalDamage < minMaxData.lowestTotal){
				minMaxData.lowestTotal = fight.totalDamage;
				minHitSpecificData.data = fight.localHitChartData.data;
				minHitSpecificData.pointBackgroundColor = fight.localHitChartData.pointBackgroundColor;
				minHitSpecificData.customLabels = fight.localHitChartData.customLabels;
				minStringStoringAllTiles= fight.localStoringAllTiles;
				minMaxData.lowestRunDataPoints = fight.localTotalDamageDataPoints;
				minMaxData.lowestRunAddedTilesetDmg = fight.localAddedDmgTilesets;
				fight.localProccedInfoLists.forEach(function(proccedInfoList, key){
					calcData.tilesetData.usedTilesets[key].minRunProccedInfoList = proccedInfoList;
				});
			}
			if(minMaxData.highestTotal === -1 || fight.totalDamage > minMaxData.highestTotal){
				minMaxData.highestTotal = fight.totalDamage;
				maxHitSpecificData.data = fight.localHitChartData.data;
				maxHitSpecificData.pointBackgroundColor = fight.localHitChartData.pointBackgroundColor;
				maxHitSpecificData.customLabels = fight.localHitChartData.customLabels;
				maxStringStoringAllTiles = fight.localStoringAllTiles;
				minMaxData.highestRunDataPoints = fight.localTotalDamageDataPoints;
				minMaxData.highestRunAddedTilesetDmg = fight.localAddedDmgTilesets;
				fight.localProccedInfoLists.forEach(function(proccedInfoList, key){
					calcData.tilesetData.usedTilesets[key].maxRunProccedInfoList = proccedInfoList;
				});
			}

			return {
				totalDamage: fight.totalDamage,
				timePassed: fight.timePassed
			};
		}

		function initializeTilesetsData(calcData, usedTilesets){
			calcData.tilesetData.usedTilesets = [];
			calcData.tilesetData.addedDmgTilesets = 0;
			for(let i=0;i<usedTilesets.length;i++){
				if(usedTilesets[i] != undefined){
					calcData.tilesetData.usedTilesets.push({
						"idx":i,
						"condition":usedTilesets[i],
						"addedDmg":0,
						"number_of_procs":0,
						"interferenceList": [],
						"minRunProccedInfoList": [],
						"maxRunProccedInfoList": []
					});
				}
			}
		}

		function initializeBeforeCalculations(calcData){
			totalDamageDataPoints = [];
			minMaxData = {
				lowestTotal: -1,
				lowestRunDataPoints: {},
				lowestRunAddedTilesetDmg: 0,
				highestTotal: -1,
				highestRunDataPoints: {},
				highestRunAddedTilesetDmg: 0
			};
			calcData.addedTotalDamage = 0;
			calcData.addedTimePassed = 0;
			calcData.averageTilesetBoostPercent = 0;
			calcData.tilesetData = {};

			calcData.weaponMultiplier = AttackModule.getWeaponMultiplier(settings.weaponLevel, settings.weaponPlusLevel);
		}

		function doAllCalculations(tilesets, repeatFightCount, stopEarlyBelowPercent, startIndexOfStopEarly){
			let calcData = {};

			input = readInput();
			settings = input.settings;
			loadAttacksOfClass(input.className, calcData);

			initializeBeforeCalculations(calcData);

			// Retrieve the current tilesets.
			initializeTilesetsData(calcData, tilesets);

			for(let i10=0;i10<repeatFightCount;i10++){
				const oneFightData = calculateOneFight(calcData, i10);
				calcData.addedTotalDamage += oneFightData.totalDamage;
				calcData.addedTimePassed += oneFightData.timePassed;
				if(i10 >= startIndexOfStopEarly && stopEarlyBelowPercent != undefined){
					updateTotalTilesetPercent(calcData);
					if(calcData.tilesetData.totalTilesetPercent < stopEarlyBelowPercent){
						return false; // Stop with calculations when tileset group is too weak.
					}
				}
			}

			calcData.dps = calcData.addedTotalDamage/calcData.addedTimePassed;
			updateTilesetData(calcData);

			return calcData;
		}

		function getResults(){
			return {totalDamageDataPoints: totalDamageDataPoints, minMaxData: minMaxData,
				minTriggeredTiles: minStringStoringAllTiles, maxTriggeredTiles: maxStringStoringAllTiles};
		}
		return {doAllCalculations: doAllCalculations, getResults: getResults};
	}

	return {
		create: create,
		constants: {MAX_TIME_SECONDS: MAX_TIME_SECONDS, STEP_SIZE: STEP_SIZE,
			MINIMUM_TILESET_LENGTH: MINIMUM_TILESET_LENGTH, MAX_AVAILABLE_TILESETS: MAX_AVAILABLE_TILESETS,
			START_DRAWING_AFTER_X_SECONDS: START_DRAWING_AFTER_X_SECONDS}
	};
});
