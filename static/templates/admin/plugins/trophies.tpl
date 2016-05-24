<form id="trophies-form">

	<div class="panel panel-default">
		<div class="panel-heading">Award a trophy</div>
		<div class="panel-body">

			<div class="form-group">
				<label for="trophies-award-list">Trophy to award:</label>
				<select name="trophies-award-list" id="trophies-award-list" class="form-control">
					<!-- BEGIN trophies -->
					<option value="{trophies.name}" data-trophyid="{trophies.trophyId}">{trophies.name}</option>
					<!-- END trophies -->
				</select>
			</div>

			<div class="form-group">
				<label for="trophies-award-user">User to award:</label>
				<input type="text" class="form-control" name="trophies-award-user" id="trophies-award-user"/>
			</div>

			<div class="form-group">
				<label for="steal-from-others">Steal from all other users?</label>
				<input type="checkbox" name="steal-from-others" id="steal-from-others" />
			</div>

			<button type="button" id="trophies-award" class="btn btn-success btn-lg btn-block"><i class="fa fa-trophy"></i> Award!</button>

		</div>
	</div>

	<div class="panel panel-default">
		<div class="panel-heading">Create a trophy</div>
		<div class="panel-body">
			<div class="form-group">
				<label for="trophies-name">Trophy name:</label>
				<input type="text" name="trophies-name" id="trophies-name" class="form-control"/>
			</div>

			<div class="form-group">
				<label for="trophies-description">Trophy description:</label>
				<input type="text" name="trophies-description" id="trophies-description" class="form-control"/>
			</div>

			<div class="form-group">
				<label for="trophies-image">Trophy image:</label>
				<select name="trophies-image" id="trophies-image" class="form-control">
				<!-- BEGIN pictures -->
					<option value="{pictures.name}" data-imagesrc="../../plugins/nodebb-plugin-trophies/static/trophies/{pictures.name}"
					data-description="{pictures.name}">{pictures.name}</option>
				<!-- END pictures -->
				</select>
			</div>

			<button type="button" id="trophies-create" class="btn btn-primary btn-lg btn-block"><i class="fa fa-save"></i> Create a trophy</button>
		</div>
	</div>

	<div class="panel panel-default">
		<div class="panel-heading">Trophy list</div>
		<div class="panel-body" id="trophies-total-list">
			<!-- BEGIN trophies -->
			<div class="trophies-item" title="{trophies.description}" style="background-image:url('../../plugins/nodebb-plugin-trophies/static/trophies/{trophies.image}');">
				<span class="trophies-item-name">{trophies.name}</span>
				<button type="button" class="trophies-delete btn btn-warning btn-xs" data-trophiesid="{trophies.trophyId}"><i class="fa fa-trash"></i></button>
			</div>
			<!-- END trophies -->
		</div>
	</div>
</form>

<script>
	require(['settings'], function(Settings) {
		Settings.load('trophies', $('#trophies-form'));

		$('#trophies-award').on('click', function(ev) {
			var data = {
				trophy: $("#trophies-award-list option:selected").data("trophyid"),
				user: $("#trophies-award-user").val(),
				steal: $("#steal-from-others").is(':checked')
			};
			socket.emit('plugins.Trophies.awardTrophy', data, function(err) {
				if (err && err.hasOwnProperty("message")) {
					app.alertError("Error: " + err.message);
				} else {
					app.alertSuccess("User " + data.user + " awarded!");
				}
			});
			//Settings.save($('#trophies-form'));
			ev.preventDefault();
			return false;
		});

		$('#trophies-create').on('click', function(ev) {
			var data = {
				name: $("#trophies-name").val(),
				description: $("#trophies-description").val(),
				image: $("#trophies-image option:selected").data()
			}

			if (data.name == "") {
				app.alertError("Empty name!");
				ev.preventDefault();
				return false;
			}
			if (! $("#trophies-image").val()) {
				app.alertError("No image selected!");
				ev.preventDefault();
				return false;
			}

			socket.emit('plugins.Trophies.createTrophy', data, function(err, result) {
				if (err) {
					console.log("Error on creating Trophy:");
					console.log(err);
					app.alertError("Error occured. See console.");
				} else {
					app.alertSuccess("Created a trophy!");
					$("#trophies-name").val("");
					$("#trophies-image option:selected").prop("selected", false).change();
					updateTrophyList();
				}
			});

			ev.preventDefault();
			return false;
		});

		$('.trophies-delete').click(function(event) {
			socket.emit('plugins.Trophies.deleteTrophy', $(this).data("trophiesid"), function(result) {
				app.alertSuccess("Deleted trophy.");
				updateTrophyList();
			});
		});

		$("#trophies-award-user").autocomplete({
			delay: 800,
			minLength: 2,
			source: function(request, response) {
				socket.emit('admin.user.search', {query: request.term}, function(err, results) {
					if (err || !results | results.users.length <= 0) {
						console.log(err);
						return;
					}
					var users = [];
					results.users.forEach(function(item) {
						users.push(item.userslug);
					});
					response(users);
				});
			}
		});
	});

	function updateTrophyList() {
		socket.emit('plugins.Trophies.getAllTrophies', null, function(err, results) {
			if (err || !results) {
				return app.alertError("Error occured! " + err?err:"");
			}
			$("#trophies-total-list").empty();
			$("#trophies-award-list").empty();
			results.forEach(function(item) {
				$("#trophies-total-list").append("<div class=\"trophies-item\" title=\"" + item.description + "\" style=\"background-image:url('../../plugins/nodebb-plugin-trophies/static/trophies/" + item.image + "');\"><span class=\"trophies-item-name\">" + item.name + "</span><button type=\"button\" class=\"trophies-delete btn btn-warning btn-xs\" data-trophiesid=\"" + item.trophyId + "\"><i class=\"fa fa-trash\"></i></button></div>");
				$("#trophies-award-list").append("<option value=\"" + item.name + "\" data-trophyid=\"" + item.trophyId + "\">" + item.name + "</option>");
			});

		});
	}
</script>
