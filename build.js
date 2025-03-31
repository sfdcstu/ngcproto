import { readdir, statSync, existsSync, readFileSync, mkdirSync, rmSync, cpSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const __dirname = dirname(fileURLToPath(import.meta.url));

const ngcBuildsDir = resolve(__dirname, "./builds/ngc");
const distDir = resolve(__dirname, "./dist");
console.log({ ngcBuildsDir, distDir });

const createDefaultManifest = () => ({
    manifest_version: "1.0",
    manifest_publish_date: new Date().toISOString(),
    available_versions: [],
});

const buildManifest = async () => {
    const ngcBuilds = await promisify(readdir)(ngcBuildsDir);
    console.log({ ngcBuilds });
    const manifest = ngcBuilds.reduce((m, dir) => {
        if (!statSync(resolve(ngcBuildsDir, dir)).isDirectory()) {
            console.log(`${dir} is not a directory`);
            return m;
        }
        // look for and load the BUILDINFO file
        const buildinfoPath = resolve(ngcBuildsDir, dir, "BUILDINFO.json");
        if (!existsSync(buildinfoPath)) {
            console.log(`${dir} does not contain BUILDINFO.json`);
            return m;
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
                    return m;
                }
                const path = `<root>/releases/ngc/${majorMinorVersion}/${entry_point}`;
                m.available_versions.push({
                    version: majorMinorVersion,
                    full_version: version,
                    minimum_bootstrap_versions,
                    path,
                    css_file,
                    build_date,
                });
            }
        } catch (ex) {
            console.error(`Error while reading YAML for ${dir}`, ex, yamlFile);
        }

        return m;
    }, createDefaultManifest());

    console.log("rebuildManifest", manifest);

    return manifest;
};

const manifest = await buildManifest();
if (!existsSync(distDir)) {
    mkdirSync(distDir)
}
rmSync(distDir, { recursive: true });
cpSync(resolve(ngcBuildsDir, "./"), distDir, { recursive: true });
writeFileSync(resolve(distDir, "manifest.json"), JSON.stringify(manifest, null, 2));
