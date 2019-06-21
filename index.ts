
const express = require('express');
const lti = require('ims-lti')
const q = require('q');
const ejs = require('ejs');
const http = require('http');

// For debugging on https://localhost
/*
const fs = require('fs');
const https = require('https');
const privateKey  = fs.readFileSync('sslcert/server.key', 'utf8');
const certificate = fs.readFileSync('sslcert/server.crt', 'utf8');
const credentials = {key: privateKey, cert: certificate};
*/

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

import configurationManager from './configurationManager';
import DatabaseClient from './DatabaseClient';
import FileStore from './FileStore';
import RequestHandler from './requestHandler';
let utils = require('./utils').default;

configurationManager.initialize();
const config = configurationManager.loadConfigFile();
configurationManager.watch();

const requestHandler = new RequestHandler(config);
const databaseClient = new DatabaseClient(config);
const fileStore = new FileStore(config);

const getAuthToken = req => {
  const authorization = req.get('authorization');
  if (!authorization || authorization.length < 7)
    throw 'Authorization header missing';
  return authorization.length > 7 && authorization.substr(7);
};

const authorizationError = {
  code: 401, 
  msg: 'Unauthorized request'
};

const handleError = (res, err) => {
  const errType = Object.prototype.toString.call(err).slice(8, -1);
  if (errType === 'String' || errType === 'Error' || !err.code) {
    if (errType === 'Error') {
      console.error('[ERROR] ' + err + '\n' + err.stack);
      err = err.msg;
    } else console.error('[ERROR] ' + err);
    res.status(500).send(err);
  } else {
    const errMsg =
      err.code === 403
        ? 'Authentication error'
        : err.msg ? err.msg : `code: ${err.code}`;

    if (err.code !== 204) {
      // 204= file not found
      console.error(`[ERROR] ${errMsg}`);
    }
    res.status(err.code).send(errMsg);
  }
};

app.post('/submission', async (req, res) => {
  let userInfo;
  try {
    userInfo = await requestHandler.getUserInfo(
        'me',
        getAuthToken(req)
    );
    const dataBaseRequest = await databaseClient.createSubmissionEntry({ 
      userInfo,
      ...req.body
    })
    .catch(err => { throw(err) });
    const fileStoreRequest = await fileStore.store({
      userInfo,
      ...req.body
    })
    .catch(err => { throw(err) });
    res.send({
      database: dataBaseRequest,
      fileStore: fileStoreRequest
    })
  } catch (err) {
    handleError(res, err);
  }
});

app.post('/edx-launch', async (req, res) => {
  try {
    const ltiKey = config.ltiConsumerKey;
    const ltiSecret = config.ltiConsumerSecret;
    let provider = new lti.Provider(ltiKey, ltiSecret);
    let validator = provider.valid_request.bind(provider);
    await q.denodeify(validator)(req)
    .then(isValid => {
      if (!isValid) {
        const msg = 'Invalid LTI launch request';
        throw(msg);
      }
    })
    .catch(err => {
      console.error('LTI validation error');
      throw(err);
    });
    const token = utils.generateToken(
      config.tokenEncryptionKey, 
      req.body['lis_result_sourcedid']
    );
    // We store part of the req object in the Firebase database 
    // We need req's body for later submission to edX, actually two of its LTI parameters:
    // 'lis_outcome_service_url', the url where to submit the edX grade, and
    // lis_result_sourcedid', a unique identifier of the pair (edX LTI unit, edX user)
    // Some req properties are filtered out as they cannot be serialized 
    // (none of them, except body, are useful for the edX send-and-replace call).
    const INCLUDE = ['body', 'raw', 'originalUrl', 'protocol', 'method', 'headers']; 
    let filteredRequest = {};
    Object.keys(req).forEach(key => {
      if (INCLUDE.indexOf(key) !== -1) filteredRequest[key] = req[key]; 
    });
    filteredRequest['connection'] = { encrypted: req.connection.encrypted };
    await databaseClient.createEdxGradeEntry({
      request: filteredRequest,
      token  
    })
    .catch(err => { throw(err) });
    const launchWidget = await q.denodeify(ejs.renderFile)('views/launch_exercise_show_token.ejs', 
      {
        token,
        exercise: req.body['custom_subheader'],
        redirect: 'https://collab.humanbrainproject.eu/#/collab'
      }
    );
    res.send(launchWidget);
  } catch (err) {
    handleError(res, err);
  }
});

app.post('/edx-submission/:userId/:header', async (req, res) => {
  try {
    if (getAuthToken(req) !== config.adminToken) throw(authorizationError);
    const dataBaseRequest = await databaseClient.submitUserGradesToEdx(
       req.params.userId, 
       req.params.header
    )
    .catch(err => { throw(err) });
    res.send(dataBaseRequest);
  } catch (err) {
    console.log(err);
    handleError(res, err);
  }
});

app.post('/edx-submission/:header', async (req, res) => {
  try {
    if (getAuthToken(req) !== config.adminToken) throw(authorizationError);
    const dataBaseRequest = await databaseClient.submitGradesToEdx(req.params.header)
    .catch(err => { throw(err) });
    res.send(dataBaseRequest);
  } catch (err) {
    console.log(err);
    handleError(res, err);
  }
});

app.post('/final-grades/:userId', async (req, res) => {
  try {
    if (getAuthToken(req) !== config.adminToken) throw(authorizationError);
    const dataBaseRequest = await databaseClient.appendUserFinalGrades(req.params.userId, req.body)
    .catch(err => { throw(err) });
    res.send(dataBaseRequest);
  } catch (err) {
    handleError(res, err);
  }
});

app.post('/final-grades', async (req, res) => {
  try {
    if (getAuthToken(req) !== config.adminToken) throw(authorizationError);
    const dataBaseRequest = await databaseClient.appendFinalGrades(req.body)
    .catch(err => { throw(err) });
    res.send(dataBaseRequest);
  } catch (err) {
    handleError(res, err);
  }
});

app.get('/check-token', async (req, res) => {
  try {
    const dataBaseRequest = await databaseClient.getEdxGradeIdentifiers(req.query.token)
    .catch(err => { throw(err) });
    
    res.send({
      custom_header: dataBaseRequest['custom_header'],
      custom_subheader: dataBaseRequest['custom_subheader']
    })
  } catch (err) {
    handleError(res, err);
  }
});


// Express configuration
const httpServer = http.createServer(app);
httpServer.listen(3000, () => console.log('Server listening on port 3000!'));

// For debugging on https://localhost
//const httpsServer = https.createServer(credentials, app);
//httpsServer.listen(8443, () => console.log('Server listening on port 8443!'));