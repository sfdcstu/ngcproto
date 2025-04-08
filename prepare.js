import { exec } from "node:child_process";
import {
    existsSync,
    readFileSync,
    mkdirSync,
    rmSync,
    cpSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { exit } from "node:process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { parse } from "yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));

const configFilename = ".local-config";
const configFilePath = resolve(__dirname, configFilename);

if (!existsSync(configFilePath)) {
    console.error(".local-config does not exist; create it with `yarn setup repo <path>`");
    exit(1);
}

const config = parse(readFileSync(configFilePath, "utf8"));

const agentforceMessagingRepoPath = config.agentforceMessaging?.repository;
const resolvedRepoPath = agentforceMessagingRepoPath && resolve(__dirname, agentforceMessagingRepoPath);
const resolvedPackageJsonPath = resolvedRepoPath && resolve(resolvedRepoPath, "package.json");

if (!resolvedRepoPath || !existsSync(resolvedPackageJsonPath)) {
    console.error(
        "A valid path to the agentforce-messaging repository was not specified in .local-config"
    );
    exit(1);
}

const packageJson = JSON.parse(readFileSync(resolvedPackageJsonPath, "utf8"));
const currentVersion = packageJson.version;
const currentMajorMinorVersion = currentVersion.replace(/^(\d+\.\d+)\.\d+.*$/, "$1");
const versionIsValid = /^\d+\.\d+$/.test(currentMajorMinorVersion);

if (!versionIsValid) {
    console.error(`agentforce-messaging version string "${currentVersion}" is not compatible with this tool; must be "x.x.x" or "x.x.x-tag"`);
    exit(1);
}

console.log(`Current agentforce-messaging version is ${currentMajorMinorVersion}`);

const distDir = resolve(resolvedRepoPath, "dist/");
if (!existsSync(distDir)) {
    console.error("agentforce-messaging has not been built");
    exit(1);
}

const releasesDir = resolve(__dirname, "builds/ngc");
const releaseDir = resolve(releasesDir, currentMajorMinorVersion);
if (!existsSync(releaseDir)) {
    console.log(`Version ${currentMajorMinorVersion} not found in this repo; adding it now`);
} else {
    console.log(`Overwriting existing ${currentMajorMinorVersion} release`);
    rmSync(releaseDir, { recursive: true });
}
mkdirSync(releaseDir);

console.log(`Copying version ${currentMajorMinorVersion} from agentforce-messaging`);
cpSync(distDir, releaseDir, { recursive: true });
console.log(`Copying finished! Staging files for Git commit`);
await promisify(exec)(`git add builds/ngc/${currentMajorMinorVersion}/*`);
console.log(`Committing changes`);
await promisify(exec)(`git commit -m "feat: auto-commit of agentforce-messaging v${currentVersion}"`);
console.log(`Commit completed. Be sure to push your changes and open a PR!`);
