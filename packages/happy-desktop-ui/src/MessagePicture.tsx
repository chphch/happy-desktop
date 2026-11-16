import { useState } from "react";
import { Lightbox } from "./Lightbox";
import { MediaFlow } from "./MediaFlow";
import { MESSAGE_MEDIA_MAX_WIDTH } from "./mediaLayout";
import { messagePicturePlan, type MessagePictureSize } from "./messageMarkdownMedia";
import { ModalOverlay } from "./ModalOverlay";
import { WindowOverlay } from "./WindowOverlay";

export interface MessagePictureProps {
    /** The picture's address: `https:` or `data:image/…` (`messagePictureSource`). */
    readonly src: string;
    /** The picture's description, as the reply wrote it. */
    readonly alt?: string;
    /** The picture's own size in pixels, once known; until then its box is 4:3. */
    readonly size?: MessagePictureSize;
    /** The picture's bytes arrived and reported their size. */
    onSize?(size: MessagePictureSize): void;
    readonly "data-testid"?: string;
}

/**
 * C-353 MessagePicture — a picture a reply placed on a line of its own with
 * Markdown, drawn as the picture rather than a link to it.
 *
 * It is laid out the way a message's own photos are (`MediaFlow`, within
 * `MESSAGE_MEDIA_LIMITS`): at its own shape, never past its own size, in a box
 * the row model reserves from the same plan. Until its size is known the box
 * is 4:3; when the bytes arrive they report the size once, and every later
 * mount has it. The address is fetched without a referrer. A click opens it
 * full window in the shared `Lightbox`; one that cannot be loaded keeps its
 * box and says so in its own words.
 */
export function MessagePicture(props: MessagePictureProps) {
    const [open, setOpen] = useState(false);
    const [failed, setFailed] = useState<string | undefined>(undefined);
    const alt = props.alt?.trim() ?? "";
    const close = () => setOpen(false);
    return (
        <>
            <MediaFlow
                className="happy-message__picture"
                data-testid={props["data-testid"]}
                maxWidth={MESSAGE_MEDIA_MAX_WIDTH}
                plan={messagePicturePlan(props.size)}
                renderTile={(_position, style) => (
                    <button
                        aria-label={alt ? `Open ${alt}` : "Open image"}
                        className="happy-message__media-item"
                        data-happy-desktop-ui="message-picture"
                        data-interactive=""
                        data-state={failed === props.src ? "failed" : undefined}
                        onClick={() => setOpen(true)}
                        style={style}
                        type="button"
                    >
                        {failed === props.src ? (
                            <span className="happy-message__picture-failed">
                                {alt || "The image could not be loaded."}
                            </span>
                        ) : (
                            <img
                                alt={alt}
                                className="happy-message__media-image"
                                decoding="async"
                                draggable={false}
                                loading="lazy"
                                onError={() => setFailed(props.src)}
                                onLoad={(event) => {
                                    const image = event.currentTarget;
                                    props.onSize?.({
                                        width: image.naturalWidth,
                                        height: image.naturalHeight,
                                    });
                                }}
                                referrerPolicy="no-referrer"
                                src={props.src}
                            />
                        )}
                    </button>
                )}
            />
            {open ? (
                <WindowOverlay>
                    <ModalOverlay onDismiss={close} placement="fill">
                        <Lightbox
                            alt={alt || "Image"}
                            {...(alt ? { caption: alt } : {})}
                            imageThumbnail={{
                                url: props.src,
                                ...(props.size
                                    ? { width: props.size.width, height: props.size.height }
                                    : {}),
                            }}
                            imageUrl={props.src}
                            onClose={close}
                        />
                    </ModalOverlay>
                </WindowOverlay>
            ) : null}
        </>
    );
}
