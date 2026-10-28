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
  bitcoinWalkMarks,
  type BitcoinWalkMarkId,
} from "../../../domain/brand-marks";
import type { OgComposition, OgSource } from "../../../domain/og-composer";
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
const initial: OgComposition = {
  version: 1,
  title: "BitcoinWalk OG image",
  background: { hash: emptyHash, source: "upload", zoom: 1, x: 50, y: 50 },
  mark: {
    visible: true,
    variant: "traditional",
    x: 64,
    y: 54,
    width: 150,
  },
  text: {
    value: "Powered by BitcoinWalk",
    x: 64,
    y: 420,
    width: 760,
    fontSize: 64,
    align: "left",
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
            variant: draft.mark.variant ?? "traditional",
          },
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
      if (composition.mark.visible) {
        try {
          const selected = bitcoinWalkMark(composition.mark.variant),
            mark = await image(selected.path),
            height =
              composition.mark.width *
              (mark.naturalHeight / mark.naturalWidth);
          if (!active) return;
          context.drawImage(
            mark,
            composition.mark.x,
            composition.mark.y,
            composition.mark.width,
            height,
          );
        } catch {}
      }
      if (composition.text.value.trim()) {
        context.font = `700 ${composition.text.fontSize}px Arial, sans-serif`;
        context.textAlign = composition.text.align;
        context.textBaseline = "top";
        const x =
            composition.text.align === "left"
              ? composition.text.x
              : composition.text.align === "right"
                ? composition.text.x + composition.text.width
                : composition.text.x + composition.text.width / 2,
          lines = wrap(context, composition.text.value, composition.text.width);
        if (composition.text.treatment === "panel") {
          context.fillStyle =
            composition.text.color === "#ffffff"
              ? "rgba(0,0,0,.68)"
              : "rgba(255,255,255,.84)";
          context.beginPath();
          context.roundRect(
            composition.text.x - 16,
            composition.text.y - 16,
            composition.text.width + 32,
            lines.length * composition.text.fontSize * 1.12 + 32,
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
            composition.text.y + index * composition.text.fontSize * 1.12,
          ),
        );
        context.shadowColor = "transparent";
      }
      if (composition.logo && logoData) {
        try {
          const logo = await image(logoData);
          if (!active) return;
          const ratio = composition.logo.width / logo.naturalWidth,
            width = logo.naturalWidth * ratio,
            height = logo.naturalHeight * ratio;
          context.drawImage(
            logo,
            composition.logo.x,
            composition.logo.y,
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
                <label>
                  Mark variant
                  <span className={styles.markChoice}>
                    <span
                      className={
                        bitcoinWalkMark(composition.mark.variant).dark
                          ? styles.markPreviewDark
                          : styles.markPreview
                      }
                      aria-hidden="true"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={bitcoinWalkMark(composition.mark.variant).preview}
                        alt=""
                      />
                    </span>
                    <span>
                      <select
                        value={composition.mark.variant}
                        onChange={(event) =>
                          update("mark", {
                            ...composition.mark,
                            variant: event.target.value as BitcoinWalkMarkId,
                          })
                        }
                      >
                        <optgroup label="Featured marks">
                          {bitcoinWalkMarks
                            .filter((mark) => mark.group === "featured")
                            .map((mark) => (
                              <option key={mark.id} value={mark.id}>
                                {mark.label} — {mark.use}
                              </option>
                            ))}
                        </optgroup>
                        <optgroup label="City-neutral system">
                          {bitcoinWalkMarks
                            .filter((mark) => mark.group === "system")
                            .map((mark) => (
                              <option key={mark.id} value={mark.id}>
                                {mark.label} — {mark.use}
                              </option>
                            ))}
                        </optgroup>
                      </select>
                      <small>
                        All approved BitcoinWalk variants from the brand guide.
                      </small>
                    </span>
                  </span>
                </label>
                <div className={styles.three}>
                  <label>
                    X
                    <input
                      type="number"
                      min="0"
                      max="1168"
                      value={composition.mark.x}
                      onChange={(event) =>
                        update("mark", {
                          ...composition.mark,
                          x: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    Y
                    <input
                      type="number"
                      min="0"
                      max="598"
                      value={composition.mark.y}
                      onChange={(event) =>
                        update("mark", {
                          ...composition.mark,
                          y: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    Width (px)
                    <input
                      type="number"
                      min="48"
                      max="900"
                      value={composition.mark.width}
                      onChange={(event) =>
                        update("mark", {
                          ...composition.mark,
                          width: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                </div>
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
            <div className={styles.three}>
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
                Align
                <select
                  value={composition.text.align}
                  onChange={(event) =>
                    update("text", {
                      ...composition.text,
                      align: event.target
                        .value as OgComposition["text"]["align"],
                    })
                  }
                >
                  <option value="left">Left</option>
                  <option value="center">Centre</option>
                  <option value="right">Right</option>
                </select>
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
            <div className={styles.three}>
              <label>
                X
                <input
                  type="number"
                  min="0"
                  max="1040"
                  value={composition.text.x}
                  onChange={(event) =>
                    update("text", {
                      ...composition.text,
                      x: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                Y
                <input
                  type="number"
                  min="0"
                  max="560"
                  value={composition.text.y}
                  onChange={(event) =>
                    update("text", {
                      ...composition.text,
                      y: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                Width
                <input
                  type="number"
                  min="160"
                  max="1120"
                  value={composition.text.width}
                  onChange={(event) =>
                    update("text", {
                      ...composition.text,
                      width: Number(event.target.value),
                    })
                  }
                />
              </label>
            </div>
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
                <div className={styles.three}>
                  <label>
                    X
                    <input
                      type="number"
                      min="0"
                      max="1100"
                      value={composition.logo.x}
                      onChange={(event) =>
                        update("logo", {
                          ...composition.logo!,
                          x: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    Y
                    <input
                      type="number"
                      min="0"
                      max="560"
                      value={composition.logo.y}
                      onChange={(event) =>
                        update("logo", {
                          ...composition.logo!,
                          y: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    Width (px)
                    <input
                      type="number"
                      min="32"
                      max="900"
                      value={composition.logo.width}
                      onChange={(event) =>
                        update("logo", {
                          ...composition.logo!,
                          width: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                </div>
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
