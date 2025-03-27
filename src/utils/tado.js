/**
 * tado.js
 * homebridge-tado
 *
 * @copyright 2021 Hendrik Meinl
 */

"use strict";

const path = require("node:path");
const fsPromises = require("node:fs/promises");

class TadoClient {

    constructor(log, config, api) {

        this.log = log;
        this.config = config;
        this.api = api;

        this.homeId = config.homeId;

        this.deviceCode = null;
        this.pollingInterval = 5;

        this.accessToken = "";
        this.refreshToken = "";
        this.expires = 0;
    }

    async connect() {

        const data = await this.loadToken();

        if (data === null) {
            await this.startDeviceCodeGrantFlow();
            return;
        }

        const leeway = 5000;
        const isAccessTokenValid = (Date.now() + leeway) < data.expires;

        const ttl = 30 * 24 * 60 * 60 * 1000;
        const isRefreshTokenValid = (data.timestamp + ttl) > Date.now();

        if (!isAccessTokenValid && !isRefreshTokenValid) {
            await this.deleteToken();
            throw new Error("[API] Access token expired. Please restart Homebridge to authenticate again.");
        }

        this.accessToken = data.accessToken;
        this.refreshToken = data.refreshToken;
        this.expires = data.expires;

        if (!isAccessTokenValid) {
            await this.refreshAccessToken();
        }
    }

    async startDeviceCodeGrantFlow() {

        const data = {
            client_id : "1bb50063-6b0c-4d11-bd99-387f4a91cc46",
            scope     : "offline_access",
        };

        const response = await this.httpPost("https://login.tado.com/oauth2/device_authorize", data);

        await this.analytics("Starting device code grant flow", response);

        if (!Object.hasOwn(response, "verification_uri_complete")) {
            throw new Error("[API] Response does not contain verification URI");
        }

        if (!Object.hasOwn(response, "device_code")) {
            throw new Error("[API] Response does not contain device code");
        }

        const verificationURI = response.verification_uri_complete;
        this.log.info("Please visit the following URL to complete the authorization process:");
        this.log.info(verificationURI);

        this.pollingInterval = response.interval || 5;
        this.deviceCode = response.device_code;

        return new Promise((resolve, reject) => {
            setTimeout(() => {
                this.getAccessToken(resolve, reject);
            }, this.pollingInterval * 1000);
        });
    }

    async getAccessToken(resolve, reject) {

        const data = {
            client_id   : "1bb50063-6b0c-4d11-bd99-387f4a91cc46",
            device_code : this.deviceCode,
            grant_type  : "urn:ietf:params:oauth:grant-type:device_code",
        };

        let response = null;

        try {
            response = await this.httpPost("https://login.tado.com/oauth2/token", data);
        } catch (error) {
            reject(error);
            return;
        }

        if (response === "authorization_pending") {
            setTimeout(() => {
                this.getAccessToken(resolve, reject);
            }, this.pollingInterval * 1000);
            return;
        }

        await this.analytics("Getting access token", response);

        if (!Object.hasOwn(response, "access_token")) {
            reject("[API] Response does not contain access token");
            return;
        }

        this.accessToken = response.access_token;
        this.refreshToken = response.refresh_token;
        this.expires = Date.now() + (response.expires_in * 1000);

        this.saveToken();

        this.log.info("Authorization completed successfully");

        resolve();
    }

    async refreshAccessToken() {

        const data = {
            client_id     : "1bb50063-6b0c-4d11-bd99-387f4a91cc46",
            grant_type    : "refresh_token",
            refresh_token : this.refreshToken,
        };

        const response = await this.httpPost("https://login.tado.com/oauth2/token", data);

        await this.analytics("Refreshing access token", response);

        if (!Object.hasOwn(response, "access_token")) {
            throw new Error("[API] Response does not contain access token");
        }

        this.accessToken = response.access_token;
        this.refreshToken = response.refresh_token;
        this.expires = Date.now() + (response.expires_in * 1000);

        this.saveToken();
    }

    async checkToken() {

        if (this.accessToken) {

            const leeway = 5000;
            const isTokenValid = (Date.now() + leeway) < this.expires;

            if (isTokenValid) {
                return;
            }
        }

        await this.refreshAccessToken();
    }



    //! tado API calls

    async getHomeId() {

        await this.checkToken();

        const response = await this.httpGet("https://my.tado.com/api/v2/me");

        await this.analytics("Getting user info", response);

        if (!Object.hasOwn(response, "homes")) {
            throw new Error("[API] Response does not contain list of homes");
        }

        const homes = response.homes;

        if (homes.length === 1) {
            this.homeId = `${homes[0].id}`;
            return;
        }

        if (homes.length === 0) {
            throw new Error("No homes found");
        } else {
            const homesList = homes.map((home) => `${home.name} (ID: ${home.id})`).join(", ");
            throw new Error(`Found multiple homes: ${homesList}. Please set Home ID in config.`);
        }
    }

    async getHome() {

        await this.checkToken();

        const response = await this.httpGet("https://my.tado.com/api/v2/homes/" + this.homeId);

        await this.analytics("Getting home info", response);

        return response;
    }

    async getState() {

        await this.checkToken();

        const response = await this.httpGet("https://my.tado.com/api/v2/homes/" + this.homeId + "/state");

        await this.analytics("Getting home state", response);

        return response;
    }

    async setState(atHome) {

        const homeState = {
            homePresence: (atHome === true ? "HOME" : "AWAY")
        };

        await this.checkToken();

        const response = await this.httpPut("https://my.tado.com/api/v2/homes/" + this.homeId + "/presenceLock", homeState);

        await this.analytics("Set home state response", response);

        return response;
    }

    async getZones() {

        await this.checkToken();

        const response = await this.httpGet("https://my.tado.com/api/v2/homes/" + this.homeId + "/zones");

        await this.analytics("Getting zones", response);

        return response;
    }

    async getZoneStates() {

        await this.checkToken();

        const response = await this.httpGet("https://my.tado.com/api/v2/homes/" + this.homeId + "/zoneStates");

        await this.analytics("Getting zone states", response);

        return response;
    }

    async getZoneState(zoneId) {

        await this.checkToken();

        const response = await this.httpGet("https://my.tado.com/api/v2/homes/" + this.homeId + "/zones/" + zoneId + "/state");

        await this.analytics("Getting zone state", response);

        return response;
    }

    async getZoneDefaultOverlay(zoneId) {

        await this.checkToken();

        const response = await this.httpGet("https://my.tado.com/api/v2/homes/" + this.homeId + "/zones/" + zoneId + "/defaultOverlay");

        await this.analytics("Getting zone default overlay", response);

        return response;
    }

    async getDevices() {

        await this.checkToken();

        const response = await this.httpGet("https://my.tado.com/api/v2/homes/" + this.homeId + "/devices");

        await this.analytics("Getting devices", response);

        return response;
    }

    async setOverlay(zoneId, overlay) {

        await this.analytics("Setting overlay", overlay);

        await this.checkToken();

        const response = await this.httpPut("https://my.tado.com/api/v2/homes/" + this.homeId + "/zones/" + zoneId + "/overlay", overlay);

        await this.analytics("Set overlay response", response);

        return response;
    }

    async deleteOverlay(zoneId) {

        await this.checkToken();

        // We never get a response for DELETE .../overlay
        await this.httpDelete("https://my.tado.com/api/v2/homes/" + this.homeId + "/zones/" + zoneId + "/overlay");

        // So just return true
        return true;
    }


    //! HTTP GET, POST, PUT, DELETE

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
            throw new Error(`[API] ${error.description}`);
        }

        return await response.json();
    }

    async httpPost(url, data) {

        const headers = new Headers();
        headers.append("Content-Type", "application/x-www-form-urlencoded");

        const options = {
            method: "POST",
            headers: headers,
            body: this.urlencodeObject(data),
        };

        const response = await fetch(url, options);

        if (!response.ok) {
            const error = await this.getErrorDescription(response);
            switch (error.error) {
            case "authorization_pending":
                return "authorization_pending";
            case "slow_down":
                this.pollingInterval += 5;
                return "authorization_pending";
            default:
                throw new Error(`[API] ${error.description}`);
            }
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
            throw new Error(`[API] ${error.description}`);
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
            throw new Error(`[API] ${error.description}`);
        }

        // We never get a response for DELETE .../overlay
        // so trying to parse as JSON results in an error
        // return await response.json();

        return true;
    }



    //! Error handling

    async getErrorDescription(response) {

        // Error examples
        // {"error":"invalid_grant","error_description":"Bad credentials"}
        // {"errors":[{"code":"unauthorized","title":"Full authentication is required to access this resource"}]}

        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            this.log.debug(await response.text());
            return { error: "", description: "Got error, but response is not JSON" };
        }

        try {

            const errorMessage = await response.json();

            if (Object.hasOwn(errorMessage, "error") && Object.hasOwn(errorMessage, "error_description")) {
                return { error: errorMessage["error"], description: errorMessage["error_description"] };
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
                    return { error: "", description: errors[0].title };
                }
            }

        } catch (error) {
            this.log.debug(error.message || error);
            return { error: "", description: "Error reading response" };
        }

        return { error: "", description: `Status: ${response.status} ${response.statusText}` };
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

    async analytics(apiCall, response) {

        if (this.config.analytics !== true) {
            return;
        }

        const storagePath = this.api.user.storagePath();
        const filePath = path.join(storagePath, "tado", "analytics.log");

        try {

            await fsPromises.mkdir(path.dirname(filePath), { recursive: true });

            const contents = JSON.stringify(response, null, 4);
            await fsPromises.appendFile(filePath, `=== ${apiCall} ===\n`, { encoding: "utf8" });
            await fsPromises.appendFile(filePath, `${contents}\n\n`, { encoding: "utf8" });

            const stats = await fsPromises.stat(filePath);
            if (stats.size > (100 * 1024)) {
                const filePathRenamed = path.join(storagePath, "tado", "analytics.prev.log");
                await fsPromises.copyFile(filePath, filePathRenamed);
                await fsPromises.truncate(filePath, 0);
            }

        } catch (error) {
            this.log.debug(error.message || error);
        }
    }



    //! Load/Save/Delete token file

    async loadToken() {

        const storagePath = this.api.user.storagePath();
        const filePath = path.join(storagePath, "tado", "token.json");

        try {
            const contents = await fsPromises.readFile(filePath, { encoding: "utf8" });
            return JSON.parse(contents);
        } catch (error) {
            // this.log.debug(error.message || error);
            return null;
        }
    }

    async saveToken() {

        const data = {
            timestamp    : Date.now(),
            accessToken  : this.accessToken,
            refreshToken : this.refreshToken,
            expires      : this.expires,
        };

        const storagePath = this.api.user.storagePath();
        const filePath = path.join(storagePath, "tado", "token.json");

        try {
            const contents = JSON.stringify(data, null, 4);
            await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
            await fsPromises.writeFile(filePath, contents, { encoding: "utf8" });
        } catch (error) {
            this.log.debug(error.message || error);
        }
    }

    async deleteToken() {

        const storagePath = this.api.user.storagePath();
        const filePath = path.join(storagePath, "tado", "token.json");

        try {
            fsPromises.unlink(filePath);
        } catch (error) {
            this.log.debug(error.message || error);
        }
    }
}

exports.TadoClient = TadoClient;
