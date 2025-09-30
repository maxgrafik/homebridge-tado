"use strict";

const https = require("https");

/**
 * Ajax Functions
 */

class Ajax {

    /**
     * Ajax POST (form urlencoded)
     * Used for tado° login/token refresh
     */

    post(url, data) {

        return new Promise((resolve, reject) => {

            const options = {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            };

            const request = https.request(url, options, (response) => {

                let data = "";

                response.on("data", (chunk) => {
                    data = data + chunk.toString();
                });

                response.on("end", () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        resolve(null);
                    }
                });
            });

            request.on("error", (e) => {
                reject(e.message);
            });

            request.write(this.urlencodeObject(data));
            request.end();
        });
    }

    /**
     * Ajax GET
     */

    get(url, token) {

        return new Promise((resolve, reject) => {

            const options = {
                headers: {
                    "Authorization": "Bearer " + token,
                },
            };

            const request = https.request(url, options, (response) => {

                let data = "";

                response.on("data", (chunk) => {
                    data = data + chunk.toString();
                });

                response.on("end", () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        resolve(null);
                    }
                });
            });

            request.on("error", (e) => {
                reject(e.message);
            });

            request.end();
        });
    }

    /**
     * Ajax PUT
     */

    put(url, token, obj) {

        return new Promise((resolve, reject) => {

            const options = {
                method: "PUT",
                headers: {
                    "Authorization": "Bearer " + token,
                    "Content-Type": "application/json; charset=utf-8",
                },
            };

            const request = https.request(url, options, (response) => {

                let data = "";

                response.on("data", (chunk) => {
                    data = data + chunk.toString();
                });

                response.on("end", () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        resolve(null);
                    }
                });
            });

            request.on("error", (e) => {
                reject(e.message);
            });

            request.write(JSON.stringify(obj));
            request.end();
        });
    }

    /**
     * Ajax DELETE
     */

    delete(url, token) {

        return new Promise((resolve, reject) => {

            const options = {
                method: "DELETE",
                headers: {
                    "Authorization": "Bearer " + token,
                    "Content-Type": "application/json; charset=utf-8",
                },
            };

            const request = https.request(url, options, (response) => {

                let data = "";

                response.on("data", (chunk) => {
                    data = data + chunk.toString();
                });

                response.on("end", () => {
                    resolve(data);
                });
            });

            request.on("error", (e) => {
                reject(e.message);
            });

            request.end();
        });
    }

    /**
     * Helper functions to form-urlencode an Object
     */

    urlencodeObject(obj) {

        let encoded = "";

        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                encoded += (encoded ? "&" : "") + this.encodeString(key) + "=" + this.encodeString(obj[key]);
            }
        }

        return encoded;
    }

    encodeString(s) {
        return encodeURIComponent(s).replace(/%20/g, '+');
    }
}

exports.Ajax = Ajax;
