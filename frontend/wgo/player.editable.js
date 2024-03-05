(function(WGo) {

// board mousemove callback for edit move - adds highlighting
var edit_board_mouse_move = function(x,y) {
	if(this.player.frozen || this.player.ignore_attempts || (this._lastX == x && this._lastY == y)) return;
	
	this._lastX = x;
	this._lastY = y;
	
	if(this._last_mark) {
		this.board.removeObject(this._last_mark);
	}
	
	if(x != -1 && y != -1 && this.player.kifuReader.game.isValid(x,y)) {
		this._last_mark = {
			type: "outline",
			x: x,
			y: y, 
			c: this.player.kifuReader.game.turn
		};
		this.board.addObject(this._last_mark);
	}
	else {
		delete this._last_mark;
	}
}

// board mouseout callback for edit move	
var edit_board_mouse_out = function() {
	if(this._last_mark) {
		this.board.removeObject(this._last_mark);
		delete this._last_mark;
		delete this._lastX;
		delete this._lastY;
	}
}

// get differences of two positions as a change object (TODO create a better solution, without need of this function)
var pos_diff = function(old_p, new_p) {
	var size = old_p.size, add = [], remove = [];
	
	for(var i = 0; i < size*size; i++) {
		if(old_p.schema[i] && !new_p.schema[i]) remove.push({x:Math.floor(i/size),y:i%size});
		else if(old_p.schema[i] != new_p.schema[i]) add.push({x:Math.floor(i/size),y:i%size,c:new_p.schema[i]});
	}
	
	return {
		add: add,
		remove: remove
	}
}

var make_attempt = function (player, x, y) {
	var move = player.XyToStringMove(x, y);
	var solved = false;

	var makeAttemptCall = $.ajax({ 
		type: "POST",
		contentType: "application/json",
		url: server_address + "backend/make_attempt",
		beforeSend: function (xhr) {
			xhr.setRequestHeader('Authorization', 'Bearer ' + localStorage.getItem('token'));
		},
		data: JSON.stringify({
			problemId: player.problem.id,
			move: move
		})
	});

	makeAttemptCall.done(function (result) {
		player.loadRandomProblem();
		
		var maxWinrate = Math.max(...result.solutions.map(e => e.winrate))
		var bestSolution = result.solutions.find(e => e.winrate == maxWinrate)
		player.board.solutions = [];

		for (solution of result.solutions){
			var solutionMove = player.StringMoveToXy(solution.move);

			if (solution.winrate == maxWinrate){
				solutionMove.type = "aiMove";
				player.board.addObject(solutionMove);
				player.board.solutions.push({
					x: solutionMove.x,
					y: solutionMove.y,
					winrate: solution.winrate,
					score_lead: solution.score_lead
				});
			}
			else if (solution.winrate == 0 && bestSolution.move != solution.move) {
				solutionMove.type = "proMove";
				player.board.addObject(solutionMove);
				player.board.solutions.push({
					x: solutionMove.x,
					y: solutionMove.y,
					winrate: 0,
					score_lead: 0
				});
			}			
			// There are currently no problems with multiple solutions. Keeping this here for a potential future where they are added

			// else if (solution.winrate > 0 && solution.winrate != maxWinrate) {
			// 	solutionMove.type = "additionalSolution";
			// 	player.board.addObject(solutionMove);
			// 	player.board.solutions.push({
			// 		x: solutionMove.x,
			// 		y: solutionMove.y,
			// 		winrate: solution.winrate,
			// 		score_lead: solution.score_lead
			// 	})
			// }

			if (solution.move == move){
				solved = true;
				player.kifuReader.node.appendChild(new WGo.KNode({
					move: {
						x: x, 
						y: y, 
						c: player.kifuReader.game.turn
					}, 
					_edited: true
				}));
				player.next(player.kifuReader.node.children.length-1);
			}
		}

		if (!solved){
			player.board.addObject({
				type: "wrongAnswer",
				x: x,
				y: y
			})
		}

		document.getElementById("currentRating").innerHTML = Math.round(result.new_rating);

		var plus = result.rating_change > 0 ? "+" : "";

		document.getElementById("ratingChange").innerHTML = "(" + plus + Math.round(result.rating_change * 10) / 10 + ")";

		var imgFilename = result.success ? "correct.png" : "wrong.png";
		document.getElementById("feedbackImage").src = WGo.DIR + "textures/" + imgFilename;

		plus = result.problem_rating_change > 0 ? "+" : "";

		player.kifu.info = {
			problem_id: result.problem_id,
			problem_rating: Math.round(result.problem_rating) + " (" + plus + (Math.round(result.problem_rating_change * 10) / 10) + ")",
			problem_from_game: result.game_title,
			problem_game_date: new Date(result.game_date).toDateString()
		};

		player.dispatchEvent({
			type: "solutionLoaded",
			target: player,
			kifu: player.kifu,
		});

		player.board.redraw();
	});
}

var make_attempt_unranked = function (player, x, y) {
	var move = player.XyToStringMove(x, y);
	var solved = false;
	
	player.loadRandomProblem();
		
	var maxWinrate = Math.max(...player.problem.solutions.map(e => e.winrate))
	var bestSolution = player.problem.solutions.find(e => e.winrate == maxWinrate)
	player.board.solutions = [];

	for (solution of player.problem.solutions){
		var solutionMove = player.StringMoveToXy(solution.move);

		if (solution.winrate == maxWinrate){
			solutionMove.type = "aiMove";
			player.board.addObject(solutionMove);
			player.board.solutions.push({
				x: solutionMove.x,
				y: solutionMove.y,
				winrate: solution.winrate,
				score_lead: solution.score_lead
			});
		}
		else if (solution.winrate == 0 && bestSolution.move != solution.move) {
			solutionMove.type = "proMove";
			player.board.addObject(solutionMove);
			player.board.solutions.push({
				x: solutionMove.x,
				y: solutionMove.y,
				winrate: 0,
				score_lead: 0
			});
		}			
		// There are currently no problems with multiple solutions. Keeping this here for a potential future where they are added

		// else if (solution.winrate > 0 && solution.winrate != maxWinrate) {
		// 	solutionMove.type = "additionalSolution";
		// 	player.board.addObject(solutionMove);
		// 	player.board.solutions.push({
		// 		x: solutionMove.x,
		// 		y: solutionMove.y,
		// 		winrate: solution.winrate,
		// 		score_lead: solution.score_lead
		// 	})
		// }

		if (solution.move == move){
			solved = true;
			player.kifuReader.node.appendChild(new WGo.KNode({
				move: {
					x: x, 
					y: y, 
					c: player.kifuReader.game.turn
				}, 
				_edited: true
			}));
			player.next(player.kifuReader.node.children.length-1);
		}
	}

	if (!solved){
		player.board.addObject({
			type: "wrongAnswer",
			x: x,
			y: y
		})
	}

	var imgFilename = solved ? "correct.png" : "wrong.png";
	document.getElementById("feedbackImage").src = WGo.DIR + "textures/" + imgFilename;

	player.dispatchEvent({
		type: "solutionLoaded",
		target: player,
		kifu: player.kifu,
	});

	player.board.redraw();
}

WGo.Player.Editable = {};

/**
 * Toggle edit mode.
 */
	
WGo.Player.Editable = function(player, board) {
	this.player = player;
	this.board = board;
	this.editMode = true;
}

WGo.Player.Editable.prototype.set = function(problem, token) {
	// save original kifu reader
	this.originalReader = this.player.kifuReader;
	
	// create new reader with cloned kifu
	this.player.kifuReader = new WGo.KifuReader(this.player.kifu.clone(), this.originalReader.rememberPath, this.originalReader.allow_illegal, this.originalReader.allow_illegal);
	
	// go to current position
	this.player.kifuReader.goTo(this.originalReader.path);
	
	// register edit listeners
	this._ev_click = this._ev_click || this.play.bind(this);
	this._ev_move = this._ev_move || edit_board_mouse_move.bind(this);
	this._ev_out = this._ev_out || edit_board_mouse_out.bind(this);
	
	this.board.addEventListener("click", this._ev_click);
	this.board.addEventListener("mousemove", this._ev_move);
	this.board.addEventListener("mouseout", this._ev_out);
	
	this.editMode = true;
}

WGo.Player.Editable.prototype.play = function(x,y) {
	var player = this.player;

	if (player.frozen || player.ignore_attempts || !player.kifuReader.game.isValid(x, y)) {
		return;
	}

	player.ignore_attempts = true;

	if (player.unranked) {
		make_attempt_unranked(player, x, y);
	}
	else {
		make_attempt(player, x, y);
	}
}

WGo.i18n.en["editmode"] = "Edit mode";

})(WGo);
