const reqSync = require('sync-request');
var notify = true;

function login() {
	var options = {
		method: "POST",
		uri: "http://cloud.odp.capiot.com:32001/api/a/rbac/login",
		headers: {
			"Content-Type": "application/json",
		},
		timeout: 5000,
	    json: { "username": "sandil", "password": "917259471214" }
	}
	try {
		var res = reqSync(options.method, options.uri, options);
		if(res.statusCode == 200)
			sendNotification("Authentication works now");
		else
			sendNotification("Could not login, invalid credentials");
		// console.log("Success");
		notify = false;
		// console.log(res.getBody('utf8'));
	} catch(error) {
		// console.log("Error");
		notify = true;
		sendNotification("Authentication failed");
	}
}

login();

setInterval(function () {
	login()
}, 120000);

function sendNotification(_message) {
	if(notify) {
		var options = {
			method: "POST",
			uri: "https://api.flock.com/hooks/sendMessage/baabc728-26c0-4164-9370-90d4e793c3ee",
			headers: {
				"Content-Type": "application/json",
			},
		    json: {"notification": _message,"text": _message}
		}
		var res = reqSync(options.method, options.uri, options);
	}
}