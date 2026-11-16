import { happyAgentArtifactReferenceResolve } from "happy-desktop-state";

/**
 * What a page a reply wrote may load: nothing from anywhere. Its pictures and
 * fonts are data inside it, its styles are its own text. The frame already
 * inherits the window's policy and runs no script; this narrows it further, so
 * a page cannot fetch from its author's host, from the app's own origin, or
 * from the agent merely by being looked at.
 */
const PAGE_POLICY =
    "default-src 'none'; img-src data: blob:; media-src data: blob:; font-src data:; style-src 'unsafe-inline'; frame-src data:";

/** The element holding the host's values in a page, replaced when the appearance changes. */
export const MESSAGE_HTML_PAGE_HOST_STYLE = "happy-message-page-host";

/** Marks a page document, so a frame still showing `about:blank` is never measured as one. */
export const MESSAGE_HTML_PAGE_ATTRIBUTE = "data-happy-message-page";

/**
 * The page is laid out at its content's height, whatever it says about its
 * own: the frame is as tall as what it reports, so a root sized to the frame
 * would only ever report the frame back. It never scrolls up and down; one too
 * wide for the reply scrolls sideways, as a wide table in a reply does.
 */
const PAGE_STYLE = [
    "html, body { height: auto !important; min-height: 0 !important; }",
    "html { overflow: hidden !important; }",
    ":where(body) { margin: 0; overflow-x: auto; color: var(--happy-host-text, CanvasText); font: 16px/24px var(--happy-host-font, system-ui, sans-serif); }",
    ":where(img, video, canvas) { max-width: 100%; height: auto; }",
    ":where(svg) { max-width: 100%; }",
].join("\n");

/**
 * The host's values and the reply's colour scheme, which the appearance
 * changes; `:where` keeps both weaker than anything the page says.
 */
function hostStyleOf(hostStyle: string, scheme: "light" | "dark"): string {
    return `${hostStyle}\n:where(html) { color-scheme: ${scheme}; }`;
}

/**
 * The document a ```` ```artifact ```` fence in a reply is drawn as: the
 * fence's HTML, made into a static page for a sandboxed `srcdoc` frame.
 *
 * Scripts, `<base>`, refreshes and every `<link>` are dropped, since none of
 * them could do anything here. A link to the web opens outside the frame,
 * where the window decides where a web address goes; a link inside the page
 * stays; a link to anything else is its words. The page is drawn in the
 * reply's colour scheme — `data-theme` on its root names it, for a page that
 * styles itself by it — with the host's values (`hostStyle`, from
 * `artifactPageHostStyle`) for one that uses them, on the reply's own surface.
 */
export function messageHtmlPageDocument(
    source: string,
    hostStyle: string,
    scheme: "light" | "dark",
): string {
    const document = new DOMParser().parseFromString(source, "text/html");
    for (const element of document.querySelectorAll(
        "script, base, meta[http-equiv], object, embed, link",
    ))
        element.remove();
    for (const anchor of document.querySelectorAll("a[href], area[href]")) {
        const target = happyAgentArtifactReferenceResolve(
            "index.html",
            anchor.getAttribute("href") ?? "",
        );
        if (target.type === "web") {
            anchor.setAttribute("href", target.url);
            anchor.setAttribute("target", "_blank");
            anchor.setAttribute("rel", "noopener noreferrer");
        } else if (target.type === "fragment") {
            anchor.setAttribute("href", `#${target.fragment}`);
            anchor.removeAttribute("target");
        } else {
            anchor.removeAttribute("href");
        }
    }
    const root = document.documentElement;
    root.setAttribute(MESSAGE_HTML_PAGE_ATTRIBUTE, "");
    root.setAttribute("data-theme", scheme);
    const policy = document.createElement("meta");
    policy.setAttribute("http-equiv", "Content-Security-Policy");
    policy.setAttribute("content", PAGE_POLICY);
    const referrer = document.createElement("meta");
    referrer.setAttribute("name", "referrer");
    referrer.setAttribute("content", "no-referrer");
    const host = document.createElement("style");
    host.id = MESSAGE_HTML_PAGE_HOST_STYLE;
    host.textContent = hostStyleOf(hostStyle, scheme);
    const base = document.createElement("style");
    base.textContent = PAGE_STYLE;
    document.head.prepend(policy, referrer, host, base);
    return `<!doctype html>\n${root.outerHTML}`;
}

/**
 * The scheme and host values of a page already shown, set again in place.
 * Values that have not changed are left alone: the host's style carries the
 * app's typefaces, and setting it again would make the page parse it again.
 */
export function messageHtmlPageRestyle(
    document: Document,
    hostStyle: string,
    scheme: "light" | "dark",
): void {
    const root = document.documentElement;
    if (root.getAttribute("data-theme") !== scheme) root.setAttribute("data-theme", scheme);
    const host = document.getElementById(MESSAGE_HTML_PAGE_HOST_STYLE);
    const next = hostStyleOf(hostStyle, scheme);
    if (host && host.textContent !== next) host.textContent = next;
}
