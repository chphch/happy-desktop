// Builds Happy (the standard flavor) for this Mac's own use without an Apple
// Developer ID: ad-hoc signed, not notarized. It is the chphch fork's build
// (branch agent-custom) and follows scripts/build-mac-apps.mjs step for step —
// the same renderer, main and preload builds, the same staged production
// install and the same builder configuration — leaving out only what needs
// Apple credentials: Developer ID signing, notarization, stapling and the
// Gatekeeper assessment that checks them. It also leaves the committed app
// icon as it is: `pnpm desktop:assets` on this Mac rewrites it with different
// bytes (measured 2026-11-09: icns 716 KB -> 97 KB from the same source.png).
// Self-update is off (HAPPY_DESKTOP_SELF_UPDATE=off): the published releases
// are upstream's, and installing one would replace this build.
//
//   node scripts/build-mac-unsigned.mjs [--arch=arm64|x64]
//
// Output: packages/happy-desktop-electron/release/standard-unsigned/
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { desktopFlavorRead } from "./desktopFlavors.mjs";
import { desktopBuildVersion } from "./release/desktopVersion.mjs";
import { packagedMainModulesVerify } from "./verify-packaged-main-modules.mjs";

const workspace = resolve(fileURLToPath(new URL("..", import.meta.url)));
const desktopDirectory = join(workspace, "packages", "happy-desktop-electron");
const require = createRequire(join(desktopDirectory, "package.json"));
const { Arch, Platform, build } = require("electron-builder");
const packageJson = JSON.parse(await readFile(join(desktopDirectory, "package.json"), "utf8"));
const releaseVersion = desktopBuildVersion(process.env.RELEASE_VERSION, packageJson.version);
packageJson.version = releaseVersion;
const architecture = argument("--arch", ["arm64", "x64"], process.arch === "x64" ? "x64" : "arm64");
const selectedFlavor = desktopFlavorRead("standard");

if (process.platform !== "darwin") throw new Error("Happy macOS builds must be built on macOS.");

await run("pnpm", ["--dir", "packages/happy-desktop-electron", "typecheck"]);
await rm(join(desktopDirectory, "dist"), { force: true, recursive: true });
await run("pnpm", ["--dir", "packages/happy-desktop-electron", "exec", "vite", "build"]);
for (const viteConfig of ["vite.main.config.ts", "vite.preload.config.ts"])
    await run(
        "pnpm",
        [
            "--dir",
            "packages/happy-desktop-electron",
            "exec",
            "vite",
            "build",
            "--config",
            viteConfig,
        ],
        { HAPPY_DESKTOP_SELF_UPDATE: "off" },
    );

const staging = join("release", ".staging", "standard-unsigned");
await rm(join(desktopDirectory, staging), { force: true, recursive: true });
await run("pnpm", [
    "--config.inject-workspace-packages=true",
    "--config.node-linker=hoisted",
    "--os",
    "darwin",
    "--cpu",
    architecture,
    "--filter",
    "happy-desktop-electron",
    "deploy",
    "--prod",
    join("packages", "happy-desktop-electron", staging),
]);
await stagedPackagePrepare(join(desktopDirectory, staging, "package.json"));
const output = join("release", "standard-unsigned");
await rm(join(desktopDirectory, output), { force: true, recursive: true });
await mkdir(join(desktopDirectory, output), { recursive: true });
try {
    await build({
        config: builderConfiguration(packageJson.build, output, staging),
        projectDir: join(desktopDirectory, staging),
        publish: "never",
        targets: Platform.MAC.createTarget(
            ["zip"],
            architecture === "arm64" ? Arch.arm64 : Arch.x64,
        ),
    });
} finally {
    await rm(join(desktopDirectory, staging), { force: true, recursive: true });
}
const application = await buildVerify(output);
console.log(`Built ${application} (${releaseVersion}, ad-hoc signed, not notarized).`);

function builderConfiguration(base, output, app) {
    const buildResources = join(desktopDirectory, "build");
    const entitlements = join(buildResources, "entitlements.mac.plist");
    const icon = join(desktopDirectory, "assets", "app-icon", "generated", "app-icon.icns");
    return {
        ...structuredClone(base),
        appId: selectedFlavor.appId,
        productName: selectedFlavor.productName,
        artifactName: `${selectedFlavor.artifactPrefix}-\${version}-\${arch}.\${ext}`,
        beforeBuild: () => false,
        electronVersion: packageJson.devDependencies.electron.replace(/^\D+/u, ""),
        directories: { buildResources, output: join(desktopDirectory, output) },
        extraResources: [
            {
                from: join(desktopDirectory, app, "node_modules"),
                to: "node_modules",
                filter: [
                    "**/*",
                    "!.pnpm{,/**/*}",
                    "!.modules.yaml",
                    "!.pnpm-workspace-state-v1.json",
                    "!.bin{,/**/*}",
                ],
            },
        ],
        mac: {
            ...base.mac,
            entitlements,
            entitlementsInherit: entitlements,
            icon,
            // "-" is an ad-hoc signature: no certificate, so no notarization,
            // and the hardened runtime a notarized app needs is not required.
            identity: "-",
            hardenedRuntime: false,
            notarize: false,
        },
        publish: { ...structuredClone(base.publish), channel: selectedFlavor.channel },
    };
}

async function stagedPackagePrepare(path) {
    const metadata = JSON.parse(await readFile(path, "utf8"));
    metadata.version = releaseVersion;
    delete metadata.build;
    delete metadata.devDependencies;
    // electron-builder names the updater cache after the staged package name.
    metadata.name = selectedFlavor.updaterCacheDirName.slice(0, -"-updater".length);
    await writeFile(path, `${JSON.stringify(metadata, null, 4)}\n`);
}

/** The checks of build-mac-apps.mjs that do not depend on Apple credentials. */
async function buildVerify(output) {
    const application = join(
        desktopDirectory,
        output,
        architecture === "arm64" ? "mac-arm64" : "mac",
        `${selectedFlavor.productName}.app`,
    );
    const updaterConfiguration = parse(
        await readFile(join(application, "Contents", "Resources", "app-update.yml"), "utf8"),
    );
    if (`${String(updaterConfiguration.channel)}` !== selectedFlavor.channel)
        throw new Error(`The packaged updater channel is ${String(updaterConfiguration.channel)}.`);
    packagedMainModulesVerify(join(application, "Contents", "Resources", "app.asar"), [
        "dist/main.js",
        "dist/happyAgentRendererUtility.js",
    ]);
    await run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", application]);
    return application;
}

function argument(name, allowed, fallback) {
    const prefix = `${name}=`;
    const value = process.argv.find((entry) => entry.startsWith(prefix))?.slice(prefix.length);
    if (value === undefined) return fallback;
    if (!allowed.includes(value)) throw new Error(`${name} must be one of ${allowed.join(", ")}.`);
    return value;
}

function run(command, args, environment = {}) {
    return new Promise((resolvePromise, reject) => {
        const child = spawn(command, args, {
            cwd: workspace,
            env: { ...process.env, ...environment },
            stdio: "inherit",
        });
        child.once("error", reject);
        child.once("exit", (code, signal) => {
            if (code === 0) resolvePromise();
            else
                reject(
                    new Error(
                        `${command} failed${signal ? ` with ${signal}` : ` with exit code ${code}`}.`,
                    ),
                );
        });
    });
}
