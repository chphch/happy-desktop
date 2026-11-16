import { type ReactNode } from "react";
import {
    artifactPageHostObserve,
    artifactPageHostStyle,
    artifactPageScheme,
} from "./artifactPageHost";
import {
    MESSAGE_HTML_PAGE_ATTRIBUTE,
    messageHtmlPageDocument,
    messageHtmlPageRestyle,
} from "./messageHtmlPageDocument";

export interface MessageHtmlPageProps {
    /** The page's HTML, as the reply wrote it. */
    readonly source: string;
    /**
     * The height the transcript reserves for the page, the last it measured;
     * absent until it has been laid out once.
     */
    readonly height?: number;
    /** Every content height the page settles on, at the width it is drawn at. */
    onHeightChange(height: number): void;
    /** What stands in the page's place until its height is known: its source. */
    readonly children?: ReactNode;
    /** The page's name, for anyone who cannot see it. */
    readonly label?: string;
    readonly "data-testid"?: string;
}

/** The source each frame was last handed, so a re-render never reloads it. */
const frameSources = new WeakMap<HTMLIFrameElement, string>();

/**
 * C-352 MessageHtmlPage — the page a reply wrote in a ```` ```artifact ````
 * fence, drawn in place in the reply at its full height.
 *
 * It is static: HTML, CSS and SVG, and nothing else. The frame's sandbox
 * grants no script, so nothing in the page runs, and the page loads nothing —
 * not from the web, not from the app, not from the agent (see
 * `messageHtmlPageDocument`). `allow-same-origin` is granted only so that the
 * transcript can read the height the page lays out at; with no script, the
 * page itself can do nothing with it. A link to the web leaves through the
 * window's own link handling. A page that needs to run belongs in an artifact,
 * which the conversation runs live.
 *
 * The transcript sizes its rows from a model, so the page is measured before
 * it is shown: until a height is known the fence's source stands in its place
 * and the page is laid out in a hidden frame at the same width. Then the page
 * replaces the source in the same frame, at that height, on the reply's own
 * surface, with no frame or background of its own. It never scrolls inside;
 * it is measured again whenever its width or the appearance changes.
 */
export function MessageHtmlPage(props: MessageHtmlPageProps) {
    const ready = props.height !== undefined;
    const { source, height, onHeightChange } = props;
    const mount = (frame: HTMLIFrameElement | null) => {
        if (frame === null) return;
        if (frameSources.get(frame) !== source) {
            frameSources.set(frame, source);
            frame.srcdoc = messageHtmlPageDocument(
                source,
                artifactPageHostStyle(frame, "inline"),
                artifactPageScheme(frame),
            );
        }
        /* What this frame last reported, so the same height is said once. */
        let reported = height;
        const page = () => {
            const document = frame.contentDocument;
            return document?.documentElement.hasAttribute(MESSAGE_HTML_PAGE_ATTRIBUTE) === true
                ? document
                : undefined;
        };
        const measure = () => {
            const document = page();
            if (document === undefined) return;
            const measured = Math.ceil(document.documentElement.getBoundingClientRect().height);
            if (measured === reported) return;
            reported = measured;
            onHeightChange(measured);
        };
        const loaded = () => {
            measure();
            void page()?.fonts.ready.then(measure);
        };
        const restyle = () => {
            const document = page();
            if (document === undefined) return;
            messageHtmlPageRestyle(
                document,
                artifactPageHostStyle(frame, "inline"),
                artifactPageScheme(frame),
            );
            measure();
        };
        frame.addEventListener("load", loaded);
        // A frame already showing its page (a re-render) measures now.
        if (page() !== undefined) restyle();
        /* Its width is the reply's: a narrower window re-wraps the page. */
        const resized = new ResizeObserver(measure);
        resized.observe(frame);
        const unobserve = artifactPageHostObserve(frame, restyle);
        return () => {
            frame.removeEventListener("load", loaded);
            resized.disconnect();
            unobserve();
        };
    };
    return (
        <div
            className="happy-message__page"
            data-happy-desktop-ui="message-html-page"
            data-state={ready ? "ready" : "measuring"}
            data-testid={props["data-testid"]}
            style={ready ? { height } : undefined}
        >
            {ready ? null : props.children}
            <iframe
                aria-hidden={ready ? undefined : true}
                className="happy-message__page-frame"
                data-happy-desktop-ui="message-html-page-frame"
                ref={mount}
                referrerPolicy="no-referrer"
                // No `allow-scripts`: nothing in the page runs. See above for
                // why `allow-same-origin` is safe without it.
                sandbox="allow-same-origin allow-popups"
                tabIndex={ready ? undefined : -1}
                title={props.label ?? "Page"}
            />
        </div>
    );
}
