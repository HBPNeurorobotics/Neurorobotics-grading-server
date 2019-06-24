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

import EdxClient from './EdxClient';

const  q = require('q');
// mocked in tests
// tslint:disable-next-line: prefer-const
let firebase = require('firebase-admin');

export default class DatabaseClient {
  private db;
  private edxClient;

  constructor(private config) {
      this.initializeFirebase(config);
      this.edxClient = new EdxClient(config);
  }

  initializeFirebase(config) {
    const serviceAccount = require('./serviceAccount.json');
    firebase.initializeApp({
      credential: firebase.credential.cert(serviceAccount),
      databaseURL: config.databaseURL
    });
    this.db = firebase.firestore();
    this.db.settings({ timestampsInSnapshots: true });
  }


  async submitToFirebase(data) {
    const submissionsCollection = this.db.collection('submissions');
    // Add the submission entry in the Firestore database
    const doc = submissionsCollection.doc();
    return doc.set({
      ...data,
      date: new Date()
    });
  }

  async getEdxGradeIdentifiers(token) {
    if (!token) return q.reject('Missing token: the submission is rejected.');
    return this.db.collection('edx-grade-identifiers')
    .where('token', '==', token)
    .limit(1)
    .get()
    .then( querySnapshot => {
      let match;
      querySnapshot.forEach(doc => {
        match = doc;
      });
      if (!querySnapshot.empty) return match.data();
      else return q.reject({
        msg:
        'Your token is invalid. ' +
        'Please check that you made a copy from the correct edX exercise.',
        code: 404 
      });
    })
  }

  async createSubmissionEntry(data) {
    data.edx = await this.getEdxGradeIdentifiers(data.token);
    await this.submitToFirebase(data);
    return q.resolve('Successful submission to database');
  }


  async createEdxGradeInFirebase(data) {
    const edxGradesCollection = this.db.collection('edx-grade-identifiers');
    // Add the edx lis grade entry in the Firestore database
    const doc = edxGradesCollection.doc();
    return doc.set(data);
  }

  async createEdxGradeEntry(data) {
    await this.createEdxGradeInFirebase(data);
    return q.resolve('Successful creation of an edX grade entry in the database');
  }

  processFinalGradesBody(data, withUsers=false) {
    const gradingServerRepoUrl = 'https://github.com/HBPNeurorobotics/Neurorobotics-grading-server';
    const msg = `The body of the request has an invalid format. Check the API documentation at ${gradingServerRepoUrl}`;
    const exception = { msg: msg, body: data, detail: '' };
    if (!data.finalGrades) {
      const bodyKey = Object.keys(data)[0];
      if (bodyKey) {
      // This is a hack. 
      // The deserialization of the request body can fail on some requests in spite of 
      // the use of express.json() and express.urlencoded().
        try {
          data = JSON.parse(bodyKey);
        } catch(err) {
          exception.detail = 'JSON Parsing error';
        }
      }
      if (!data.finalGrades) {
        exception.detail = 'Missing field: finalGrades';
        throw(exception);
      }
    }
    const finalGrades = data.finalGrades;
    if (finalGrades && !withUsers) return finalGrades;
    if (finalGrades && withUsers && finalGrades.users) return finalGrades.users;
    exception.detail = 'Missing field: users';
    throw(exception);
  }

  appendFinalGradesFailureMessage(error) {
    if (!error.msg) error.msg = '';
    error.msg += ' Grading in edX will not be possible. Submission of final grades to NRP database failed.';
  }

  async setGrades(userGrades, usersRef, userId) {
    let userRef =  usersRef.doc(userId);
    let doc = await userRef.get();
    let userDoc = doc.data();
    if (!userDoc) return q.reject({ msg: `User ${userId} has no submission at all.` });
    try {
      Object.keys(userGrades).forEach(header => {
          const grades = userGrades[header];
          if (userDoc[header]) {
            Object.keys(grades).forEach(subheader => {
                const grade = Number(grades[subheader]);
                if (!userDoc[header][subheader]){ 
                  throw({ msg: `User ${userId} has no submission for ${subheader}.` });
                }
                userDoc[header][subheader].finalGrade = grade;
            });
          } else throw({ msg: `User ${userId} has no submission for ${header}.` });
      });
    } catch (error) {
      this.appendFinalGradesFailureMessage(error);
      return q.reject(error);
    }
    return userRef.update(userDoc);
  }

  async appendUserFinalGrades(userId, data) {
      let grades = {finalGrades: {users: {} }};
      try {
        grades.finalGrades.users[userId] = this.processFinalGradesBody(data);
      } catch(error) {
        return q.reject(error);
      }
      return await this.appendFinalGrades(grades);
  }

  async appendFinalGrades(data) {
      // Some request bodies fail to be deserialized in spite of express.json() and express.urlencoded()
      if (typeof data === 'string')
        data = JSON.parse(Object.keys(data)[0]);
      const usersRef = this.db.collection('users');
      let response = data;
      let submittedGrades;
      try {
        // Handles body format errors
        submittedGrades = this.processFinalGradesBody(data, true);
      } catch(error) {
        return q.reject(error);
      }
      let promises : Array<any> = [];
      try {
          Object.keys(submittedGrades).forEach(async (userId) => {
              const userGrades = submittedGrades[userId];
              // Populates the array promises with Firebase update requests
              promises.push(
                this.setGrades(userGrades, usersRef, userId).catch(err => q.reject(err))
              );
          });
      } catch (error) {
        this.appendFinalGradesFailureMessage(error);
        return q.reject(error);
      }
      return await q.all(promises).then(() => {
          response.msg = 'The grades have been successfully updated in NRP database.';
          return q.resolve(response);
      });
  }

  async submitUserGrades(userDoc, header, selectedUser=false) {
    const userId = userDoc['userInfo']['id'];
    let promises:Promise<any>[] = [];
    if (!userDoc[header]) {
      if (selectedUser) return q.reject(`User ${userId} has no submission for ${header}`);
      else return q.resolve(); // We ignore this user, as she/he didn't submit anything yet for 'header'
    }
    try {
      Object.keys(userDoc[header]).forEach(subheader => {
        const userSubheader = userDoc[header][subheader];
        const grade = userSubheader.finalGrade;
        if (!grade) throw(`User ${userId} has no final grade for ${header}/${subheader}.`);
        const edxIdentifiers = userSubheader.edx;
        if (!edxIdentifiers) throw(`User ${userId} has no edX identifiers for ${header}/${subheader}.`);
        promises.push(this.edxClient.ltiSendAndReplace(grade, edxIdentifiers.request));
      })
    } catch(error) {
      if (!error.msg) error.msg = '';
      error.msg += ' Submission to edX aborted.';
      return q.reject(error);
    }
    return await q.all(promises)
    .then(() => 
      q.resolve(`The grades of user ${userId} for ${header} have been successfully submitted to edX.`) 
    )
  }

  async submitUserGradesToEdx(userId, header) {
    header = decodeURIComponent(header);
    const userRef = this.db.collection('users').doc(userId);
    let doc = await userRef.get();
    let userDoc = doc.data();
    return await this.submitUserGrades(userDoc, header, true);
  }

  async submitGradesToEdx(header) {
    header = decodeURIComponent(header);
    const usersRef = this.db.collection('users');
    let users = await usersRef.get();
    let promises:Promise<any>[] = [];
    users.docs.forEach(user => {
       const userDoc = user.data();
       promises.push(this.submitUserGrades(userDoc, header));
    });
    return await q.all(promises)
    .then(() => 
      q.resolve(`The grades of all users for ${header} have been successfully submitted to edX.`) 
    )
  }
}
