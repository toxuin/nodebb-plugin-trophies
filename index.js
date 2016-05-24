"use strict";
var	user = module.parent.require('./user'),
	utils = module.parent.require('../public/src/utils'),
	templates = module.parent.require('./meta/templates.js'),
	SocketPlugins = module.parent.require('./socket.io/plugins'),
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
	application.router.get('/api/plugins/trophies/:username', renderJSON);

	SocketPlugins.Trophies = {
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
		var username = widget.area.url.replace("user/", "");
		getTrophiesForUsername(username, function(err, trophies) {
			if (!err) app.render('widgets/trophies', {trophies: trophies}, callback);
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
			troId: function(callback) {
				db.setObject("trophy-plugin:trophy:" + troId, trophy, callback(err, troId));
			},
			whatever : function(callback) {
				db.setAdd("trophy-plugin:trophies", troId, callback(err, troId));
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
		}
	], callback);
}

Trophies.awardTrophy = function(socket, data, callback) {
	// SAMPLE DATA: { trophy: 14, user: 'toxuin', steal: true }
	user.getUidByUsername(data.user, function(err, uid) {
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
				notifications.create({
					bodyShort: 'You just got a trophy!',
					bodyLong: "Congratulations! You just got a new trophy!",
					nid: 'trophy_' + uid + '_' + data.trophy,
					from: 2,
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
		}
	}, function(err, result) {
		res.render('admin/plugins/trophies', result);
	});
}

function renderJSON(request, response, callback) {
	if (!request.params || !request.params.username) response.json({error: "No username specified"});
	var username = request.params.username;

	getTrophiesForUsername(username, function(err, trophies) {
		if (err) response.json({error: err});
		else response.json(trophies);
	});
}

function getTrophiesForUsername(username, callback) {
	user.getUidByUsername(username, function(err, uid) {
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
		async.each(users, function(user, roll) {
			db.setRemove("trophy-plugin:user:" + user, trophyId, function() {
				db.setCount("trophy-plugin:user:" + user, function (err, result) {
					if (result == 0) {
						db.setRemove("trophy-plugin:users", user, roll);
					} else roll();
				});

			});
		}, callback);
	});
}

module.exports = Trophies;
