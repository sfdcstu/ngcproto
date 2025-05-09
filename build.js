import archiver from "archiver";
import {
    readdir,
    statSync,
    existsSync,
    readFileSync,
    mkdirSync,
    rmSync,
    cpSync,
    writeFileSync,
    createWriteStream,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const __dirname = dirname(fileURLToPath(import.meta.url));

const ngcBuildsDir = resolve(__dirname, "./builds/ngc");
const distDir = resolve(__dirname, "./dist");
console.log({ ngcBuildsDir, distDir });

const zipDirectory = async (sourceDir, outPath) => {
    const archive = archiver("zip", { zlib: { level: 9 } });
    const stream = createWriteStream(outPath);

    return new Promise((resolve, reject) => {
        archive
            .directory(sourceDir, false)
            .on("error", (err) => reject(err))
            .pipe(stream);

        stream.on("close", () => resolve());
        archive.finalize();
    });
};

const createDefaultManifest = () => ({
    manifest_version: "1.0",
    manifest_publish_date: new Date().toISOString(),
    available_versions: [],
});

const buildManifest = async (buildZip = false) => {
    const ngcBuilds = await promisify(readdir)(ngcBuildsDir);
    console.log({ ngcBuilds });
    let manifest = createDefaultManifest();
    for (const dir of ngcBuilds) {
        if (!statSync(resolve(ngcBuildsDir, dir)).isDirectory()) {
            console.log(`${dir} is not a directory`);
            continue;
        }
        // look for and load the BUILDINFO file
        const buildinfoPath = resolve(ngcBuildsDir, dir, "BUILDINFO.json");
        if (!existsSync(buildinfoPath)) {
            console.log(`${dir} does not contain BUILDINFO.json`);
            continue;
        }
        const yamlFile = readFileSync(buildinfoPath, { encoding: "utf8" });
        try {
            const buildinfo = JSON.parse(yamlFile);
            console.log(`BUILDINFO for ${dir}:`, buildinfo);
            const {
                version,
                minimum_bootstrap_versions = [],
                build_date,
                entry_point = "index.js",
                css_file,
            } = buildinfo;
            if (version) {
                const majorMinorVersion =
                    version.match(/^([0-9]+\.[0-9]+)\./)?.[1];
                if (!majorMinorVersion) {
                    console.log(
                        `Could not match regular expression against ${version}`
                    );
                    continue;
                }
                const versionTag = version.match(/-([-a-zA-Z0-9]+)$/)?.[1];
                const destVersion = `${majorMinorVersion}${
                    versionTag ? `-${versionTag}` : ""
                }`;
                const path = `<root>/releases/ngc/${destVersion}/${entry_point}`;

                // build a ZIP
                const archive = buildZip ? `agentforce-messaging-release-${destVersion}.zip` : undefined;
                if (buildZip) {
                    await zipDirectory(
                        resolve(ngcBuildsDir, dir),
                        resolve(
                            distDir,
                            archive
                        )
                    );
                }

                manifest.available_versions.push({
                    version: destVersion,
                    full_version: version,
                    minimum_bootstrap_versions,
                    path,
                    css_file,
                    build_date,
                    ...buildZip && { archive },
                });
            }
        } catch (ex) {
            console.error(`Error processing build for ${dir}`, ex, yamlFile);
        }
    };

    console.log("rebuildManifest", manifest);

    return manifest;
};

if (!existsSync(distDir)) {
    mkdirSync(distDir);
}
rmSync(distDir, { recursive: true });
mkdirSync(resolve(distDir, "releases/ngc"), { recursive: true });
const manifest = await buildManifest(true);
cpSync(resolve(ngcBuildsDir, "./"), resolve(distDir, "releases/ngc"), {
    recursive: true,
});
writeFileSync(
    resolve(distDir, "manifest.json"),
    JSON.stringify(manifest, null, 2)
);
