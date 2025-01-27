# Change Log

## v2.1.0  (2025-01-27)

### Code revisit
- Using up-to-date Homebridge/Node functions
- Improved handling of tado° API errors
- Tested Homebridge 2.0.0 compatibility
- Minor cosmetic changes
- Added CHANGELOG

## v2.0.3  (2025-01-14)

- Renamed repo to be in line with my other Homebridge plugins
- Update README
- Added icon

## v2.0.2  (2024-06-08)

- Minor fixes

## v2.0.2  (2024-03-18)

- Now using a different API for getting zone state updates by default, which requires less requests to the tado° servers.
- More code cleanup
- Update README

## v2.0.2  (2024-03-16)

- Code cleanup
- Improved error handling

## v2.0.1  (2022-05-28)

- Fix lint errors

## v2.0.0  (2022-04-28)

- **Pure JavaScript** rewrite (I just don’t like TypeScript :P).
- Clean up repo

## v1.0.3  (2022-04-04)

- Bump ansi-regex from 4.1.0 to 4.1.1
- Bump minimist from 1.2.5 to 1.2.6

## v1.0.3  (2021-06-13)

- Bump normalize-url from 4.5.0 to 4.5.1
- Bump glob-parent from 5.1.1 to 5.1.2

## v1.0.3  (2021-05-12)

- Bump dependencies

## v1.0.2  (2021-03-02)

- Minor fixes

## v1.0.2  (2021-02-26)

- Fix lint errors

## v1.0.2  (2021-02-22)

- Changed the way how manual overrides work. Instead of using the same termination condition for all zones, we now use each zone’s individual settings for when a manual override should end. Must be set in the tado° App, but allows for more flexibility.

## v1.0.1  (2021-02-20)

- Bugfixes

## v1.0.0  (2021-02-17)

Initial commit
