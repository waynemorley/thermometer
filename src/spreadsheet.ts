const spreadsheetId = "1MIYaIyZX7Q_rk6MioPJYKX5wvQ1lSDfUEPSRa_RRxn4";

import * as fs from "fs";
import { createInterface, Interface } from "readline";
import { google } from "googleapis";
import { OAuth2Client } from "googleapis-common";
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

// return result of readline question
async function question(rl: Interface, query: string): Promise<string> {
    return new Promise(function(resolve) {
        rl.question(query, name => {
            resolve(name);
        });
    });
}

// get and return new token after prompting via user authorization URL
async function getNewToken(oAuth2Client: OAuth2Client) {
    console.log("getnewtoken entry");
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: "offline",
        scope: SCOPES
    });
    const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: false
    });

    console.log(`Authorize this app by visiting this url: ${authUrl}`);
    const code = await question(rl, "Enter the code from that page here: ");
    console.log(`code is ${code}`);

    const newToken = (await oAuth2Client.getToken(code.toString())) as any;
    console.log(`new tokens: ${JSON.stringify(newToken)}`);

    // await oAuth2Client.setCredentials(newToken);
    await fs.writeFileSync(TOKEN_PATH, JSON.stringify(newToken));
    console.log(`just wrote token to ${TOKEN_PATH}`);
    return newToken.tokens;
}

// create an OAuth2 client with the given credentials
async function authorize(credentials: Credentials) {
    const { client_secret, client_id, redirect_uris } = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    let token;
    try {
        const rawToken = fs.readFileSync(TOKEN_PATH);
        token = JSON.parse(rawToken.toString());
        console.log(`found a token ${JSON.stringify(token.tokens)}`);
        if (token == undefined || token == undefined) throw new Error("undefined token");
    } catch (error) {
        token = await getNewToken(oAuth2Client);
        console.log("got new token");
    } finally {
        console.log(`setting creds w/ token ${JSON.stringify(token)}`);
        await oAuth2Client.setCredentials(token);
    }
    // try {
    //     await oAuth2Client.setCredentials(token);
    // } catch (error) {
    //     console.log(`error w/ oAuth2Client.setCredentials(): ${error}`);
    // }

    console.log(`returning oath2client`);
    return oAuth2Client;
}

// initialize google sheets client and start reading from sheet
async function readSheet(auth: OAuth2Client) {
    try {
        console.log("about to get sheetclient");
        const sheetClient = google.sheets({ version: "v4", auth: auth });
        console.log("got sheetclient");
        const res = await sheetClient.spreadsheets.get({
            spreadsheetId: "1G7pwAZaaZXjWqJaw95YqQfAqNogogjeIjGj9qgDLs_E"
        });
        console.log(res.data.sheets);
    } catch (error) {
        console.log(`error initializing getting with sheetClient ${error}`);
        return;
    }
    /*
    const sheetClient = google.sheets({ version: "v4", auth: auth });
    const res = await sheetClient.spreadsheets.get({
        spreadsheetId: "1G7pwAZaaZXjWqJaw95YqQfAqNogogjeIjGj9qgDLs_E"
    });
    console.log(res);
    const sheets = res.data.sheets;
    console.log("sheets:", JSON.stringify(sheets));
    if (sheets) {
        for (const sheet of sheets) {
            console.log(sheet);
            // const tabName = sheet.properties.title;
            // const bedSize = tabName.indexOf("King") > -1 ? "King" : "Queen";
            // const rows = sheet.data.values;
        }
    }*/
}

export async function spreadsheetTest() {
    const content = fs.readFileSync("credentials.json");
    const auth = await authorize(JSON.parse(content as any));
    console.log("done authorizing");
    try {
        await readSheet(auth);
    } catch (error) {
        console.log(`Error on readSheet is ${error}`);
    }
}
