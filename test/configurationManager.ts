'use strict';

const chai = require('chai'),
  chaiAsPromised = require('chai-as-promised'),
  rewire = require('rewire'),
  expect = chai.expect,
  path = require('path'),
  sinon = require('sinon');
chai.use(chaiAsPromised);

describe('Configuration Manager', () => {
  let rewiredManager;

  beforeEach(() => {
    let confFile = path.join(__dirname, 'config.json');
    rewiredManager = rewire('../configurationManager');
    rewiredManager.__set__({ CONFIG_FILE: confFile });
  });

  it('should load the config file', () => {
    return expect(rewiredManager.default.loadConfigFile()).to.be.an('object');
  });

  it('should throw when the conf file is wrong', () => {
    var errorSpy = sinon.spy();
    var logSpy = sinon.spy();
    let wrongConfFile = path.join(__dirname, 'wrongConfig.json');
    let RewiredConf = rewire('../configurationManager');
    RewiredConf.__set__({ CONFIG_FILE: wrongConfFile });
    RewiredConf.__set__({
      console: {
        log: logSpy,
        error: errorSpy
      }
    });
    RewiredConf.default.loadConfigFile();
    sinon.assert.calledOnce(errorSpy);
  });

});