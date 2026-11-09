// Builds Happy (the standard flavor) for Windows x64 without a code-signing
// identity, for this fork's own use (branch agent-custom). It follows
// scripts/build-mac-unsigned.mjs, which follows the release scripts, and can
// run on Linux: the production install is staged for win32 x64 with
// `pnpm deploy --os win32 --cpu x64`, because koffi ships its native binary as
// a per-platform optional package that an install on Linux would not fetch.
// Self-update is off (HAPPY_DESKTOP_SELF_UPDATE=off), as in the macOS build.
//
// Two phases, so each runs where its tools are:
//   node scripts/build-windows-unsigned.mjs --stage     needs pnpm (any OS)
//   node scripts/build-windows-unsigned.mjs --package   needs Wine off Windows
// With no phase it runs both. electron-builder runs Wine to edit the .exe's
// icon and version and to build the NSIS uninstaller; the image
// electronuserland/builder:wine provides it.
//
// Output: packages/happy-desktop-electron/release/standard-windows-unsigned/
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { access, mkdir, open, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { desktopFlavorRead } from "./desktopFlavors.mjs";
import { desktopBuildVersion } from "./release/desktopVersion.mjs";
import { packagedMainModulesVerify } from "./verify-packaged-main-modules.mjs";

const workspace = resolve(fileURLToPath(new URL("..", import.meta.url)));
const desktopDirectory = join(workspace, "packages", "happy-desktop-electron");
const require = createRequire(join(desktopDirectory, "package.json"));
const packageJson = JSON.parse(await readFile(join(desktopDirectory, "package.json"), "utf8"));
const releaseVersion = desktopBuildVersion(process.env.RELEASE_VERSION, packageJson.version);
packageJson.version = releaseVersion;
const selectedFlavor = desktopFlavorRead("standard");
const staging = join("release", ".staging", "standard-windows-unsigned");
const output = join("release", "standard-windows-unsigned");
const phase = process.argv.includes("--stage")
    ? "stage"
    : process.argv.includes("--package")
      ? "package"
      : "all";

if (phase !== "package") await stage();
if (phase !== "stage") await packageInstaller();

async function stage() {
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
    await rm(join(desktopDirectory, staging), { force: true, recursive: true });
    await run("pnpm", [
        "--config.inject-workspace-packages=true",
        "--config.node-linker=hoisted",
        "--os",
        "win32",
        "--cpu",
        "x64",
        "--filter",
        "happy-desktop-electron",
        "deploy",
        "--prod",
        join("packages", "happy-desktop-electron", staging),
    ]);
    const path = join(desktopDirectory, staging, "package.json");
    const metadata = JSON.parse(await readFile(path, "utf8"));
    metadata.version = releaseVersion;
    delete metadata.build;
    delete metadata.devDependencies;
    // electron-builder names the updater cache after the staged package name.
    metadata.name = selectedFlavor.updaterCacheDirName.slice(0, -"-updater".length);
    await writeFile(path, `${JSON.stringify(metadata, null, 4)}\n`);
    console.log(`Staged ${staging} for win32 x64.`);
}

async function packageInstaller() {
    const { Arch, Platform, build } = require("electron-builder");
    await access(join(desktopDirectory, staging, "package.json")).catch(() => {
        throw new Error(`Run --stage first: ${staging} is missing.`);
    });
    await rm(join(desktopDirectory, output), { force: true, recursive: true });
    await mkdir(join(desktopDirectory, output), { recursive: true });
    try {
        await build({
            config: builderConfiguration(packageJson.build),
            projectDir: join(desktopDirectory, staging),
            publish: "never",
            targets: Platform.WINDOWS.createTarget(["nsis"], Arch.x64),
        });
    } finally {
        await rm(join(desktopDirectory, staging), { force: true, recursive: true });
    }
    const installer = await buildVerify();
    console.log(`Built ${installer} (${releaseVersion}, unsigned, self-update off).`);
}

function builderConfiguration(base) {
    const icon = join(desktopDirectory, "assets", "app-icon", "generated", "app-icon.png");
    return {
        ...structuredClone(base),
        appId: selectedFlavor.appId,
        productName: selectedFlavor.productName,
        artifactName: `${selectedFlavor.artifactPrefix}-\${version}-\${arch}.\${ext}`,
        beforeBuild: () => false,
        electronVersion: packageJson.devDependencies.electron.replace(/^\D+/u, ""),
        directories: {
            buildResources: join(desktopDirectory, "build"),
            output: join(desktopDirectory, output),
        },
        extraResources: [
            {
                from: join(desktopDirectory, staging, "node_modules"),
                to: "node_modules",
                filter: [
                    "**/*",
                    "!.pnpm{,/**/*}",
                    "!.modules.yaml",
                    "!.pnpm-workspace-state-v1.json",
                    "!.bin{,/**/*}",
                    // usb ships prebuilds for every platform; keep Windows' own.
                    "!usb/prebuilds/{android,darwin,linux}-*{,/**}",
                ],
            },
        ],
        forceCodeSigning: false,
        win: { ...base.win, icon },
        publish: { ...structuredClone(base.publish), channel: selectedFlavor.channel },
    };
}

/** What can be checked without Windows: the payload, the updater and self-update. */
async function buildVerify() {
    const releaseDirectory = join(desktopDirectory, output);
    const resources = join(releaseDirectory, "win-unpacked", "resources");
    const updater = parse(await readFile(join(resources, "app-update.yml"), "utf8"));
    if (
        updater.channel !== selectedFlavor.channel ||
        updater.updaterCacheDirName !== selectedFlavor.updaterCacheDirName
    )
        throw new Error(
            `Packaged updater configuration does not match ${selectedFlavor.productName}.`,
        );
    const archive = join(resources, "app.asar");
    packagedMainModulesVerify(archive, ["dist/main.js", "dist/happyAgentRendererUtility.js"]);
    const electronBuilderRequire = createRequire(require.resolve("electron-builder/package.json"));
    const { extractFile } = electronBuilderRequire("@electron/asar");
    const main = extractFile(archive, join("dist", "main.js").replaceAll("/", sep)).toString(
        "utf8",
    );
    const updaterCall = main.slice(main.indexOf("desktopUpdaterCreate({"));
    if (!/^desktopUpdaterCreate\(\{[^}]*platform: void 0/u.test(updaterCall))
        throw new Error("The packaged main process still checks for updates.");
    const modules = join(resources, "node_modules");
    const nativeBinaries = [];
    for (const entry of await readdir(modules, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith(".node")) continue;
        const path = join(entry.parentPath, entry.name);
        const file = await open(path);
        const { buffer } = await file.read({ buffer: Buffer.alloc(2), position: 0 });
        await file.close();
        if (buffer.toString("latin1") !== "MZ")
            throw new Error(`Packaged native module is not a Windows binary: ${path}`);
        nativeBinaries.push(path.slice(modules.length + 1));
    }
    for (const required of [
        ["@koromix", "koffi-win32-x64"].join(sep),
        ["usb", "prebuilds", "win32-x64"].join(sep),
    ])
        if (!nativeBinaries.some((path) => path.startsWith(required)))
            throw new Error(`No Windows binary under node_modules/${required}.`);
    console.log(`Packaged Windows native modules: ${nativeBinaries.join(", ")}`);
    const installer = `${selectedFlavor.artifactPrefix}-${releaseVersion}-x64.exe`;
    await access(join(releaseDirectory, installer));
    return join(releaseDirectory, installer);
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
