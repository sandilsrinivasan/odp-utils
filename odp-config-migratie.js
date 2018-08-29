// TODO: error handling

var clear = require('clear');
clear();

var readline = require('readline-sync');
var sleep = require('sleep');
const req = require('request-promise');
const reqSync = require('sync-request');

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

var toBeExported = [];

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
	return req(options);
}

function getServices(_url, _token, _domain){
	var options = {
		method: "GET",
		uri: _url + API.service + '?count=-1',
		headers: {
			"Content-Type": "application/json",
			"Authorization": "JWT " + _token
		},
	    json: true,
	}

	if (readline.keyInYN('Export only active services? ')) {
		options.uri += '&filter={"domain":"' + _domain + '","status":"Active"}'
	} else {
		options.uri += '&filter={"domain":"' + _domain + '"}'
	}
	return req(options);
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
	return req(options);
}

function createService(_url, _token, _service) {
	var options = {
		method: "POST",
		uri: _url + API.service,
		headers: {
			"Content-Type": "application/json",
			"Authorization": "JWT " + _token
		},
	    json: _service
	}
	var res = reqSync(options.method, options.uri, options);
	// console.log(res.getBody('utf8'));;
	return JSON.parse(res.getBody('utf8'));
}

function getNewId(_oldId) {
	var newId = null;
	// console.log("_oldId = " + _oldId);
	toBeExported.forEach((service, i) => {
		// console.log("service._id = " + service._id);
		// console.log("service.ocmExported = " + service.ocmExported);
		if(service._id == _oldId && service.ocmExported)
			newId = service.ocmId;
	});
	return newId;
}

function allDependenciesDone(_service) {
	var allDone = true;
	// console.log("Checking if all dependencies of " + _service.api + " are done");
	_service.relatedSchemas.outgoing.forEach((_dep) => {
		if(allDone) {
			// console.log("Checking: " + _dep.service);
			toBeExported.forEach((service, i) => {
				if(allDone) {
					// console.log("Checking against: " + service._id + ", ocmExported = " + service.ocmExported);
					if(service._id == _dep.service) {
						if(!service.ocmExported) {
							allDone = false;
						}
					}
				}
			});
		}
	});
	return allDone;
}

function allServicesDone() {
	var allDone = true;
	toBeExported.forEach((service, i) => {
		if(!service.ocmExported)
			allDone = false;
	});
	return allDone;
}

function createServices() {

	getServices(CONFIG.sourceUrl, CONFIG.sourceToken, CONFIG.sourceDomain).then(_services => {
		console.log("Creating services ...");
		_services.forEach((service, i) => {

			service.ocmId = "";
			service.ocmExported = false;
			toBeExported.push(service);

		});

		do {

			sleep.sleep(2);

			toBeExported.forEach((service, i) => {

				if(!service.ocmExported) {

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

					// Check if this service has any outgoing relationships
					if(service.relatedSchemas.outgoing && service.relatedSchemas.outgoing.length > 0) {
						// Check if all dependent services have already been exported
						if(allDependenciesDone(service)) {
							// enrich the IDs

							for (var key in s.definition) {
								// console.log("key = " + key);
								// console.log("type = " + s.definition[key].type);
								if(s.definition[key].properties && s.definition[key].properties.relatedTo) {
									var newId = getNewId(s.definition[key].properties.relatedTo);
									// console.log("old id = " + s.definition[key].properties.relatedTo + ", new id = " + newId);
									var props = s.definition[key].properties;
									s.definition[key] = {};
									s.definition[key]._newField = false;
									s.definition[key].properties = props;
									s.definition[key].properties.relatedTo = newId;
									s.definition[key].properties._typeChanged = 'Relation';
									s.definition[key].type = 'Relation';
								}
							}

							// safe to export
							// dirty hack
							// because odp misbehaves with roles when hit too quickly
							console.log("Creating service " + service.name + " ... ");
							// console.log(JSON.stringify(s));
							var _remoteService = createService(CONFIG.targetUrl, CONFIG.targetToken, s);
							console.log("Created service: " + service.name + " with id: " + _remoteService._id);
							service.ocmId = _remoteService._id
							service.ocmExported = true;
						} else {
							console.log("Skipping service: " + service.name + ", not all dependencies have been created ...");
						}

					} else {
						// if not, it's safe to export
						// dirty hack
						// because odp misbehaves with roles when hit too quickly
						console.log("Creating service " + service.name + " ... ");
						var _remoteService = createService(CONFIG.targetUrl, CONFIG.targetToken, s);
						console.log("Created service: " + service.name + " with id: " + _remoteService._id);
						service.ocmId = _remoteService._id
						service.ocmExported = true;
					}

				}

			});

		} while(!allServicesDone())
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
