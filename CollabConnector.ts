/**---LICENSE-BEGIN - DO NOT CHANGE OR MOVE THIS HEADER
 * This file is part of the Neurorobotics Platform software
 * Copyright (C) 2014,2015,2016,2017 Human Brain Project
 * https://www.humanbrainproject.eu
 *
 * The Human Brain Project is a European Commission funded project
 * in the frame of the Horizon2020 FET Flagship plan.
 * http://ec.europa.eu/programmes/horizon2020/en/h2020-section/fet-flagships
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
 * ---LICENSE-END**/
'use strict';

const q = require('q'),
  _ = require('lodash'),
  path = require('path');

// mocked in the tests
// tslint:disable-next-line: prefer-const
let request = require('request-promise');

// wraps the collab connection
export default class CollabConnector {
  static get REQUEST_TIMEOUT() {
    return 30 * 1000;
  } // ms

  static get COLLAB_API_URL() {
    return 'https://services.humanbrainproject.eu/storage/v1/api';
  }

  static get instance() {
    return this._instance;
  }

  private static _instance = new CollabConnector();

  private _getMemoizedCollabs?;

  private _getMemoizedCollab?;

  handleError(err) {
    console.error(`[Collab error] ${err}`);
    const errType = Object.prototype.toString.call(err).slice(8, -1);

    if (errType === 'Object' && err.statusCode) {
      if (
        err.statusCode === 403 ||
        (err.statusCode === 401 &&
          (err.message.indexOf('OpenId response: token is not valid') >= 0 ||
            err.message.indexOf('invalid_token') >= 0))
      )
        return q.reject({
          code: 477,
          msg:
            'https://services.humanbrainproject.eu/oidc/authorize?prompt=login&response_type=token'
        });
    } else if (errType === 'String') {
      err = `[Collab error] ${err}`;
    }
    return q.reject(err);
  }

  executeRequest(options, token) {
    _.extend(options, {
      resolveWithFullResponse: true,
      timeout: CollabConnector.REQUEST_TIMEOUT,
      headers: { Authorization: 'Bearer ' + token }
    });

    return request(options)
      .then(res => {
        if (res.statusCode < 200 || res.statusCode >= 300)
          throw 'Status code: ' + res.statusCode;
        if (options.encoding === null)
          return { headers: res.headers, body: res.body };
        return res.body;
      })
      .catch(this.handleError);
  }

  post(url, data, token, jsonType = false) {
    const operation = () =>
      this.executeRequest(
        {
          method: 'POST',
          uri: url,
          body: data,
          json: !!jsonType
        },
        token
      );

    return operation().catch(e => {
      if (e.message && e.message === 'Error: ESOCKETTIMEDOUT')
        return operation();
      throw e;
    });
  }

  get(url, token) {
    return this.executeRequest(
      {
        method: 'GET',
        uri: url
      },
      token
    );
  }

  delete(url, token) {
    return this.executeRequest(
      {
        method: 'DELETE',
        uri: url
      },
      token
    );
  }
  getCollabEntity(token, collabId) {
    if (!this._getMemoizedCollabs)
      this._getMemoizedCollabs = _.memoize(
        this.getEntity,
        (token, collabId) => collabId
      );

    return this._getMemoizedCollabs(token, collabId);
  }

  getEntity(token, collabId, ...entityPath) {
    if (!collabId) return q.reject('No collab id specified');

    const fullpath = encodeURIComponent(
      path.join('/', collabId + '', entityPath.join('/'))
    );
    const COLLAB_STORAGE_URL = `${CollabConnector.COLLAB_API_URL}/entity/?path=${fullpath}`;
    return this.get(COLLAB_STORAGE_URL, token).then(res => JSON.parse(res));
  }

  projectFolders(token, project) {
    return this.jsonApi(token, 'project', project, 'children').then(res =>
      res.results.map(f => ({
        uuid: f.uuid,
        name: f.name,
        parent: f.parent
      }))
    );
  }

  createFile(token, parent, name, contentType) {
    const COLLAB_FILE_URL = `${CollabConnector.COLLAB_API_URL}/file/`;

    return this.post(
      COLLAB_FILE_URL,
      {
        name,
        parent,
        content_type: contentType
      },
      token,
      true
    );
  }

  deleteEntity(token, folder, entityUuid, type = 'file') {
    const COLLAB_FILE_URL = `${CollabConnector.COLLAB_API_URL}/${type}/${entityUuid}/`;
    return this.delete(COLLAB_FILE_URL, token);
  }

  createFolder(token, parent, name) {
    const COLLAB_FILE_URL = `${CollabConnector.COLLAB_API_URL}/folder/`;

    return this.post(
      COLLAB_FILE_URL,
      {
        name,
        parent
      },
      token,
      true
    );
  }

  uploadContent(token, entityUuid, content) {
    const COLLAB_FILE_URL = `${CollabConnector.COLLAB_API_URL}/file/${entityUuid}/content/upload/`;

    return this.post(COLLAB_FILE_URL, content, token).then(() => ({
      uuid: entityUuid
    }));
  }

  folderContent(token, folder) {
    return this.jsonApi(token, 'folder', folder, 'children').then(res =>
      res.results.map(f => ({
        uuid: f.uuid,
        name: f.name,
        parent: f.parent,
        contentType: f.content_type,
        type: f.entity_type,
        modifiedOn: f.modified_on
      }))
    );
  }

  entityContent(token, entityUuid) {
    const COLLAB_ENTITY_URL = `${CollabConnector.COLLAB_API_URL}/file/${entityUuid}/content/`;

    return this.executeRequest(
      {
        method: 'GET',
        uri: COLLAB_ENTITY_URL,
        encoding: null
      },
      token
    );
  }

  jsonApi(token, entityType, entityUuid, requestType) {
    return this.api(token, entityType, entityUuid, requestType).then(res =>
      JSON.parse(res)
    );
  }

  api(token, entityType, entityUuid, requestType) {
    const COLLAB_ENTITY_URL = `${CollabConnector.COLLAB_API_URL}/${entityType}/${entityUuid}/${requestType}/`;

    return this.get(COLLAB_ENTITY_URL, token);
  }
  getContextIdCollab(token, contextId) {
    if (!this._getMemoizedCollab) {
      this._getMemoizedCollab = _.memoize((token, contextId) => {
        const COLLAB_URL = `https://services.humanbrainproject.eu/collab/v0/collab/context/${contextId}/`;
        return this.get(COLLAB_URL, token)
          .then(res => JSON.parse(res))
          .then(({ collab: { id } }) => id);
      }, (token, contextId) => token + contextId);
    }

    return this._getMemoizedCollab(token, contextId);
  }
}
