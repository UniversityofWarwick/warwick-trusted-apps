'use strict';

const crypto = require('crypto');
const forge = require('node-forge');

var CONFIG;

function setConfig(config) {
  CONFIG = config;

  // Trust thyself
  CONFIG.trustedApps.apps[CONFIG.shire.providerId] = {
    publicKey: CONFIG.trustedApps.publicKey
  };

  setPublicKey(CONFIG.trustedApps.publicKey);
  setPrivateKey(CONFIG.trustedApps.privateKey);
}

function getReqHeaderValue(req, headerKey) {
  if (typeof req.header === 'function') {
    return req.header(headerKey);
  } else if (req.headers && typeof req.headers === 'object') {
    if (req.headers[headerKey]) {
      return req.headers[headerKey]
    } else if (req.headers[headerKey.toLowerCase()]) {
      return req.headers[headerKey.toLowerCase()];
    }
    return undefined;
  } else {
    throw new Error("req.header is not a function and req.headers is not an object");
  }
}

function getRequestUrl(req) {
  let result = "";
  if (getReqHeaderValue(req, 'X-Requested-URI')) {
    result = getReqHeaderValue(req, 'X-Requested-URI');
  } else {
    result = req.protocol + '://' + getReqHeaderValue(req, 'Host') + req.url;
  }
  if (CONFIG.allowMultipleProtocolsInURL) {
    return result.replace(/([a-z]+):\/([^\/])/, '$1://$2'); // Regex because of sitebuilder requests for lighthouse reports
  } else {
    return result;
  }
}

// Designed to work with express - if you're using Koa, use middlewareForKoa below
function middleware(req, res, next) {
  function error(res, id, message) {
    res.status(401)
        .set(HEADER_STATUS, 'Error')
        .send({
          success: false,
          status: 'Unauthorized',
          errors: [
            {
              id: id,
              message: message
            }
          ]
        })
        .end();
  }

  let url = getRequestUrl(req);

  let certificate = getReqHeaderValue(req, HEADER_CERTIFICATE);
  let providerId = getReqHeaderValue(req, HEADER_PROVIDER_ID);
  let signature = getReqHeaderValue(req, HEADER_SIGNATURE);

  if (certificate) {
    if (!providerId)
      return error(res, 'no-provider-id', 'Provider ID not found in request');

    let app = CONFIG.trustedApps.apps[providerId];

    if (!app)
      return error(res, 'unknown-app', 'Unknown application: ' + providerId);

    if (!signature)
      return error(res, 'no-signature', 'Missing signature in request');

    let okay = verifySignature(app, url, certificate, signature);

    if (!okay)
      return error(res, 'bad-signature', 'Bad signature for URL: ' + url);

    res.set(HEADER_STATUS, 'OK');

    req.user = {
      usercode: decodeCertificate(certificate).username
    };
  }

  next();
}

function middlewareForKoa(ctx, next) {
  const url = getRequestUrl(ctx.req);
  const certificate = getReqHeaderValue(ctx.req, HEADER_CERTIFICATE);
  const providerId = getReqHeaderValue(ctx.req, HEADER_PROVIDER_ID);
  const signature = getReqHeaderValue(ctx.req, HEADER_SIGNATURE);

  ctx.assert(certificate, 403, "No trusted apps certificate found");
  ctx.assert(providerId, 403, 'Provider ID not found in request');

  const app = CONFIG.trustedApps.apps[providerId];

  ctx.assert(app, 403, `Unknown application: ${providerId}`);
  ctx.assert(signature, 403, "Missing signature in request");
  ctx.assert(verifySignature(app, url, certificate, signature), 403, `Bad signature for URL: ${url}`);

  ctx.set(HEADER_STATUS, 'OK');
  ctx.user = {
    usercode: decodeCertificate(certificate).username
  };

  return next();
}

const HEADER_PREFIX = 'X-Trusted-App-';

// Request headers
const HEADER_PROVIDER_ID = HEADER_PREFIX + 'ProviderID';
const HEADER_CERTIFICATE = HEADER_PREFIX + 'Cert';
const HEADER_SIGNATURE = HEADER_PREFIX + 'Signature';

// Response headers
const HEADER_STATUS = HEADER_PREFIX + "Status";
const HEADER_ERROR_CODE = HEADER_PREFIX + "Error-Code";
const HEADER_ERROR_MESSAGE = HEADER_PREFIX + "Error-Message";

const SIGNATURE_ALGORITHM = 'RSA-SHA1';

function generateSignatureBaseString(timestamp, url, username) {
  let separator = "\n";

  return timestamp + separator + url + separator + username;
}

function createCertificate(timestamp, username) {
  let separator = "\n";

  return forge.util.encode64(timestamp + separator + username);
}

function toPublicKey(str) {
  return forge.pki.publicKeyToPem(
      forge.pki.publicKeyFromAsn1(
          forge.asn1.fromDer(
              forge.util.decode64(str)
          )
      )
  );
}

function toPrivateKey(str) {
  return forge.pki.privateKeyToPem(
      forge.pki.privateKeyFromAsn1(
          forge.asn1.fromDer(
              forge.util.decode64(str)
          )
      )
  );
}

var privateKey, publicKey;

function setPublicKey(str) {
  publicKey = toPublicKey(str);
}

function setPrivateKey(str) {
  privateKey = toPrivateKey(str);
}

function createSignature(timestamp, url, username) {
  return crypto.createSign(SIGNATURE_ALGORITHM)
      .update(generateSignatureBaseString(timestamp, url, username))
      .sign(privateKey, 'base64');
}

function verifySignature(app, url, certificate, signature) {
  let appPublicKey = toPublicKey(app.publicKey);
  let cert = decodeCertificate(certificate);

  return crypto.createVerify(SIGNATURE_ALGORITHM)
      .update(generateSignatureBaseString(cert.timestamp, url, cert.username))
      .verify(appPublicKey, signature, 'base64');
}

function getRequestHeaders(providerId, timestamp, url, username) {
  let certificate = createCertificate(timestamp, username);
  let signature = createSignature(timestamp, url, username);

  return {
    [HEADER_PROVIDER_ID]: providerId,
    [HEADER_CERTIFICATE]: certificate,
    [HEADER_SIGNATURE]: signature
  };
}

function decodeCertificate(certificate) {
  let decodedCertificate = forge.util.decode64(certificate).split("\n");

  return {
    timestamp: decodedCertificate[0],
    username: decodedCertificate[1]
  };
}

module.exports = {
  setConfig,
  getRequestHeaders,
  createSignature,
  verifySignature,
  decodeCertificate,
  createCertificate,
  middleware,
  middlewareForKoa,
  getRequestUrl,
  HEADER_PROVIDER_ID,
  HEADER_SIGNATURE,
  HEADER_CERTIFICATE,
  HEADER_STATUS,
  HEADER_ERROR_CODE,
  HEADER_ERROR_MESSAGE
};
