"use strict";

const { TadoPlatform } = require("./platform");

module.exports = function(homebridge) {
    homebridge.registerPlatform("tado", TadoPlatform);
};
