"use strict";

const { Ajax } = require("./ajax");

/**
 * tado° web client
 */

class TadoClient {

    constructor(log, config) {

        this.log = log;
        this.config = config;

        this.username = "";
        this.password = "";
        this.homeId = "";
        this.accessToken = "";
        this.refreshToken = "";
        this.expires = 0;

        this.ajax = new Ajax();
    }

    setCredentials(username, password, homeId) {
        this.username = username;
        this.password = password;
        this.homeId = homeId;
    }

    async connect() {

        let refresh = false;

        if (this.accessToken) {

            const leeway = 10000;
            const isTokenValid = (Date.now() + leeway) < this.expires;

            if (isTokenValid) {
                return;
            }

            refresh = true;
        }

        try {
            const response = await this.getAccessToken(refresh);

            this.accessToken = response.access_token;
            this.refreshToken = response.refresh_token;
            this.expires = Date.now() + (response.expires_in * 1000);

            if (!this.homeId) {
                this.homeId = await this.getHomeId();
            }

        } catch (error) {
            this.reset();
            throw error;
        }
    }

    async getAccessToken(refresh) {

        let credentials = {};

        if (refresh) {
            credentials = {
                client_id: "tado-web-app",
                grant_type: "refresh_token",
                refresh_token: this.refreshToken,
                scope: "home.user",
                client_secret: "wZaRN7rpjn3FoNyF5IFuxg9uMzYJcvOoQ8QWiIqS3hfk6gLhVlG57j5YNoZL2Rtc",
            };
        } else {
            credentials = {
                client_id: "tado-web-app",
                grant_type: "password",
                username: this.username,
                password: this.password,
                scope: "home.user",
                client_secret: "wZaRN7rpjn3FoNyF5IFuxg9uMzYJcvOoQ8QWiIqS3hfk6gLhVlG57j5YNoZL2Rtc",
            };
        }

        const response = await this.ajax.post("https://auth.tado.com/oauth/token", credentials);

        if (this.config.analytics === true) {
            this.log.debug("[Analytics] Login/Refresh: %s", JSON.stringify(response, null, 2));
        }

        this.getErrors(response, "access_token");

        return response;
    }

    async getHomeId() {

        const response = await this.ajax.get("https://my.tado.com/api/v2/me", this.accessToken);

        if (this.config.analytics === true) {
            this.log.debug("[Analytics] User Info: %s", JSON.stringify(response, null, 2));
        }

        this.getErrors(response, "homes");

        const homes = response.homes;

        if (homes.length === 1) {
            return homes[0].id.toString();
        }

        if (homes.length === 0) {
            throw new Error("No homes found");
        } else {
            let listOfHomes = "";
            for (const home of homes) {
                listOfHomes += (listOfHomes !== "" ? ", " : "") + "'" + home.name + "'" + " (id: " + home.id + ")";
            }
            throw new Error("Found multiple homes: " + listOfHomes + ". Please set Home ID in config.");
        }
    }

    async getHome() {

        await this.connect();

        const response = await this.ajax.get("https://my.tado.com/api/v2/homes/" + this.homeId, this.accessToken);

        if (this.config.analytics === true) {
            this.log.debug("[Analytics] Home Info: %s", JSON.stringify(response, null, 2));
        }

        this.getErrors(response, null);

        return response;
    }

    async getState() {

        await this.connect();

        const response = await this.ajax.get("https://my.tado.com/api/v2/homes/" + this.homeId + "/state", this.accessToken);

        if (this.config.analytics === true) {
            this.log.debug("[Analytics] Home State: %s", JSON.stringify(response, null, 2));
        }

        this.getErrors(response, null);

        return response;
    }

    async setState(atHome) {

        const homeState = {
            homePresence: (atHome === true ? "HOME" : "AWAY")
        };

        await this.connect();

        if (this.config.analytics === true) {
            this.log.debug("[Analytics] Setting Home State: %s", JSON.stringify(homeState, null, 2));
        }

        const response = await this.ajax.put("https://my.tado.com/api/v2/homes/" + this.homeId + "/presenceLock", this.accessToken, homeState);

        if (this.config.analytics === true) {
            this.log.debug("[Analytics] Set Home State Response: %s", JSON.stringify(response, null, 2));
        }

        return response;
    }

    async getZones() {

        await this.connect();

        const response = await this.ajax.get("https://my.tado.com/api/v2/homes/" + this.homeId + "/zones", this.accessToken);

        if (this.config.analytics === true) {
            this.log.debug("[Analytics] Zones: %s", JSON.stringify(response, null, 2));
        }

        this.getErrors(response, null);

        return response;
    }

    async getZoneStates() { // New API call: aggregated zone states

        await this.connect();

        const response = await this.ajax.get("https://my.tado.com/api/v2/homes/" + this.homeId + "/zoneStates", this.accessToken);

        if (this.config.analytics === true) {
            this.log.debug("[Analytics] Zone States: %s", JSON.stringify(response, null, 2));
        }

        this.getErrors(response, null);

        return response;
    }

    async getZoneState(zoneId) {

        await this.connect();

        const response = await this.ajax.get("https://my.tado.com/api/v2/homes/" + this.homeId + "/zones/" + zoneId + "/state", this.accessToken);

        if (this.config.analytics === true) {
            this.log.debug("[Analytics] Zone State: %s", JSON.stringify(response, null, 2));
        }

        this.getErrors(response, null);

        return response;
    }

    async getZoneDefaultOverlay(zoneId) {

        await this.connect();

        const response = await this.ajax.get("https://my.tado.com/api/v2/homes/" + this.homeId + "/zones/" + zoneId + "/defaultOverlay", this.accessToken);

        if (this.config.analytics === true) {
            this.log.debug("[Analytics] Zone Default Overlay: %s", JSON.stringify(response, null, 2));
        }

        this.getErrors(response, null);

        return response;
    }

    async getDevices() {

        await this.connect();

        const response = await this.ajax.get("https://my.tado.com/api/v2/homes/" + this.homeId + "/devices", this.accessToken);

        if (this.config.analytics === true) {
            this.log.debug("[Analytics] Devices: %s", JSON.stringify(response, null, 2));
        }

        this.getErrors(response, null);

        return response;
    }

    async setOverlay(zoneId, overlay) {

        await this.connect();

        if (this.config.analytics === true) {
            this.log.debug("[Analytics] Setting Overlay: %s", JSON.stringify(overlay, null, 2));
        }

        const response = await this.ajax.put("https://my.tado.com/api/v2/homes/" + this.homeId + "/zones/" + zoneId + "/overlay", this.accessToken, overlay);

        if (this.config.analytics === true) {
            this.log.debug("[Analytics] Set Overlay Response: %s", JSON.stringify(response, null, 2));
        }

        this.getErrors(response, null);

        return response;
    }

    async deleteOverlay(zoneId) {

        await this.connect();

        if (this.config.analytics === true) {
            this.log.debug("[Analytics] Deleting Overlay...");
        }

        const response = await this.ajax.delete("https://my.tado.com/api/v2/homes/" + this.homeId + "/zones/" + zoneId + "/overlay", this.accessToken);

        // not sure whether we ever get a response here
        if (this.config.analytics === true) {
            this.log.debug("[Analytics] Delete Overlay Response: %s", response);
        }

        return response;
    }

    getErrors(response, reqField) {
        if (Object.prototype.hasOwnProperty.call(response, "error")) {
            if (Object.prototype.hasOwnProperty.call(response, "data")) {
                this.log.debug("[Data] " + response.data);
            }
            throw new Error("[API] " + (response.error.message || response.error));
        }
        if (Object.prototype.hasOwnProperty.call(response, "errors")) {
            throw new Error("[API] " + response.errors[0].title);
        }
        if (Object.prototype.hasOwnProperty.call(response, "error_description")) {
            throw new Error("[API] " + response.error_description);
        }
        if (reqField && !Object.prototype.hasOwnProperty.call(response, reqField)) {
            throw new Error("[API] Response does not contain " + reqField);
        }
    }

    reset() {
        this.accessToken = "";
        this.refreshToken = "";
        this.expires = 0;
    }
}

exports.TadoClient = TadoClient;
