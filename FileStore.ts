'use strict';

const fs = require('fs'),
  q = require('q'),
  _ = require('lodash'),
  stringify = q.denodeify(require('csv-stringify')),
  path = require('path');
  const fsPromises = fs.promises;

export default class FileStore {
  private root?;

  constructor(private config) {
    if (config) {
      this.root = config.fileStorePath;
    }
  }

  async processSubmission(data, folderPath) {
    const logContent = await stringify([
      [new Date().toUTCString(), data.userInfo.displayName, data.submissionInfo]
    ]);
    await fsPromises.appendFile(path.join(folderPath, 'submissions.log'), logContent);
    await fsPromises.writeFile(path.join(folderPath, data.fileName), data.fileContent);
    return q.resolve("Successful submission to filestore");
  }

  async store(data) {
    let id = data.userInfo.id;
    let userFolderPath = path.join(this.root, id);
    return await fsPromises.access(userFolderPath, fs.constants.F_OK)
      .then(
        () => this.processSubmission(data, userFolderPath)
      )
      .catch(
        async () =>  {
          await fsPromises.mkdir(userFolderPath, { recursive: true });
          return await this.processSubmission(data, userFolderPath);
        }
    );
  }
}
