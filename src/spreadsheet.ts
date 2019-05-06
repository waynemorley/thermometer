const spreadsheetId = "1MIYaIyZX7Q_rk6MioPJYKX5wvQ1lSDfUEPSRa_RRxn4";

import * as fs from "fs";
import {} from "readline";
// import * as google from "googleapis";
import { google } from "googleapis";
import { Promises } from "@eight/promises";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
// token.json stores access tokens; created automatically by auth flow
const TOKEN_PATH = "token.json";
interface Credentials {
    installed: {
        client_id: string;
        project_id: string;
        auth_uri: string;
        token_uri: string;
        auth_provider_x509_cert_url: string;
        client_secret: string;
        redirect_uris: string[];
    };
}

// Load client secrets from a local file.
fs.readFile("credentials.json", (err, content) => {
    if (err) return console.log("Error loading client secret file:", err);
    // Authorize a client with credentials, then call the Google Sheets API.
    authorize(JSON.parse(content as any));
});

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 */
async function authorize(credentials: Credentials) {
    const { client_secret, client_id, redirect_uris } = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    const token = await fs.readFileSync(TOKEN_PATH);
    if (token == null || token == undefined) {
        token = await getNewToken(oAuth2Client);
    }
    await oAuth2Client.setCredentials(JSON.parse(token));

    return oAuth2Client;
}

await listMajors(oAuth2Client);

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
async function getNewToken(oAuth2Client, callback) {
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: "offline",
        scope: SCOPES
    });
    console.log("Authorize this app by visiting this url:", authUrl);
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    rl.question("Enter the code from that page here: ", code => {
        rl.close();
        const token = oAuth2Client.getToken(code);
        oAuth2Client.setCredentials(token);
        // Store the token to disk for later program executions
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
    });
}

/**
 * Prints the names and majors of students in a sample spreadsheet:
 * @see https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit
 * @param {google.auth.OAuth2} auth The authenticated Google OAuth client.
 */
async function listMajors(auth: google.oauth2_v2.Oauth2) {
    const sheetClient = google.sheets({ version: "v4", auth });
    const res = await sheetClient.spreadsheets.get({
        spreadsheetId: "1G7pwAZaaZXjWqJaw95YqQfAqNogogjeIjGj9qgDLs_E"
    });
    console.log(res);
    const sheets = res.data.sheets;
    console.log("sheets:", JSON.stringify(sheets));
    for (var sheet of sheets) {
        const tabName = sheet.properties.title;
        const bedSize = tabName.indexOf("King") > -1 ? "King" : "Queen";
        const rows = sheet.data.values;
        if (rows.length) {
            // do something
        }
    }
}
