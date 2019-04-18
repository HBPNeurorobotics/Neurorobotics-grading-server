'use strict';

var chai = require('chai');
var chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);
var expect = chai.expect;
var rewire = require('rewire');
var sinon = require('sinon');
var assert = chai.assert;
const q = require('q');
const DatabaseClientRewire = rewire('../DatabaseClient'),
  { default: DatabaseClient } = DatabaseClientRewire;

var refMock = {
  set: sinon.stub().returns(q.resolve({}))
};
var collectionMock = {
  doc: sinon.stub().returns(refMock)
};
var firestoreMock = {
  settings: sinon.stub().returns(0),
  collection: sinon.stub().returns(collectionMock)
};
var firebaseMock = {
  firestore: sinon.stub().returns(firestoreMock),
  credential: { cert: sinon.stub().returns(0) },
  initializeApp: sinon.stub().returns(0)
};
let configFile = {
    "fileStorePath": "/tmp/fileStore",
  databaseURL: 'https://test-nrp-data-base.firebaseio.com' // fake
};

describe('DatabaseClient', function() {
  beforeEach(function() {
    refMock.set.reset();
    DatabaseClientRewire.__set__('firebase', firebaseMock);
  });


  it('The constructor should call initializeFirebase depending on the app configuration', function() {
    var initializeFirebaseStub = sinon
      .stub(DatabaseClient.prototype, 'initializeFirebase')
      .returns(0);
    var al = new DatabaseClient(configFile);
    assert(al.initializeFirebase.called);
    initializeFirebaseStub.reset();
    DatabaseClient.prototype.initializeFirebase.restore();
  });

  it('submitToFirebase should create a submission entry', function(done) {
    var al = new DatabaseClient(configFile);
    al.submitToFirebase({})
      .then(function() {
        expect(refMock.set.callCount).to.equal(1);
        done();
      })
      .catch(function(error) {
        done(error);
      });
  });
});
