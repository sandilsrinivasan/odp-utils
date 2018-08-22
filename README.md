# odp-utils
Omni Data Platform Utilities

## Getting Started

Clone the repository to start working with ODP utilities.

### Prerequisites

Install the dependencies before running the project

```
npm install
```

### Configuration migration

Run the configuration migration script to export schemas from one ODP instance/domain to another. The script asks for the following parameters:

* Source ODP hostname
* Source ODP port
* Source ODP username
* Source ODP password
* Source ODP Domain
* Target ODP hostname
* Target ODP port
* Target ODP username
* Target ODP password
* Target ODP Domain
* Target ODP Domain
* Whether a domain should be created?
* Whether only active services should be exported?

Note: If the domain must be created, the target ODP user must have permissions to do so.

```
node odp-config-migratie.js

```

Provide the input in the console to define the configuration parameters. When executed, the script will show a console output similar to the following:

```
Enter the source ODP details.
Host: [sandbox.odp.capiot.com]
Port: [32001]
Username: admin
Password: ************
Domain: AjaxArenA
Enter the target ODP details.
Host: [sandbox.odp.capiot.com] bifrost.odp.capiot.com
Port: [32001]
Username: admin
Password: ************
Domain: CampNou
Connecting to http://sandbox.odp.capiot.com:32001 ...
Logged in to the source ODP.
Connecting to http://bifrost.odp.capiot.com:32001 ...
Logged in to the target ODP.
Do you want to create the domain? [y/n]: n
Will using existing domain.
Export only active services? [y/n]: y
Creating services ...
Created service: permissions
Created service: roles
Created service: testEntity
```
