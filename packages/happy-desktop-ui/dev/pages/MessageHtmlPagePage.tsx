import { useState } from "react";
import {
    agentAuthor,
    happyAgentOwnerAuthor,
    type ComposerSnapshot,
    type ConversationAuthor,
    type ConversationEntry,
} from "happy-desktop-state";
import { ConversationDock } from "../../src/ConversationDock";
import { ConversationView } from "../../src/ConversationView";
import { MessageHtmlPage } from "../../src/MessageHtmlPage";
import { ThemeScope } from "../../src/ThemeScope";
import { ComponentPage, FullScreenSpecimen, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-352";

const noop = () => undefined;

/** A page as an agent writes one: its own styles, a chart in SVG, a table, no script. */
const PAGE = [
    "<style>",
    "  .summary { display: flex; gap: 16px; align-items: center; margin-bottom: 12px; }",
    "  .summary svg { flex: none; }",
    "  .muted { color: var(--happy-host-muted); }",
    "  table { border-collapse: collapse; width: 100%; font-size: 14px; line-height: 20px; }",
    "  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--happy-host-border); }",
    "  th { color: var(--happy-host-muted); font-weight: 500; }",
    "  .passed { color: var(--happy-host-added); }",
    "  .running { color: var(--happy-host-accent); }",
    "</style>",
    '<div class="summary">',
    '  <svg viewBox="0 0 64 64" width="56" height="56" role="img" aria-label="3 of 4 checks passed">',
    '    <circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" stroke-opacity="0.15" stroke-width="8"/>',
    '    <circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" stroke-width="8"',
    '      stroke-dasharray="123 164" transform="rotate(-90 32 32)"/>',
    "  </svg>",
    '  <div><strong>Release checks</strong><br><span class="muted">3 of 4 passed</span></div>',
    "</div>",
    "<table>",
    "  <tr><th>Check</th><th>Result</th><th>Time</th></tr>",
    '  <tr><td>Typecheck</td><td class="passed">Passed</td><td>41 s</td></tr>',
    '  <tr><td>Lint</td><td class="passed">Passed</td><td>18 s</td></tr>',
    '  <tr><td>Build</td><td class="passed">Passed</td><td>1 min 12 s</td></tr>',
    '  <tr><td>Browser tests</td><td class="running">Running</td><td>—</td></tr>',
    "</table>",
].join("\n");

/** The fence's source, as the reply shows it until the page has measured. */
function Source(props: { readonly source: string }) {
    return (
        <pre
            style={{ margin: 0, whiteSpace: "pre-wrap", font: "12px/18px var(--happy-font-mono)" }}
        >
            {props.source}
        </pre>
    );
}

/** The page as a transcript holds it: measured unseen, then shown at that height. */
function Measured(props: { readonly source: string }) {
    const [height, setHeight] = useState<number | undefined>(undefined);
    return (
        <MessageHtmlPage
            onHeightChange={setHeight}
            source={props.source}
            {...(height === undefined ? {} : { height })}
        >
            <Source source={props.source} />
        </MessageHtmlPage>
    );
}

const COMPOSER: ComposerSnapshot = {
    agentUserIds: [],
    attachments: [],
    capabilities: { commands: [], mentions: false, shellMode: false },
    focused: false,
    mentionCandidates: [],
    revision: 0,
    scopeId: "message-html-page",
    submission: { status: "idle" },
    text: "",
};

const REPLY = [
    "Here is where the release stands:",
    "",
    "```artifact",
    PAGE,
    "```",
    "",
    "The browser tests are the last thing still running.",
].join("\n");

function message(
    id: string,
    sender: ConversationAuthor,
    text: string,
    createdAt: string,
): ConversationEntry {
    return {
        kind: "message",
        source: "server",
        delivery: "sent",
        message: {
            id,
            chatId: "message-html-page",
            sequence: id,
            changePts: id,
            sender,
            text,
            attachments: [],
            reactions: [],
            createdAt,
            generationStatus: "complete",
        },
    };
}

const TRANSCRIPT: readonly ConversationEntry[] = [
    message(
        "1",
        happyAgentOwnerAuthor,
        "Show me the release checks as a page.",
        "2026-11-16T09:40:00.000Z",
    ),
    message("2", agentAuthor, REPLY, "2026-11-16T09:41:00.000Z"),
];

function TranscriptWindow(props: { readonly mode: "light" | "dark" }) {
    return (
        <ThemeScope mode={props.mode}>
            <div
                style={{
                    background: "var(--surface)",
                    display: "flex",
                    height: "100%",
                    width: "100%",
                }}
            >
                <ConversationView
                    agentAuthor={agentAuthor}
                    dock={
                        <ConversationDock
                            composer={COMPOSER}
                            composerPlaceholder="Message Happy…"
                            onComposerSend={noop}
                            onComposerValueChange={noop}
                            running={false}
                        />
                    }
                    conversationId={`message-html-page-${props.mode}`}
                    entries={TRANSCRIPT}
                    running={false}
                    style={{ flex: "1 1 auto", minWidth: 0 }}
                    viewerId={happyAgentOwnerAuthor.id}
                />
            </div>
        </ThemeScope>
    );
}

export function MessageHtmlPagePage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="A reply's ```artifact fence, drawn in place as a static page: its HTML, CSS and SVG on the reply's own surface at its full height. Nothing in it runs and it loads nothing. Until its height is known the fence's source stands in its place."
            title="MessageHtmlPage"
        >
            <Specimen
                detail="Measured unseen at this width, then shown at that height, in the reply's colour scheme"
                label="Page"
                number="00"
                stage="surface"
            >
                <div style={{ width: "560px" }}>
                    <Measured source={PAGE} />
                </div>
            </Specimen>
            <Specimen
                detail="Before the page has a height the fence's source stands in its place"
                label="Measuring"
                number="01"
                stage="surface"
            >
                <div style={{ width: "560px" }}>
                    <MessageHtmlPage onHeightChange={noop} source={PAGE}>
                        <Source source={PAGE} />
                    </MessageHtmlPage>
                </div>
            </Specimen>
            <FullScreenSpecimen
                detail="An agent reply with an artifact fence between two paragraphs"
                label="In a conversation · light"
                number="10"
                screen="10-transcript-light-780x620"
                window={{ width: 780, height: 620 }}
            >
                <TranscriptWindow mode="light" />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="The same reply in the dark theme"
                label="In a conversation · dark"
                number="11"
                screen="11-transcript-dark-780x620"
                window={{ width: 780, height: 620 }}
            >
                <TranscriptWindow mode="dark" />
            </FullScreenSpecimen>
        </ComponentPage>
    );
}
