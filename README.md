# thermometer

### Running thermometer locally
1. Clone this repo
2. Install dependencies: `npm install`
3. Build the code: `npm run build`
4. Run and view available options: `node build/index.js --help`

### Default Mode
If you run `node build/index.js` without any options, the default mode of this program is optimized for in-house hub QC. The process is:
1. Set up hubs for QC with full reservoirs and water loops. The laptop running thermometer must also be connected to the Eight VPN.
2. Plug one hub in and ensure it is in pairing mode. Note the pairing ID that it broadcasts: "EIGHT-XXXX"
3. Connect the laptop to the "EIGHT" network.
4. Scan (or type in) the serial number on the back of the device. The program will pair to the device, get it online, revert the laptop back to the Knotel network, and begin testing the device.
5. Each test lasts about 8 minutes per device (longer if more devices are tested at the same time). A device passes this "test" if it heats more than 7 degrees in a minute of heating _and_ if it cools more than 7 degrees in 2 minutes of cooling. If it fails this thermal test, it retries twice. If it fails 3x, it fails and is removed from the program's pool of test devices.
6. At the end of each test, the program posts the results (device serial number, device ID, and test result) to the Master Testing QC spreadsheet.
7. Repeat for as many devices as necessary.

The program will continue to accept command line input of serial numbers - theoretically you could test any number of devices simultaneously. Make sure to connect to each device's "EIGHT" network before scanning that device's serial number, as the program will immediately then try to pair to that network. Ctrl-C at any time to quit.  

### Additional Options
Overview of command line options that can be run as `node build/index.js [option]`; again, this are listed in the help menu.
- `remote <deviceId|email>`:  runs healthcheck remotely on a connected customer device, specified by device ID or paired email
- `--wifi`: Ubuntu-only option. Program will auto-connect to any broadcasting EIGHT-XXXX network.
- `--pair`: Pair to devices via laptop wifi without running health check. Connect to the "EIGHT" wifi of a device in pairing mode, scan or enter the device ID, and the program will pass the office wifi credentials ("Knotel") to the device. The program will also return the device id
- `--prime`: Skip thermal testing and only use thermometer to pair and prime devices.
