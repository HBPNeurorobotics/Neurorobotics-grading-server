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

const  q = require('q');
const lti = require('ims-lti');

export default class EdxClient {
  constructor(private config) {
      this.config = config;
  }

  async ltiSendAndReplace(grade, request) {
    try {
        const options = {
            'consumer_key': this.config.ltiConsumerKey,
            'consumer_secret': this.config.ltiConsumerSecret,
            'service_url': request.body['lis_outcome_service_url'],
            'source_did': request.body['lis_result_sourcedid'],
        };
        let service = new lti.OutcomeService(options);
        return service.send_replace_result(Number(grade), (err, result) => {
            if (err) {
                console.log(err);
                throw(err);
            }
            if (!result) { 
            const msg = 'The update of the grade failed.';
                console.log(msg);
                throw(msg);
            }
            return result;
        });
    } catch(err) {
        return q.reject(err);
    };
  }
}
