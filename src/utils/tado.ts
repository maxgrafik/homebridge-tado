import { TadoPlatform } from '../platform';
import { Ajax } from './ajax';

/**
 * tado° web client
 */

export class TadoClient {

    private ajax!: Ajax;

    private username: string = '';
    private password: string = '';
    public  homeId: string = '';

    private accessToken: string = '';
    private refreshToken: string = '';
    private expires: number = 0;

    constructor(
        private readonly platform: TadoPlatform
    ) {
        this.ajax = new Ajax();
    }

    setCredentials(username, password, homeId) {
        this.username = username;
        this.password = password;
        this.homeId   = homeId;
    }

    connect() {
        return new Promise((resolve, reject) => {

            let refresh = false;

            if (this.accessToken) {

                const leeway = 10000;
                const isTokenValid = (Date.now() + leeway) < this.expires;

                if (isTokenValid) {
                    resolve(true);
                    return;
                } else {
                    refresh = true;
                }
            }

            this.getAccessToken(refresh).then((response: any) => {

                this.accessToken = response.access_token;
                this.refreshToken = response.refresh_token;
                this.expires = Date.now() + (response.expires_in * 1000);

                if (this.homeId) {
                    resolve(true);
                } else {
                    this.getHomeId().then((response: any) => {
                        this.homeId = response;
                        resolve(true);
                    }).catch(error => {
                        reject(error);
                    });
                }
            }).catch((error) => {
                this.reset();
                reject(error);
            });
        });
    }

    getAccessToken(refresh) {
        return new Promise((resolve, reject) => {
            
            let credentials = {};

            if (refresh) {
                credentials = {
                    client_id     : 'tado-web-app',
                    grant_type    : 'refresh_token',
                    refresh_token : this.refreshToken,
                    scope         : 'home.user',
                    client_secret : 'wZaRN7rpjn3FoNyF5IFuxg9uMzYJcvOoQ8QWiIqS3hfk6gLhVlG57j5YNoZL2Rtc'
                };
            } else {
                credentials = {
                    client_id     : 'tado-web-app',
                    grant_type    : 'password',
                    username      : this.username,
                    password      : this.password,
                    scope         : 'home.user',
                    client_secret : 'wZaRN7rpjn3FoNyF5IFuxg9uMzYJcvOoQ8QWiIqS3hfk6gLhVlG57j5YNoZL2Rtc'
                };
            }

            this.ajax.post('https://auth.tado.com/oauth/token', credentials).then((response: any) => {

                if (this.platform.config.analytics === true) {
                    this.platform.log.debug('[Analytics] Login/Refresh: %s', JSON.stringify(response, null, 2));
                }

                const status = this.getErrors(response, 'access_token');
                if (status !== true) {
                    reject(status);
                } else {
                    resolve(response);
                }

            }).catch(error => {
                reject(error);
            });
        });
    }
    
    getHomeId() {
        return new Promise((resolve, reject) => {
            this.ajax.get('https://my.tado.com/api/v2/me', this.accessToken).then((response: any) => {

                if (this.platform.config.analytics === true) {
                    this.platform.log.debug('[Analytics] User Info: %s', JSON.stringify(response, null, 2));
                }

                const status = this.getErrors(response, 'homes');
                if (status !== true) {
                    reject(status);
                } else {
                    const homes = response.homes;
                    if (homes.length === 0) {
                        reject('No homes found');
                    } else if (homes.length === 1) {
                        resolve(homes[0].id.toString());
                    } else {
                        let listOfHomes = '';
                        for (const home of homes) {
                            listOfHomes += (listOfHomes ? ', ' : '') + '"' + home.name + '"' + ' (id: '+home.id+')';
                        }
                        reject('Found multiple homes: ' + listOfHomes + '. Please set Home ID in config.');
                    }
                }

            }).catch(error => {
                reject(error);
            });
        });
    }

    async getHome() {

        await this.connect().catch(error => {
            throw Error(error);
        });

        return new Promise((resolve, reject) => {
            this.ajax.get('https://my.tado.com/api/v2/homes/'+this.homeId, this.accessToken).then((response: any) => {

                if (this.platform.config.analytics === true) {
                    this.platform.log.debug('[Analytics] Home Info: %s', JSON.stringify(response, null, 2));
                }

                const status = this.getErrors(response, null);
                if (status !== true) {
                    reject(status);
                } else {
                    resolve(response);
                }

            }).catch(error => {
                reject(error);
            });
        });
    }

    async getZones() {

        await this.connect().catch(error => {
            throw Error(error);
        });

        return new Promise((resolve, reject) => {
            this.ajax.get('https://my.tado.com/api/v2/homes/'+this.homeId+'/zones', this.accessToken).then((response: any) => {

                if (this.platform.config.analytics === true) {
                    this.platform.log.debug('[Analytics] Zones: %s', JSON.stringify(response, null, 2));
                }

                const status = this.getErrors(response, null);
                if (status !== true) {
                    reject(status);
                } else {
                    resolve(response);
                }

            }).catch(error => {
                reject(error);
            });
        });
    }

    async getZoneState(zoneId) {

        await this.connect().catch(error => {
            throw Error(error);
        });

        return new Promise((resolve, reject) => {
            this.ajax.get('https://my.tado.com/api/v2/homes/'+this.homeId+'/zones/'+zoneId+'/state', this.accessToken).then((response: any) => {

                if (this.platform.config.analytics === true) {
                    this.platform.log.debug('[Analytics] Zone State: %s', JSON.stringify(response, null, 2));
                }

                const status = this.getErrors(response, null);
                if (status !== true) {
                    reject(status);
                } else {
                    resolve(response);
                }

            }).catch(error => {
                reject(error);
            });
        });
    }

    async getDevices() {
        
        await this.connect().catch(error => {
            throw Error(error);
        });

        return new Promise((resolve, reject) => {
            this.ajax.get('https://my.tado.com/api/v2/homes/'+this.homeId+'/devices', this.accessToken).then((response: any) => {

                if (this.platform.config.analytics === true) {
                    this.platform.log.debug('[Analytics] Devices: %s', JSON.stringify(response, null, 2));
                }

                const status = this.getErrors(response, null);
                if (status !== true) {
                    reject(status);
                } else {
                    resolve(response);
                }

            }).catch(error => {
                reject(error);
            });
        });
    }

    async setOverlay(zoneId, overlay) {
        
        await this.connect().catch(error => {
            throw Error(error);
        });

        return new Promise((resolve, reject) => {

            if (this.platform.config.analytics === true) {
                this.platform.log.debug('[Analytics] Setting Overlay: %s', JSON.stringify(overlay, null, 2));
            }

            this.ajax.put('https://my.tado.com/api/v2/homes/'+this.homeId+'/zones/'+zoneId+'/overlay', this.accessToken, overlay).then((response: any) => {

                if (this.platform.config.analytics === true) {
                    this.platform.log.debug('[Analytics] Set Overlay Response: %s', JSON.stringify(response, null, 2));
                }

                const status = this.getErrors(response, null);
                if (status !== true) {
                    reject(status);
                } else {
                    resolve(response);
                }

            }).catch(error => {
                reject(error);
            });
        });
    }

    async deleteOverlay(zoneId) {
        
        await this.connect().catch(error => {
            throw Error(error);
        });

        return new Promise((resolve, reject) => {

            if (this.platform.config.analytics === true) {
                this.platform.log.debug('[Analytics] Deleting Overlay...');
            }

            this.ajax.delete('https://my.tado.com/api/v2/homes/'+this.homeId+'/zones/'+zoneId+'/overlay', this.accessToken).then((response: any) => {

                // not sure whether we ever get a response here
                
                if (this.platform.config.analytics === true) {
                    this.platform.log.debug('[Analytics] Delete Overlay Response: %s', response);
                }

                resolve(response);

            }).catch(error => {
                reject(error);
            });
        });
    }

    getErrors(response, reqField) {
        if (!response) {
            return 'Response contains no data';
        }
        if (response.hasOwnProperty('errors')) {
            return response.errors[0].title;
        }
        if (response.hasOwnProperty('error_description')) {
            return response.error_description;
        }
        if (reqField && !response.hasOwnProperty(reqField)) {
            return 'No ' + reqField + ' found';
        }
        return true;
    }

    reset() {
        this.accessToken = '';
        this.refreshToken = '';
        this.expires = 0;
    }

}
