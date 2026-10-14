define([], function(){
	// Attack-pattern parsing and cloning shared with the class modules.

	function getAttackPatterns(attackPatternStr, classData){
		var attackPatternsData = [];
		attackPatternStr = attackPatternStr.replace(/ /g,''); // Remove spaces
		var attackPatternsStr = attackPatternStr.split("\n");
		for (var i2 = 0; i2 < attackPatternsStr.length; i2++) {
			var attackPattern = [];
			var prevAttack=undefined;
			var prevChar=undefined;
			var lastBracketOpenIdx=-1;
			var attackPattStr = attackPatternsStr[i2];
			for (var i = 0; i < attackPattStr.length; i++) {
				var chr = attackPattStr.charAt(i);
				var newAttack = classData.attackTypes[chr];
				if(newAttack != undefined){
					newAttack = clone(newAttack);
					if(newAttack.prePreModifierFunc != undefined){
						newAttack.prePreModifierFunc(newAttack);
					}
					attackPattern.push(newAttack);
				}
				if(chr == '('){
					lastBracketOpenIdx = i;
				}
				// When the 'x' is used it will repeat the last 'attack' that many times.
				// here is extracted how many times this is. A '()' bracket will repeat
				// everything between the brackets.
				if(chr == 'x' || chr == '*'){
					var amount = 0;
					var startNumIdx = i+1;
					while(i+1 < attackPattStr.length && '0123456789'.indexOf(attackPattStr.charAt(i+1)) !== -1){
						i++;
						amount*=10;
						amount += parseInt(attackPattStr.charAt(i));
					}
					amount-=1;


					if(prevChar == ')'){
						attackPattStr = attackPattStr.substr(0, startNumIdx) + (""+amount) + attackPattStr.substr(i + 1);
						if(amount > 0){
							i = lastBracketOpenIdx;
						}
					} else if(prevAttack != undefined){
						for(var repeat=0;repeat<amount;repeat++){
							attackPattern.push(prevAttack);
						}
					}
				}
				prevAttack = newAttack;
				prevChar = chr;
			}
			attackPatternsData["100_"+i2] = {pattern:attackPattern, patternIdx:0, patternTimePassed:0};
		}
		return attackPatternsData;
	}

	function clone(obj) {
		var copy;

		// Handle the 3 simple types, and null or undefined
		if (null == obj || "object" != typeof obj) return obj;

		// Handle Date
		if (obj instanceof Date) {
			copy = new Date();
			copy.setTime(obj.getTime());
			return copy;
		}

		// Handle Array
		if (obj instanceof Array) {
			copy = [];
			for (var i = 0, len = obj.length; i < len; i++) {
				copy[i] = clone(obj[i]);
			}
			return copy;
		}

		// Handle Object
		if (obj instanceof Object) {
			copy = {};
			for (var attr in obj) {
				if (obj.hasOwnProperty(attr)) copy[attr] = clone(obj[attr]);
			}
			return copy;
		}

		throw new Error("Unable to copy obj! Its type isn't supported.");
	}

	return {getAttackPatterns: getAttackPatterns, clone: clone};
});
