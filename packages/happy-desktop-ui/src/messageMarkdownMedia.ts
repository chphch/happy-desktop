import { inlineImageSize } from "happy-desktop-state";
import { INLINE_PAGE_MAX_HEIGHT } from "./inlinePageFit";
import { MESSAGE_MEDIA_LIMITS, mediaJustifiedPlan, type MediaFlowPlan } from "./mediaLayout";
import type { MessageMarkdownAst } from "./messageMarkdownAst";

/*
 * What a reply draws in place of two pieces of its Markdown, and what each
 * measures once it has been drawn.
 *
 * A fence whose info string is exactly `artifact` is a page: the HTML in it is
 * drawn as a static page in the reply (`MessageHtmlPage`) once the reply has
 * settled, and as its source until then. A paragraph that is nothing but one
 * picture at an address the app may load (`messagePictureSource`) is that
 * picture (`MessagePicture`). Both apply to the top level of a message body
 * only: a picture inside a sentence, and either one inside a list or a quote,
 * stay what Markdown makes of them. The renderer and the row model read the
 * same rules here, so the box one reserves is the box the other draws.
 *
 * Neither size is known before it is drawn: a page's height comes from laying
 * it out, a picture's shape from its bytes. Each is kept here by its source —
 * the one change when it is first learned, and the exact box at once on every
 * later mount. Bounded, and memory only.
 */

type MarkdownBlock = MessageMarkdownAst["children"][number];

/** A picture's own size in pixels. */
export type MessagePictureSize = { readonly width: number; readonly height: number };

/** How many pages' heights and pictures' sizes are kept; the oldest is forgotten first. */
const MEDIA_LIMIT = 512;

const pageHeights = new Map<string, number>();
const pictureSizes = new Map<string, MessagePictureSize>();
const listeners = new Set<() => void>();
let version = 0;

function remember<Value>(memory: Map<string, Value>, key: string, value: Value): void {
    memory.delete(key);
    memory.set(key, value);
    if (memory.size > MEDIA_LIMIT) memory.delete(memory.keys().next().value!);
    version += 1;
    for (const listener of listeners) listener();
}

/** The fence `node` is, when it is a page: the HTML it holds. */
export function messagePageSource(node: MarkdownBlock): string | undefined {
    return node.type === "code" && node.lang === "artifact" && !node.meta ? node.value : undefined;
}

/**
 * The height a page last measured at, in CSS pixels; absent before it has been
 * laid out. `at` is the version a render read (`messageMarkdownMediaVersion`),
 * so a memoized render asks again exactly when a height arrives.
 */
export function messagePageHeight(source: string, _at: number = version): number | undefined {
    return pageHeights.get(source);
}

/** Keeps the content height a page measured itself at. */
export function messagePageHeightRecord(source: string, height: number): void {
    if (!Number.isFinite(height) || height < 0) return;
    const value = Math.min(INLINE_PAGE_MAX_HEIGHT, Math.ceil(height));
    if (pageHeights.get(source) === value) return;
    remember(pageHeights, source, value);
}

/*
 * Hosts a picture is never fetched from, whatever the address says: the
 * agent's own address carries the window's credentials, and a machine on the
 * reader's network — a bare name, a `.local` name, a private, loopback,
 * link-local or carrier-grade address (the tailnet), or any IPv6 literal —
 * would let a reply reach past the internet into it.
 */
const PRIVATE_SUFFIXES = [".local", ".localhost", ".internal", ".home.arpa", ".lan"];

function pictureHostPublic(hostname: string): boolean {
    const host = hostname.toLowerCase();
    if (host === "happy-agent" || host === "localhost") return false;
    if (PRIVATE_SUFFIXES.some((suffix) => host.endsWith(suffix))) return false;
    if (host.startsWith("[") || host.includes(":")) return false;
    const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/u.exec(host);
    if (ipv4) {
        const first = Number(ipv4[1]);
        const second = Number(ipv4[2]);
        return !(
            first === 0 ||
            first === 10 ||
            first === 127 ||
            first >= 224 ||
            (first === 100 && second >= 64 && second <= 127) ||
            (first === 169 && second === 254) ||
            (first === 172 && second >= 16 && second <= 31) ||
            (first === 192 && second === 168)
        );
    }
    return host.includes(".");
}

/**
 * The address a Markdown picture is drawn from, or `undefined` when it stays
 * the labelled link Markdown images otherwise are. Only two kinds load: a
 * `data:image/…` address, whose bytes are already in the reply and so fetch
 * nothing, and an `https:` address on a public host. Plain `http:` is never
 * fetched, since it is how a reply would reach a router or another device on
 * the reader's own network; nor is a relative path, a file, or a blob.
 *
 * Drawing a picture fetches it the moment the reply is shown, so the host
 * learns the reader's address. Upstream Happy draws every Markdown image as a
 * link for that reason; this fork draws them, as the earlier web app did.
 */
export function messagePictureSource(url: string | null | undefined): string | undefined {
    const value = url?.trim();
    if (!value) return undefined;
    if (/^data:image\/[a-z0-9.+-]+[;,]/iu.test(value)) return value;
    let parsed: URL;
    try {
        parsed = new URL(value);
    } catch {
        return undefined;
    }
    if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "")
        return undefined;
    return pictureHostPublic(parsed.hostname) ? parsed.href : undefined;
}

/** The picture `node` is, when it is a paragraph holding one picture and nothing else. */
export function messagePicture(
    node: MarkdownBlock,
): { readonly url: string; readonly alt: string } | undefined {
    if (node.type !== "paragraph") return undefined;
    const content = node.children.filter(
        (child) => !(child.type === "text" && child.value.trim() === ""),
    );
    const only = content.length === 1 ? content[0] : undefined;
    if (only?.type !== "image") return undefined;
    const url = messagePictureSource(only.url);
    return url === undefined ? undefined : { url, alt: only.alt ?? "" };
}

/**
 * A picture's size: the one its bytes reported once drawn, or for a `data:`
 * address the one its header states, which is known before anything loads.
 * `at` is the version a render read, as for `messagePageHeight`.
 */
export function messagePictureSize(
    url: string,
    _at: number = version,
): MessagePictureSize | undefined {
    const learned = pictureSizes.get(url);
    if (learned) return learned;
    if (!url.startsWith("data:")) return undefined;
    const comma = url.indexOf(",");
    if (comma === -1 || !url.slice(0, comma).toLowerCase().endsWith(";base64")) return undefined;
    return inlineImageSize(url.slice(comma + 1));
}

/** Keeps the size a picture's bytes reported. */
export function messagePictureSizeRecord(url: string, size: MessagePictureSize): void {
    if (!(size.width > 0 && size.height > 0)) return;
    const held = messagePictureSize(url);
    if (held?.width === size.width && held.height === size.height) return;
    remember(pictureSizes, url, { width: size.width, height: size.height });
}

/**
 * How a picture is laid out: alone, at its own shape, within the bounds a
 * message's own photos have; 4:3 until its size is known.
 */
export function messagePicturePlan(size: MessagePictureSize | undefined): MediaFlowPlan {
    return mediaJustifiedPlan([size ?? {}], MESSAGE_MEDIA_LIMITS);
}

/** Changes whenever a size is learned; a layout that read the sizes reads them again. */
export function messageMarkdownMediaVersion(): number {
    return version;
}

export function messageMarkdownMediaSubscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/**
 * What the top level of `tree` reads from learned sizes, as part of a cache
 * key: empty when it holds no picture and, with `pages`, no page; otherwise
 * each one's size or `?`. `at` is the version the caller read, so a value
 * derived from it is recomputed exactly when a size arrives.
 */
export function messageMarkdownMediaSignature(
    tree: MessageMarkdownAst,
    pages: boolean,
    _at: number = version,
): string {
    let signature = "";
    for (const node of tree.children) {
        const picture = messagePicture(node);
        if (picture !== undefined) {
            const size = messagePictureSize(picture.url);
            signature += size ? `${String(size.width)}x${String(size.height)},` : "?,";
            continue;
        }
        if (!pages) continue;
        const page = messagePageSource(node);
        if (page === undefined) continue;
        const height = pageHeights.get(page);
        signature += height === undefined ? "p?," : `p${String(height)},`;
    }
    return signature;
}
