/**
 * miLight-adapter.js - miLight adapter.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */

'use strict';

let Adapter, Device, Property;
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
  Device = gwa.Device;
  Property = gwa.Property;
}

function levelToCmd(level) {
  if (level == 0) {
    return {
      code : 0x41,
      param : 0x00,
    };
  }
  else if (level == 100) {
    return {
      code : 0x42,
      param : 0x00,
    };
  }
  else {
    return {
      code : 0x4E,
      param : Math.round(level / 4),
    };
  }
}

function cssToCmd(cssColor) {
  const color = Color(cssColor);
  switch(color.rgbNumber()) {
  case 0x000000: {//Black
    return null;
  }
  case 0x000080: {//Navy
    return {
      code : 0x40,
      param : 0x00,
    };
  }
  case 0x0000FF: {//Blue
    return {
      code : 0x40,
      param : 0xBA,
    };
  }
  case 0x008000: {//Green
    return {
      code : 0x40,
      param : 0x7A,
    };
  }
  case 0x00FF00: {//Lime
    return {
      code : 0x40,
      param : 0x54,
    };
  }
  case 0x00FFFF: {//Aqua
    return {
      code : 0x40,
      param : 0x85,
    };
  }
  case 0x800080: {//Purple
    return {
      code : 0x40,
      param : 0xD9,
    };
  }
  case 0xFF0000: {//Red
    return {
      code : 0x40,
      param : 0xFF,
    };
  }
  case 0xFFA500: {//Orange
    return {
      code : 0x40,
      param : 0x1E,
    };
  }
  case 0xFFFF00: {//Yellow
    return {
      code : 0x40,
      param : 0x3B,
    };
  }
  case 0xFFFFFF: {//White
    return {
      code : 0xC2,
      param : 0x00,
    };
  }
  default: {
    return null;
  }
  }
}

function on() {
  return {
    name: 'on',
    value: false,
    metadata: {
      label: 'On/Off',
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
      label: 'Color',
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
      label: 'Brightness',
      type: 'number',
      '@type': 'BrightnessProperty',
      unit: 'percent',
    },
  };
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
/*const brightCodes = [0x00, 0x02, 0x03, 0x04, 0x05, 0x08, 0x09, 0x0A, 0x0B, 0x0D,
                     0x0E, 0x0F, 0x10, 0x12, 0x13, 0x14, 0x15, 0x17, 0x18, 0x19];*/

class miLightProperty extends Property {
  constructor(device, name, descr, value) {
    super(device, name, descr);
    this.setCachedValue(value);
    //this.device.notifyPropertyChanged(this);
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
    const changed = this.value !== value; 
    return new Promise((resolve) => {
      this.setCachedValue(value);
      resolve(this.value);
      if (changed) {
        this.device.notifyPropertyChanged(this);
      }
    });
  }
}

class miLightDevice extends Device {
  constructor(adapter, id, template) {
    super(adapter, id);
    this.name = template.name;
    this.type = template.type;
    this['@context'] = template['@context'];
    this['@type'] = template['@type'];
    for (const prop of template.properties) {
      this.properties.set(prop.name, 
                          new miLightProperty(this, prop.name, prop.metadata, prop.value));
    }
  }

  notifyPropertyChanged(property) {
    super.notifyPropertyChanged(property);
    let cmd = null;
    console.log('miLightAdapter:', property);
    switch (property.name) {
      case 'color': {
        cmd =  Object.assign(cmd, cssToCmd(this.properties.get('color').value));
        break;
      }
      case 'on': {
        //if (this.properties.has('level'))
        cmd.param = 0x00;
        cmd.code = (this.properties.get('on').value == false) ? 0x41 : 0x42;
        console.log('miLightAdapter:', 'setting cmd', cmd);
        break;
      }
      case 'level': {
        cmd =  Object. assign(cmd, levelToCmd(this.properties.get('level').value));
        break;
      }
      default:
        console.warn('Unknown property:', property.name);
        break;
    }
    if (!cmd) {
      return;
    }
    this.adapter.sendProperties(this.deviceId, cmd);
  }
}

class miLightAdapter extends Adapter {
  constructor(adapterManager, manifestName) {
    super(adapterManager, 'miLightAdapter', manifestName);
    this.bridgeIp = '192.168.0.66';
    adapterManager.addAdapter(this);
    this.addDevice('miLight-adapter-0', dimmableColorLight);
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
  addDevice(deviceId, deviceDescription) {
    return new Promise((resolve, reject) => {
      if (deviceId in this.devices) {
        reject(`Device: ${deviceId} already exists.`);
      } else {
        const device = new miLightDevice(this, deviceId, deviceDescription);
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
    const uri = `http://${this.bridgeIp}`;
    const port = 80;
    const dgram = require('dgram');
    const message = [cmd.code, cmd.param, 0x55];
    const client = dgram.createSocket('udp4');
    
    // Skip the next update after a sendProperty
    if (this.devices[deviceId]) {
      this.devices[deviceId].recentlyUpdated = true;
    }
    console.log('miLightAdapter:', uri, port, message)
    client.send(message, port, uri, (err) => {
      client.close();
    });
  }
}

function loadmiLightAdapter(addonManager, manifest, _errorCallback) {
  new miLightAdapter(addonManager, manifest.name);
}

module.exports = loadmiLightAdapter;
