(function(WGo, undefined){

"use strict";

var prepare_dom = function() {
	this.top = document.createElement("div");
	this.top.className = "wgo-right-top";
	this.top.innerHTML = '<img id="feedbackImage" class="wgo-right-feedback" src=""></img>' +
		'<h3 id="currentRating" class="wgo-right-rating"></h3>' +
		'<h3 id="ratingChange" class="wgo-right-ratingChange"></h3>';
	this.element.appendChild(this.top);

	// Create tabs container
	this.tabs = document.createElement("div");
	this.tabs.className = "wgo-tabs";
	this.element.appendChild(this.tabs);

	this.infoTab = document.createElement("div");
	this.infoTab.className = "wgo-tab wgo-tab-active";
	this.infoTab.textContent = "Info";
	this.tabs.appendChild(this.infoTab);

	this.commentsTab = document.createElement("div");
	this.commentsTab.className = "wgo-tab";
	this.commentsTab.innerHTML = "Comments";
	this.tabs.appendChild(this.commentsTab);

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

	// Create comments section (hidden by default)
	this.commentsSection = document.createElement("div");
	this.commentsSection.className = "wgo-comments-section";
	this.commentsSection.style.display = "none";
	this.element.appendChild(this.commentsSection);

	this.commentsListContainer = document.createElement("div");
	this.commentsListContainer.className = "wgo-comments-list";
	this.commentsSection.appendChild(this.commentsListContainer);

	// Tab click handlers
	this.infoTab.onclick = function() {
		this.infoTab.className = "wgo-tab wgo-tab-active";
		this.commentsTab.className = "wgo-tab";
		this.comments.style.display = "block";
		this.commentsSection.style.display = "none";
	}.bind(this);

	this.commentsTab.onclick = function() {
		this.commentsTab.className = "wgo-tab wgo-tab-active";
		this.infoTab.className = "wgo-tab";
		this.comments.style.display = "none";
		this.commentsSection.style.display = "block";
	}.bind(this);
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
       	if(key === 'my_rating' || key === "problem_id" || key === "comments" || key === "rating_history") continue;

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

	// Add rating history chart at the bottom if available
	if(info.rating_history && info.rating_history.length > 0 && token && token != "undefined") {
		ret += '<div class="wgo-rating-history-section">';
		ret += '<div class="wgo-rating-history-chart-container">';
		ret += '<canvas id="wgo-rating-history-chart"></canvas>';
		ret += '</div>';
		ret += '</div>';
	}

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
				gameInfo.comments = e.kifu.info.comments || [];
			}

			this.comment_text.innerHTML = format_info(gameInfo);
			this.setupStarRating(gameInfo);
			this.renderRatingHistoryChart(gameInfo.rating_history);
			this.displayComments(gameInfo.comments || [], gameInfo.problem_id);
			this.updateCommentsTabTitle(gameInfo.comments ? gameInfo.comments.length : 0);
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

CommentBox.prototype.updateCommentsTabTitle = function(count) {
	if(count > 0) {
		this.commentsTab.innerHTML = 'Comments (' + count + ')';
	} else {
		this.commentsTab.innerHTML = 'Comments';
	}
};

CommentBox.prototype.displayComments = function(comments, problemId) {
	var token = localStorage.getItem('token');
	var self = this;
	var player = this.player;

	// Clear existing content
	this.commentsListContainer.innerHTML = '';

	// Display existing comments
	if(comments && comments.length > 0) {
		// Sort comments by datetime descending (newest first)
		var sortedComments = comments.slice().sort(function(a, b) {
			return new Date(b.time) - new Date(a.time);
		});

		sortedComments.forEach(function(comment) {
			var commentDiv = document.createElement('div');
			commentDiv.className = 'wgo-comment-item';

			var commentHeader = document.createElement('div');
			commentHeader.className = 'wgo-comment-header';
			var date = new Date(comment.time);
			var rating = comment.user_rating ? ' (' + Math.round(comment.user_rating) + ')' : '';
			commentHeader.innerHTML = '<strong>' + WGo.filterHTML(comment.username) + rating + '</strong> - ' +
				date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
			commentDiv.appendChild(commentHeader);

			var commentBody = document.createElement('div');
			commentBody.className = 'wgo-comment-body';
			commentBody.textContent = comment.comment;
			commentDiv.appendChild(commentBody);

			self.commentsListContainer.appendChild(commentDiv);
		});
	} else {
		var noComments = document.createElement('div');
		noComments.className = 'wgo-no-comments';
		noComments.textContent = 'No comments yet. Be the first to comment!';
		this.commentsListContainer.appendChild(noComments);
	}

	// Add comment form if user is logged in
	if(token && token !== "undefined" && problemId) {
		var commentForm = document.createElement('div');
		commentForm.className = 'wgo-comment-form';

		var textarea = document.createElement('textarea');
		textarea.className = 'wgo-comment-textarea';
		textarea.placeholder = 'Add a comment...';
		textarea.rows = 3;

		// Prevent focus issues on mobile
		textarea.addEventListener('touchstart', function(e) {
			e.stopPropagation();
		});
		textarea.addEventListener('focus', function(e) {
			e.stopPropagation();
		});

		commentForm.appendChild(textarea);

		var submitButton = document.createElement('button');
		submitButton.className = 'wgo-comment-submit';
		submitButton.textContent = 'Post Comment';
		commentForm.appendChild(submitButton);

		submitButton.onclick = function() {
			var commentText = textarea.value.trim();
			if(!commentText) {
				player.notification("Comment cannot be empty");
				setTimeout(function() {
					player.notification();
				}, 2000);
				return;
			}

			$.ajax({
				type: "POST",
				url: server_address + "backend/add_comment",
				headers: {
					'Authorization': 'Bearer ' + token,
					'Content-Type': 'application/json'
				},
				data: JSON.stringify({
					problem_id: problemId,
					comment: commentText
				})
			}).done(function() {
				player.notification("Comment posted successfully!");
				setTimeout(function() {
					player.notification();
				}, 2000);

				// Add the new comment to the display
				var newComment = {
					time: new Date().toISOString(),
					username: localStorage.getItem('username') || 'You',
					comment: commentText
				};

				// Re-render comments with the new one
				var updatedComments = comments.concat([newComment]);
				self.displayComments(updatedComments, problemId);
				self.updateCommentsTabTitle(updatedComments.length);

				// Clear textarea
				textarea.value = '';
			}).fail(function(xhr) {
				console.error('Failed to post comment:', xhr);
				player.notification("Failed to post comment. Please try again.");
				setTimeout(function() {
					player.notification();
				}, 3000);
			});
		};

		this.commentsListContainer.appendChild(commentForm);
	}
};

CommentBox.prototype.renderRatingHistoryChart = function(ratingHistory) {
	if(!ratingHistory || ratingHistory.length === 0) return;

	// Wait longer to ensure canvas is in DOM and Chart.js is loaded
	setTimeout(function() {
		var canvas = document.getElementById('wgo-rating-history-chart');
		if(!canvas) return;

		// Check if Chart is available
		if(typeof Chart === 'undefined') {
			console.error('Chart.js is not loaded');
			return;
		}

		var ctx = canvas.getContext('2d');

		// Destroy existing chart if it exists
		if(this.ratingChart) {
			this.ratingChart.destroy();
		}

		// Create labels (attempt numbers)
		var labels = ratingHistory.map(function(_, index) {
			return index + 1;
		});

		this.ratingChart = new Chart(ctx, {
			type: 'line',
			data: {
				labels: labels,
				datasets: [{
					label: 'Problem Rating',
					data: ratingHistory,
					borderColor: 'rgba(91, 168, 247, 1)',
					backgroundColor: 'rgba(91, 168, 247, 0.1)',
					borderWidth: 2,
					pointRadius: 3,
					pointHoverRadius: 5,
					tension: 0.1,
					fill: true
				}]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: {
						display: false
					},
					tooltip: {
						callbacks: {
							title: function(context) {
								return 'Attempt #' + context[0].label;
							},
							label: function(context) {
								return 'Rating: ' + Math.round(context.parsed.y);
							}
						}
					}
				},
				scales: {
					y: {
						beginAtZero: false,
						ticks: {
							color: 'rgba(255,255,255,0.7)',
							callback: function(value) {
								return Math.round(value);
							}
						},
						grid: {
							color: 'rgba(255,255,255,0.1)'
						},
						title: {
							display: true,
							text: 'Rating History',
							color: 'rgba(255,255,255,0.7)'
						}
					},
					x: {
						ticks: {
							color: 'rgba(255,255,255,0.7)',
							maxTicksLimit: 10
						},
						grid: {
							color: 'rgba(255,255,255,0.1)'
						},
						title: {
							display: true,
							text: 'Attempt number (rated)',
							color: 'rgba(255,255,255,0.7)'
						}
					}
				}
			}
		});
	}.bind(this), 0);
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
