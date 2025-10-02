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
			gameId: player.problem.game_id,
			moveNumber: player.problem.move_number,
			move: move
		})
	});

	makeAttemptCall.done(function (result) {
		player.loadNewProblem();
		
		player.addSolutions(result.solutions);

		var nextMove = player.kifuReader.node.children[0].move;

		if (result.success) {
			if (nextMove.x != x || nextMove.y != y) {
				player.kifuReader.node.appendChild(new WGo.KNode({
					move: {
						x: x, 
						y: y, 
						c: player.kifuReader.game.turn
					}, 
					_edited: true
				}));
			}
			player.next(player.kifuReader.node.children.length-1);
		}
		else {
			player.board.addObject({
				type: "wrongAnswer",
				x: x,
				y: y
			});
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
			problem_game_date: new Date(result.game_date).toDateString(),
			"Total attempts": result.total_attempts || 0,
			"Average user rating": player.formatStarRating(result.user_rating),
			my_rating: result.my_rating || null,
			comments: result.comments || []
		};

		player.dispatchEvent({
			type: "solutionLoaded",
			target: player,
			kifu: player.kifu,
		});

		player.board.redraw();

		player.enableNextButtons();
	});
}

var make_attempt_anonymous = function (player, x, y) {	
	var move = player.XyToStringMove(x, y);
	var solved = false;
	
	player.loadNewProblemAnonymous();

	$.ajax({ 
		type: "POST",
		contentType: "application/json",
		url: server_address + "backend/make_attempt_anonymous",
		data: JSON.stringify({
			gameId: player.problem.game_id,
			moveNumber: player.problem.move_number,
			move: move
		})
	});
		
	player.addSolutions();

	for (var solution of player.problem.solutions){
		if (solution.move == move){
			solved = true;
		}
	}

	var nextMove = player.kifuReader.node.children[0].move;

	if (solved) {
		if (nextMove.x != x || nextMove.y != y) {
			player.kifuReader.node.appendChild(new WGo.KNode({
				move: {
					x: x, 
					y: y, 
					c: player.kifuReader.game.turn
				}, 
				_edited: true
			}));
		}
		player.next(player.kifuReader.node.children.length-1);
	}
	else {
		player.board.addObject({
			type: "wrongAnswer",
			x: x,
			y: y
		})
	}

	var imgFilename = solved ? "correct.png" : "wrong.png";
	document.getElementById("feedbackImage").src = WGo.DIR + "textures/" + imgFilename;

	var win_int = solved ? 1 : 0;
	var rating_change = parseFloat(player.anon_kfactor) * (win_int - (1 / (1 + Math.pow(10, (parseFloat(player.problem.rating) - parseFloat(player.anon_rating)) / 400.0))));

	player.anon_rating = parseFloat(player.anon_rating) + rating_change;

	document.getElementById("currentRating").innerHTML = Math.round(player.anon_rating);

	var plus = rating_change > 0 ? "+" : "";

	document.getElementById("ratingChange").innerHTML = "(" + plus + Math.round(rating_change * 10) / 10 + ")";

	if (player.anon_kfactor > 25) {
		player.anon_kfactor -= 2;
	}

	localStorage.setItem("anon_rating", player.anon_rating)
	localStorage.setItem("anon_kfactor", player.anon_kfactor)

	player.dispatchEvent({
		type: "solutionLoaded",
		target: player,
		kifu: player.kifu,
	});

	player.board.redraw();
	
	player.enableNextButtons();
}

var make_attempt_unranked = function (player, x, y) {
	var move = player.XyToStringMove(x, y);
	var solved = false;
	
	player.loadNewProblem();
	
	player.addSolutions();

	for (solution of player.problem.solutions){
		if (solution.move == move){
			solved = true;
		}
	}

	var nextMove = player.kifuReader.node.children[0].move;
	
	if (solved) {
		if (nextMove.x != x || nextMove.y != y) {
			player.kifuReader.node.appendChild(new WGo.KNode({
				move: {
					x: x, 
					y: y, 
					c: player.kifuReader.game.turn
				}, 
				_edited: true
			}));
		}
		player.next(player.kifuReader.node.children.length-1);
	}
	else {
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
	
	player.enableNextButtons();
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

	var valid = player.kifuReader.game.isValid(x, y);

	if (player.frozen || player.ignore_attempts || !valid) {
		return;
	}

	player.ignore_attempts = true;

	if (player.unranked) {
		make_attempt_unranked(player, x, y);
	}
	else if (player.anonymous) {
		make_attempt_anonymous(player, x, y);
	}
	else {
		make_attempt(player, x, y);
	}
}

WGo.i18n.en["editmode"] = "Edit mode";

})(WGo);
