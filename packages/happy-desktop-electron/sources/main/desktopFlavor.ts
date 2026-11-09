declare const __HAPPY_DESKTOP_FLAVOR__: "local-web" | "standard";
declare const __HAPPY_LOCAL_WEB_ORIGIN__: string | null;
declare const __HAPPY_DESKTOP_SELF_UPDATE__: boolean | undefined;

/**
 * Whether this build updates itself from the published releases. A build made
 * with HAPPY_DESKTOP_SELF_UPDATE=off is not one of them, and never asks.
 */
export const desktopSelfUpdate: boolean =
    typeof __HAPPY_DESKTOP_SELF_UPDATE__ === "boolean" ? __HAPPY_DESKTOP_SELF_UPDATE__ : true;

export type DesktopFlavor =
    | { readonly kind: "standard" }
    | { readonly kind: "local-web"; readonly rendererOrigin: string };

/** Build-time desktop policy; packaged local-web builds cannot redirect it at runtime. */
export const desktopFlavor: DesktopFlavor =
    __HAPPY_DESKTOP_FLAVOR__ === "local-web"
        ? {
              kind: "local-web",
              rendererOrigin: requiredLocalWebOrigin(__HAPPY_LOCAL_WEB_ORIGIN__),
          }
        : { kind: "standard" };

function requiredLocalWebOrigin(value: string | null): string {
    if (!value) throw new Error("The local-web desktop renderer origin is missing.");
    const url = new URL(value);
    if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash
    )
        throw new Error("The local-web desktop renderer must be an exact HTTPS origin.");
    return url.origin;
}
