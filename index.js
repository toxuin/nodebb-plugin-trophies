"use strict";
var	user = module.parent.require('./user'),
	utils = module.parent.require('../public/src/utils'),
	templates = module.parent.require('./meta/templates.js'),
	SocketAdmin = module.parent.require('./socket.io/admin').plugins,
	db = module.parent.require('./database'),
	notifications = module.parent.require('./notifications'),
	async = require('async'),
	path = require('path'),
	fs = require('fs'),
	app;

var Trophies = {};


// HOOKS

Trophies.onLoad = function(application, callback) {
	application.router.get('/admin/plugins/trophies', application.middleware.admin.buildHeader, renderAdmin);
	application.router.get('/api/admin/plugins/trophies', renderAdmin);
	application.router.get('/api/plugins/trophies/:userslug', renderJSON);

	SocketAdmin.Trophies = {
		createTrophy: Trophies.createTrophy,
		deleteTrophy: Trophies.deleteTrophy,
		awardTrophy: Trophies.awardTrophy,
		getAllTrophies: Trophies.getAllTrophies
	};

	app = application.app; // HELLO, MOM
	callback();
};

Trophies.addAdminNavigation = function(nav, callback) {
	nav.plugins.push({
		"route": "/plugins/trophies",
		"icon": "fa fa-certificate",
		"name": "Trophies"
	});

	callback(null, nav);
};

Trophies.defineWidgets = function(widgets, callback) {
		widgets = widgets.concat([
            {
                widget: "trophies",
                name: "Trophies",
                description: "List of your trophies",
                content: 'admin/widgets/trophies.tpl'
            }
		]);

		callback(null, widgets);
};

Trophies.renderTrophiesWidget = function(widget, callback) {
        if (!widget || !widget.area || !widget.area.url || !widget.area.url.startsWith("user/")) return callback();
		var userslug = widget.area.url.replace("user/", "");
		getTrophiesForUserslug(userslug, function(err, trophies) {
			if (!err) app.render('widgets/trophies', {trophies: trophies}, callback);
			else console.log(err);
		});
};





// DO STUFF HERE

Trophies.createTrophy = function(socket, data, callback) {
	if (!data || !data.hasOwnProperty("name") || data.name == "" || !data.hasOwnProperty("image") || !data.hasOwnProperty("description") || !data.image.hasOwnProperty("description") || data.image.description == "") {
		return callback(new Error("empty-data"));
	}

	db.incrObjectField('global', 'nextTrophyId', function(err, troId) {
		if (err) return callback(err);

		var trophy = {
			trophyId: troId,
			name: data.name,
			description: data.description,
			image: data.image.description
		};

		async.parallel({
			troId: function(next) {
				db.setObject("trophy-plugin:trophy:" + troId, trophy, next(err, troId));
			},
			whatever : function(next) {
				db.setAdd("trophy-plugin:trophies", troId, next(err, troId));
			},
			logging: function(next) {
				logTrophyEvent(socket.uid, "created", troId, -1, next);
			}
		}, callback);

	});

}

Trophies.deleteTrophy = function(socket, data, callback) {
	async.parallel([
		function(next) {
			deleteTrophyFromAllUsers(data, next);
		},
		function(next) {
			db.setRemove("trophy-plugin:trophies", data, next);
		},
		function(next) {
			db.delete("trophy-plugin:trophy:" + data, next);
		},
		function(next) {
			logTrophyEvent(socket.uid, "deleted", data, -1, next);
		}
	], callback);
}

Trophies.awardTrophy = function(socket, data, callback) {
	// SAMPLE DATA: { trophy: 14, user: 'toxuin', steal: true }
	user.getUidByUserslug(data.user, function(err, uid) {
		if (err) return callback(err);
		if (!uid) return callback(new Error("No such user!"));
		if (!data.trophy) return callback(new Error("Trophy not found!"));

		async.parallel([
			function(next) {
				db.setAdd("trophy-plugin:users", uid, next);
			},
			function(next) {
				if (data.steal) {
					deleteTrophyFromAllUsers(data.trophy, function() {
						db.setAdd("trophy-plugin:user:" + uid, data.trophy, next);
					});
				} else {
					db.setAdd("trophy-plugin:user:" + uid, data.trophy, next);
				}
			},
			function(next) {
				logTrophyEvent(socket.uid, "awarded" + (data.steal?" (stealing)":""), data.trophy, uid, next);
			},
			function(next) {
				notifications.create({
					bodyShort: 'You just got a trophy!',
					bodyLong: "Congratulations! You just got a new trophy!",
					nid: 'trophy_' + uid + '_' + data.trophy,
					from: 1,
					path: '/user/' + data.user,
				}, function(err, notification) {
					if (!err && notification) {
						notifications.push(notification, uid, next);
					}
				});
			}
		], callback);
	});
}

Trophies.getAllTrophies = function(socket, data, callback) {
	getAllTrophies(callback);
}


// PRIVATE METHODS??

function renderAdmin(req, res, next) {
	async.parallel({
		pictures: function(callback) { // GET ALL PICTURES
			var icons = [];
			var pathToTrophiesImages = path.join(__dirname, 'static/trophies');
			utils.walk(pathToTrophiesImages, function(err, rawIcons) {
				rawIcons.forEach(function(icon, i) {
					icons.push({
						name: icon.replace(pathToTrophiesImages+"/", '')
					});
				});
				callback(null, icons);
			});
		},
		trophies: function(callback) { // GET ALL TROPHIES FROM DB
			getAllTrophies(callback);
		},
		logs: function(callback) {
			parseAllLogs(callback);
		}
	}, function(err, result) {
		res.render('admin/plugins/trophies', result);
	});
}

function renderJSON(request, response, callback) {
	if (!request.params || !request.params.userslug) response.json({error: "No userslug specified"});
	var userslug = request.params.userslug;

	getTrophiesForUserslug(userslug, function(err, trophies) {
		if (err) response.json({error: err});
		else response.json(trophies);
	});
}

function getTrophiesForUserslug(userslug, callback) {
	user.getUidByUserslug(userslug, function(err, uid) {
		if (err) return callback(err);
		if (!uid) return callback(new Error("User not found"));

		db.isSetMember("trophy-plugin:users", uid, function(err, result) {
			if (err) return callback(err);
			if (!result) return callback(null, []);
			db.getSetMembers("trophy-plugin:user:" + uid, function(err, result) {
				if (err) return callback(err);
				var trophies = [];

				async.each(result, function(item, next) {
					db.getObject("trophy-plugin:trophy:" + item, function(err, trop) {
						trophies.push(trop);
						next();
					});
				}, function(err) {
					if (err) return callback(err);
					callback(null, trophies);
				});

			});
		});
	});
}

function getAllTrophies(callback) {
	db.getSetMembers('trophy-plugin:trophies', function(err, trophyIds) {
		var trophies = [];
		async.each(trophyIds, function(trophyId, next) {
			db.getObject("trophy-plugin:trophy:" + trophyId, function(err, trophy) {
				trophies.push(trophy);
				next();
			});
		}, function(err) {
			callback(err, trophies);
		});
	});
}

function deleteTrophyFromAllUsers(trophyId, callback) {
	db.getSetMembers("trophy-plugin:users", function(err, users) {
		async.each(users, function(user, nextEach) {
			db.setRemove("trophy-plugin:user:" + user, trophyId, function() {
				db.setCount("trophy-plugin:user:" + user, function (err, result) {
					if (result == 0) {
						db.setRemove("trophy-plugin:users", user, nextEach);
					} else nextEach();
				});
			});
		}, callback);
	});
}

function logTrophyEvent(fromUserId, action, trophyId, toUserId, callback) {
	var trophyEvent = {
		fromUserId: fromUserId,
		action: action,
		trophyId: trophyId,
		toUserId: toUserId
	};

	db.incrObjectField('global', 'nextTrophyLogId', function(err, logId) {
		if (err) return callback(err);
		async.parallel([
			function(next) {
				db.sortedSetAdd("trophy-plugin:logs", Date.now(), logId, next);
			},
			function(next) {
				db.setObject("trophy-plugin:log:" + logId, trophyEvent, next);
			}
		], callback);
	});
}

function parseAllLogs(callback) {
	db.getSortedSetsMembers(['trophy-plugin:logs'], function(err, logIds) {
		if (err) {
			console.log(err);
			return callback(err);
		}
		var logs = [];
		logIds[0].reverse(); // DATE ASC DESC
		async.eachSeries(logIds[0], function(logId, nextEach) {
			db.getObject("trophy-plugin:log:" + logId, function(err, logObject) {
				if (err) {
					console.log(err);
					return callback(err);
				}

				var logString = "";

				async.series([
					function(nextSeries) {
						user.getUserField(logObject.fromUserId, 'userslug', function(err, slug) {
							if (err) slug = "id " + logObject.fromUserId;
							logString += "User <a target=\"_blank\" href=\"/user/" + slug + "/\">" + slug + "</a> " + logObject.action + " trophy ";
							nextSeries();
						});
					},
					function(nextSeries) {
						db.isSetMember("trophy-plugin:trophies", logObject.trophyId, function(err, exists) {
							if (err) exists = false;
							if (exists) {
								db.getObjectField("trophy-plugin:trophy:" + logObject.trophyId, "name", function(err, trophyName) {
									if (err) trophyName = "Unknown Trophy";
									logString += "\"<b>" + trophyName + "</b>\" (ID " + logObject.trophyId + ")";
								});
							} else {
								logString += "ID " + logObject.trophyId;
							}
							nextSeries();
						});
					},
					function(nextSeries) {
						if (logObject.toUserId <= 0) return nextSeries();
						user.getUserField(logObject.toUserId, 'userslug', function(err, slug) {
							if (err) slug = "id " + logObject.toUserId;
							logString += " to User <a target=\"_blank\" href=\"/user/" + slug + "/\">" + slug + "</a>";
							nextSeries();
						});
					},
					function(nextSeries) {
						db.sortedSetScore("trophy-plugin:logs", logId, function(err, timestamp) {
							if (err) timestamp = "???";
							logString += " at " + utils.toISOString(timestamp);
							nextSeries();
						});
					}
				], function(err, result) {
					logs.push({text: logString});
					nextEach();
				});

			});
		}, function(err) {
			callback(err, logs);
		});
	});
}

module.exports = Trophies;
