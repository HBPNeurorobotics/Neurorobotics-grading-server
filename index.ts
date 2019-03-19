
const express = require('express');
const bodyParser = require('body-parser')

const app = express();
app.use(bodyParser.urlencoded({
  extended: true
}));
app.use(bodyParser.json());

import configurationManager from './configurationManager';
import DatabaseClient from './DatabaseClient';
import FileStore from './FileStore';
import RequestHandler from './requestHandler';

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
    const dataBaseRequest = await databaseClient.submit({ 
      userInfo,
      ...req.body
    });
    const fileStoreRequest = await fileStore.store({
      userInfo,
      ...req.body
    });
    res.send({
      database: dataBaseRequest,
      fileStore: fileStoreRequest
    });
  } catch (err) {
    handleError(res, err);
  }
});


app.listen(3000, () =>
  console.log('Server listening on port 3000!'),
);