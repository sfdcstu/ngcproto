import {
    existsSync,
    readFileSync,
    writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { exit } from "node:process";
import { fileURLToPath } from "node:url";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { parse, stringify } from "yaml";

const DEFAULT_CONFIG = `agentforce-messaging:
    repository: ""
`;

const __dirname = dirname(fileURLToPath(import.meta.url));

const configFilename = ".local-config";
const configFilePath = resolve(__dirname, configFilename);

const args = yargs(hideBin(process.argv))
    .command("repo <path>", "set the path to the agentforce-messaging repository", (yargs) => {
        return yargs.positional("path", {
            describe: "path of repository"
        });
    })
    .parse();

const path = args["path"];
const configExists = existsSync(configFilePath);

if (!path && !existsSync) {
    console.error(".local-config does not exist and a valid path was not specified");
    exit(1);
}

if (!configExists) {
    console.log("Creating .local-config");
    writeFileSync(configFilename, DEFAULT_CONFIG, { encoding: "utf8" });
}

const config = parse(readFileSync(configFilePath, "utf8"));

const agentforceMessagingRepoPath = path || config.agentforceMessaging?.repository;

console.log(`Setting repo path to ${agentforceMessagingRepoPath}`);
const newConfig = Object.assign({}, config, { agentforceMessaging: { repository: agentforceMessagingRepoPath } });
writeFileSync(configFilePath, stringify(newConfig), { encoding: "utf8" });
console.log("Wrote new config", newConfig);
exit(0);
