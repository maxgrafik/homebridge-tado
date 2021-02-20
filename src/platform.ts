import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME, PLUGIN_VERSION } from './settings';
import { TadoThermostat } from './accessories/thermostat';
import { TadoClient } from './utils/tado';

/**
 * tado° platform
 */

export class TadoPlatform implements DynamicPlatformPlugin {
    public readonly Service: typeof Service = this.api.hap.Service;
    public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

    public readonly accessories: PlatformAccessory[] = [];

    public tadoClient: TadoClient = new TadoClient(this);
    private tadoZones: TadoThermostat[] = [];

    private lastZoneUpdate = 0;
    private lastBatteryUpdate = 0;

    private updateTimer!: NodeJS.Timeout;

    constructor(
        public readonly log: Logger,
        public readonly config: PlatformConfig,
        public readonly api: API,
    ) {

        if (!this.api || !this.config) {
            return;
        }

        if (!this.config.email || !this.config.password) {
            this.log.error('No email or password given. Service stopped.');
            return;
        }

        this.tadoClient.setCredentials(this.config.email, this.config.password, this.config.homeId);

        this.api.on('didFinishLaunching', () => {
            this.log.debug('Searching new thermostats...');
            this.discoverDevices();
        });
    }

    configureAccessory(accessory: PlatformAccessory) {
        this.log.debug('Loading thermostat from cache: %s', accessory.displayName);
        this.accessories.push(accessory);
    }

    async discoverDevices() {

        let temperatureUnit = 0;
        let hasAutoAssist = false;

        // get home info and set temperatureUnit
        await this.tadoClient.getHome().then((response: any) => {
            temperatureUnit = response.temperatureUnit === 'CELSIUS' ? 0 : 1;
            hasAutoAssist = response.skills && response.skills.includes('AUTO_ASSIST');
        }).catch(error => {
            this.log.error('[API] %s', error);
        });

        this.tadoClient.getZones().then((zones: any) => {
            
            const thermostats: any[] = [];

            // find thermostats (zone.type === 'HEATING')
            zones.forEach((zone: any) => {

                if (zone.type === 'HEATING') {
                    
                    // find zone leader
                    let zoneLeader = 0;
                    zone.devices.some((device, index) => {
                        if (device.duties.includes('ZONE_LEADER')) {
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
                            targetTemp   : 0,
                            displayUnits : temperatureUnit,
                            humidity     : 0,
                            batteryState : zone.devices[zoneLeader].batteryState,
                        }
                    });
                }
            });

            // restore/register thermostat
            for (const thermostat of thermostats) {
                
                const existingThermostat = this.accessories.find(accessory => accessory.UUID === thermostat.UUID);

                if (existingThermostat) {
                    this.log.debug('Restoring existing thermostat from cache: %s', existingThermostat.displayName);
                    existingThermostat.context.device = thermostat.device;
                    this.api.updatePlatformAccessories([existingThermostat]);
                    this.tadoZones.push(new TadoThermostat(this, existingThermostat));

                } else {
                    this.log.info('Adding new thermostat: %s', thermostat.displayName);
                    const accessory = new this.api.platformAccessory(thermostat.displayName, thermostat.UUID);
                    accessory.context.device = thermostat.device;
                    this.tadoZones.push(new TadoThermostat(this, accessory));
                    this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
                }
            }

            // remove unused thermostats
            const unusedThermostats = this.accessories.filter(accessory => {
                return !thermostats.find(thermostat => thermostat.UUID === accessory.UUID);
            });
            if (unusedThermostats.length > 0) {
                this.log.info('Removing unused thermostats from cache...');
                this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, unusedThermostats);
            }

            // ready and running
            this.log.debug('Home ID: %s', this.tadoClient.homeId);
            this.log.debug('Auto Assist %s', hasAutoAssist ? 'available' : 'not available');
            this.log.debug('Version: %s', PLUGIN_VERSION);
            this.log.info('Ready');

            // initial update
            this.forceUpdate(null);

        }).catch(error => {
            this.log.error('[API] %s', error);
        });
    }

    async updateDevices(zoneId) {

        this.lastZoneUpdate = Date.now();

        const needsBatteryUpdate = this.lastBatteryUpdate+(12*60*60*1000) < Date.now(); // twice a day is enough

        let devices: any[] = [];

        if (needsBatteryUpdate) {
            devices = <any[]> await this.tadoClient.getDevices().catch(error => {
                this.log.error('[API] %s', error);
            });
            this.lastBatteryUpdate = Date.now();
        }

        this.tadoZones.forEach(async (tadoZone: TadoThermostat) => {

            const accessory  = tadoZone.accessory;
            const thermostat = accessory.context.device;

            if (needsBatteryUpdate && devices && devices.length) {
                const device = devices.find(d => d.serialNo === thermostat.serialNo);
                if (device && Object.prototype.hasOwnProperty.call(device, 'batteryState')) {
                    this.log.debug('Daily battery update for %s: %s', accessory.displayName, device.batteryState);
                    tadoZone.updateBattery(device.batteryState);
                }
            }

            if (zoneId === null || (zoneId === thermostat.zoneId)) {
                await this.tadoClient.getZoneState(thermostat.zoneId).then((state: any) => {
                    tadoZone.update(state);
                }).catch(error => {
                    this.log.error('[API] %s', error);
                });
            }
        });
    }

    async forceUpdate(zoneId) {

        const timeSinceLastUpdate = (Date.now() - this.lastZoneUpdate) / 1000;

        // tado° web client uses a 15s timer for zone state updates
        // so we consider the data is still fresh within this timeframe
        // except for when a zoneId is given (caused by setOverlay)
        // in which case we MUST update this particular zone immediately

        if (zoneId === null && timeSinceLastUpdate <= 15) {
            return;
        }

        if (this.updateTimer) {
            clearInterval(this.updateTimer);
        }

        await this.updateDevices(zoneId);

        // set update interval
        const updateInterval = Math.max(15, (<number> this.config.updateInterval || 300));

        this.updateTimer = setInterval(() => {
            this.updateDevices(null);
        }, updateInterval*1000);

    }

}
