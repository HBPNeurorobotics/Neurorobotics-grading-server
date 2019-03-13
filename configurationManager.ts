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

// path.resolve is required because the current directory is recreated regularly by puppet
// and when that happens fs.readFileSync fails if using a relative path

const path = require('path'),
  fs = require('fs'),
  q = require('q');

let CONFIG_FILE;
const configuration = q.defer();
let configFile;

const initialize = () => {
  CONFIG_FILE = path.resolve('./config.json');
};


const resolveReplaceEnvVariables = (str: string) => {
  return str.replace(/\$([A-Za-z]*)/g, (_m, v) => process.env[v] || '');
};

const loadConfigFile = () => {
  try {
    configFile = JSON.parse(fs.readFileSync(CONFIG_FILE));
    configuration.notify(configFile);
    return configFile;
  } catch (err) {
    if (err.code === 'ENOENT' && !configFile) {
      console.log(
        'config.json not found! Please create a config.json from config.json.sample and run again!'
      );
    }
    console.error(err);
  }
};

const onConfigChange = curr => {
  if (curr !== 'change') {
    console.log(
      'config.json has been deleted! Continuing with the previously-parsed version.'
    );
    return;
  }
  console.log('Received change for configuration file. Reparsing.');
  loadConfigFile();
};

// watcher for config file to re-parse if the file has been edited
const watch = () => {
  fs.watch(CONFIG_FILE, onConfigChange);
};

const getState = key => {
  return configFile.states && configFile.states[key];
};

const setState = (key, value) => {
  if (!configFile.states) configFile.states = {};
  configFile.states[key] = value;
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(configFile));
};

export default {
  watch,
  initialize,
  loadConfigFile,
  configuration: configuration.promise,
  getState,
  setState,
  resolveReplaceEnvVariables
};
