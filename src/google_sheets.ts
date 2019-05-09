import * as fs from "fs";
import { createInterface, Interface } from "readline";
// import { google, sheets_v4 } from "googleapis"; // client is type "sheets_v4.Sheets"
import { google } from "googleapis";
import { OAuth2Client } from "googleapis-common";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
// token.json stores access tokens; created automatically by auth flow
const TOKEN_PATH = "token.json";

// return result of readline question
async function question(rl: Interface, query: string): Promise<string> {
    return new Promise(function(resolve) {
        rl.question(query, name => {
            resolve(name);
        });
    });
}

export interface AppendArgs {
    spreadsheetId: string;
    range: string;
    valueInputOption: string;
    resource: any;
}

export class Spreadsheet {
    constructor(private readonly client: any, private readonly sheetId: string) {
        this.client = client;
        this.sheetId = sheetId;
    }

    public async getTabTitles() {
        try {
            const res = await this.client.spreadsheets.get({
                spreadsheetId: this.sheetId
            });
            console.log(res.data.sheets);
        } catch (error) {
            console.log(`Error with spreadsheet get: ${error}`);
        }
    }

    public async appendValues(args: AppendArgs) {
        try {
            const res = await this.client.spreadsheets.values.append({
                spreadsheetId: this.sheetId,
                ...args
            });
            // TODO: confirm 200 status in response
        } catch (error) {
            console.log(`Error with spreadsheet appendValues: ${error}`);
        }
        return;
    }
}

export default class GoogleSheets {
    private static credsFile: string = "credentials.json";
    private readonly client: any;

    constructor(private readonly authClient: OAuth2Client) {
        this.client = google.sheets({ version: "v4", auth: authClient });
    }

    public async getSpreadsheet(sheetId: string) {
        return new Spreadsheet(this.client, sheetId);
    }

    // create an OAuth2 client with the given credentials
    private static async authorize(credsFile: string): Promise<OAuth2Client> {
        const content = fs.readFileSync(credsFile);
        const credentials = JSON.parse(content as any);
        const { client_secret, client_id, redirect_uris } = credentials.installed;
        const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
        let token;
        try {
            const rawToken = fs.readFileSync(TOKEN_PATH);
            token = JSON.parse(rawToken.toString());
            if (token == undefined) throw new Error("undefined token");
        } catch (error) {
            token = await this.getNewToken(oAuth2Client);
        } finally {
            await oAuth2Client.setCredentials(token.tokens);
        }
        return oAuth2Client;
    }

    // get and return new token after prompting via user authorization URL
    private static async getNewToken(oAuth2Client: OAuth2Client) {
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
        const code = await new Promise(function(resolve) {
            rl.question("Enter the code from that page here: ", name => {
                resolve(name);
            });
        });
        // const code = await question(rl, "Enter the code from that page here: ");

        const newToken = (await oAuth2Client.getToken(code.toString())) as any;
        await fs.writeFileSync(TOKEN_PATH, JSON.stringify(newToken));
        return newToken;
    }

    public static async getFromCredentials() {
        const oAuth2Client = await this.authorize(this.credsFile);
        return new GoogleSheets(oAuth2Client);
    }
}
