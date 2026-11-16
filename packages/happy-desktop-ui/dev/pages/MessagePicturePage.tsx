import {
    agentAuthor,
    happyAgentOwnerAuthor,
    type ComposerSnapshot,
    type ConversationAuthor,
    type ConversationEntry,
} from "happy-desktop-state";
import { ConversationDock } from "../../src/ConversationDock";
import { ConversationView } from "../../src/ConversationView";
import { MessagePicture } from "../../src/MessagePicture";
import { ThemeScope } from "../../src/ThemeScope";
import { ComponentPage, FullScreenSpecimen, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-353";

const noop = () => undefined;

/** A 360 × 200 picture carried in the page itself, so nothing is fetched. */
const PICTURE =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAWgAAADICAIAAABK7OzYAAADKElEQVR42u3UgQnAIAxFwezTebuFo3QWKTiAziBIRDl4EyT8i/o3SZoqnEASOCSBQxI4JIFDEjgkCRySwCEJHJLAIQkckgQOSeCQBA5J4JAEDkkChyRwSAKHJHBIAockcEgSOCSBQxI4JIFDEjgkCRySwCEJHJLAIQkckgQOSeCQBA5J4JAEDkkChyRwSAKHJHBIAockcEgSOCSBQxI4JIFDEjgkCRySLoHjKZ8S2vXf/oYSAofAIXCAAxwCBzjAAQ5wgAMc4AAHOAQOcIBD4BA4wAEOgQMc4AAHOMABDnCAAxwCBzjAIXAIHOAAh8ABDnCAAxzgAAc4wAEOcIADHOAQOAQOgUPgAAc4wAEOcIADHOAABzjAAQ5wCBzgAIfAIXCAAxwCBzjAAQ5wgAMc4AAHOAQOcIBD4BA4wAEOgQMc4AAHOMABDnCAAxwCBzjAIXAIHOAAh8ABDnCAAxzgAAc4wAEOcIADHOAQOAQOgUPgAAc4wAEOcIADHOAABzjAAQ5wCBzgAIfAIXCAAxwCBzjAAQ5wgAMc4AAHOAQOcIBD4BA4wAEOgQMc4AAHOMABDnCAAxwCBzjAIXAIHCYNDoEDHOAABzjAAQ5wgAMc4AAHOMAhcAgcAofAAQ5wmDQ4wAEOcIADHOAABzjAIXCAAxwCh8ABDnAIHOAABzjAAQ5wgAMc4BA4wAEOgUPgAAc4BA5wgAMc4AAHOMABDnAIHOAAh8AhcAgcAgc4wAEOcIADHOAABzjAAQ5wgEPgEDgEDoEDHOAQOMABDnCAAxzgAAc4wCFwgAMcAofAAQ5wCBzgAAc4wAEOcIADHOAQOMABDoFD4AAHOAQOcIADHOAABzjAAQ5wgAMc4ACHwCFwCBwCBzjAAQ5wgAMc4AAHOMABDnCcDYekcwOHJHBIAockcEgChyRwSBI4JIFDEjgkgUMSOCQJHJLAIQkcksAhCRySBA5J4JAEDkngkAQOSeBwBUngkAQOSeCQBA5J4JAkcEgChyRwSAKHJHBIEjgkgUMSOCSBQxI4JAkcksAhCRySwCEJHJLAIUngkAQOSeCQBA5J4JAkcEha3ACItO1bGVko5QAAAABJRU5ErkJggg==";

/** Bytes that are not a picture, as a picture whose address has gone bad would be. */
const BROKEN = "data:image/png;base64,AAAA";

const COMPOSER: ComposerSnapshot = {
    agentUserIds: [],
    attachments: [],
    capabilities: { commands: [], mentions: false, shellMode: false },
    focused: false,
    mentionCandidates: [],
    revision: 0,
    scopeId: "message-picture",
    submission: { status: "idle" },
    text: "",
};

const REPLY = [
    "The two blocks now line up on one baseline:",
    "",
    `![Two blocks on one baseline](${PICTURE})`,
    "",
    "Click the picture to see it full window.",
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
            chatId: "message-picture",
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
    message("1", happyAgentOwnerAuthor, "Show me how it looks now.", "2026-11-16T09:40:00.000Z"),
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
                    conversationId={`message-picture-${props.mode}`}
                    entries={TRANSCRIPT}
                    running={false}
                    style={{ flex: "1 1 auto", minWidth: 0 }}
                    viewerId={happyAgentOwnerAuthor.id}
                />
            </div>
        </ThemeScope>
    );
}

export function MessagePicturePage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="A picture a reply put on a line of its own with Markdown, drawn as the picture: at its own shape within a message photo's bounds, never past its own size. A click opens it full window."
            title="MessagePicture"
        >
            <Specimen
                detail="Its size known: 360 × 200 at its own shape"
                label="Picture"
                number="00"
                stage="surface"
            >
                <div style={{ width: "560px" }}>
                    <MessagePicture
                        alt="Two blocks on one baseline"
                        size={{ width: 360, height: 200 }}
                        src={PICTURE}
                    />
                </div>
            </Specimen>
            <Specimen
                detail="Before its size is known the box is 4:3, the picture fitted inside it"
                label="Size unknown"
                number="01"
                stage="surface"
            >
                <div style={{ width: "560px" }}>
                    <MessagePicture alt="Two blocks on one baseline" onSize={noop} src={PICTURE} />
                </div>
            </Specimen>
            <Specimen
                detail="A picture that cannot be loaded keeps its box and says so in its own words"
                label="Not loaded"
                number="02"
                stage="surface"
            >
                <div style={{ width: "560px" }}>
                    <MessagePicture alt="Release dashboard" src={BROKEN} />
                </div>
            </Specimen>
            <FullScreenSpecimen
                detail="An agent reply with a picture on a line of its own"
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
