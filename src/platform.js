/**
 * platform.js
 * homebridge-tado
 *
 * @copyright 2021 Hendrik Meinl
 */

"use strict";

const PLATFORM_NAME = "tado";
const PLUGIN_NAME = "homebridge-tado";

const { TadoThermostat } = require("./accessories/thermostat");
const { TadoClient } = require("./utils/tado");

class TadoPlatform {

    constructor(log, config, api) {

        if (!api || !config) {
            return;
        }

        this.log = log;
        this.config = config;
        this.api = api;

        this.accessories = new Map();
        this.discoveredCacheUUIDs = [];

        this.tadoZones = [];
        this.lastZoneUpdate = 0;
        this.lastBatteryUpdate = 0;
        this.lastError = 0;
        this.updateInterval = Math.max(15, (this.config.updateInterval || 300));

        this.tadoClient = new TadoClient(this.log, this.config, this.api);

        this.api.on("didFinishLaunching", () => {

            this.discoverDevices().then(() => {

                // clean up
                this.accessories.clear();
                this.discoveredCacheUUIDs = [];

                this.updateThermostats();

            }).catch((error) => {

                // clean up
                this.accessories.clear();
                this.discoveredCacheUUIDs = [];
                this.tadoZones = [];
                this.tadoClient = null;

                this.log.error(error.message || error);
                this.log.error("Cannot continue setting up thermostats");
                this.log.error("Plugin stopped");
            });
        });
    }

    configureAccessory(accessory) {
        this.accessories.set(accessory.UUID, accessory);
    }

    async discoverDevices() {

        this.log.info("Connecting to tado.com...");

        await this.tadoClient.connect();


        // Get home id

        if (!this.config.homeId) {
            await this.tadoClient.getHomeId();
        }


        // Get home info and set temperatureUnit

        const response = await this.tadoClient.getHome();

        const temperatureUnit = response.temperatureUnit === "CELSIUS" ? 0 : 1;
        const hasAutoAssist = response.skills && response.skills.includes("AUTO_ASSIST");


        // Get zones and configure thermostats

        const thermostats = [];
        const zones = await this.tadoClient.getZones();

        for (const zone of zones) {

            // Find thermostats

            if (zone.type === "HEATING") {

                // Find zone leader

                let zoneLeader = zone.devices.find((device) => device.duties.includes("ZONE_LEADER"));
                if (zoneLeader === undefined) {
                    if (zone.devices.length > 0) {
                        this.log.warn("No zone leader found for zone %s. This zone may not work as expected.", zone.name);
                        zoneLeader = zone.devices[0];
                    } else {
                        this.log.warn("No devices found in zone %s.", zone.name);
                        continue;
                    }
                }

                thermostats.push({
                    UUID        : this.api.hap.uuid.generate(zoneLeader.serialNo),
                    displayName : zone.name,
                    device      : {
                        zoneId       : zone.id,
                        deviceType   : zoneLeader.deviceType,
                        serialNo     : zoneLeader.serialNo,
                        serialShort  : zoneLeader.shortSerialNo,
                        FwVersion    : zoneLeader.currentFwVersion,
                        currentState : 0,
                        targetState  : 0,
                        currentTemp  : 0,
                        targetTemp   : 5,
                        displayUnits : temperatureUnit,
                        humidity     : 0,
                        batteryState : zoneLeader.batteryState,
                    },
                });
            }
        }


        // Restore/Register thermostat

        for (const thermostat of thermostats) {
            const existingThermostat = this.accessories.get(thermostat.UUID);
            if (existingThermostat) {
                this.log.debug("Restoring thermostat %s", existingThermostat.displayName);
                existingThermostat.context.device = thermostat.device;
                this.api.updatePlatformAccessories([existingThermostat]);
                this.tadoZones.push(new TadoThermostat(this, existingThermostat));
            } else {
                this.log.info("Creating thermostat %s", thermostat.displayName);
                const newThermostat = new this.api.platformAccessory(thermostat.displayName, thermostat.UUID);
                newThermostat.context.device = thermostat.device;
                this.tadoZones.push(new TadoThermostat(this, newThermostat));
                this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [newThermostat]);
            }
            this.discoveredCacheUUIDs.push(thermostat.UUID);
        }


        // Clean up

        for (const [uuid, accessory] of this.accessories) {
            if (!this.discoveredCacheUUIDs.includes(uuid)) {
                this.log.debug("Removing thermostat %s from cache", accessory.displayName);
                this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
            }
        }


        // Ready and running

        this.log.info("Ready");

        if (!this.config.homeId) {
            this.log.info("Your Home ID: %s", this.tadoClient.homeId);
        }

        this.log.info("Auto Assist is %s", hasAutoAssist ? "available" : "not available");
    }

    async updateThermostats() {

        // tado° web client uses a 15s timer for zone state updates
        // so we consider the data is still fresh within this timeframe

        const timeSinceLastUpdate = (Date.now() - this.lastZoneUpdate) / 1000;

        if (timeSinceLastUpdate <= 15) {
            return;
        }


        // In case of previous errors, pause updates for 5 minutes

        const timeSinceLastError = (Date.now() - this.lastError) / 1000;

        if (timeSinceLastError <= 300) {
            return;
        }

        this.lastError = 0;


        // Stop timer -> update -> rinse & repeat

        if (this.updateTimer) {
            clearInterval(this.updateTimer);
        }

        await this.update();

        this.updateTimer = setInterval(
            this.updateThermostats.bind(this),
            this.updateInterval*1000
        );
    }

    async update() {

        // Update all zones

        this.lastZoneUpdate = Date.now();

        try {
            const response = await this.tadoClient.getZoneStates();
            for (const tadoZone of this.tadoZones) {
                const zoneId = tadoZone.accessory.context.device.zoneId;
                const state = response.zoneStates[zoneId];
                if (state) {
                    tadoZone.updateState(state);
                }
            }
        } catch (error) {
            this.lastError = Date.now();
            this.log.error(error.message || error);
            return;
        }

        // Battery update

        const needsBatteryUpdate = this.lastBatteryUpdate+(12*60*60*1000) < Date.now(); // twice a day is enough

        if (needsBatteryUpdate) {
            try {
                const devices = await this.tadoClient.getDevices();
                for (const device of devices) {
                    const tadoZone = this.tadoZones.find(zone => zone.accessory.context.device.serialNo === device.serialNo);
                    if (tadoZone) {
                        if (Object.hasOwn(device, "batteryState")) {
                            tadoZone.updateBattery(device.batteryState);
                        }
                        if (Object.hasOwn(device, "currentFwVersion")) {
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

        // Update single zone

        const accessory  = tadoZone.accessory;
        const thermostat = accessory.context.device;

        await this.tadoClient.getZoneState(thermostat.zoneId).then((state) => {
            tadoZone.updateState(state);
        });
    }
}

exports.TadoPlatform = TadoPlatform;
