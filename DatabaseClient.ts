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
    console.log(data);
    return doc.set(data);
  }

  async createEdxGradeEntry(data) {
    await this.createEdxGradeInFirebase(data);
    return q.resolve('Successful creation of an edX grade entry in the database');
  }

  async appendUserFinalGrades(userId, data) {
    const userRef = this.db.collection('users').doc(userId);
    let doc = await userRef.get();
    let userDoc = doc.data();
    let response = data;
    let error;
    const submittedGrades = data.finalGrades;
    Object.keys(submittedGrades).forEach(header => {
      const grades =  submittedGrades[header];
      let docSubheaders = userDoc[header];
      Object.keys(grades).forEach(subheader => {
        const grade = grades[subheader];
        if (docSubheaders[subheader]){ 
          docSubheaders[subheader].finalGrade = grade;
        } else { 
          error = `User ${userId} has no submission for ${subheader}. Grading in edX will not be possible.`;
        }
      })
    })
    if (error) return q.reject(error);
    await userRef.update(userDoc);
    response.msg = `The grades of user ${userId} have been successfully updated.`
    return q.resolve(response);
  }

  async appendFinalGrades(data) {
    const usersRef = this.db.collection('users');
    let response = data;
    const submittedGrades = data.finalGrades.users;
    try {
      Object.keys(submittedGrades).forEach(async userId => {
        const userGrades = submittedGrades[userId];
        let userRef = usersRef.doc(userId);
        let doc = await userRef.get();
        let userDoc = doc.data();
        if (!userDoc) throw({ msg: `User ${userId} has no submission at all.`});
        Object.keys(userGrades).forEach(header => {
          const grades = userGrades[header];
          if (userDoc[header]){
            Object.keys(grades).forEach(async subheader => {
              const grade = grades[subheader];
              if (userDoc[header][subheader]) { 
                userDoc[header][subheader].finalGrade = grade;
                await userRef.update(userDoc);
            } else throw({ msg: `User ${userId} has no submission for ${subheader}.` });
            })
          } else throw({ msg: `User ${userId} has no submission for ${header}.` });
        })
      })
    } catch(error) {
      if (!error.msg) error.msg = '';
      error.msg += ' Grading in edX will not be possible.';
      return q.reject(error);
    }
    response.msg = `The grades have been successfully updated.`
    return q.resolve(response);
  }

  async submitUserGradesToEdx(userId, header) {
    header = decodeURIComponent(header);
    const userRef = this.db.collection('users').doc(userId);
    let doc = await userRef.get();
    let userDoc = doc.data();
    let promises:Promise<any>[] = [];
    if (!userDoc[header]) return q.reject(`User ${userId} has no submission for ${header}`);
    try {
      Object.keys(userDoc[header]).forEach(async subheader => {
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
      q.resolve(`The grades of users ${userId} for ${header} have been successfully submitted to edX.`) 
    )
  }
}
