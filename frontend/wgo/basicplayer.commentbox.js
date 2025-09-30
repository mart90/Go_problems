(function(WGo, undefined){

"use strict";

var prepare_dom = function() {
	this.top = document.createElement("div");
	this.top.className = "wgo-right-top";
	this.top.innerHTML = '<img id="feedbackImage" class="wgo-right-feedback" src=""></img>' +
		'<h3 id="currentRating" class="wgo-right-rating"></h3>' +
		'<h3 id="ratingChange" class="wgo-right-ratingChange"></h3>';
	this.element.appendChild(this.top);
	
	this.comments = document.createElement("div");
	this.comments.className = "wgo-comments-content";
	this.element.appendChild(this.comments);
	
	this.notification = document.createElement("div");
	this.notification.className = "wgo-notification";
	this.notification.style.display = "none";
	this.comments.appendChild(this.notification);
	
	this.comment_text = document.createElement("div");
	this.comment_text.className = "wgo-comment-text"; 
	this.comments.appendChild(this.comment_text);
}

var mark = function(move) {
	var x,y;
	
	x = move.charCodeAt(0)-'a'.charCodeAt(0);
	if(x < 0) x += 'a'.charCodeAt(0)-'A'.charCodeAt(0);
	if(x > 7) x--;
	y = (move.charCodeAt(1)-'0'.charCodeAt(0));
	if(move.length > 2) y = y*10+(move.charCodeAt(2)-'0'.charCodeAt(0));
	y = this.kifuReader.game.size-y;

	this._tmp_mark = {type:'MA', x:x, y:y};
	this.board.addObject(this._tmp_mark);
}

var unmark = function() {
	this.board.removeObject(this._tmp_mark);
	delete this._tmp_mark;
}

var search_nodes = function(nodes, player) {
	for(var i in nodes) {
		if(nodes[i].className && nodes[i].className == "wgo-move-link") {
			nodes[i].addEventListener("mouseover", mark.bind(player, nodes[i].innerHTML));
			nodes[i].addEventListener("mouseout", unmark.bind(player));
		}
		else if(nodes[i].childNodes && nodes[i].childNodes.length) search_nodes(nodes[i].childNodes, player);
	}
}	

var format_info = function(info, title) {
	var ret = '<div class="wgo-info-list">';
	if(title) ret += '<div class="wgo-info-title">'+WGo.t("Info")+'</div>';
	for(var key in info) {
		// Skip internal properties used for rating functionality
       	if(key === 'my_rating' || key === "problem_id") continue;

       	// Make problem_id clickable
       	if(key === 'Problem id') {
       		ret += '<div class="wgo-info-item"><span class="wgo-info-label">'+key+'</span><span class="wgo-info-value"><a href="/problems/'+info[key]+'" class="wgo-problem-link">'+info[key]+'</a></span></div>';
       	} else {
       		ret += '<div class="wgo-info-item"><span class="wgo-info-label">'+key+'</span><span class="wgo-info-value">'+info[key]+'</span></div>';
       	}	
	}

	// Add rating section if we have a problem_id AND user is logged in
	var token = localStorage.getItem('token');
	if(info.problem_id && token && token != "undefined") {
		ret += '<div class="wgo-info-item wgo-rating-section">';
		ret += '<span class="wgo-info-label">My rating</span>';
		ret += '<div class="wgo-star-rating">';
		for(var i = 1; i <= 5; i++) {
			// Prefill stars if user has already rated this problem
			var starSymbol = (info.my_rating && i <= info.my_rating) ? '★' : '☆';
			ret += '<span class="wgo-star" data-rating="' + i + '">' + starSymbol + '</span>';
		}
		ret += '</div>';
		ret += '</div>';
	}

	ret += '</div>';
	return ret;
}

/**
 * Implements box for comments and game informations.
 */

var CommentBox = WGo.extendClass(WGo.BasicPlayer.component.Component, function(player) {
	this.super(player);
	this.player = player;
	
	this.element.className = "wgo-commentbox";
	
	prepare_dom.call(this);
	
	player.addEventListener("solutionLoaded", function(e) {
		if(e.kifu.hasComments()) {
			this.element.className = "wgo-commentbox";
			
			this._update = function(e) {
				this.setComments(e);
			}.bind(this);
			
			player.addEventListener("update", this._update);
		}
		else {
			this.element.className = "wgo-commentbox wgo-gameinfo";

			if(this._update) {
				player.removeEventListener("update", this._update);
				delete this._update;
			}

			// Merge game info with problem info from attempt
			var gameInfo = e.target.getGameInfo();
			if(e.kifu.info) {
				// Add problem info from attempt
				gameInfo.problem_id = e.kifu.info.problem_id;
				gameInfo["Total attempts"] = e.kifu.info["Total attempts"];
				gameInfo["Average user rating"] = e.kifu.info["Average user rating"];
				// Keep internal data for rating functionality
				gameInfo.my_rating = e.kifu.info.my_rating;
			}

			this.comment_text.innerHTML = format_info(gameInfo);
			this.setupStarRating(gameInfo);
		}
	}.bind(this));

	player.addEventListener("solutionUnloaded", function(e) {
		this.element.className = "wgo-commentbox wgo-gameinfo";
		
		if(this._update) {
			player.removeEventListener("update", this._update);
			delete this._update;
		}
		this.comment_text.innerHTML = format_info(e.target.getGameInfo());
	}.bind(this));
	
	player.notification = function(text) {
		if(text) {
			this.notification.style.display = "block";
			this.notification.innerHTML = text;
			this.is_notification = true;
		}
		else {
			this.notification.style.display = "none";
			this.is_notification = false;
		}
	}.bind(this);
	
	player.help = function(text) {
		if(text) {
			this.help.style.display = "block";
			this.help.innerHTML = text;
			this.is_help = true;
		}
		else {
			this.help.style.display = "none";
			this.is_help = false;
		}
	}.bind(this);
});

CommentBox.prototype.setComments = function(e) {
	if(this.player._tmp_mark) unmark.call(this.player);

	var msg = "";
	if(!e.node.parent) {
		msg = format_info(e.target.getGameInfo(), true);
	}
	
	this.comment_text.innerHTML = msg+this.getCommentText(e.node.comment, this.player.config.formatNicks, this.player.config.formatMoves);

	if(this.player.config.formatMoves) {
		if(this.comment_text.childNodes && this.comment_text.childNodes.length) search_nodes(this.comment_text.childNodes, this.player);
	}
};

CommentBox.prototype.getCommentText = function(comment, formatNicks, formatMoves) {
	// to avoid XSS we must transform < and > to entities, it is highly recomanded not to change it
	//.replace(/</g,"&lt;").replace(/>/g,"&gt;") : "";
	if(comment) {
		var comm =  "<p>"+WGo.filterHTML(comment).replace(/\n/g, "</p><p>")+"</p>";
		if(formatNicks) comm = comm.replace(/(<p>)([^:]{3,}:)\s/g, '<p><span class="wgo-comments-nick">$2</span> ');
		if(formatMoves) comm = comm.replace(/\b[a-zA-Z]1?\d\b/g, '<a href="javascript:void(0)" class="wgo-move-link">$&</a>');
		return comm;
	}
	return "";
};

CommentBox.prototype.setupStarRating = function(gameInfo) {
	var stars = this.element.querySelectorAll('.wgo-star');
	var player = this.player;
	var token = localStorage.getItem('token');

	// Only show rating if we have a problem_id from an attempt AND user is logged in
	if(!gameInfo.problem_id || stars.length === 0 || !token || token == "undefined") return;

	// Apply initial styling for existing rating
	if(gameInfo.my_rating) {
		stars.forEach(function(star, index) {
			var rating = parseInt(star.getAttribute('data-rating'));
			if(rating <= gameInfo.my_rating) {
				star.style.color = '#FFD700';
			}
		});
	}

	stars.forEach(function(star, index) {
		star.addEventListener('click', function() {
			var rating = parseInt(star.getAttribute('data-rating'));

			// Visual feedback - fill stars up to the clicked one
			stars.forEach(function(s, i) {
				if(i < rating) {
					s.textContent = '★';
					s.style.color = '#FFD700';
				} else {
					s.textContent = '☆';
					s.style.color = '';
				}
			});

			// Call backend to rate the problem
			var token = localStorage.getItem('token');
			if(token) {
				$.ajax({
					type: "POST",
					url: server_address + "backend/rate_problem",
					headers: {
						'Authorization': 'Bearer ' + token,
						'Content-Type': 'application/json'
					},
					data: JSON.stringify({
						problem_id: gameInfo.problem_id,
						rating: rating
					})
				}).done(function(result) {
					// Show confirmation
					player.notification("Thank you for rating this problem!");
					setTimeout(function() {
						player.notification();
					}, 3000);
				}).fail(function(xhr) {
					console.error('Failed to rate problem:', xhr);
					player.notification("Failed to submit rating. Please try again.");
					setTimeout(function() {
						player.notification();
					}, 3000);
				});
			}
		});

		// Hover effects
		star.addEventListener('mouseover', function() {
			var hoverRating = parseInt(star.getAttribute('data-rating'));
			stars.forEach(function(s, i) {
				if(i < hoverRating) {
					s.style.color = '#FFD700';
				} else {
					s.style.color = '';
				}
			});
		});

		star.addEventListener('mouseout', function() {
			// Reset to default state
			stars.forEach(function(s) {
				s.style.color = '';
			});
		});
	});
};

/**
 * Adding 2 configuration to BasicPlayer:
 *
 * - formatNicks: tries to highlight nicknames in comments (default: true)
 * - formatMoves: tries to highlight coordinates in comments (default: true)
 */
 
WGo.BasicPlayer.default.formatNicks = true;
WGo.BasicPlayer.default.formatMoves = true;

WGo.BasicPlayer.attributes["data-wgo-formatnicks"] = function(value) {
	if(value.toLowerCase() == "false") this.formatNicks = false;
}
	
WGo.BasicPlayer.attributes["data-wgo-formatmoves"] = function(value) {
	if(value.toLowerCase() == "false") this.formatMoves = false;
}

WGo.BasicPlayer.layouts["right_top"].right.push("CommentBox");
WGo.BasicPlayer.layouts["right"].right.push("CommentBox");
WGo.BasicPlayer.layouts["one_column"].bottom.push("CommentBox");

WGo.BasicPlayer.component.CommentBox = CommentBox

})(WGo);
