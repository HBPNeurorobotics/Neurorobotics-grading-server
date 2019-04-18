'use strict';

var chai = require('chai');
var chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);
var expect = chai.expect;
var rewire = require('rewire');
var sinon = require('sinon');
var assert = chai.assert;
const q = require('q');
const FileStoreRewire = rewire('../FileStore'),
  { default: FileStore } = FileStoreRewire;
const fs = require('fs'),
const fsPromises = fs.promises;

describe('FileStore', function() {

  it('store() should log to local file', function(done) {
    sinon.stub(FileStore.prototype, 'processSubmission').returns(q.resolve());
    sinon.stub(fsPromises, 'access').returns(q.resolve());
    let filestore = new FileStore({ fileStorePath: '/tmp/fileStore' });
    expect(filestore.config).to.be.defined;
    filestore.store({userInfo: { id: '123456' }})
      .then(function() {
        expect(fsPromises.access.called).to.equal(true);
        expect(filestore.processSubmission.called).to.equal(true);
        done();
      })
      .catch(function(error) {
        done(error);  
      });
  });
});
