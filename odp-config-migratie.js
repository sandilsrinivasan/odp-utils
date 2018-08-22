// TODO: error handling

var clear = require('clear');
clear();

var readline = require('readline-sync');
const req = require('request-promise');

var DEFAULT = {
	port: 32001,
	sourceHostname: 'sandbox.odp.capiot.com',
	targetHostname: 'sandbox.odp.capiot.com'
}

const API = {
    login: "/api/a/rbac/login",
    domain: "/api/a/rbac/domain",
    service: "/api/a/sm/service"
}

var CONFIG = {};

console.log("Enter the source ODP details.");

var sourceHost = readline.question('Host: [' + DEFAULT.sourceHostname + '] ', {
  defaultInput: DEFAULT.sourceHostname

});

var sourcePort = readline.question('Port: [' + DEFAULT.port + '] ', {
  defaultInput: DEFAULT.port
});

CONFIG.sourceUrl = "http://" + sourceHost + ":" + sourcePort;

var sourceUsername = readline.question('Username: ');
var sourcePassword = readline.question('Password: ', {
  hideEchoBack: true
});

CONFIG.sourceDomain = readline.question('Domain: ');
CONFIG.sourceToken = null;

// ------

console.log("Enter the target ODP details.");

var targetHost = readline.question('Host: [' + DEFAULT.targetHostname + '] ', {
  defaultInput: DEFAULT.targetHostname

});

var targetPort = readline.question('Port: [' + DEFAULT.port + '] ', {
  defaultInput: DEFAULT.port
});

CONFIG.targetUrl = "http://" + targetHost + ":" + targetPort;

var targetUsername = readline.question('Username: ');
var targetPassword = readline.question('Password: ', {
  hideEchoBack: true
});

CONFIG.targetDomain = readline.question('Domain: ');
CONFIG.targetToken = null;

function login(_url, _username, _password) {
	var options = {
		method: "POST",
		uri: _url + API.login,
	    json: true,
	    body: {
	    	username: _username,
	    	password: _password
	    }
	}
	return req(options)
}

function getServices(_url, _token, _domain){
	var options = {
		method: "GET",
		uri: _url + API.service,
		headers: {
			"Content-Type": "application/json",
			"Authorization": "JWT " + _token
		},
	    json: true,
	}

	if (readline.keyInYN('Export only active services? ')) {
		options.uri += '?filter={"domain":"' + _domain + '","status":"Active"}'
	} else {
		options.uri += '?filter={"domain":"' + _domain + '"}'
	}
	return req(options)
}

function createDomain(_url, _token, _name, _description) {
	var options = {
		method: "POST",
		uri: _url + API.domain,
		headers: {
			"Content-Type": "application/json",
			"Authorization": "JWT " + _token
		},
	    json: true,
	    body: {
	    	"_id": _name,
	    	"type": "Management",
	    	"description": _description
	    }
	}
	return req(options)
}

function createService(_url, _token, _service) {
	var options = {
		method: "POST",
		uri: _url + API.service,
		headers: {
			"Content-Type": "application/json",
			"Authorization": "JWT " + _token
		},
	    json: true,
	    body: _service
	}
	return req(options)
}

function createServices() {
	getServices(CONFIG.sourceUrl, CONFIG.sourceToken, CONFIG.sourceDomain).then(_services => {
		console.log("Creating services ...");
		_services.forEach((service, i) => {
			var s = {};
			s.api = service.api;
			s.attributeList = service.attributeList;
			s.definition = JSON.parse(service.definition);
			s.description = service.description;
			s.domain = CONFIG.targetDomain;
			s.name = service.name;
			s.preHooks = service.preHooks;
			s.tags = service.tags;
			s.version = 1;
			s.versionValidity = service.versionValidity;
			s.webHooks = service.webHooks;
			s.wizard = service.wizard;
			// dirty hack
			// because odp misbehaves with roles when hit too quickly
			setTimeout(function() {
				createService(CONFIG.targetUrl, CONFIG.targetToken, s).then(_remoteService => {
					console.log("Created service: " + service.name);
				});
			} , ((i+1) * 1000));
		})
	})
}

console.log("Connecting to " + CONFIG.sourceUrl + " ...");
login(CONFIG.sourceUrl, sourceUsername, sourcePassword).then(_sd => {
	
	console.log("Logged in to the source ODP.");
	CONFIG.sourceToken = _sd.token;

	console.log("Connecting to " + CONFIG.targetUrl + " ...");
	login(CONFIG.targetUrl, targetUsername, targetPassword).then(_td => {
		console.log("Logged in to the target ODP.");
		CONFIG.targetToken = _td.token;

		if (readline.keyInYN('Do you want to create the domain? ')) {
			console.log("Creating domain ...");
			createDomain(CONFIG.targetUrl, CONFIG.targetToken, CONFIG.targetDomain, "This domain was cloned.").then(_domain => {	
				console.log("Created domain.");
				createServices();
			});
		} else {
			console.log("Will using existing domain.");
			createServices();
		}

		
	})
	
});
