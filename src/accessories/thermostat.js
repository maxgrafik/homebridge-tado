"use strict";

/**
 * Thermostat Accessory
 * An instance of this class is created for each thermostat
 */

class TadoThermostat {

    constructor(platform, accessory) {

        this.platform = platform;
        this.accessory = accessory;

        this.api = this.platform.api;
        this.log = this.platform.log;

        this.hasOverlay = false;

        // set accessory information
        this.accessory.getService(this.platform.Service.AccessoryInformation)
            .setCharacteristic(this.platform.Characteristic.Manufacturer, "tado°")
            .setCharacteristic(this.platform.Characteristic.Model, accessory.context.device.deviceType)
            .setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.device.serialShort)
            .setCharacteristic(this.platform.Characteristic.FirmwareRevision, accessory.context.device.FwVersion);

        /**
         * Thermostat Service
         */

        this.thermostatService = this.accessory.getService(this.platform.Service.Thermostat) || this.accessory.addService(this.platform.Service.Thermostat);

        // set the service name, this is what is displayed as the default name on the Home app
        this.thermostatService.setCharacteristic(this.platform.Characteristic.Name, this.accessory.displayName);

        // hide cooling option from target state
        // works fine with Apple's Home app, but not with Eve or Homebridge UI
        this.thermostatService.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState).setProps({
            minValue: 0,
            maxValue: 3,
            validValues: [0, 1, 3],
        });

        // set temperature range (celsius)
        this.thermostatService.getCharacteristic(this.platform.Characteristic.TargetTemperature).setProps({
            minValue: 5,
            maxValue: 25,
            minStep: 0.1,
        });

        // required characteristics for Thermostat Service
        this.thermostatService.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState)
            .on("get", this.getCurrentState.bind(this));

        this.thermostatService.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState)
            .on("get", this.getTargetState.bind(this))
            .on("set", this.setTargetState.bind(this));

        this.thermostatService.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
            .on("get", this.getCurrentTemperature.bind(this));

        this.thermostatService.getCharacteristic(this.platform.Characteristic.TargetTemperature)
            .on("get", this.getTargetTemperature.bind(this))
            .on("set", this.setTargetTemperature.bind(this));

        /**
         * NOTE
         * TemperatureDisplayUnits is meant to control the units used on a physical thermostat display
         * HomeKit is ALWAYS celsius. The conversion between °C and °F is done by HomeKit depending on
         * the settings on the iPhone.
         * We read temperatureUnit from tado° on start and set this accordingly, but changing this value
         * has no effect. Unfortunately we also can not hide this characteristic using Perms.HIDDEN
         * since HomeKit will complain about this device not being compatible then :P
         */

        this.thermostatService.getCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits)
            .on("get", this.getTemperatureDisplayUnits.bind(this))
            .on("set", this.setTemperatureDisplayUnits.bind(this));


        // optional characteristics for Thermostat Service
        this.thermostatService.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
            .on("get", this.getCurrentRelativeHumidity.bind(this));

        /**
         * Battery Service
         */

        this.batteryService = this.accessory.getService(this.platform.Service.Battery) || this.accessory.addService(this.platform.Service.Battery);

        // required characteristics for Battery Service
        this.batteryService.getCharacteristic(this.platform.Characteristic.StatusLowBattery)
            .on("get", this.getStatusLowBattery.bind(this));

        // optional characteristics for Battery Service
        this.batteryService.getCharacteristic(this.platform.Characteristic.BatteryLevel)
            .on("get", this.getBatteryLevel.bind(this));

        // this.batteryService.getCharacteristic(this.platform.Characteristic.ChargingState)
        //    .on("get", this.getChargingState.bind(this));

    }

    getCurrentState(callback) {
        callback(null, this.accessory.context.device.currentState);
    }

    getTargetState(callback) {
        callback(null, this.accessory.context.device.targetState);
    }

    setTargetState(value, callback) {
        if (value !== this.accessory.context.device.targetState) {
            this.setOverlay(value, null);
        }
        callback(null);
    }

    getCurrentTemperature(callback) {
        // getCurrentTemperature is triggered whenever opening the home app
        // we use this event to force an update for all thermostats
        this.platform.runUpdateLoop();
        callback(null, this.accessory.context.device.currentTemp);
    }

    getTargetTemperature(callback) {
        callback(null, this.accessory.context.device.targetTemp);
    }

    setTargetTemperature(value, callback) {
        if (value !== this.accessory.context.device.targetTemp) {
            this.setOverlay(1, value);
        }
        callback(null);
    }

    getTemperatureDisplayUnits(callback) {
        callback(null, this.accessory.context.device.displayUnits);
    }

    setTemperatureDisplayUnits(value, callback) {
        callback(null);
    }

    getCurrentRelativeHumidity(callback) {
        callback(null, this.accessory.context.device.humidity);
    }

    getBatteryLevel(callback) {
        const batteryLevel = this.accessory.context.device.batteryState === "NORMAL" ? 100 : 10;
        callback(null, batteryLevel);
    }

    //getChargingState(callback) {
    //    callback(null, 2); // NOT_CHARGEABLE
    //}

    getStatusLowBattery(callback) {
        const batteryState = this.accessory.context.device.batteryState === "NORMAL" ? 0 : 1;
        callback(null, batteryState);
    }

    updateState(state) {

        this.hasOverlay = state.overlayType !== null;

        const powered = state.setting.power === "ON";

        const currentState = state.activityDataPoints.heatingPower.percentage > 0 ? 1 : 0;
        const targetState = powered ? (this.hasOverlay ? 1 : 3) : 0;

        if (this.accessory.context.device.targetState !== targetState) {
            this.log.info("%s is %s", this.accessory.displayName, ["off", "in Manual Mode", "... wtf?", "in Automatic Mode"][targetState]);
        }

        let currentTemp = state.sensorDataPoints.insideTemperature.celsius;
        let targetTemp = powered ? (this.hasOverlay ? state.overlay.setting.temperature.celsius : state.setting.temperature.celsius) : this.accessory.context.device.targetTemp;

        currentTemp = (Math.round(currentTemp * 10) / 10);
        targetTemp = (Math.round(targetTemp * 10) / 10);

        const humidity = state.sensorDataPoints.humidity.percentage;

        this.accessory.context.device.currentState = currentState;
        this.accessory.context.device.targetState = targetState;
        this.accessory.context.device.currentTemp = currentTemp;
        this.accessory.context.device.targetTemp = targetTemp;
        this.accessory.context.device.humidity = humidity;
        this.api.updatePlatformAccessories([this.accessory]);

        // push updates to homekit
        this.thermostatService.updateCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState, currentState);
        this.thermostatService.updateCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState, targetState);
        this.thermostatService.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, currentTemp);
        this.thermostatService.updateCharacteristic(this.platform.Characteristic.TargetTemperature, targetTemp);
        this.thermostatService.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, humidity);
        this.thermostatService.updateCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits, this.accessory.context.device.displayUnits);
    }

    updateBattery(state) {

        // skip unnecessary updates
        if (state === this.accessory.context.device.batteryState) {
            return;
        }

        const batteryLevel = state === "NORMAL" ? 100 : 10;
        const batteryState = state === "NORMAL" ? 0 : 1;

        this.accessory.context.device.batteryState = state;

        this.api.updatePlatformAccessories([this.accessory]);

        // push updates to homekit
        this.batteryService.updateCharacteristic(this.platform.Characteristic.BatteryLevel, batteryLevel);
        this.batteryService.updateCharacteristic(this.platform.Characteristic.StatusLowBattery, batteryState);
    }

    updateAccessoryInfo(fwVersion) {

        // skip unnecessary updates
        if (fwVersion === this.accessory.context.device.FwVersion) {
            return;
        }

        this.accessory.context.device.FwVersion = fwVersion;

        this.api.updatePlatformAccessories([this.accessory]);

        // push updates to homekit
        this.accessory.getService(this.platform.Service.AccessoryInformation)
            .updateCharacteristic(this.platform.Characteristic.FirmwareRevision, fwVersion);
    }

    setOverlay(state, temperature) {

        if (this.throttleOverlay) {
            clearTimeout(this.throttleOverlay);
        }

        this.throttleOverlay = setTimeout(() => {

            if (state === 3 && this.hasOverlay) {
                this.log.info("Setting %s to Automatic Mode...", this.accessory.displayName);
                try {
                    this.platform.tadoClient.deleteOverlay(this.accessory.context.device.zoneId).then(() => {
                        this.platform.updateZone(this);
                    });
                } catch (error) {
                    this.platform.lastError = Date.now();
                    this.log.error(error.message || error);
                }

            } else if (state < 2) {
                this.log.info("Setting mode for %s...", this.accessory.displayName);
                try {
                    this.platform.tadoClient.getZoneDefaultOverlay(this.accessory.context.device.zoneId).then((defaultOverlay) => {
                        const overlay = this.createOverlay(defaultOverlay, state, temperature);
                        this.platform.tadoClient.setOverlay(this.accessory.context.device.zoneId, overlay).then(() => {
                            this.platform.updateZone(this);
                        });
                    });
                } catch (error) {
                    this.platform.lastError = Date.now();
                    this.log.error(error.message || error);
                }

            } else if (state === 2) {
                // ignore Characteristic.TargetHeatingCoolingState.COOL
                this.thermostatService.updateCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState, this.accessory.context.device.targetState);
            }

        }, 800);
    }

    createOverlay(defaultOverlay, state, temperature) {

        let terminationCondition = {};

        switch (defaultOverlay.terminationCondition.type) {
        case "TIMER":
            terminationCondition = {
                typeSkillBasedApp: "TIMER",
                durationInSeconds: defaultOverlay.terminationCondition.durationInSeconds,
            };
            break;
        case "MANUAL":
            terminationCondition = {
                typeSkillBasedApp: "MANUAL",
            };
            break;
        default:
            terminationCondition = {
                typeSkillBasedApp: "NEXT_TIME_BLOCK",
            };
        }

        let overlay = null;

        const targetTemp = temperature || this.accessory.context.device.targetTemp;

        let targetTempC;
        let targetTempF;

        if (this.accessory.context.device.displayUnits === 0) {
            targetTempF = Math.round(((targetTemp * 1.8) + 32) * 10) / 10;
            targetTempC = targetTemp;
        } else {
            targetTempF = Math.round((targetTemp * 1.8) + 32);
            targetTempC = Math.round(((targetTempF - 32) / 1.8) * 10) / 10;
        }

        if (state === 0) { // turn off
            overlay = {
                type: "MANUAL",
                setting: {
                    type: "HEATING",
                    power: "OFF",
                },
                termination: terminationCondition,
            };

        } else if (state === 1) { // manual mode
            overlay = {
                type: "MANUAL",
                setting: {
                    type: "HEATING",
                    power: "ON",
                    temperature: {
                        celsius: targetTempC,
                        fahrenheit: targetTempF,
                    },
                },
                termination: terminationCondition,
            };
        }
        return overlay;
    }
}

exports.TadoThermostat = TadoThermostat;
