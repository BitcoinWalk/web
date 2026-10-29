"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { useDashboard } from "../../../components/dashboard-context";
import {
  AdminButton,
  AdminFeedback,
  AdminStatusBadge,
} from "../../../components/admin-ui";
import {
  bitcoinWalkMark,
  ogComposerMarkIds,
  ogComposerMarks,
  type BitcoinWalkMarkId,
} from "../../../domain/brand-marks";
import {ogRelativeTextLayout,type OgComposition,type OgSource} from "../../../domain/og-composer";
import {
  mediaRequestTemplate,
  type MediaRequest,
} from "../../../domain/media-request";
import { isSuperAdmin } from "../../../nostr/authority";
import {
  getBrowserExtensionPubkey,
  signWithBrowserExtension,
} from "../../../nostr/signer";
import styles from "./og-image-composer.module.css";

type CatalogueEntry = {
  pubkey: string;
  displayName: string;
  website: string;
  logoHash: string;
  approvalEventId: string;
  url: string;
};
type Saved = {
  id: string;
  title: string;
  createdAt: string;
  outputHash: string;
  composition: OgComposition;
  dataUrl?: string;
};
const STORAGE = "bitcoinwalk:og-composer:draft:v1",
  emptyHash = "0".repeat(64);
const CANVAS_WIDTH = 1200,
  CANVAS_HEIGHT = 630,
  EDGE = 64,
  TEXT_WIDTH = CANVAS_WIDTH - EDGE * 2;
const OG_FONT = '"BitcoinWalk Ubuntu"';
let ubuntuFontPromise: Promise<FontFace> | null = null;
function ensureUbuntuFont() {
  ubuntuFontPromise ??= new FontFace(
    "BitcoinWalk Ubuntu",
    "url(/api/og-font)",
    { weight: "700", style: "italic" },
  )
    .load()
    .then((font) => {
      document.fonts.add(font);
      return font;
    });
  return ubuntuFontPromise;
}
type Alignment = "left" | "center" | "right";
type VerticalAlignment = "top" | "center" | "bottom";
function alignedX(align: Alignment, width: number) {
  return align === "left"
    ? EDGE
    : align === "right"
      ? CANVAS_WIDTH - EDGE - width
      : (CANVAS_WIDTH - width) / 2;
}
function alignedY(align: VerticalAlignment, height: number) {
  return align === "top"
    ? EDGE
    : align === "bottom"
      ? CANVAS_HEIGHT - EDGE - height
      : (CANVAS_HEIGHT - height) / 2;
}
const initial: OgComposition = {
  version: 1,
  title: "BitcoinWalk OG image",
  background: { hash: emptyHash, source: "upload", zoom: 1, x: 50, y: 50 },
  mark: {
    visible: true,
    variant: "symbol-white",
    x: 64,
    y: 54,
    width: 240,
    align: "center",
    verticalAlign: "center",
  },
  text: {
    value: "Powered by",
    x: 64,
    y: 420,
    width: 520,
    fontSize: 56,
    align: "center",
    verticalAlign: "bottom",
    color: "#ffffff",
    treatment: "shadow",
  },
  logo: null,
};
function image(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const value = new window.Image();
    value.crossOrigin = "anonymous";
    value.onload = () => resolve(value);
    value.onerror = () =>
      reject(new Error("Preview image could not be loaded."));
    value.src = source;
  });
}
function preparedMark(value: HTMLImageElement, tint?: string) {
  const source = document.createElement("canvas");
  source.width = value.naturalWidth;
  source.height = value.naturalHeight;
  const sourceContext = source.getContext("2d", { willReadFrequently: true })!;
  sourceContext.drawImage(value, 0, 0);
  const pixels = sourceContext.getImageData(0, 0, source.width, source.height).data;
  let left = source.width,
    top = source.height,
    right = -1,
    bottom = -1;
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      if (pixels[(y * source.width + x) * 4 + 3] === 0) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) return source;
  const output = document.createElement("canvas");
  output.width = right - left + 1;
  output.height = bottom - top + 1;
  const context = output.getContext("2d")!;
  context.drawImage(
    source,
    left,
    top,
    output.width,
    output.height,
    0,
    0,
    output.width,
    output.height,
  );
  if (tint) {
    context.globalCompositeOperation = "source-in";
    context.fillStyle = tint;
    context.fillRect(0, 0, output.width, output.height);
  }
  return output;
}
const preparedMarkCache = new Map<
  string,
  Promise<{ artwork: HTMLCanvasElement; sourceWidth: number }>
>();
function loadPreparedMark(source: string, tint?: string) {
  const key = `${source}:${tint ?? "original"}`;
  let pending = preparedMarkCache.get(key);
  if (!pending) {
    pending = image(source).then((value) => ({
      artwork: preparedMark(value, tint),
      sourceWidth: value.naturalWidth,
    }));
    preparedMarkCache.set(key, pending);
  }
  return pending;
}
function cover(
  context: CanvasRenderingContext2D,
  value: HTMLImageElement,
  composition: OgComposition,
) {
  const zoom = composition.background.zoom,
    scale =
      Math.max(1200 / value.naturalWidth, 630 / value.naturalHeight) * zoom,
    width = value.naturalWidth * scale,
    height = value.naturalHeight * scale,
    left = (-(width - 1200) * composition.background.x) / 100,
    top = (-(height - 630) * composition.background.y) / 100;
  context.drawImage(value, left, top, width, height);
}
function wrap(context: CanvasRenderingContext2D, value: string, width: number) {
  const words = value.trim().split(/\s+/),
    lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (context.measureText(next).width <= width) line = next;
    else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}
function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
function SizeControl({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className={styles.sizeControl} role="group" aria-label={`${label} size`}>
      <button
        type="button"
        disabled={value <= min}
        aria-label={`Shrink ${label}`}
        onClick={() => onChange(clamp(value - step, min, max))}
      >
        −
      </button>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={`${label} size`}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <output aria-live="polite">{value}px</output>
      <button
        type="button"
        disabled={value >= max}
        aria-label={`Enlarge ${label}`}
        onClick={() => onChange(clamp(value + step, min, max))}
      >
        +
      </button>
    </div>
  );
}

function AlignmentControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Alignment;
  onChange: (value: Alignment) => void;
}) {
  return (
    <div className={styles.alignmentField}>
      <span>{label}</span>
      <div
        className={styles.alignmentControl}
        role="group"
        aria-label={`${label} alignment`}
      >
        {(["left", "center", "right"] as const).map((alignment) => (
          <button
            key={alignment}
            type="button"
            aria-pressed={value === alignment}
            onClick={() => onChange(alignment)}
          >
            {alignment === "center"
              ? "Centre"
              : alignment[0].toUpperCase() + alignment.slice(1)}
          </button>
        ))}
      </div>
    </div>
  );
}

function VerticalAlignmentControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: VerticalAlignment;
  onChange: (value: VerticalAlignment) => void;
}) {
  return (
    <div className={styles.alignmentField}>
      <span>{label}</span>
      <div
        className={styles.alignmentControl}
        role="group"
        aria-label={`${label} alignment`}
      >
        {(["top", "center", "bottom"] as const).map((alignment) => (
          <button
            key={alignment}
            type="button"
            aria-pressed={value === alignment}
            onClick={() => onChange(alignment)}
          >
            {alignment === "center"
              ? "Centre"
              : alignment[0].toUpperCase() + alignment.slice(1)}
          </button>
        ))}
      </div>
    </div>
  );
}

function MarkCarousel({
  value,
  onChange,
}: {
  value: BitcoinWalkMarkId;
  onChange: (value: BitcoinWalkMarkId) => void;
}) {
  const touchStart = useRef<number | null>(null),
    currentIndex = Math.max(
      0,
      ogComposerMarks.findIndex((mark) => mark.id === value),
    ),
    selected = ogComposerMarks[currentIndex];
  function move(offset: number) {
    const next =
      (currentIndex + offset + ogComposerMarks.length) %
      ogComposerMarks.length;
    onChange(ogComposerMarks[next].id);
  }
  return (
    <div
      className={styles.markCarousel}
      role="region"
      aria-label="BitcoinWalk mark variants"
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          move(-1);
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          move(1);
        }
      }}
      onTouchStart={(event) => {
        touchStart.current = event.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
        if (touchStart.current === null) return;
        const distance = event.changedTouches[0].clientX - touchStart.current;
        touchStart.current = null;
        if (Math.abs(distance) >= 40) move(distance < 0 ? 1 : -1);
      }}
    >
      <button
        type="button"
        className={styles.carouselArrow}
        aria-label="Previous mark"
        onClick={() => move(-1)}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="m15 18-6-6 6-6" />
        </svg>
      </button>
      <div
        className={styles.carouselStage}
        data-dark={selected.dark || undefined}
        tabIndex={0}
        aria-live="polite"
        aria-label={`${selected.label}, ${selected.use}. ${currentIndex + 1} of ${ogComposerMarks.length}`}
      >
        <span className={styles.carouselArtwork} aria-hidden="true">
          {selected.tint ? (
            <span
              className={styles.tintedMark}
              style={{
                backgroundColor: selected.tint,
                maskImage: `url(${selected.preview})`,
                WebkitMaskImage: `url(${selected.preview})`,
              }}
            />
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={selected.preview} alt="" />
          )}
        </span>
        <strong>{selected.label}</strong>
        <small>{selected.use}</small>
        <span className={styles.carouselCount} aria-hidden="true">
          {currentIndex + 1} / {ogComposerMarks.length}
        </span>
      </div>
      <button
        type="button"
        className={styles.carouselArrow}
        aria-label="Next mark"
        onClick={() => move(1)}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>
    </div>
  );
}

export default function OgImageComposer() {
  const dashboard = useDashboard(),
    canvas = useRef<HTMLCanvasElement>(null),
    lock = useRef(false),
    [composition, setComposition] = useState(initial),
    [background, setBackground] = useState<OgSource | null>(null),
    [logoData, setLogoData] = useState(""),
    [catalogue, setCatalogue] = useState<CatalogueEntry[]>([]),
    [saved, setSaved] = useState<Saved[]>([]),
    [busy, setBusy] = useState(""),
    [message, setMessage] = useState("Choose or create a background to begin."),
    [tone, setTone] = useState<"info" | "success" | "warning" | "error">(
      "info",
    ),
    [url, setUrl] = useState(""),
    [prompt, setPrompt] = useState(
      "A warm documentary photograph of people walking through a recognisable city street at golden hour, with open space on the left",
    ),
    [savedOutput, setSavedOutput] = useState<Saved | null>(null);
  const exactActor = useCallback(async () => {
    const actor = await getBrowserExtensionPubkey();
    if (!dashboard.pubkey || actor !== dashboard.pubkey || !isSuperAdmin(actor))
      throw new Error("Connect the BitcoinWalk super-admin identity.");
    return actor;
  }, [dashboard.pubkey]);
  const request = useCallback(
    async (command: MediaRequest, extra?: { file: File }) => {
      const actor = await exactActor(),
        event = await signWithBrowserExtension(mediaRequestTemplate(command));
      if (event.pubkey !== actor)
        throw new Error("Signer identity changed. Reconnect and retry.");
      const response = extra
          ? await (async () => {
              const form = new FormData();
              form.set("event", JSON.stringify(event));
              form.set("file", extra.file);
              return fetch("/api/admin/og-images", {
                method: "POST",
                body: form,
                cache: "no-store",
              });
            })()
          : await fetch("/api/admin/og-images", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ event }),
              cache: "no-store",
            }),
        body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "OG image request failed.");
      return body;
    },
    [exactActor],
  );
  const run = useCallback(async (label: string, work: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(label);
    setTone("info");
    try {
      await work();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "OG image request failed.",
      );
      setTone("error");
    } finally {
      lock.current = false;
      setBusy("");
    }
  }, []);
  const load = useCallback(
    () =>
      run("load", async () => {
        const history = await request({ action: "og-studio-list" });
        setSaved(history.items);
        setCatalogue(history.entries);
        const raw = localStorage.getItem(STORAGE);
        if (!raw) {
          setMessage(
            "Studio ready. Drafts stay private until you explicitly save an output.",
          );
          setTone("info");
          return;
        }
        const draft = JSON.parse(raw) as OgComposition;
        if (draft.version !== 1 || draft.background.hash === emptyHash) return;
        const source = await request({
          action: "og-studio-source",
          hash: draft.background.hash,
        });
        setComposition({
          ...draft,
          mark: {
            ...draft.mark,
            variant: ogComposerMarkIds.includes(
              draft.mark.variant as (typeof ogComposerMarkIds)[number],
            )
              ? draft.mark.variant
              : "symbol-orange",
            align: draft.mark.align ?? "left",
            verticalAlign: draft.mark.verticalAlign ?? "top",
          },
          text: {
            ...draft.text,
            verticalAlign: draft.text.verticalAlign ?? "bottom",
          },
          logo: draft.logo
            ? {
                ...draft.logo,
                align: draft.logo.align ?? "right",
                verticalAlign: draft.logo.verticalAlign ?? "bottom",
              }
            : null,
        });
        setBackground(source);
        if (draft.logo?.source === "catalogue")
          setLogoData(`/api/sponsors/logo/files/${draft.logo.hash}`);
        else if (draft.logo) {
          const uploaded = await request({
            action: "og-studio-source",
            hash: draft.logo.hash,
          });
          setLogoData(uploaded.dataUrl);
        }
        setMessage("Recovered your private browser draft.");
        setTone("success");
      }),
    [request, run],
  );
  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);
  useEffect(() => {
    if (background) localStorage.setItem(STORAGE, JSON.stringify(composition));
  }, [background, composition]);
  useEffect(() => {
    let active = true;
    void (async () => {
      const context = canvas.current?.getContext("2d");
      if (!context) return;
      context.clearRect(0, 0, 1200, 630);
      context.fillStyle = "#25211c";
      context.fillRect(0, 0, 1200, 630);
      if (background) {
        try {
          cover(context, await image(background.dataUrl), composition);
        } catch {}
      }
      context.fillStyle = "rgba(0,0,0,.16)";
      context.fillRect(0, 0, 1200, 630);
      let markArtwork:CanvasImageSource|null=null,
        markWidth=0,
        markHeight=0;
      if(composition.mark.visible)try{
        const selected=bitcoinWalkMark(composition.mark.variant),
          prepared=await loadPreparedMark(selected.path,selected.tint),
          mark=prepared.artwork,
          scale=composition.mark.width/prepared.sourceWidth;
        markWidth=mark.width*scale;
        markHeight=mark.height*scale;
        markArtwork=mark;
      }catch{}
      if (composition.text.value.trim()) {
        await ensureUbuntuFont();
        context.font = `italic 700 ${composition.text.fontSize}px ${OG_FONT}`;
        context.textAlign = "center";
        context.textBaseline = "top";
        const textWidth=clamp(composition.text.width,160,TEXT_WIDTH),
          lines = wrap(context, composition.text.value, textWidth-32),
          textHeight = lines.length * composition.text.fontSize * 1.12,
          blockHeight = textHeight,
          layout=ogRelativeTextLayout({align:composition.mark.align,verticalAlign:composition.mark.verticalAlign,markWidth,markHeight,textWidth,textHeight:blockHeight}),
          x=layout.textLeft+textWidth/2,
          y=layout.textTop;
        if(markArtwork){
          if(!active)return;
          context.drawImage(markArtwork,layout.markLeft,layout.markTop,markWidth,markHeight);
        }
        if (composition.text.treatment === "panel") {
          context.fillStyle =
            composition.text.color === "#ffffff"
              ? "rgba(0,0,0,.68)"
              : "rgba(255,255,255,.84)";
          context.beginPath();
          context.roundRect(
            layout.textLeft,
            layout.textTop,
            textWidth,
            blockHeight,
            18,
          );
          context.fill();
        }
        context.fillStyle = composition.text.color;
        if (composition.text.treatment === "shadow") {
          context.shadowColor = "rgba(0,0,0,.78)";
          context.shadowBlur = 14;
          context.shadowOffsetY = 4;
        }
        lines.forEach((line, index) =>
          context.fillText(
            line,
            x,
            y + index * composition.text.fontSize * 1.12,
          ),
        );
        context.shadowColor = "transparent";
      }else if(markArtwork){
        const layout=ogRelativeTextLayout({align:composition.mark.align,verticalAlign:composition.mark.verticalAlign,markWidth,markHeight,textWidth:0,textHeight:0});
        if(!active)return;
        context.drawImage(markArtwork,layout.markLeft,layout.markTop,markWidth,markHeight);
      }
      if (composition.logo && logoData) {
        try {
          const logo = await image(logoData);
          if (!active) return;
          const ratio = composition.logo.width / logo.naturalWidth,
            width = logo.naturalWidth * ratio,
            height = logo.naturalHeight * ratio,
            x = alignedX(composition.logo.align, width),
            y = alignedY(composition.logo.verticalAlign, height);
          context.drawImage(
            logo,
            x,
            y,
            width,
            height,
          );
        } catch {}
      }
    })();
    return () => {
      active = false;
    };
  }, [background, composition, logoData]);
  function update<K extends keyof OgComposition>(
    key: K,
    value: OgComposition[K],
  ) {
    setComposition((current) => ({ ...current, [key]: value }));
    setSavedOutput(null);
  }
  async function upload(
    event: ChangeEvent<HTMLInputElement>,
    asset: "background" | "partner-logo",
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await run(asset, async () => {
      if (
        !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        !file.size ||
        file.size > 10 * 1024 * 1024
      )
        throw new Error("Choose a JPEG, PNG or WebP image up to 10 MB.");
      const bytes = await file.arrayBuffer(),
        sha256 = Array.from(
          new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
        )
          .map((value) => value.toString(16).padStart(2, "0"))
          .join(""),
        source = await request(
          {
            action: "og-studio-upload",
            asset,
            sha256,
            mime: file.type as "image/jpeg" | "image/png" | "image/webp",
            bytes: file.size,
          },
          { file },
        );
      if (asset === "background") {
        setBackground(source);
        update("background", {
          hash: source.hash,
          source: "upload",
          zoom: 1,
          x: 50,
          y: 50,
        });
      } else {
        setLogoData(source.dataUrl);
        update("logo", {
          hash: source.hash,
          source: "upload",
          label: file.name.slice(0, 80),
          x: 900,
          y: 430,
          width: 220,
          align: "right",
          verticalAlign: "bottom",
        });
      }
      setMessage(
        `${asset === "background" ? "Background" : "Partner logo"} uploaded privately and added to the preview.`,
      );
      setTone("success");
    });
  }
  async function importUrl() {
    await run("url", async () => {
      const source = await request({
        action: "og-studio-import",
        sourceUrl: url.trim(),
      });
      setBackground(source);
      update("background", {
        hash: source.hash,
        source: "url",
        sourceUrl: source.sourceUrl,
        zoom: 1,
        x: 50,
        y: 50,
      });
      setMessage("Public image imported, validated and stripped of metadata.");
      setTone("success");
    });
  }
  async function generate() {
    await run("generate", async () => {
      const source = await request({
        action: "og-studio-generate",
        prompt: prompt.trim(),
      });
      setBackground(source);
      update("background", {
        hash: source.hash,
        source: "generated",
        prompt: source.prompt,
        model: source.model,
        zoom: 1,
        x: 50,
        y: 50,
      });
      setMessage(
        `Background generated with ${source.model}. Review it before saving.`,
      );
      setTone("success");
    });
  }
  function chooseCatalogue(pubkey: string) {
    const entry = catalogue.find((row) => row.pubkey === pubkey);
    if (!entry) {
      setLogoData("");
      update("logo", null);
      return;
    }
    setLogoData(entry.url);
    update("logo", {
      hash: entry.logoHash,
      source: "catalogue",
      approvalEventId: entry.approvalEventId,
      label: entry.displayName,
      x: 900,
      y: 430,
      width: 220,
      align: "right",
      verticalAlign: "bottom",
    });
  }
  async function save() {
    await run("save", async () => {
      if (!background) throw new Error("Choose a background before saving.");
      const body = await request({ action: "og-studio-render", composition }),
        item = body.item as Saved;
      setSavedOutput(item);
      setSaved((current) => [
        item,
        ...current.filter((row) => row.id !== item.id),
      ]);
      setMessage(
        "PNG and composition manifest saved. No page, sponsorship or entitlement was changed.",
      );
      setTone("success");
    });
  }
  async function restore(id: string) {
    await run("restore", async () => {
      const body = await request({ action: "og-studio-read", id }),
        item = body.item as Saved,
        source = await request({
          action: "og-studio-source",
          hash: item.composition.background.hash,
        });
      setComposition(item.composition);
      setBackground(source);
      setSavedOutput(item);
      if (item.composition.logo?.source === "catalogue")
        setLogoData(`/api/sponsors/logo/files/${item.composition.logo.hash}`);
      else if (item.composition.logo) {
        const uploaded = await request({
          action: "og-studio-source",
          hash: item.composition.logo.hash,
        });
        setLogoData(uploaded.dataUrl);
      } else setLogoData("");
      setMessage(`Restored “${item.title}” from its saved manifest.`);
      setTone("success");
    });
  }
  function download() {
    const href = savedOutput?.dataUrl ?? canvas.current?.toDataURL("image/png");
    if (!href) return;
    const link = document.createElement("a");
    link.href = href;
    link.download = `${
      composition.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "bitcoinwalk-og"
    }.png`;
    link.click();
  }
  return (
    <section className={styles.studio} aria-labelledby="og-studio-heading">
      <header>
        <div>
          <p className={styles.eyebrow}>Private super-admin tool</p>
          <h2 id="og-studio-heading">OG image composer</h2>
          <p>
            Build a 1200 × 630 image from validated layers. Nothing is published
            or assigned automatically.
          </p>
        </div>
        <AdminStatusBadge tone={background ? "success" : "warning"}>
          {background ? "Preview ready" : "Background needed"}
        </AdminStatusBadge>
      </header>
      <AdminFeedback tone={tone}>{message}</AdminFeedback>
      <div className={styles.workspace}>
        <div className={styles.controls}>
          <fieldset>
            <legend>1. Background</legend>
            <div className={styles.sourceActions}>
              <label className={styles.fileButton}>
                Upload image
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={!!busy}
                  onChange={(event) => void upload(event, "background")}
                />
              </label>
              <div className={styles.inline}>
                <input
                  type="url"
                  value={url}
                  placeholder="https://…"
                  aria-label="Background image URL"
                  disabled={!!busy}
                  onChange={(event) => setUrl(event.target.value)}
                />
                <AdminButton
                  disabled={!!busy || !url.trim()}
                  onClick={() => void importUrl()}
                >
                  Import URL
                </AdminButton>
              </div>
              <label>
                AI prompt
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={prompt}
                  disabled={!!busy}
                  onChange={(event) => setPrompt(event.target.value)}
                />
              </label>
              <AdminButton
                disabled={!!busy || !prompt.trim()}
                onClick={() => void generate()}
              >
                {busy === "generate" ? "Generating…" : "Generate background"}
              </AdminButton>
            </div>
            {background && (
              <div className={styles.sliders}>
                <label>
                  Zoom{" "}
                  <input
                    type="range"
                    min="1"
                    max="2.5"
                    step=".05"
                    value={composition.background.zoom}
                    onChange={(event) =>
                      update("background", {
                        ...composition.background,
                        zoom: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Horizontal crop{" "}
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={composition.background.x}
                    onChange={(event) =>
                      update("background", {
                        ...composition.background,
                        x: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Vertical crop{" "}
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={composition.background.y}
                    onChange={(event) =>
                      update("background", {
                        ...composition.background,
                        y: Number(event.target.value),
                      })
                    }
                  />
                </label>
              </div>
            )}
          </fieldset>
          <fieldset>
            <legend>2. BitcoinWalk mark</legend>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={composition.mark.visible}
                onChange={(event) =>
                  update("mark", {
                    ...composition.mark,
                    visible: event.target.checked,
                  })
                }
              />{" "}
              Show official mark
            </label>
            {composition.mark.visible && (
              <>
                <MarkCarousel
                  value={composition.mark.variant}
                  onChange={(variant) =>
                    update("mark", { ...composition.mark, variant })
                  }
                />
                <AlignmentControl
                  label="Horizontal position"
                  value={composition.mark.align}
                  onChange={(align) =>
                    update("mark", { ...composition.mark, align })
                  }
                />
                <VerticalAlignmentControl
                  label="Vertical position"
                  value={composition.mark.verticalAlign}
                  onChange={(verticalAlign) =>
                    update("mark", { ...composition.mark, verticalAlign })
                  }
                />
                <SizeControl
                  label="BitcoinWalk mark"
                  min={48}
                  max={900}
                  step={24}
                  value={composition.mark.width}
                  onChange={(width) =>
                    update("mark", { ...composition.mark, width })
                  }
                />
              </>
            )}
          </fieldset>
          <fieldset>
            <legend>3. Text</legend>
            <p className={styles.fieldHint}>Always positioned 15px below the BitcoinWalk mark.</p>
            <label>
              Message
              <textarea
                rows={3}
                maxLength={140}
                value={composition.text.value}
                onChange={(event) =>
                  update("text", {
                    ...composition.text,
                    value: event.target.value,
                  })
                }
              />
            </label>
            <div className={styles.two}>
              <label>
                Size (px)
                <input
                  type="number"
                  min="24"
                  max="180"
                  value={composition.text.fontSize}
                  onChange={(event) =>
                    update("text", {
                      ...composition.text,
                      fontSize: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                Treatment
                <select
                  value={composition.text.treatment}
                  onChange={(event) =>
                    update("text", {
                      ...composition.text,
                      treatment: event.target
                        .value as OgComposition["text"]["treatment"],
                    })
                  }
                >
                  <option value="shadow">Shadow</option>
                  <option value="panel">Panel</option>
                  <option value="none">None</option>
                </select>
              </label>
            </div>
            <SizeControl
              label="text"
              min={24}
              max={180}
              step={4}
              value={composition.text.fontSize}
              onChange={(fontSize) =>
                update("text", { ...composition.text, fontSize })
              }
            />
            <div
              className={styles.segmented}
              role="group"
              aria-label="Text colour"
            >
              <button
                type="button"
                aria-pressed={composition.text.color === "#ffffff"}
                onClick={() =>
                  update("text", { ...composition.text, color: "#ffffff" })
                }
              >
                Light
              </button>
              <button
                type="button"
                aria-pressed={composition.text.color === "#17120d"}
                onClick={() =>
                  update("text", { ...composition.text, color: "#17120d" })
                }
              >
                Dark
              </button>
            </div>
          </fieldset>
          <fieldset>
            <legend>4. Sponsor or partner logo</legend>
            <label>
              Approved sponsor
              <select
                value={
                  composition.logo?.source === "catalogue"
                    ? (catalogue.find(
                        (entry) => entry.logoHash === composition.logo?.hash,
                      )?.pubkey ?? "")
                    : ""
                }
                onChange={(event) => chooseCatalogue(event.target.value)}
              >
                <option value="">No catalogue logo</option>
                {catalogue.map((entry) => (
                  <option key={entry.pubkey} value={entry.pubkey}>
                    {entry.displayName}
                  </option>
                ))}
              </select>
            </label>
            <p className={styles.or}>or</p>
            <label className={styles.fileButton}>
              Upload separate partner artwork
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={!!busy}
                onChange={(event) => void upload(event, "partner-logo")}
              />
            </label>
            {composition.logo && (
              <>
                <AlignmentControl
                  label="Horizontal position"
                  value={composition.logo.align}
                  onChange={(align) =>
                    update("logo", { ...composition.logo!, align })
                  }
                />
                <VerticalAlignmentControl
                  label="Vertical position"
                  value={composition.logo.verticalAlign}
                  onChange={(verticalAlign) =>
                    update("logo", {
                      ...composition.logo!,
                      verticalAlign,
                    })
                  }
                />
                <SizeControl
                  label="partner logo"
                  min={32}
                  max={900}
                  step={20}
                  value={composition.logo.width}
                  onChange={(width) =>
                    update("logo", { ...composition.logo!, width })
                  }
                />
                <AdminButton
                  variant="ghost"
                  onClick={() => {
                    setLogoData("");
                    update("logo", null);
                  }}
                >
                  Remove logo
                </AdminButton>
              </>
            )}
          </fieldset>
        </div>
        <div className={styles.previewColumn}>
          <div className={styles.previewFrame}>
            <canvas
              ref={canvas}
              width="1200"
              height="630"
              aria-label="Live OG image preview"
            />
          </div>
          <label className={styles.title}>
            Saved image name
            <input
              value={composition.title}
              maxLength={80}
              onChange={(event) => update("title", event.target.value)}
            />
          </label>
          <div className={styles.actions}>
            <AdminButton
              variant="primary"
              disabled={!!busy || !background}
              onClick={() => void save()}
            >
              {busy === "save" ? "Rendering…" : "Render and save"}
            </AdminButton>
            <AdminButton disabled={!!busy || !background} onClick={download}>
              {savedOutput ? "Download saved PNG" : "Download preview"}
            </AdminButton>
          </div>
          <p className={styles.privateNote}>
            Managed uploads are artwork only. This tool never creates
            sponsorship approval, payment, entitlement or public content.
          </p>
          {saved.length > 0 && (
            <div className={styles.history}>
              <h3>Saved compositions</h3>
              <ul>
                {saved.map((item) => (
                  <li key={item.id}>
                    <div>
                      <strong>{item.title}</strong>
                      <small>{new Date(item.createdAt).toLocaleString()}</small>
                    </div>
                    <AdminButton
                      disabled={!!busy}
                      onClick={() => void restore(item.id)}
                    >
                      Restore
                    </AdminButton>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
