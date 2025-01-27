/**
 * index.js
 * homebridge-tado
 *
 * @copyright 2021 Hendrik Meinl
 */

"use strict";

const { TadoPlatform } = require("./platform");

module.exports = function(homebridge) {
    homebridge.registerPlatform("tado", TadoPlatform);
};
