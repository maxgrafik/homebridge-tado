"use strict";

const PLATFORM_NAME = "tado";
const PLUGIN_NAME = "homebridge-tado";

const { TadoThermostat } = require("./accessories/thermostat");
const { TadoClient } = require("./utils/tado");

class TadoPlatform {

    constructor(log, config, api) {

        this.log = log;
        this.config = config;
        this.api = api;

        this.Service = this.api.hap.Service;
        this.Characteristic = this.api.hap.Characteristic;

        this.accessories = [];

        if (!this.api || !this.config) {
            return;
        }

        if (!this.config.email || !this.config.password) {
            this.log.error("No email or password given. Service stopped.");
            return;
        }

        this.tadoZones = [];
        this.lastZoneUpdate = 0;
        this.lastBatteryUpdate = 0;
        this.lastError = 0;
        this.updateInterval = Math.max(15, (this.config.updateInterval || 300));

        this.tadoClient = new TadoClient(this.log, this.config);
        this.tadoClient.setCredentials(this.config.email, this.config.password, this.config.homeId);

        this.api.on("didFinishLaunching", () => {
            this.log.debug("Searching new thermostats...");
            this.discoverDevices();
        });
    }

    configureAccessory(accessory) {
        this.log.debug("Loading thermostat from cache: %s", accessory.displayName);
        this.accessories.push(accessory);
    }

    async discoverDevices() {

        let temperatureUnit = 0;
        let hasAutoAssist = false;

        // get home info and set temperatureUnit

        try {
            const response = await this.tadoClient.getHome();
            temperatureUnit = response.temperatureUnit === "CELSIUS" ? 0 : 1;
            hasAutoAssist = response.skills && response.skills.includes("AUTO_ASSIST");
        } catch (error) {
            this.log.error(error.message || error);
            this.log.error("Cannot continue setting up devices. Service stopped.");
            return;
        }

        // get zones and configure thermostats

        try {

            const thermostats = [];
            const zones = await this.tadoClient.getZones();

            for (const zone of zones) {

                // find thermostats
                if (zone.type === "HEATING") {

                    // find zone leader
                    let zoneLeader = 0;
                    zone.devices.some((device, index) => {
                        if (device.duties.includes("ZONE_LEADER")) {
                            zoneLeader = index;
                            return true;
                        }
                    });

                    thermostats.push({
                        UUID        : this.api.hap.uuid.generate(zone.devices[zoneLeader].serialNo),
                        displayName : zone.name,
                        device      : {
                            zoneId       : zone.id,
                            deviceType   : zone.devices[zoneLeader].deviceType,
                            serialNo     : zone.devices[zoneLeader].serialNo,
                            serialShort  : zone.devices[zoneLeader].shortSerialNo,
                            FwVersion    : zone.devices[zoneLeader].currentFwVersion,
                            currentState : 0,
                            targetState  : 0,
                            currentTemp  : 0,
                            targetTemp   : 5,
                            displayUnits : temperatureUnit,
                            humidity     : 0,
                            batteryState : zone.devices[zoneLeader].batteryState,
                        },
                    });
                }
            }

            // restore/register thermostat
            for (const thermostat of thermostats) {

                const cachedThermostat = this.accessories.find(accessory => accessory.UUID === thermostat.UUID);

                if (cachedThermostat) {
                    this.log.debug("Restoring thermostat: %s", cachedThermostat.displayName);
                    cachedThermostat.context.device = thermostat.device;
                    this.api.updatePlatformAccessories([cachedThermostat]);
                    this.tadoZones.push(new TadoThermostat(this, cachedThermostat));

                } else {
                    this.log.info("Adding new thermostat: %s", thermostat.displayName);
                    const newThermostat = new this.api.platformAccessory(thermostat.displayName, thermostat.UUID);
                    newThermostat.context.device = thermostat.device;
                    this.tadoZones.push(new TadoThermostat(this, newThermostat));
                    this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [newThermostat]);
                }
            }

            // find orphaned thermostats
            const orphanedThermostats = this.accessories.filter(accessory => {
                return !thermostats.find(thermostat => thermostat.UUID === accessory.UUID);
            });

            // remove orphaned thermostats
            if (orphanedThermostats.length > 0) {
                this.log.info("Removing orphaned thermostats...");
                this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, orphanedThermostats);
            }

        } catch (error) {
            this.log.error(error.message || error);
            this.log.error("Cannot continue setting up devices. Service stopped.");
            return;
        }

        // ready and running
        this.log.info("Ready");

        if (!this.config.homeId) {
            this.log.info("Home ID: %s", this.tadoClient.homeId);
        }

        this.log.debug("Auto Assist %s", hasAutoAssist ? "available" : "not available");

        this.runUpdateLoop();
    }

    async runUpdateLoop() {

        // tado° web client uses a 15s timer for zone state updates
        // so we consider the data is still fresh within this timeframe

        const timeSinceLastUpdate = (Date.now() - this.lastZoneUpdate) / 1000;

        if (timeSinceLastUpdate <= 15) {
            return;
        }


        // in case of previous errors, pause updates for 5 minutes

        const timeSinceLastError = (Date.now() - this.lastError) / 1000;

        if (timeSinceLastError <= 300) {
            return;
        }

        this.lastError = 0;


        // stop timer -> update -> rinse & repeat

        if (this.updateTimer) {
            clearInterval(this.updateTimer);
        }

        await this.update();

        this.updateTimer = setInterval(
            this.runUpdateLoop.bind(this),
            this.updateInterval*1000
        );
    }

    async update() {

        // zone update

        this.lastZoneUpdate = Date.now();

        try {
            this.log.debug("Updating zones");

            if (this.config.useNewAPI) {
                // new API call
                const response = await this.tadoClient.getZoneStates();
                for (const tadoZone of this.tadoZones) {
                    const zoneId = tadoZone.accessory.context.device.zoneId;
                    const state = response.zoneStates[zoneId];
                    if (state) {
                        tadoZone.updateState(state);
                    }
                }

            } else {
                // old API call(s)
                for (const tadoZone of this.tadoZones) {
                    await this.updateZone(tadoZone);
                }
            }

        } catch (error) {
            this.lastError = Date.now();
            this.log.error(error.message || error);
            return;
        }

        // battery update

        const needsBatteryUpdate = this.lastBatteryUpdate+(12*60*60*1000) < Date.now(); // twice a day is enough

        if (needsBatteryUpdate) {
            try {
                this.log.debug("Updating battery states");

                const devices = await this.tadoClient.getDevices();
                for (const device of devices) {
                    const tadoZone = this.tadoZones.find(zone => zone.accessory.context.device.serialNo === device.serialNo);
                    if (tadoZone) {
                        if (Object.prototype.hasOwnProperty.call(device, "batteryState")) {
                            tadoZone.updateBattery(device.batteryState);
                        }
                        if (Object.prototype.hasOwnProperty.call(device, "currentFwVersion")) {
                            tadoZone.updateAccessoryInfo(device.currentFwVersion);
                        }
                    }
                }

            } catch (error) {
                this.lastError = Date.now();
                this.log.error(error.message || error);
                return;
            }

            this.lastBatteryUpdate = Date.now();
        }
    }

    async updateZone(tadoZone) {

        const accessory  = tadoZone.accessory;
        const thermostat = accessory.context.device;

        await this.tadoClient.getZoneState(thermostat.zoneId).then((state) => {
            tadoZone.updateState(state);
        });
    }
}

exports.TadoPlatform = TadoPlatform;
