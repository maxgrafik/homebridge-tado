/**
 * thermostat.js
 * homebridge-tado
 *
 * @copyright 2021 Hendrik Meinl
 */

"use strict";

/**
 * Thermostat Accessory
 * An instance of this class is created for each thermostat
 */
class TadoThermostat {

    constructor(platform, accessory) {

        this.platform = platform;
        this.accessory = accessory;

        this.log = platform.log;
        this.api = platform.api;

        this.Service = platform.api.hap.Service;
        this.Characteristic = platform.api.hap.Characteristic;

        this.hasOverlay = false;


        // Accessory information

        this.accessory.getService(this.Service.AccessoryInformation)
            .setCharacteristic(this.Characteristic.Manufacturer, "tado GmbH")
            .setCharacteristic(this.Characteristic.Model, accessory.context.device.deviceType)
            .setCharacteristic(this.Characteristic.SerialNumber, accessory.context.device.serialShort)
            .setCharacteristic(this.Characteristic.FirmwareRevision, accessory.context.device.FwVersion);


        // Thermostat

        this.thermostatService = this.accessory.getService(this.Service.Thermostat) || this.accessory.addService(this.Service.Thermostat);

        this.thermostatService.setCharacteristic(this.Characteristic.Name, this.accessory.displayName);


        // Required characteristics

        this.thermostatService.getCharacteristic(this.Characteristic.CurrentHeatingCoolingState)
            .onGet(this.getCurrentState.bind(this));

        this.thermostatService.getCharacteristic(this.Characteristic.TargetHeatingCoolingState)
            .onGet(this.getTargetState.bind(this))
            .onSet(this.setTargetState.bind(this));

        // Hide cooling option from target state
        // Works fine with Apple's Home app, but not with Eve or Homebridge UI
        this.thermostatService.getCharacteristic(this.Characteristic.TargetHeatingCoolingState).setProps({
            // minValue: 0,
            // maxValue: 3,
            validValues: [0, 1, 3],
        });

        this.thermostatService.getCharacteristic(this.Characteristic.CurrentTemperature)
            .onGet(this.getCurrentTemperature.bind(this));

        this.thermostatService.getCharacteristic(this.Characteristic.TargetTemperature)
            .onGet(this.getTargetTemperature.bind(this))
            .onSet(this.setTargetTemperature.bind(this));

        // Set temperature range (Celsius)
        this.thermostatService.getCharacteristic(this.Characteristic.TargetTemperature).setProps({
            minValue: 5,
            maxValue: 25,
            minStep: 0.5,
        });

        /**
         * NOTE
         * TemperatureDisplayUnits is meant to control the units used on a physical thermostat display
         * HomeKit is ALWAYS celsius. The conversion between °C and °F is done by HomeKit depending on
         * the settings on the iPhone.
         * We read temperatureUnit from tado° on start and set this accordingly, but changing this value
         * has no effect. Unfortunately we also can not hide this characteristic using Perms.HIDDEN
         * since HomeKit will complain about this device not being compatible then :P
         */

        this.thermostatService.getCharacteristic(this.Characteristic.TemperatureDisplayUnits)
            .onGet(this.getTemperatureDisplayUnits.bind(this))
            .onSet(this.setTemperatureDisplayUnits.bind(this));


        // Optional characteristics

        this.thermostatService.getCharacteristic(this.Characteristic.CurrentRelativeHumidity)
            .onGet(this.getCurrentRelativeHumidity.bind(this));


        // Battery

        this.batteryService = this.accessory.getService(this.Service.Battery) || this.accessory.addService(this.Service.Battery);

        // Required characteristics
        this.batteryService.getCharacteristic(this.Characteristic.StatusLowBattery)
            .onGet(this.getStatusLowBattery.bind(this));

        // Optional characteristics
        this.batteryService.getCharacteristic(this.Characteristic.BatteryLevel)
            .onGet(this.getBatteryLevel.bind(this));
    }

    getCurrentState() {
        return this.accessory.context.device.currentState;
    }

    getTargetState() {
        return this.accessory.context.device.targetState;
    }

    setTargetState(value) {
        if (value !== this.accessory.context.device.targetState) {
            this.setOverlay(value, null);
        }
    }

    getCurrentTemperature() {
        // getCurrentTemperature is triggered whenever opening the home app
        // We use this event to force an update for all thermostats
        this.platform.updateThermostats();
        return this.accessory.context.device.currentTemp;
    }

    getTargetTemperature() {
        return this.accessory.context.device.targetTemp;
    }

    setTargetTemperature(value) {
        if (value !== this.accessory.context.device.targetTemp) {
            this.setOverlay(1, value);
        }
    }

    getTemperatureDisplayUnits() {
        return this.accessory.context.device.displayUnits;
    }

    setTemperatureDisplayUnits() {
        // Not possible. See above.
    }

    getCurrentRelativeHumidity() {
        return this.accessory.context.device.humidity;
    }

    getBatteryLevel() {
        const batteryLevel = this.accessory.context.device.batteryState === "NORMAL" ? 100 : 10;
        return batteryLevel;
    }

    getStatusLowBattery() {
        const batteryState = this.accessory.context.device.batteryState === "NORMAL" ? 0 : 1;
        return batteryState;
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

        // Push updates to homekit
        this.thermostatService.updateCharacteristic(this.Characteristic.CurrentHeatingCoolingState, currentState);
        this.thermostatService.updateCharacteristic(this.Characteristic.TargetHeatingCoolingState, targetState);
        this.thermostatService.updateCharacteristic(this.Characteristic.CurrentTemperature, currentTemp);
        this.thermostatService.updateCharacteristic(this.Characteristic.TargetTemperature, targetTemp);
        this.thermostatService.updateCharacteristic(this.Characteristic.CurrentRelativeHumidity, humidity);
        this.thermostatService.updateCharacteristic(this.Characteristic.TemperatureDisplayUnits, this.accessory.context.device.displayUnits);
    }

    updateBattery(state) {

        // Skip unnecessary updates
        if (state === this.accessory.context.device.batteryState) {
            return;
        }

        const batteryLevel = state === "NORMAL" ? 100 : 10;
        const batteryState = state === "NORMAL" ? 0 : 1;

        this.accessory.context.device.batteryState = state;

        this.api.updatePlatformAccessories([this.accessory]);

        // Push updates to homekit
        this.batteryService.updateCharacteristic(this.Characteristic.BatteryLevel, batteryLevel);
        this.batteryService.updateCharacteristic(this.Characteristic.StatusLowBattery, batteryState);
    }

    updateAccessoryInfo(fwVersion) {

        // Skip unnecessary updates
        if (fwVersion === this.accessory.context.device.FwVersion) {
            return;
        }

        this.accessory.context.device.FwVersion = fwVersion;

        this.api.updatePlatformAccessories([this.accessory]);

        // Push updates to homekit
        this.accessory.getService(this.Service.AccessoryInformation)
            .updateCharacteristic(this.Characteristic.FirmwareRevision, fwVersion);
    }

    setOverlay(state, temperature) {

        if (this.throttleOverlay) {
            clearTimeout(this.throttleOverlay);
        }

        this.throttleOverlay = setTimeout(() => {

            if (state === 3 && this.hasOverlay) {

                this.log.info("Setting %s to Automatic Mode...", this.accessory.displayName);

                this.platform.tadoClient.deleteOverlay(this.accessory.context.device.zoneId).then(() => {
                    this.platform.updateZone(this);
                }).catch((error) => {
                    this.platform.lastError = Date.now();
                    this.log.error(error.message || error);
                });

            } else if (state < 2) {

                this.log.info("Setting mode for %s...", this.accessory.displayName);

                this.platform.tadoClient.getZoneDefaultOverlay(this.accessory.context.device.zoneId).then((defaultOverlay) => {
                    const overlay = this.createOverlay(defaultOverlay, state, temperature);
                    this.platform.tadoClient.setOverlay(this.accessory.context.device.zoneId, overlay).then(() => {
                        this.platform.updateZone(this);
                    });
                }).catch((error) => {
                    this.platform.lastError = Date.now();
                    this.log.error(error.message || error);
                });

            } else if (state === 2) {
                // Ignore Characteristic.TargetHeatingCoolingState.COOL
                this.thermostatService.updateCharacteristic(this.Characteristic.TargetHeatingCoolingState, this.accessory.context.device.targetState);
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

        if (state === 0) { // Turn off
            overlay = {
                type: "MANUAL",
                setting: {
                    type: "HEATING",
                    power: "OFF",
                },
                termination: terminationCondition,
            };

        } else if (state === 1) { // Manual mode
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
