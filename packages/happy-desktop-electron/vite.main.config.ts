import { resolve } from "node:path";
import { defineConfig } from "vite";

const flavor = process.env.HAPPY_DESKTOP_FLAVOR === "local-web" ? "local-web" : "standard";
const localWebOrigin =
    flavor === "local-web"
        ? process.env.HAPPY_LOCAL_WEB_ORIGIN || "https://local.app.happy.engineering"
        : null;
// A build the published releases do not come from, such as a fork's own, turns
// self-update off so the updater never replaces it with one of them.
const selfUpdate = process.env.HAPPY_DESKTOP_SELF_UPDATE !== "off";

export default defineConfig({
    define: {
        __HAPPY_DESKTOP_FLAVOR__: JSON.stringify(flavor),
        __HAPPY_LOCAL_WEB_ORIGIN__: JSON.stringify(localWebOrigin),
        __HAPPY_DESKTOP_SELF_UPDATE__: JSON.stringify(selfUpdate),
    },
    publicDir: false,
    build: {
        ssr: true,
        emptyOutDir: false,
        outDir: "dist",
        rollupOptions: {
            input: {
                main: resolve(import.meta.dirname, "sources/main/main.ts"),
                happyAgentRendererUtility: resolve(
                    import.meta.dirname,
                    "sources/utility/utility.ts",
                ),
            },
            external: [
                "electron",
                "electron-updater",
                "ws",
                // node-usb is native: loaded from node_modules at first use.
                "usb",
                // Native FFI reads Low Power Mode and battery saver from system libraries.
                // Keep its prebuilt N-API modules in node_modules.
                "koffi",
                // Kept out of the bundle and shipped as a runtime dependency.
                // Nothing in the main process imports it since the notes
                // collection was removed, so this entry is inert; it is left in
                // place rather than changing the host build for no gain.
                "yjs",
            ],
            output: {
                entryFileNames: "[name].js",
            },
        },
    },
});
