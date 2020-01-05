/**
 * miLight-adapter.js - miLight adapter.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */

'use strict';

let Adapter, Device, Property, Database;
try {
  Adapter = require('../adapter');
  Device = require('../device');
  Property = require('../property');
} catch (e) {
  if (e.code !== 'MODULE_NOT_FOUND') {
    throw e;
  }
  const gwa = require('gateway-addon');
  Adapter = gwa.Adapter;
  Database = gwa.Database;
  Device = gwa.Device;
  Property = gwa.Property;
}

function levelToCmd(level, zone) {
  if (level > 0) {
    return {
      code : 0x4E,
      param : Math.round(level / 4),
    };
  }
  else {
    return {};
  }
}

function cssToCmd(cssColor, zone) {
  var Color = require('color');
  var hh;
  var hsl;
  const color = Color(cssColor);
  if(color.rgbNumber() == 0xFFFFFF){
    return {
      code : whiteCodes[zone],
      param : 0x00,
    };
  }
  else{
    //use hue
    hsl = color.hsl().color[0];
    //console.warn('Hsl:', hsl);
    if(hsl > 271){
      hsl = 271;
    }
    hh = (hsl * 255) / 360;
    hh = Math.floor(192 - hh);
    //console.warn('Mi:', hh);
    return {
      code : 0x40,
      param : hh,
    };
  }
}

function on() {
  return {
    name: 'on',
    value: false,
    metadata: {
      title: 'On/Off',
      type: 'boolean',
      '@type': 'OnOffProperty',
    },
  };
}

function color() {
  return {
    name: 'color',
    value: '#ffffff',
    metadata: {
      title: 'Color',
      type: 'string',
      '@type': 'ColorProperty',
    },
  };
}

function brightness() {
  return {
    name: 'level',
    value: 0,
    metadata: {
      title: 'Brightness',
      type: 'number',
      '@type': 'BrightnessProperty',
      unit: 'percent',
    },
  };
}

function sleep(ms){
  return new Promise(resolve => {
      setTimeout(resolve,ms)
  })
}


const dimmableColorLight = {
  type: 'dimmableColorLight',
  '@context': 'https://iot.mozilla.org/schemas',
  '@type': ['OnOffSwitch', 'Light', 'ColorControl'],
  name: 'Dimmable Color Light',
  properties: [
    color(),
    brightness(),
    on(),
  ],
  actions: [],
  events: [],
};

const whiteCodes = [0xC2, 0xC5, 0xC7, 0xC9, 0xCB];
const onCodes = [0x42, 0x45, 0x47, 0x49, 0x4B];
const offCodes = [0x41, 0x46, 0x48, 0x4A, 0x4C];

class miLightProperty extends Property {
  constructor(device, name, descr, value) {
    super(device, name, descr);
    this.setCachedValue(value);
  }

  /**
   * Set the value of the property.
   *
   * @param {*} value The new value to set
   * @returns a promise which resolves to the updated value.
   *
   * @note it is possible that the updated value doesn't match
   * the value passed in.
   */
  setValue(value) {
    return new Promise((resolve) => {
      const changed = (this.value !== value);
      this.setCachedValue(value);
      resolve(this.value);
      if(this.name == 'on') {
        this.device.notifyStateChanged(this, 1/*changed*/);
      }
      else {
        this.device.notifyLvlColChanged(this);
      }
    });
  }
}

class miLightDevice extends Device {
  constructor(adapter, id, template, config) {
    super(adapter, id);
    this.name = template.name;
    this.type = template.type;
    this.config = config;
    this['@context'] = template['@context'];
    this['@type'] = template['@type'];
    for (const prop of template.properties) {
      this.properties.set(prop.name,
                          new miLightProperty(this, prop.name, prop.metadata, prop.value));
    }
  }

  notifyStateChanged(property, changed) {
    super.notifyPropertyChanged(property);
    if(('on' == property.name) && changed) {
       this.adapter.sendProperties(this.id,
                                   { code : (property.value == false) ? offCodes[this.config.zone] : onCodes[this.config.zone],
                                     param : 0x00,
       });
    }
  }

  notifyLvlColChanged(property) {
    super.notifyPropertyChanged(property);
    let cmd = {};
    let zone = this.config.zone;
    switch (property.name) {
      case 'color':
        cmd = Object.assign(cmd, cssToCmd(this.properties.get('color').value, zone));
        if((cmd.code == 0x40) && (zone != 0)){
            this.properties.get('on').setValue(true);
            sleep(100).then(() => { this.adapter.sendProperties(this.id, cmd) });
        }
        else{//white code, no need to send on cmd to identify zone
            this.adapter.sendProperties(this.id, cmd);
        }
        break;
      case 'level':
        if (0 == property.value) {
            this.properties.get('on').setValue(false);
        }
        else {
           cmd = Object.assign(cmd, levelToCmd(this.properties.get('level').value, zone));
           if (this.properties.get('on').value == false) {
               this.properties.get('on').setValue(true);
               sleep(100).then(() => { this.adapter.sendProperties(this.id, cmd) });
           }
           else{
            this.properties.get('on').setValue(true);
            sleep(80).then(() => { this.adapter.sendProperties(this.id, cmd) });
           }
        }
        break;
      default:
        console.warn('Unknown property:', property.name);
        break;
    }
  }
}

class miLightAdapter extends Adapter {
  constructor(adapterManager, manifest) {
    super(adapterManager, 'miLightAdapter', manifest.name);
    adapterManager.addAdapter(this);
    var i = 0;
    for (; i < manifest.moziot.config.bulbs.length; i++) {
      this.addDevice('miLight-adapter-' + i.toString(), dimmableColorLight, manifest.moziot.config.bulbs[i]);
    }
  }

  /**
   * Add a new device to the adapter.
   *
   * The important part is to call: `this.handleDeviceAdded(device)`
   *
   * @param {String} deviceId ID of the device to add.
   * @param {String} deviceDescription Description of the device to add.
   * @return {Promise} which resolves to the device added.
   */
  addDevice(deviceId, deviceDescription, deviceConfig) {
    return new Promise((resolve, reject) => {
      if (deviceId in this.devices) {
        reject(`Device: ${deviceId} already exists.`);
      } else {
        const device = new miLightDevice(this, deviceId, deviceDescription, deviceConfig);
        this.handleDeviceAdded(device);
        resolve(device);
      }
    });
  }

  /**
   * Remove a device from the adapter.
   *
   * The important part is to call: `this.handleDeviceRemoved(device)`
   *
   * @param {String} deviceId ID of the device to remove.
   * @return {Promise} which resolves to the device removed.
   */
  removeDevice(deviceId) {
    return new Promise((resolve, reject) => {
      const device = this.devices[deviceId];
      if (device) {
        this.handleDeviceRemoved(device);
        resolve(device);
      } else {
        reject(`Device: ${deviceId} not found.`);
      }
    });
  }

  /**
   * Start the pairing/discovery process.
   *
   * @param {Number} timeoutSeconds Number of seconds to run before timeout
   */
  startPairing(_timeoutSeconds) {
    console.log('miLightAdapter:', this.name,
                'id', this.id, 'pairing started');
    //this.addDevice('miLight-adapter', dimmableColorLight);
  }

  /**
   * Cancel the pairing/discovery process.
   */
  cancelPairing() {
    console.log('miLightAdapter:', this.name, 'id', this.id,
                'pairing cancelled');
  }

  /**
   * Unpair the provided the device from the adapter.
   *
   * @param {Object} device Device to unpair with
   */
  removeThing(device) {
    console.log('miLightAdapter:', this.name, 'id', this.id,
                'removeThing(', device.id, ') started');

    this.removeDevice(device.id).then(() => {
      console.log('miLightAdapter: device:', device.id, 'was unpaired.');
    }).catch((err) => {
      console.error('miLightAdapter: unpairing', device.id, 'failed');
      console.error(err);
    });
  }

  /**
   * Cancel unpairing process.
   *
   * @param {Object} device Device that is currently being paired
   */
  cancelRemoveThing(device) {
    console.log('miLightAdapter:', this.name, 'id', this.id,
                'cancelRemoveThing(', device.id, ')');
  }

  sendProperties(deviceId, cmd) {
    const dgram = require('dgram');
    const message = Buffer.from([cmd.code, cmd.param, 0x55]);
    const client = dgram.createSocket('udp4');

    // Skip the next update after a sendProperty
    if (this.devices[deviceId]) {
      this.devices[deviceId].recentlyUpdated = true;
    }
    client.send(message, this.devices[deviceId].config.bridgePort, this.devices[deviceId].config.bridgeIP, (err) => {
      client.close();
    });
  }
}

function loadmiLightAdapter(addonManager, manifest, _errorCallback) {
  let promise;
  if (Database) {
    const db = new Database(manifest.name);
    promise = db.open().then(() => {
      return db.loadConfig();
    }).then((config) => {
      let bulbsCfg = Object.assign({}, config.bulbs);
      const bulbs = [];
      for (const elem in bulbsCfg) {
        const bulb = Object.assign({}, bulbsCfg[elem]);
        bulbs.push(bulb);
      }
      if (bulbs.length > 0) {
        manifest.moziot.config.bulbs = bulbs;
        //console.log('miLightAdapter:', 'Saving config');
        return db.saveConfig({bulbs});
      }
    });
  }
  else {
    promise = Promise.resolve();
  }
  promise.then(() => {
                      console.log('miLightAdapter:', manifest.moziot.config.bulbs);
                      new miLightAdapter(addonManager, manifest)
                     });
}

module.exports = loadmiLightAdapter;
