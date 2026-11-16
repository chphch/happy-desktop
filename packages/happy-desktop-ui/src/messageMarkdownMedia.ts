import { INLINE_PAGE_MAX_HEIGHT } from "./inlinePageFit";
import type { MessageMarkdownAst } from "./messageMarkdownAst";

/*
 * What a reply draws in place of a piece of its Markdown, and what it measures
 * once it has been drawn.
 *
 * A fence whose info string is exactly `artifact` is a page: the HTML in it is
 * drawn as a static page in the reply (`MessageHtmlPage`) once the reply has
 * settled, and as its source until then. It applies to the top level of a
 * message body only: one inside a list or a quote stays a code block. The
 * renderer and the row model read the same rule here, so the box one reserves
 * is the box the other draws.
 *
 * A page's height is not known before it is drawn: it comes from laying the
 * page out. It is kept here by the page's source — the one change when it is
 * first learned, and the exact box at once on every later mount. Bounded, and
 * memory only.
 */

type MarkdownBlock = MessageMarkdownAst["children"][number];

/** How many pages' heights are kept; the oldest is forgotten first. */
const MEDIA_LIMIT = 512;

const pageHeights = new Map<string, number>();
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

/** The height a page last measured at, in CSS pixels; absent before it has been laid out. */
export function messagePageHeight(source: string): number | undefined {
    return pageHeights.get(source);
}

/** Keeps the content height a page measured itself at. */
export function messagePageHeightRecord(source: string, height: number): void {
    if (!Number.isFinite(height) || height < 0) return;
    const value = Math.min(INLINE_PAGE_MAX_HEIGHT, Math.ceil(height));
    if (pageHeights.get(source) === value) return;
    remember(pageHeights, source, value);
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
 * key: empty when, with `pages`, it holds no page; otherwise each page's
 * height or `?`.
 */
export function messageMarkdownMediaSignature(tree: MessageMarkdownAst, pages: boolean): string {
    if (!pages) return "";
    let signature = "";
    for (const node of tree.children) {
        const page = messagePageSource(node);
        if (page === undefined) continue;
        const height = pageHeights.get(page);
        signature += height === undefined ? "p?," : `p${String(height)},`;
    }
    return signature;
}
