<p align="center">
    <img src="./branding/app-icon.png">
</p>

<span align="center">

# tado° for Homebridge

![Version](https://img.shields.io/github/package-json/v/maxgrafik/homebridge-tado)
![Homebridge support](https://img.shields.io/badge/Homebridge-1.8.0_%7C_2.0.0-blue)

</span>


## Description

This [Homebridge](https://homebridge.io) plugin exposes tado° thermostats to Apple HomeKit. If you already own the HomeKit compatible tado° bridge, this plugin might not be for you.


## Configuration

I recommend using [Homebridge UI](https://github.com/homebridge/homebridge-config-ui-x) to configure the plugin

```
"platforms": [
    ...
    {
        "platform": "tado",
        "name": "tado",
        "homeId": <your_home_id>,
        "updateInterval": <seconds>,
        "analytics": <true|false>
    }
]
```

Option | Description | Default
------ | ----------- | -------
**homeId** | Your home ID. If you leave this blank, the plugin will try to auto discover it. If there is more than 1 home in your tado° account, see the log file for discovered home IDs and set accordingly | -
**updateInterval** | Time in seconds to request state updates from tado° | 300
**analytics** | Saves responses from the tado° API to disk. The log file will be written to the folder »tado« inside your Homebridge storage folder | false


#### Login

Starting with v2.2.0 this plugin uses the [device code grant flow](https://support.tado.com/en/articles/8565472-how-do-i-authenticate-to-access-the-rest-api) to authenticate. To complete this process you will need to follow a verification link (which can be found in `homebridge.log`). Therefore I highly recommend using [Homebridge UI](https://github.com/homebridge/homebridge-config-ui-x), where you can just click the link.


#### About update interval

By default this plugin updates the state of your thermostats in the background every 300 seconds (5 minutes), which is likely enough.

**Heads up!** If you're not an Auto-Assist subscriber, your usage of the tado° API may be limited to [100 requests/day](https://support.tado.com/en/articles/12165739-limitation-for-rest-api-usage). In this case you might need to increase the update interval to some reasonable number.

To give you some insight: Each state update requires 1 request. No matter how many thermostats you have. Plus 1 additional request every 24 hours for battery levels. Resulting in a total of 289 requests/day on a 5 minute update interval (assuming access-token refresh does **not** count as API call, which is not clear at the moment).

However, each change you make to temperature or mode, requires 2 requests *per thermostat(!)*: 1 for getting the override defaults + 1 for setting the actual override.

So, you do the math!


## Notes

Although the tado° API offers a lot of things like **weather**, **presence** and **open window detection**, I'd like to keep this plugin as simple as possible. So I may not implement features that can be achieved either through HomeKit automations, shortcuts or with the help of other Homebridge plugins.
