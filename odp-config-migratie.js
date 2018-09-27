// TODO: error handling

var clear = require('clear');
clear();

var readline = require('readline-sync');
var sleep = require('sleep');
const req = require('request-promise');
const reqSync = require('sync-request');

var DEFAULT = {
	port: 32001,
	sourceHostname: '',
	targetHostname: ''
}

const API = {
    login: "/api/a/rbac/login",
    domain: "/api/a/rbac/domain",
    service: "/api/a/sm/service",
    role: "/api/a/rbac/role"
}

var CONFIG = {};

CONFIG.sourceUrl = process.argv[2]
var sourceUsername = process.argv[3];
var sourcePassword = process.argv[4];
CONFIG.sourceDomain = process.argv[5];
CONFIG.sourceToken = null;

// ------

CONFIG.targetUrl = process.argv[6]
var targetUsername = process.argv[7];
var targetPassword = process.argv[8];
CONFIG.targetDomain = process.argv[9];

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

	if (process.argv[11] == "Y")
		options.uri += '&filter={"domain":"' + _domain + '","status":"Active"}'
	else
		options.uri += '&filter={"domain":"' + _domain + '"}'
	return req(options);
}

function enrichDefinition(_d) {
	// console.log(JSON.stringify(_d));
	// console.log("----");
	for (var key in _d) {
		if(_d[key].definition && _d[key].type == 'Array' && _d[key].definition._self.properties) {
			enrichDefinition(_d[key].definition._self.definition);
		}
		else if(_d[key].definition && _d[key].type == 'Array' && _d[key].definition._self.definition) {
			enrichDefinition(_d[key].definition._self.definition);
		} else if(_d[key].properties && _d[key].properties.relatedTo) {
			var newId = getNewId(_d[key].properties.relatedTo);
			var props = _d[key].properties;
			_d[key] = {};
			_d[key]._newField = false;
			_d[key].properties = props;
			_d[key].properties.relatedTo = newId;
			_d[key].properties._typeChanged = 'Relation';
			_d[key].type = 'Relation';
		}
	}
}

function getRole(_url, _token, _serviceId) {

	var options = {
		method: "GET",
		uri: _url + API.role + '?filter={"entity":"' + _serviceId + '"}',
		headers: {
			"Content-Type": "application/json",
			"Authorization": "JWT " + _token
		}
	}
	var res = reqSync(options.method, options.uri, options);
	var resParsed = JSON.parse(res.getBody('utf8'));
	var role = {};
	role.fields = JSON.parse(resParsed[0].fields);
	role.roles = resParsed[0].roles;
	return role;
}

function serviceAlreadyExists(_url, _token, _service) {

	var options = {
		method: "GET",
		uri: _url + API.service + '/count?filter={"domain":"' + _service.domain + '","api":"' + _service.api + '"}',
		headers: {
			"Content-Type": "application/json",
			"Authorization": "JWT " + _token
		}
	}
	var res = reqSync(options.method, options.uri, options);
	var count = eval(res.getBody('utf8'));
	return (count > 0);
}

function getExistingService(_url, _token, _service) {

	var options = {
		method: "GET",
		uri: _url + API.service + '?filter={"domain":"' + _service.domain + '","api":"' + _service.api + '"}',
		headers: {
			"Content-Type": "application/json",
			"Authorization": "JWT " + _token
		}
	}
	var res = reqSync(options.method, options.uri, options);
	return JSON.parse(res.getBody('utf8'))[0];
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
	console.log("Creating service " + _service.name + " ... ");
	// console.log(JSON.stringify(_service));
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
	console.log("Created service: " + _service.name + " with id: " + JSON.parse(res.getBody('utf8'))._id);
	return JSON.parse(res.getBody('utf8'));
}

function getNewId(_oldId) {
	var newId = null;
	toBeExported.forEach((service, i) => {
		if(service._id == _oldId && service.ocmExported)
			newId = service.ocmId;
	});
	return newId;
}

function allDependenciesDone(_service) {
	var allDone = true;
	_service.relatedSchemas.outgoing.forEach((_dep) => {
		if(allDone) {
			toBeExported.forEach((service, i) => {
				if(allDone) {
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
		console.log("Migrating " + _services.length + " services ...");
		_services.forEach((service, i) => {

			service.ocmId = "";
			service.ocmExported = false;
			toBeExported.push(service);

		});

		do {

			toBeExported.forEach((service, i) => {

				if(!service.ocmExported) {

					if(!serviceAlreadyExists(CONFIG.targetUrl, CONFIG.targetToken, service)) {

						var s = {};
						s.api = service.api;
						s.attributeList = [];
						service.attributeList.forEach((attribute) => {
							s.attributeList.push({
								key: attribute.key,
								name: attribute.name
							})
						})
						s.definition = JSON.parse(service.definition);
						s.description = service.description;
						s.domain = CONFIG.targetDomain;
						s.name = service.name;
						s.preHooks = service.preHooks;
						s.tags = service.tags;
						s.version = 1;
						s.versionValidity = service.versionValidity;
						s.webHooks = service.webHooks;
						s.wizard = [];
						if(service.wizard) {
							service.wizard.forEach((wizard) => {
								s.wizard.push({
									fields: wizard.fields,
									name: wizard.name
								})
							})
						}
						s.role = getRole(CONFIG.sourceUrl, CONFIG.sourceToken, service._id);

						if(service.relatedSchemas.outgoing && service.relatedSchemas.outgoing.length > 0) {
							if(allDependenciesDone(service)) {
								enrichDefinition(s.definition);
								var _remoteService = createService(CONFIG.targetUrl, CONFIG.targetToken, s);
								service.ocmId = _remoteService._id
								service.ocmExported = true;
								sleep.sleep(20);
							} else {
								console.log("Skipping service: " + service.name + ", not all dependencies have been created ...");
							}

						} else {
							var _remoteService = createService(CONFIG.targetUrl, CONFIG.targetToken, s);
							service.ocmId = _remoteService._id
							service.ocmExported = true;
							sleep.sleep(20);
						}

					} else {
						service.ocmExported = true;
						service.ocmId = getExistingService(CONFIG.targetUrl, CONFIG.targetToken, service)._id;
						console.log("Skipping service: " + service.name + ", service already exists: " + service.ocmId);
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

		if (process.argv[10] == "Y") {
			console.log("Creating domain ...");
			createDomain(CONFIG.targetUrl, CONFIG.targetToken, CONFIG.targetDomain, "").then(_domain => {	
				console.log("Created domain.");
				createServices();
			});
		} else {
			console.log("Will using existing domain.");
			createServices();
		}

		
	})
	
});
