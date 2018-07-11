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

function stateToLevel(state) {
  return Math.round(state.bri / 254 * 100);
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

class miLightProperty extends Property {
  constructor(device, name, propertyDescription) {
    super(device, name, propertyDescription);
    this.setCachedValue(propertyDescription.value);
    this.device.notifyPropertyChanged(this);
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
  return new Promise((resolve, reject) => {
    super.setValue(value).then((updatedValue) => {
      resolve(updatedValue);
      if (changed) {
        this.device.notifyPropertyChanged(this);
      }
    }).catch((err) => {
      reject(err);
      });
    });
  }
}

class miLightDevice extends Device {
  constructor(adapter, id, deviceDescription) {
    super(adapter, id);
    this.name = deviceDescription.name;
    this.type = deviceDescription.type;
    this['@type'] = deviceDescription['@type'];
    this.description = deviceDescription.description;
    for (const propertyName in deviceDescription.properties) {
      const propertyDescription = deviceDescription.properties[propertyName];
      const property = new miLightProperty(this, propertyName,
                                           propertyDescription);
      this.properties.set(propertyName, property);
    }
  }

  notifyPropertyChanged(property) {
    super.notifyPropertyChanged(property);
    let properties = null;
    switch (property.name) {
      case 'color': {
        properties = cssToState(this.properties.get('color').value);
        break;
      }
      case 'on': {
        properties = {};
        // We might be turning on after changing the color/level
        if (this.properties.has('color')) {
          properties = Object.assign(properties,
                                     cssToState(this.properties.get('color').value));
        }
        if (this.properties.has('level')) {
          properties = Object.assign(properties,
                                     levelToState(this.properties.get('level').value));
        }
        properties.on = this.properties.get('on').value;
        break;
      }
      case 'level': {
        properties = levelToState(this.properties.get('level').value);
        break;
      }
      default:
        console.warn('Unknown property:', property.name);
        return;
    }
    if (!properties) {
      return;
    }
    this.adapter.sendProperties(this.deviceId, properties);
  }
}

class miLightAdapter extends Adapter {
  constructor(addonManager, packageName) {
    this.bridgeIp = '192.168.0.66';
    super(addonManager, 'miLightAdapter', packageName);
    addonManager.addAdapter(this);
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
  
  sendProperties(deviceId, properties) {
    const uri = `http://${this.bridgeIp}`;

    // Skip the next update after a sendProperty
    if (this.devices[deviceId]) {
      this.devices[deviceId].recentlyUpdated = true;
    }

    return fetch(uri, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(properties),
    }).then((res) => {
      return res.text();
    }).catch((e) => {
      console.error(e);
    });
  }
}

function loadmiLightAdapter(addonManager, manifest, _errorCallback) {
  const adapter = new miLightAdapter(addonManager, manifest.name);
  const device = new miLightDevice(adapter, 'miLight Bulbs', dimmableColorLight);
  adapter.handleDeviceAdded(device);
}

module.exports = loadmiLightAdapter;
