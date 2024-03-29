# Warwick Trusted Apps [![Node.js CI](https://github.com/UniversityofWarwick/warwick-trusted-apps/actions/workflows/node.js.yml/badge.svg)](https://github.com/UniversityofWarwick/warwick-trusted-apps/actions/workflows/node.js.yml)

A Node.js client/server implementation for Warwick Trusted Applications.

## Setup

    var trustedApps = require('warwick-trusted-apps');
    trustedApps.setConfig({
      "shire": {
        "providerId": "example"
      },
      "trustedApps": {
        "publicKey": "key",
        "privateKey": "key",
        "apps": {
          "other-provider-id": {
            "publicKey": "key"
          }
        }
      }
    });
    
## Usage with Express

    var app = require('express')();
    app.use(trustedApps.middleware);

    app.get('/', function (req, res) {
      if (req.user) {
        res.send('Hello, ' + req.user.usercode);
      } else {
        res.send('Who are you?');
      }
    });
