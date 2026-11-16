import { useState } from "react";
import {
    agentAuthor,
    happyAgentOwnerAuthor,
    type ComposerSnapshot,
    type ConversationAuthor,
    type ConversationEntry,
} from "happy-desktop-state";
import { AppShell } from "../../src/AppShell";
import { Box } from "../../src/Box";
import { ComposerModelControl } from "../../src/ComposerModelControl";
import {
    ComposerFooterBar,
    ConversationDock,
    FloatingConversationDock,
} from "../../src/ConversationDock";
import { ConversationView } from "../../src/ConversationView";
import {
    HappyAgentControlMenu,
    HappyAgentSessionControls,
} from "../../src/HappyAgentSessionControls";
import { Sidebar } from "../../src/Sidebar";
import { happyAgentComposerModelControlProps } from "../../src/happyAgentComposerModelControl";
import { ComponentPage, FullScreenSpecimen, Specimen } from "../kit";
import { happyAgentMenus } from "./happyAgentChatFixtures";
import { videoClipWide } from "./videoClips";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-167";

const commands = [
    { id: "usage", label: "/usage", description: "Token usage for the session." },
    { id: "tasks", label: "/tasks", description: "Show the session task list." },
];

function composer(overrides: Partial<ComposerSnapshot> = {}): ComposerSnapshot {
    return {
        scopeId: "ses_alpha01234567",
        text: "",
        attachments: [],
        revision: 0,
        submission: { status: "idle" },
        focused: false,
        capabilities: { shellMode: false, commands, mentions: true },
        mentionCandidates: [],
        agentUserIds: [],
        ...overrides,
    };
}

const noop = () => undefined;

const imagePreview = `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><rect width="160" height="160" fill="#172554"/><circle cx="116" cy="44" r="24" fill="#fbbf24"/><path d="M0 132 54 70l34 38 22-22 50 50v24H0Z" fill="#22d3ee"/><path d="M0 144 54 82l34 38 22-22 50 50v12H0Z" fill="#f472b6"/></svg>',
)}`;
const portraitPreview = `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="200" viewBox="0 0 120 200"><rect width="120" height="200" fill="#3b0764"/><circle cx="84" cy="48" r="20" fill="#f472b6"/><path d="M0 168 36 102l28 34 18-20 38 52v32H0Z" fill="#c084fc"/></svg>',
)}`;
const widePreview = `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120" viewBox="0 0 240 120"><rect width="240" height="120" fill="#052e16"/><circle cx="184" cy="32" r="18" fill="#fbbf24"/><path d="M0 104 68 52l48 38 32-30 92 48v12H0Z" fill="#34d399"/></svg>',
)}`;

function attachmentFixtures(): ComposerSnapshot["attachments"] {
    return [
        {
            kind: "workspaceFile",
            id: "attachment:image",
            name: "reference.png",
            size: 842_137,
            mediaType: "image/png",
            file: new File([], "reference.png", { type: "image/png" }),
            previewUrl: imagePreview,
        },
        {
            kind: "workspaceFile",
            id: "attachment:video",
            name: "walkthrough.webm",
            size: 8_231_091,
            mediaType: "video/webm",
            file: new File([], "walkthrough.webm", { type: "video/webm" }),
            previewUrl: videoClipWide,
        },
        {
            kind: "workspaceFile",
            id: "attachment:portrait",
            name: "portrait-reference.png",
            size: 593_920,
            mediaType: "image/png",
            file: new File([], "portrait-reference.png", { type: "image/png" }),
            previewUrl: portraitPreview,
        },
        {
            kind: "workspaceFile",
            id: "attachment:wide",
            name: "layout-study.gif",
            size: 4_192_214,
            mediaType: "image/gif",
            file: new File([], "layout-study.gif", { type: "image/gif" }),
            previewUrl: widePreview,
        },
        {
            kind: "workspaceFile",
            id: "attachment:file",
            name: "requirements.pdf",
            size: 124_928,
            mediaType: "application/pdf",
            file: new File([], "requirements.pdf", { type: "application/pdf" }),
        },
    ];
}

const chatItems = [
    { kind: "label" as const, label: "happy" },
    { kind: "item" as const, id: "happy|ses_a", label: "Local settings", icon: "check" as const },
    { kind: "item" as const, id: "happy|ses_b", label: "Panel expansion" },
    { kind: "separator" as const },
    { kind: "label" as const, label: "happy · worktree-3" },
    { kind: "item" as const, id: "wt3|ses_c", label: "Provider catalog" },
];

/** What the dock says while the agent is draining or restarting. */
const RESTARTING_NOTICE = [
    "Agent is restarting and can't accept new messages.",
    "You can keep editing your draft.",
] as const;

const LONG_DRAFT = [
    "When the agent is back, please pick up where the release checklist left off:",
    "",
    "1. Re-run the renderer typecheck and lint, then the update store tests.",
    "2. Capture the sidebar card in both widths while it is still finishing work.",
    "3. Compare the composer notice against a model switch line in the transcript,",
    "   so the left edges and the muted grey match exactly.",
    "",
    "Do not reload the live daemon; use the isolated home only.",
].join("\n");

function transcriptMessage(
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
            chatId: "dock-restarting",
            sequence: id,
            changePts: id,
            sender,
            text,
            attachments: [],
            reactions: [],
            createdAt,
        },
    };
}

/** A conversation whose transcript already carries a model switch line, for comparing greys. */
const RESTARTING_ENTRIES: readonly ConversationEntry[] = [
    transcriptMessage(
        "1",
        happyAgentOwnerAuthor,
        "Run the release checks and tell me when they pass.",
        "2026-10-20T08:40:00.000Z",
    ),
    transcriptMessage(
        "2",
        agentAuthor,
        "The renderer checks pass. The update store tests are still running.",
        "2026-10-20T08:41:00.000Z",
    ),
    {
        kind: "notice",
        id: "switch:model",
        sequence: "3",
        variant: "configuration",
        level: "info",
        text: "Model Opus 5.5 → Sonnet 5.5",
    },
    {
        kind: "notice",
        id: "switch:account",
        sequence: "4",
        variant: "configuration",
        level: "info",
        text: "Account Work → Personal",
    },
];

function TranscriptWindow(props: { readonly restarting: boolean }) {
    return (
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
                        composer={composer({ text: LONG_DRAFT })}
                        composerPlaceholder="Message Happy…"
                        submitDisabled={props.restarting}
                        onComposerSend={noop}
                        onComposerValueChange={noop}
                        {...(props.restarting ? { notice: RESTARTING_NOTICE } : {})}
                        running={false}
                    />
                }
                conversationId={`dock-restarting-${props.restarting ? "on" : "off"}`}
                entries={RESTARTING_ENTRIES}
                running={false}
                style={{ flex: "1 1 auto", minWidth: 0 }}
                title="Release checklist"
                viewerId={happyAgentOwnerAuthor.id}
            />
        </div>
    );
}

function dock(
    value: string,
    submitDisabled = false,
    attachments: ComposerSnapshot["attachments"] = [],
    onAttachmentRemove: (attachmentId: string) => void = noop,
    notice?: readonly string[],
) {
    return (
        <ConversationDock
            composer={composer({ attachments, text: value })}
            composerControls={
                <ComposerModelControl
                    {...happyAgentComposerModelControlProps(happyAgentMenus, {
                        onEffortChange: noop,
                        onModelChange: noop,
                    })}
                />
            }
            composerFooterControl={
                <ComposerFooterBar
                    leading={
                        <HappyAgentSessionControls
                            fields={["permission", "tier"]}
                            menuPlacement="above"
                            variant="ghost"
                            menus={happyAgentMenus}
                            onEffortChange={noop}
                            onModelChange={noop}
                            onPermissionModeChange={noop}
                            onServiceTierChange={noop}
                        />
                    }
                    trailing={
                        <HappyAgentControlMenu
                            items={chatItems}
                            label="Chat"
                            menuAlign="end"
                            menuPlacement="above"
                            menuWidth={280}
                            variant="ghost"
                            onSelect={noop}
                            value="Local settings"
                        />
                    }
                />
            }
            composerPlaceholder="Message Happy…"
            onComposerAttachmentRemove={onAttachmentRemove}
            onComposerAttachmentsSelect={noop}
            onComposerSend={noop}
            onComposerValueChange={noop}
            submitDisabled={submitDisabled}
            {...(notice === undefined ? {} : { notice })}
        />
    );
}

function AttachmentDockSpecimen() {
    const [attachments, setAttachments] = useState(attachmentFixtures);
    return dock("Compare these before making the change.", false, attachments, (attachmentId) =>
        setAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId)),
    );
}

/** Long monospace body so the gradient has real content to fade out. */
function panelBody() {
    return (
        <Box
            style={{
                display: "flex",
                flex: "1 1 0%",
                flexDirection: "column",
                minHeight: "0",
                overflowY: "auto",
            }}
        >
            <Box
                style={{
                    boxSizing: "border-box",
                    display: "flex",
                    flexDirection: "column",
                    fontFamily: "var(--happy-font-mono)",
                    fontSize: "12px",
                    gap: "4px",
                    lineHeight: "18px",
                    padding: "16px",
                }}
            >
                {Array.from({ length: 60 }, (_, index) => (
                    <span key={index}>
                        {`${String(index + 1).padStart(3, "0")}  packages/happy-desktop-ui/src/ConversationDock.tsx`}
                    </span>
                ))}
            </Box>
        </Box>
    );
}

export function FloatingConversationDockPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="The composer at a surface edge: either fully overlaid or reserving only its input height, with the same masked gradient fading content into it."
            title="Floating conversation dock"
        >
            <Specimen
                detail="The dock over a scrolling body: the surface keeps its height and fades under the gradient"
                label="Floating dock"
                number="01"
                stage="surface"
            >
                <Box
                    style={{
                        position: "relative",
                        boxSizing: "border-box",
                        display: "flex",
                        flexDirection: "column",
                        background: "var(--surface)",
                        height: "420px",
                        width: "100%",
                    }}
                >
                    {panelBody()}
                    <FloatingConversationDock>{dock("")}</FloatingConversationDock>
                </Box>
            </Specimen>
            <FullScreenSpecimen
                detail="The workspace panel: the input reserves only its own height while the 72px fade floats over the content above it"
                label="Panel with the dock"
                number="02"
            >
                <AppShell
                    panel={panelBody()}
                    panelFooter={
                        <FloatingConversationDock placement="footer">
                            {dock("")}
                        </FloatingConversationDock>
                    }
                    panelResizable
                    sidebar={
                        <Sidebar
                            activeItemId="happy"
                            brand
                            onItemSelect={noop}
                            sections={[
                                {
                                    id: "projects",
                                    label: "This Mac",
                                    items: [
                                        { id: "happy", kind: "project", label: "happy" },
                                        {
                                            id: "wt3",
                                            kind: "workspace",
                                            label: "worktree-3",
                                            depth: 1,
                                        },
                                    ],
                                },
                            ]}
                        />
                    }
                >
                    <Box style={{ display: "flex", flex: "1 1 0%" }} />
                </AppShell>
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="The same panel without a footer, for comparison"
                label="Docked panel"
                number="03"
            >
                <AppShell
                    panel={panelBody()}
                    panelResizable
                    sidebar={
                        <Sidebar
                            activeItemId="happy"
                            brand
                            onItemSelect={noop}
                            sections={[
                                {
                                    id: "projects",
                                    label: "This Mac",
                                    items: [{ id: "happy", kind: "project", label: "happy" }],
                                },
                            ]}
                        />
                    }
                >
                    <Box style={{ display: "flex", flex: "1 1 0%" }} />
                </AppShell>
            </FullScreenSpecimen>
            <Specimen
                detail="the global band carries connectivity · the draft remains editable while submission is unavailable"
                label="Happy Agent offline"
                number="04"
                stage="surface"
            >
                <Box
                    style={{
                        background: "var(--surface)",
                        display: "flex",
                        flexDirection: "column",
                        minHeight: "260px",
                        justifyContent: "flex-end",
                    }}
                >
                    {dock("Keep this draft here until the Happy Agent reconnects.", true)}
                </Box>
            </Specimen>
            <Specimen
                detail="Two muted lines directly above the input, starting on the draft's own text column · the draft stays whole and editable, the placeholder is untouched, and Send is withheld until the agent takes messages again"
                label="Agent restarting"
                number="06"
                stage="surface"
            >
                <Box
                    style={{
                        background: "var(--surface)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "32px",
                        justifyContent: "flex-end",
                        width: "720px",
                    }}
                >
                    <div data-screen="dock-restarting-long-draft" style={{ display: "flex" }}>
                        {dock(LONG_DRAFT, true, [], noop, RESTARTING_NOTICE)}
                    </div>
                    <div data-screen="dock-restarting-empty" style={{ display: "flex" }}>
                        {dock("", true, [], noop, RESTARTING_NOTICE)}
                    </div>
                </Box>
            </Specimen>
            <FullScreenSpecimen
                detail="The restarting notice in a conversation whose transcript already has model and account switch lines: same left edge, same muted grey"
                label="Agent restarting · in a conversation"
                number="07"
                screen="01-restarting-transcript-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <TranscriptWindow restarting />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="The same conversation and draft while the agent takes messages"
                label="Agent writable · in a conversation"
                number="08"
                screen="02-normal-transcript-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <TranscriptWindow restarting={false} />
            </FullScreenSpecimen>
            <Specimen
                detail="56px image, video, and file previews · loaded images open immediately in the full-window Lightbox"
                label="Draft attachments"
                number="05"
                stage="surface"
            >
                <Box
                    style={{
                        background: "var(--surface)",
                        display: "flex",
                        flexDirection: "column",
                        minHeight: "240px",
                        justifyContent: "flex-end",
                        width: "520px",
                    }}
                >
                    <AttachmentDockSpecimen />
                </Box>
            </Specimen>
        </ComponentPage>
    );
}
