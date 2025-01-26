<p align="center">
    <img src="./branding/app-icon.png">
</p>

<span align="center">

# tado° for Homebridge

![Version](https://img.shields.io/github/package-json/v/maxgrafik/homebridge-tado)
![Homebridge support](https://img.shields.io/badge/Homebridge-1.8.0_%7C_2.0.0--beta-blue)

</span>


## Description

This [Homebridge](https://homebridge.io) plugin exposes tado° thermostats to Apple HomeKit. If you already own the HomeKit compatible tado° bridge, this plugin might not be for you. Based on the work of [Terence Eden](https://shkspr.mobi/blog/2019/02/tado-api-guide-updated-for-2019/).


## Configuration

I recommend using [Homebridge UI](https://github.com/homebridge/homebridge-config-ui-x) to configure the plugin

```
"platforms": [
    ...
    {
        "platform": "tado",
        "name": "tado",
        "email": <your_tado_email>,
        "password": <your_tado_password>,
        "homeId": <your_home_id>,
        "useNewAPI": true,
        "analytics": false,
        "updateInterval": 300
    }
]
```

Option | Description | Default
------ | ----------- | -------
**email** | The email address you use to login into your tado° account | -
**password** | Your tado° account password | -
**homeId** | Your home ID. If you leave this blank, the plugin will try to auto discover it. If there is more than 1 home in your tado° account, see the log file for discovered home IDs and set accordingly | -
**useNewAPI** | Use alternate method for getting state updates (with less server requests) | true
**analytics** | This logs the whole communication with the tado° servers to the console! Use with caution and at your own risk | false
**updateInterval** | Time in seconds to request state updates from tado° | 300


#### About update interval

This plugin updates the thermostat state whenever needed, e.g. when opening Apple's Home app. In addition it updates the state in the background every 300 seconds (5 minutes), which is likely enough. You may change this timespan by setting *updateInterval* in config, but I think there's no need to hit the tado° servers every 5 seconds.

## Notes

Although the tado° API offers a lot of things like **weather**, **presence** and **open window detection**, I'd like to keep this plugin as simple as possible. So I may not implement features that can be achieved either through HomeKit automations, shortcuts or with the help of other Homebridge plugins.
