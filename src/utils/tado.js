/**
 * tado.js
 * homebridge-tado
 *
 * @copyright 2021 Hendrik Meinl
 */

"use strict";

/**
 * tado° web client
 */
class TadoClient {

    constructor(log, config) {

        this.log = log;
        this.config = config;

        this.username = config.email;
        this.password = config.password;
        this.homeId = config.homeId;

        this.accessToken = "";
        this.refreshToken = "";
        this.expires = 0;
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

        const response = await this.httpLogin("https://auth.tado.com/oauth/token", credentials);

        if (this.config.analytics === true) {
            this.log.debug("[Analytics] Login/Refresh: %s", JSON.stringify(response, null, 2));
        }

        if (!Object.hasOwn(response, "access_token")) {
            throw new Error("[API] Response does not contain access token");
        }

        return response;
    }

    async getHomeId() {

        const response = await this.httpGet("https://my.tado.com/api/v2/me");

        if (this.config.analytics === true) {
            this.log.debug("[Analytics] User Info: %s", JSON.stringify(response, null, 2));
        }

        if (!Object.hasOwn(response, "homes")) {
            throw new Error("[API] Response does not contain list of homes");
        }

        const homes = response.homes;

        if (homes.length === 1) {
            return `${homes[0].id}`;
        }

        if (homes.length === 0) {
            throw new Error("No homes found");
        } else {
            const homesList = homes.map((home) => `${home.name} (ID: ${home.id})`).join(", ");
            throw new Error(`Found multiple homes: ${homesList}. Please set Home ID in config.`);
        }
    }

    async getHome() {

        await this.connect();

        const response = await this.httpGet("https://my.tado.com/api/v2/homes/" + this.homeId);

        if (this.config.analytics === true) {
            this.log.debug("[Analytics] Home Info: %s", JSON.stringify(response, null, 2));
        }

        return response;
    }

    async getState() {

        await this.connect();

        const response = await this.httpGet("https://my.tado.com/api/v2/homes/" + this.homeId + "/state");

        if (this.config.analytics === true) {
            this.log.debug("[Analytics] Home State: %s", JSON.stringify(response, null, 2));
        }

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

        const response = await this.httpPut("https://my.tado.com/api/v2/homes/" + this.homeId + "/presenceLock", homeState);

        if (this.config.analytics === true) {
            this.log.debug("[Analytics] Set Home State Response: %s", JSON.stringify(response, null, 2));
        }

        return response;
    }

    async getZones() {

        await this.connect();

        const response = await this.httpGet("https://my.tado.com/api/v2/homes/" + this.homeId + "/zones");

        if (this.config.analytics === true) {
            this.log.debug("[Analytics] Zones: %s", JSON.stringify(response, null, 2));
        }

        return response;
    }

    async getZoneStates() { // New API call: aggregated zone states

        await this.connect();

        const response = await this.httpGet("https://my.tado.com/api/v2/homes/" + this.homeId + "/zoneStates");

        if (this.config.analytics === true) {
            this.log.debug("[Analytics] Zone States: %s", JSON.stringify(response, null, 2));
        }

        return response;
    }

    async getZoneState(zoneId) {

        await this.connect();

        const response = await this.httpGet("https://my.tado.com/api/v2/homes/" + this.homeId + "/zones/" + zoneId + "/state");

        if (this.config.analytics === true) {
            this.log.debug("[Analytics] Zone State: %s", JSON.stringify(response, null, 2));
        }

        return response;
    }

    async getZoneDefaultOverlay(zoneId) {

        await this.connect();

        const response = await this.httpGet("https://my.tado.com/api/v2/homes/" + this.homeId + "/zones/" + zoneId + "/defaultOverlay");

        if (this.config.analytics === true) {
            this.log.debug("[Analytics] Zone Default Overlay: %s", JSON.stringify(response, null, 2));
        }

        return response;
    }

    async getDevices() {

        await this.connect();

        const response = await this.httpGet("https://my.tado.com/api/v2/homes/" + this.homeId + "/devices");

        if (this.config.analytics === true) {
            this.log.debug("[Analytics] Devices: %s", JSON.stringify(response, null, 2));
        }

        return response;
    }

    async setOverlay(zoneId, overlay) {

        await this.connect();

        if (this.config.analytics === true) {
            this.log.debug("[Analytics] Setting Overlay: %s", JSON.stringify(overlay, null, 2));
        }

        const response = await this.httpPut("https://my.tado.com/api/v2/homes/" + this.homeId + "/zones/" + zoneId + "/overlay", overlay);

        if (this.config.analytics === true) {
            this.log.debug("[Analytics] Set Overlay Response: %s", JSON.stringify(response, null, 2));
        }

        return response;
    }

    async deleteOverlay(zoneId) {

        await this.connect();

        if (this.config.analytics === true) {
            this.log.debug("[Analytics] Deleting Overlay...");
        }

        // We never get a response for DELETE .../overlay
        await this.httpDelete("https://my.tado.com/api/v2/homes/" + this.homeId + "/zones/" + zoneId + "/overlay");

        // if (this.config.analytics === true) {
        //     this.log.debug("[Analytics] Delete Overlay Response: %s", response);
        // }

        // So just return true
        return true;
    }

    async httpLogin(url, credentials) {

        const headers = new Headers();
        headers.append("Content-Type", "application/x-www-form-urlencoded");

        const options = {
            method: "POST",
            headers: headers,
            body: this.urlencodeObject(credentials),
        };

        const response = await fetch(url, options);

        if (!response.ok) {
            const error = await this.getErrorDescription(response);
            throw new Error(`[API] ${error}`);
        }

        return await response.json();
    }

    async httpGet(url) {

        const headers = new Headers();
        headers.append("Authorization", "Bearer " + this.accessToken);

        const options = {
            method: "GET",
            headers: headers,
        };

        const response = await fetch(url, options);

        if (!response.ok) {
            const error = await this.getErrorDescription(response);
            throw new Error(`[API] ${error}`);
        }

        return await response.json();
    }

    async httpPut(url, data) {

        const headers = new Headers();
        headers.append("Content-Type", "application/json; charset=utf-8");
        headers.append("Authorization", "Bearer " + this.accessToken);

        const options = {
            method: "PUT",
            headers: headers,
            body: JSON.stringify(data),
        };

        const response = await fetch(url, options);

        if (!response.ok) {
            const error = await this.getErrorDescription(response);
            throw new Error(`[API] ${error}`);
        }

        return await response.json();
    }

    async httpDelete(url) {

        const headers = new Headers();
        headers.append("Content-Type", "application/json; charset=utf-8");
        headers.append("Authorization", "Bearer " + this.accessToken);

        const options = {
            method: "DELETE",
            headers: headers,
        };

        const response = await fetch(url, options);

        if (!response.ok) {
            const error = await this.getErrorDescription(response);
            throw new Error(`[API] ${error}`);
        }

        // We never get a response for DELETE .../overlay
        // so trying to parse as JSON results in an error
        // return await response.json();

        return true;
    }


    //! Helper functions

    urlencodeObject(obj) {

        let encoded = "";

        for (const key in obj) {
            if (Object.hasOwn(obj, key)) {
                encoded += (encoded ? "&" : "") + this.encodeString(key) + "=" + this.encodeString(obj[key]);
            }
        }

        return encoded;
    }

    encodeString(s) {
        return encodeURIComponent(s).replace(/%20/g, "+");
    }

    async getErrorDescription(response) {

        // Error examples
        // {"error":"invalid_grant","error_description":"Bad credentials"}
        // {"errors":[{"code":"unauthorized","title":"Full authentication is required to access this resource"}]}

        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {

            if (this.config.analytics === true) {
                this.log.debug(await response.text());
            }

            return "Got error, but response is not JSON";
        }

        try {

            const errorMessage = await response.json();

            if (Object.hasOwn(errorMessage, "error_description")) {
                return errorMessage["error_description"];
            }

            if (Object.hasOwn(errorMessage, "errors")) {
                const errors = errorMessage["errors"];
                if (
                    Array.isArray(errors)
                    && errors.length > 0
                    && typeof errors[0] === "object"
                    && !Array.isArray(errors[0])
                    && errors[0] !== null
                    && Object.hasOwn(errors[0], "title")
                ) {
                    return errors[0].title;
                }
            }

        } catch (error) {
            this.log.debug(error.message || error);
            return "Error reading response";
        }

        return `Status: ${response.status} ${response.statusText}`;
    }

    reset() {
        this.accessToken = "";
        this.refreshToken = "";
        this.expires = 0;
    }
}

exports.TadoClient = TadoClient;
