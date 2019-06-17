
const express = require('express');
const fs = require('fs');
const q = require('q');
const ejs = require('ejs');

const http = require('http');
/*
// For debugging on https://localhost
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

const handleError = (res, err) => {
  const errType = Object.prototype.toString.call(err).slice(8, -1);
  if (errType === 'String' || errType === 'Error' || !err.code) {
    if (errType === 'Error') {
      console.error('[ERROR] ' + err + '\n' + err.stack);
      err = err.message;
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
    let launchParameters = {};
   ['lis_result_sourcedid', // unique id provided by edX for the question/exercise
    'lis_outcome_service_url', // the url used to submit the grade to edX 
    'oauth_consumer_key', 'oauth_nonce', 'oauth_timestamp', // used for the OAuth1 protocol
    'custom_header', 'custom_subheader' // used to check that the user submits an answer to the correct exercise (customized in edX LTI Consumer unit)
   ]
   .forEach(key => {
      launchParameters[key] = req.body[key];
    })
    const token = utils.generateToken(
      config.tokenEncryptionKey, 
      launchParameters['lis_result_sourcedid']
    );
    const dataBaseRequest = await databaseClient.createEdxGradeEntry({
      ...launchParameters,
      token  
    })
    .catch(err => { throw(err) });
    const launchWidget = await q.denodeify(ejs.renderFile)('views/launch_exercise_show_token.ejs', 
      {
        token,
        exercise: launchParameters['custom_subheader'],
        redirect: 'https://collab.humanbrainproject.eu/#/collab'
      }
    );
    res.send(launchWidget);
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
// const httpsServer = https.createServer(credentials, app);

httpServer.listen(3000, () => console.log('Server listening on port 3000!'));
//httpsServer.listen(8443, () => console.log('Server listening on port 8443!'));