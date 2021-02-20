import { API, Logger, Service, PlatformAccessory, CharacteristicValue, CharacteristicSetCallback, CharacteristicGetCallback } from 'homebridge';
import { TadoPlatform } from '../platform';

/**
 * Thermostat Accessory
 * An instance of this class is created for each thermostat
 */
export class TadoThermostat {
    public readonly log: Logger;
    public readonly api: API;

    private thermostatService: Service;
    private batteryService: Service;

    private hasOverlay: boolean = false;
    private throttleOverlay!: NodeJS.Timeout;

    constructor(
        private readonly platform: TadoPlatform,
        public readonly accessory: PlatformAccessory
    ) {

        this.api = this.platform.api;
        this.log = this.platform.log;

        // set accessory information
        this.accessory.getService(this.platform.Service.AccessoryInformation)!
            .setCharacteristic(this.platform.Characteristic.Manufacturer, 'tado°')
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
            .on('get', this.getCurrentState.bind(this));

        this.thermostatService.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState)
            .on('get', this.getTargetState.bind(this))
            .on('set', this.setTargetState.bind(this));

        this.thermostatService.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
            .on('get', this.getCurrentTemperature.bind(this));

        this.thermostatService.getCharacteristic(this.platform.Characteristic.TargetTemperature)
            .on('get', this.getTargetTemperature.bind(this))
            .on('set', this.setTargetTemperature.bind(this));

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
            .on('get', this.getTemperatureDisplayUnits.bind(this))
            .on('set', this.setTemperatureDisplayUnits.bind(this));

        // optional characteristics for Thermostat Service
        this.thermostatService.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
            .on('get', this.getCurrentRelativeHumidity.bind(this));


        /**
         * Battery Service
         */

        this.batteryService = this.accessory.getService(this.platform.Service.BatteryService) || this.accessory.addService(this.platform.Service.BatteryService);

        // required characteristics for Battery Service
        this.batteryService.getCharacteristic(this.platform.Characteristic.BatteryLevel)
            .on('get', this.getBatteryLevel.bind(this));

        this.batteryService.getCharacteristic(this.platform.Characteristic.ChargingState)
            .on('get', this.getChargingState.bind(this));

        this.batteryService.getCharacteristic(this.platform.Characteristic.StatusLowBattery)
            .on('get', this.getStatusLowBattery.bind(this));

    }

    getCurrentState(callback: CharacteristicGetCallback) {
        callback(null, this.accessory.context.device.currentState);
    }

    getTargetState(callback: CharacteristicGetCallback) {
        callback(null, this.accessory.context.device.targetState);
    }

    setTargetState(value: CharacteristicValue, callback: CharacteristicSetCallback) {
        if (value !== this.accessory.context.device.targetState) {
            const overlay = this.createOverlay(value, null);
            this.setOverlay(overlay);
        }
        callback(null);
    }

    getCurrentTemperature(callback: CharacteristicGetCallback) {

        // getCurrentTemperature is triggered whenever opening the home app
        // we use this event to force an update for all thermostats

        this.platform.forceUpdate(null);

        callback(null, this.accessory.context.device.currentTemp);
    }

    getTargetTemperature(callback: CharacteristicGetCallback) {
        callback(null, this.accessory.context.device.targetTemp);
    }

    setTargetTemperature(value: CharacteristicValue, callback: CharacteristicSetCallback) {
        if (value !== this.accessory.context.device.targetTemp) {
            const overlay = this.createOverlay(1, value);
            this.setOverlay(overlay);
        }
        callback(null);
    }

    getTemperatureDisplayUnits(callback: CharacteristicGetCallback) {
        callback(null, this.accessory.context.device.displayUnits);
    }

    setTemperatureDisplayUnits(value: CharacteristicValue, callback: CharacteristicSetCallback) {
        callback(null);
        // Can we return a read-only error here? This does not work:
        //callback(this.api.hap.Status.READ_ONLY_CHARACTERISTIC);
    }

    getCurrentRelativeHumidity(callback: CharacteristicGetCallback) {
        callback(null, this.accessory.context.device.humidity);
    }

    getBatteryLevel(callback: CharacteristicGetCallback) {
        const batteryLevel = this.accessory.context.device.batteryState === 'NORMAL' ? 100 : 10;
        callback(null, batteryLevel);
    }

    getChargingState(callback: CharacteristicGetCallback) {
        callback(null, 2); // NOT_CHARGEABLE
    }

    getStatusLowBattery(callback: CharacteristicGetCallback) {
        const batteryState = this.accessory.context.device.batteryState === 'NORMAL' ? 0 : 1;
        callback(null, batteryState);
    }

    update(state: any) {

        this.hasOverlay = state.overlayType !== null;

        let powered = state.setting.power === 'ON';

        let currentState = state.activityDataPoints.heatingPower.percentage > 0 ? 1 : 0;
        let targetState = powered ? (this.hasOverlay ? 1 : 3) : 0;

        if (this.accessory.context.device.targetState !== targetState) {
            this.log.info('%s is %s', this.accessory.displayName, ['off', 'in Manual Mode', 'wtf?', 'in Automatic Mode'][targetState]);
        }

        let currentTemp = state.sensorDataPoints.insideTemperature.celsius;
        let targetTemp = powered ? (this.hasOverlay ? state.overlay.setting.temperature.celsius : state.setting.temperature.celsius) : this.accessory.context.device.targetTemp;

        currentTemp = (Math.round(currentTemp*10)/10);
        targetTemp = (Math.round(targetTemp*10)/10);

        let humidity = state.sensorDataPoints.humidity.percentage;

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

    updateBattery(state: any) {
        const batteryLevel = state === 'NORMAL' ? 100 : 10;
        const batteryState = state === 'NORMAL' ? 0 : 1;

        this.accessory.context.device.batteryState = state;

        this.api.updatePlatformAccessories([this.accessory]);

        // push updates to homekit
        this.batteryService.updateCharacteristic(this.platform.Characteristic.BatteryLevel, batteryLevel);
        this.batteryService.updateCharacteristic(this.platform.Characteristic.StatusLowBattery, batteryState);
    }

    createOverlay(state, temperature) {
        
        let terminationRule = {};

        switch(this.platform.config.overlayType) {
        case 'MANUAL':
            terminationRule = {
                typeSkillBasedApp: "MANUAL"
            }
            break;
        case 'TIMER':
            terminationRule = {
                typeSkillBasedApp: "TIMER",
                durationInSeconds: (<number> this.platform.config.overlayDuration || 60) * 60
            }
            break;
        case 'NEXT_TIME_BLOCK':
        default:
            terminationRule = {
                typeSkillBasedApp: "NEXT_TIME_BLOCK"
            }
        }


        let overlay: any;

        let targetState = state;
        let targetTemp  = temperature || this.accessory.context.device.targetTemp;
        let targetTempC;
        let targetTempF;

        if (this.accessory.context.device.displayUnits === 0) {
            targetTempF = Math.round(((targetTemp*1.8)+32)*10)/10;
            targetTempC = targetTemp;
        } else {
            targetTempF = Math.round((targetTemp*1.8)+32);
            targetTempC = Math.round(((targetTempF-32)/1.8)*10)/10;
        }

        if (targetState === 0) {
            // turn off
            overlay = {
                setting: {
                    type: "HEATING",
                    power: "OFF"
                },
                termination: terminationRule
            }

        } else if (targetState === 1) {
            // manual mode
            overlay = {
                setting: {
                    type: "HEATING",
                    power: "ON",
                    temperature: {
                        celsius: targetTempC,
                        fahrenheit: targetTempF
                    }
                },
                termination: terminationRule
            }

        } else {
            // ignore any other state and revert to auto mode
            targetState = 3;
            overlay = null;

        }

        return overlay;
    }

    setOverlay(overlay) {

        if (this.throttleOverlay) {
            clearTimeout(this.throttleOverlay);
        }

        this.throttleOverlay = setTimeout(() => {
            if (overlay) {
                this.log.info('Setting mode for %s...', this.accessory.displayName);
                this.platform.tadoClient.setOverlay(this.accessory.context.device.zoneId, overlay).then((response: any) => {
                    this.platform.forceUpdate(this.accessory.context.device.zoneId);
                }).catch(error => {
                    this.platform.forceUpdate(this.accessory.context.device.zoneId);
                    this.log.error('[API] %s', error);
                });
            } else if (this.hasOverlay) {
                this.log.info('Setting %s to Automatic Mode...', this.accessory.displayName);
                this.platform.tadoClient.deleteOverlay(this.accessory.context.device.zoneId).then((response: any) => {
                    this.platform.forceUpdate(this.accessory.context.device.zoneId);
                }).catch(error => {
                    this.platform.forceUpdate(this.accessory.context.device.zoneId);
                    this.log.error('[API] %s', error);
                });
            }
        }, 800);
    }

}
