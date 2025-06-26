import { exec } from "node:child_process";
import {
    existsSync,
    readFileSync,
    mkdirSync,
    rmSync,
    cpSync,
    writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { exit, stderr } from "node:process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { parse } from "yaml";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = yargs(hideBin(process.argv))
    .option("branch", {
        alias: "b",
        type: "string",
        description:
            "Alternate branch to use for the release branch",
        default: "release",
    })
    .parse();

const releaseBranch = args["branch"];

const configFilename = ".local-config";
const configFilePath = resolve(__dirname, configFilename);

if (!existsSync(configFilePath)) {
    console.error(
        ".local-config does not exist; create it with `yarn setup repo <path>`"
    );
    exit(1);
}

const config = parse(readFileSync(configFilePath, "utf8"));

const agentforceMessagingRepoPath = config.agentforceMessaging?.repository;
const resolvedRepoPath =
    agentforceMessagingRepoPath &&
    resolve(__dirname, agentforceMessagingRepoPath);
const resolvedPackageJsonPath =
    resolvedRepoPath && resolve(resolvedRepoPath, "package.json");

if (!resolvedRepoPath || !existsSync(resolvedPackageJsonPath)) {
    console.error(
        "A valid path to the agentforce-messaging repository was not specified in .local-config"
    );
    exit(1);
}

const promiseExec = promisify(exec);
const execInRepo = async (cmd) => {
    const result = await promiseExec(
        `cd ${agentforceMessagingRepoPath}; ${cmd}`
    ).catch((err) => ({
        // this typically means the command returned a non-zero code
        // we will simply pass the `err` object back as the result
        // but we will copy `stdout` to `stderr` if `stderr` is blank
        ...err,
        stderr: err.stderr || err.stdout,
    }));
    return result;
};

// check for any uncommitted changes in the target repository
const uncommittedCheckResult = await execInRepo("git status");
if (
    uncommittedCheckResult.stderr ||
    !uncommittedCheckResult.stdout.match(/working tree clean/)
) {
    console.error(
        "The agentforce-messaging repository has uncommitted changes. Unable to continue"
    );
    exit(1);
}

// now checkout the release branch
// that's where we will be making changes
const releaseCheckoutResult = await execInRepo(`git fetch; git checkout ${releaseBranch}; if [ ! -z \`git branch -vv | grep ${releaseBranch}\` ]; then git pull; fi`);
if (releaseCheckoutResult.stderr) {
    if (
        !releaseCheckoutResult.stderr.match(/Switched to branch/) &&
        !releaseCheckoutResult.stderr.match(
            new RegExp(`Already on '${releaseBranch}'`)
        )
    ) {
        console.error(
            `Unable to check out ${releaseBranch} branch`,
            releaseCheckoutResult.stderr
        );
        exit(1);
    }
}

const packageJson = JSON.parse(readFileSync(resolvedPackageJsonPath, "utf8"));
const currentVersion = packageJson.version;
const currentMajorMinorVersion = currentVersion.replace(
    /^(\d+\.\d+)\.\d+.*$/,
    "$1"
);
const currentPatchVersion = parseInt(
    currentVersion.match(/^\d+\.\d+\.(\d+).*$/)[1] ?? "0",
    10
);
const versionTag = currentVersion.match(/-([-a-zA-Z0-9]+)$/)?.[1];
const versionIsValid = /^\d+\.\d+$/.test(currentMajorMinorVersion);

if (!versionIsValid) {
    console.error(
        `agentforce-messaging version string "${currentVersion}" is not compatible with this tool; must be "x.x.x" or "x.x.x-tag"`
    );
    exit(1);
}

// determine the last commit that we merged in
// this will be the commit immediately before HEAD
const mostRecentCommitResult = await execInRepo("git merge-base HEAD origin/main");
const mostRecentCommitHash = (mostRecentCommitResult.stdout ?? mostRecentCommitResult.stderr)?.trim();
if (!mostRecentCommitHash) {
    console.error("Unable to determine most recently-merged commit");
    exit(1);
}

// find out how many PRs have been merged since the last release
const releasedPRCheck = await execInRepo(
    `git fetch; git log ${mostRecentCommitHash}..origin/main --grep='@W-.+ \\(#[0-9]+\\)' -E --oneline`
);
if (releasedPRCheck.stderr || !releasedPRCheck.stdout) {
    console.error(releasedPRCheck.stderr || "No commits found");
    exit(1);
}
const formattedReleasedPRs = releasedPRCheck.stdout
    .split(/\n/g)
    .map((msg) => msg.replace(/^....... (?:\([^)]+ )/, ""))
    .filter((msg) => !!msg);
const prCount = formattedReleasedPRs.length;
const newPatchVersion = currentPatchVersion + prCount;
const newVersion = currentVersion.replace(
    /^(\d+\.\d+\.)(\d+)(.*)$/,
    `$1${newPatchVersion}$3`
);

// before doing anything else, we want to merge origin/main into the branch
const mergeResult = await execInRepo(
    `git merge origin/main --no-commit --no-ff -s ort -X theirs`
);
if (mergeResult.stderr) {
    if (mergeResult.stderr.match(/CONFLICT \(modify\/delete\)/)) {
        // ensure we are just dealing with deletions in origin/main
        const statusResult = await execInRepo("git status -s | grep -E '^[UAD][UAD]'");
        if (!statusResult.stdout.split(/\n/g).every((line) => !line || /^[UAD][UAD]\s/.test(line))) {
            console.error(`Unexpected merge conflict while merging origin/main into ${releaseBranch} branch`, statusResult.stdout, mergeResult.stderr);
            exit(1);
        }
        const resolveResult = await execInRepo("git status -s | grep -E '^UD ' | awk '{print $2}' | xargs git rm");
        if (resolveResult.stderr) {
            console.error(`Unexpected error while trying to resolve deleted files during merge of origin/main into ${releaseBranch} branch`, resolveResult.stderr, mergeResult.stderr);
            exit(1);
        }
        const unresolvedResult = await execInRepo("git status -s | grep -E '^[UAD][UAD]'");
        if (unresolvedResult.stdout || unresolvedResult.stderr) {
            console.error(`Unsuccessful merge of origin/main into ${releaseBranch} branch`, unresolvedResult.stdout || unresolvedResult.stderr, mergeResult.stderr);
            exit(1);
        }
    } else if (!mergeResult.stderr.match(/Automatic merge went well/)) {
        console.error(
            `Error while merging origin/main into ${releaseBranch} branch`,
            mergeResult.stderr
        );
        exit(1);
    }
} else if (mergeResult.stdout.match(/CONFLICT/)) {
    console.error(
        `Conflicts encountered while merging origin/main even though we specified a merge strategy to accept remote changes. A manual merge and build will be required to release version ${newVersion}.`
    );
    exit(1);
}

const mergeMessagePath = resolve(resolvedRepoPath, ".git/MERGE_MSG");
if (!existsSync(mergeMessagePath)) {
    console.error(
        "Merge message file does not exist. This should not happen."
    );
    exit(1);
}

console.log(
    `Found ${prCount} PR${
        prCount === 1 ? "" : "s"
    }; updating from ${currentVersion} to ${newVersion}`
);

// update package.json in the target
// we use `jq` for this since it's efficient and targeted
await execInRepo(
    `jq '.version = "${newVersion}"' package.json > package.json.tmp && mv package.json.tmp package.json`
);

// amend the commit message with our release version and the list of PRs
const newCommitMsg = `RELEASE ${newVersion}\n\n${formattedReleasedPRs.join("\n")}\n`;

writeFileSync(mergeMessagePath, newCommitMsg);

// add the updated package.json
await execInRepo(
    `git add package.json`
);

// build
console.log(`Building release ${newVersion}...`);
const buildResult = await execInRepo(
    `yarn install && yarn build`
);
const combinedResult = buildResult.stderr + "\n\n" + buildResult.stdout;
if (combinedResult.match(/Command failed/)) {
    console.error("Error while building", combinedResult);
    exit(1);
}

// commit
await execInRepo(
    `git commit -F '.git/MERGE_MSG' --no-verify`
);

// we might end up with some extra files we didn't want
// yarn.lock may have been regenerated with regular NPM repo references
// and we may now have an untracked .yarnrc.yml file
await execInRepo(
    `git checkout --force; if [ -f '.yarnrc.yml' ]; then if [ ! -z 'git status | grep .yarnrc.yml' ]; then rm .yarnrc.yml; fi; fi`
);

console.log(
    `Build of ${newVersion} finished and committed. Be sure to push the ${releaseBranch} branch! You can now run \`yarn copy\` to copy the build assets and create the deployment commit.`
);
