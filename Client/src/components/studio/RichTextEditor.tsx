import { useEffect, useReducer, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import { TextStyle } from "@tiptap/extension-text-style";
import { FontFamily } from "@tiptap/extension-font-family";
import { Extension } from "@tiptap/core";
import clsx from "clsx";
import { useUploadMedia } from "@/api/media";
import { ApiError } from "@/lib/api";

// ─── Custom TipTap Extensions ───────────────────────────────────────────────

const TextStyleWithStyling = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontSize: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          element.style.fontSize?.replace(/['"]/g, "") || null,
        renderHTML: (attributes: { fontSize?: string | null }) => {
          if (!attributes.fontSize) return {};
          return { style: `font-size: ${attributes.fontSize}` };
        },
      },
      color: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          element.style.color || null,
        renderHTML: (attributes: { color?: string | null }) => {
          if (!attributes.color) return {};
          return { style: `color: ${attributes.color}` };
        },
      },
    };
  },
});

const CustomTextAlign = Extension.create({
  name: "customTextAlign",
  addGlobalAttributes() {
    return [
      {
        types: ["heading", "paragraph"],
        attributes: {
          textAlign: {
            default: "left",
            parseHTML: (element: HTMLElement) =>
              element.style.textAlign || "left",
            renderHTML: (attributes: { textAlign?: string }) => {
              if (!attributes.textAlign || attributes.textAlign === "left")
                return {};
              return { style: `text-align: ${attributes.textAlign}` };
            },
          },
        },
      },
    ];
  },
});

// ─── Constants ──────────────────────────────────────────────────────────────

const FONT_FAMILIES: Array<{ label: string; value: string | null }> = [
  { label: "Default", value: null },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Helvetica", value: "Helvetica, Arial, sans-serif" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
  { label: "Tahoma", value: "Tahoma, Geneva, sans-serif" },
  { label: "Trebuchet MS", value: '"Trebuchet MS", sans-serif' },
  { label: "Times New Roman", value: '"Times New Roman", Times, serif' },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Garamond", value: 'Garamond, "Apple Garamond", serif' },
  { label: "Palatino", value: '"Palatino Linotype", "Book Antiqua", Palatino, serif' },
  { label: "Cambria", value: "Cambria, Georgia, serif" },
  { label: "Courier New", value: '"Courier New", Courier, monospace' },
  { label: "Consolas", value: 'Consolas, "Lucida Console", monospace' },
  { label: "Monaco", value: 'Monaco, "Lucida Console", monospace' },
];

const FONT_SIZES: Array<{ label: string; value: string | null }> = [
  { label: "12", value: "12px" },
  { label: "14", value: "14px" },
  { label: "16", value: null },
  { label: "18", value: "18px" },
  { label: "20", value: "20px" },
  { label: "24", value: "24px" },
  { label: "30", value: "30px" },
  { label: "36", value: "36px" },
  { label: "48", value: "48px" },
];

const TEXT_COLORS = [
  { label: "Default Charcoal", value: null, hex: "#1f2937" },
  { label: "BITS Green", value: "#008060", hex: "#008060" },
  { label: "Forest Green", value: "#15803d", hex: "#15803d" },
  { label: "Royal Blue", value: "#2563eb", hex: "#2563eb" },
  { label: "Sky Blue", value: "#0284c7", hex: "#0284c7" },
  { label: "Red", value: "#dc2626", hex: "#dc2626" },
  { label: "Amber / Orange", value: "#ea580c", hex: "#ea580c" },
  { label: "Purple", value: "#7c3aed", hex: "#7c3aed" },
  { label: "Muted Gray", value: "#64748b", hex: "#64748b" },
];

const HIGHLIGHT_COLORS = [
  { label: "None", value: null, hex: "transparent" },
  { label: "Yellow", value: "#fef08a", hex: "#fef08a" },
  { label: "Green", value: "#bbf7d0", hex: "#bbf7d0" },
  { label: "Blue", value: "#bfdbfe", hex: "#bfdbfe" },
  { label: "Pink", value: "#fbcfe8", hex: "#fbcfe8" },
  { label: "Orange", value: "#fed7aa", hex: "#fed7aa" },
];

// ─── Main Component ─────────────────────────────────────────────────────────

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder = "Write something…",
  minHeight = 200,
}: Props) {
  const upload = useUploadMedia();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
      }),
      Underline,
      Highlight.configure({ multicolor: true }),
      TextStyleWithStyling,
      FontFamily,
      CustomTextAlign,
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
      Image.configure({ inline: false, allowBase64: false }),
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: clsx("bits-prose focus:outline-none px-4 py-3"),
        style: `min-height: ${minHeight}px`,
      },
    },
  });

  // Force toolbar update on cursor/selection changes
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    if (!editor) return;
    editor.on("selectionUpdate", forceUpdate);
    editor.on("transaction", forceUpdate);
    return () => {
      editor.off("selectionUpdate", forceUpdate);
      editor.off("transaction", forceUpdate);
    };
  }, [editor]);

  // Synchronize incoming value changes
  useEffect(() => {
    if (!editor) return;
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [value, editor]);

  async function handleImage(file: File) {
    setUploadError(null);
    try {
      const result = await upload.mutateAsync(file);
      editor?.chain().focus().setImage({ src: result.url }).run();
    } catch (e) {
      setUploadError(
        e instanceof ApiError ? e.message : "Image upload failed.",
      );
    }
  }

  function promptLink() {
    if (!editor) return;
    const previous = editor.getAttributes("link").href ?? "";
    const url = window.prompt("Link URL", previous);
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: url })
      .run();
  }

  if (!editor) {
    return (
      <div className="rounded-md border border-gray-300 bg-white p-4 text-sm text-brand-muted">
        Loading editor…
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-gray-300 bg-white shadow-sm focus-within:border-brand-green focus-within:ring-1 focus-within:ring-brand-green">
      <Toolbar
        editor={editor}
        onImage={() => fileRef.current?.click()}
        onLink={promptLink}
        uploading={upload.isPending}
      />
      <EditorContent editor={editor} />
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleImage(f);
          e.target.value = "";
        }}
      />
      {uploadError && (
        <div className="border-t border-gray-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {uploadError}
        </div>
      )}
    </div>
  );
}

// ─── Toolbar ────────────────────────────────────────────────────────────────

interface ToolbarProps {
  editor: Editor;
  onImage: () => void;
  onLink: () => void;
  uploading: boolean;
}

function Toolbar({ editor, onImage, onLink, uploading }: ToolbarProps) {
  // Coordinated dropdown state: at most ONE dropdown open at any time
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Close any open dropdown whenever user clicks into or focuses the editor,
  // or clicks outside the toolbar.
  useEffect(() => {
    function closeDropdowns() {
      setActiveMenu(null);
    }

    editor.on("focus", closeDropdowns);
    editor.on("selectionUpdate", closeDropdowns);

    function onWindowMouseDown(e: MouseEvent | TouchEvent) {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setActiveMenu(null);
    }

    window.addEventListener("mousedown", onWindowMouseDown, true);
    window.addEventListener("touchstart", onWindowMouseDown, true);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      editor.off("focus", closeDropdowns);
      editor.off("selectionUpdate", closeDropdowns);
      window.removeEventListener("mousedown", onWindowMouseDown, true);
      window.removeEventListener("touchstart", onWindowMouseDown, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [editor]);

  function toggleMenu(name: string) {
    setActiveMenu((curr) => (curr === name ? null : name));
  }

  // Current alignment
  const currentAlign =
    editor.getAttributes("paragraph").textAlign ||
    editor.getAttributes("heading").textAlign ||
    "left";

  return (
    <div
      ref={toolbarRef}
      className="flex flex-wrap items-center gap-1 border-b border-gray-200 bg-brand-bg px-2 py-1.5 select-none"
    >
      {/* 1. Block Style Dropdown (Paragraph, H1, H2, H3, H4) */}
      <BlockDropdown
        editor={editor}
        isOpen={activeMenu === "block"}
        onToggle={() => toggleMenu("block")}
        onClose={() => setActiveMenu(null)}
      />

      {/* 2. Font Family Dropdown */}
      <FontFamilyDropdown
        editor={editor}
        isOpen={activeMenu === "font"}
        onToggle={() => toggleMenu("font")}
        onClose={() => setActiveMenu(null)}
      />

      {/* 3. Font Size Dropdown */}
      <FontSizeDropdown
        editor={editor}
        isOpen={activeMenu === "size"}
        onToggle={() => toggleMenu("size")}
        onClose={() => setActiveMenu(null)}
      />

      <Sep />

      {/* 4. Text Color Picker */}
      <TextColorDropdown
        editor={editor}
        isOpen={activeMenu === "color"}
        onToggle={() => toggleMenu("color")}
        onClose={() => setActiveMenu(null)}
      />

      {/* 5. Highlight Picker */}
      <HighlightDropdown
        editor={editor}
        isOpen={activeMenu === "highlight"}
        onToggle={() => toggleMenu("highlight")}
        onClose={() => setActiveMenu(null)}
      />

      <Sep />

      {/* 6. Basic Inline Styling */}
      <Btn
        active={editor.isActive("bold")}
        onClick={() => {
          setActiveMenu(null);
          editor.chain().focus().toggleBold().run();
        }}
        label="Bold (Cmd+B)"
      >
        <span className="text-sm font-bold">B</span>
      </Btn>

      <Btn
        active={editor.isActive("italic")}
        onClick={() => {
          setActiveMenu(null);
          editor.chain().focus().toggleItalic().run();
        }}
        label="Italic (Cmd+I)"
      >
        <span className="text-sm font-semibold italic">I</span>
      </Btn>

      <Btn
        active={editor.isActive("underline")}
        onClick={() => {
          setActiveMenu(null);
          editor.chain().focus().toggleUnderline().run();
        }}
        label="Underline (Cmd+U)"
      >
        <span className="text-sm font-semibold underline">U</span>
      </Btn>

      <Btn
        active={editor.isActive("strike")}
        onClick={() => {
          setActiveMenu(null);
          editor.chain().focus().toggleStrike().run();
        }}
        label="Strikethrough"
      >
        <span className="text-sm line-through">S</span>
      </Btn>

      <Btn
        active={editor.isActive("code")}
        onClick={() => {
          setActiveMenu(null);
          editor.chain().focus().toggleCode().run();
        }}
        label="Inline code"
      >
        <span className="font-mono text-xs">&lt;&gt;</span>
      </Btn>

      <Sep />

      {/* 7. Text Alignment Dropdown / Buttons */}
      <AlignDropdown
        currentAlign={currentAlign}
        isOpen={activeMenu === "align"}
        onToggle={() => toggleMenu("align")}
        onSelect={(align) => {
          editor
            .chain()
            .focus()
            .updateAttributes("paragraph", { textAlign: align })
            .updateAttributes("heading", { textAlign: align })
            .run();
          setActiveMenu(null);
        }}
      />

      <Sep />

      {/* 8. Lists & Blockquotes */}
      <Btn
        active={editor.isActive("bulletList")}
        onClick={() => {
          setActiveMenu(null);
          editor.chain().focus().toggleBulletList().run();
        }}
        label="Bullet list"
      >
        <ListIcon variant="bullet" />
      </Btn>

      <Btn
        active={editor.isActive("orderedList")}
        onClick={() => {
          setActiveMenu(null);
          editor.chain().focus().toggleOrderedList().run();
        }}
        label="Numbered list"
      >
        <ListIcon variant="ordered" />
      </Btn>

      <Btn
        active={editor.isActive("blockquote")}
        onClick={() => {
          setActiveMenu(null);
          editor.chain().focus().toggleBlockquote().run();
        }}
        label="Callout / Quote"
      >
        <CalloutIcon />
      </Btn>

      <Btn
        onClick={() => {
          setActiveMenu(null);
          editor.chain().focus().setHorizontalRule().run();
        }}
        label="Horizontal divider"
      >
        <HrIcon />
      </Btn>

      <Sep />

      {/* 9. Media & Links */}
      <Btn
        active={editor.isActive("link")}
        onClick={() => {
          setActiveMenu(null);
          onLink();
        }}
        label="Insert link"
      >
        <LinkIcon />
      </Btn>

      <Btn
        onClick={() => {
          setActiveMenu(null);
          onImage();
        }}
        disabled={uploading}
        label="Insert image from device"
      >
        <ImageIcon />
        {uploading && <span className="ml-1 text-[10px] text-brand-muted">…</span>}
      </Btn>

      <Sep />

      {/* 10. Clear Formatting & History */}
      <Btn
        onClick={() => {
          setActiveMenu(null);
          editor.chain().focus().clearNodes().unsetAllMarks().run();
        }}
        label="Clear formatting"
      >
        <EraserIcon />
      </Btn>

      <Btn
        onClick={() => {
          setActiveMenu(null);
          editor.chain().focus().undo().run();
        }}
        disabled={!editor.can().undo()}
        label="Undo (Cmd+Z)"
      >
        <UndoIcon />
      </Btn>

      <Btn
        onClick={() => {
          setActiveMenu(null);
          editor.chain().focus().redo().run();
        }}
        disabled={!editor.can().redo()}
        label="Redo (Cmd+Y)"
      >
        <RedoIcon />
      </Btn>
    </div>
  );
}

// ─── Dropdown Components ────────────────────────────────────────────────────

function BlockDropdown({
  editor,
  isOpen,
  onToggle,
  onClose,
}: {
  editor: Editor;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  let label = "Regular text";
  if (editor.isActive("heading", { level: 1 })) label = "Heading 1";
  else if (editor.isActive("heading", { level: 2 })) label = "Heading 2";
  else if (editor.isActive("heading", { level: 3 })) label = "Heading 3";
  else if (editor.isActive("heading", { level: 4 })) label = "Heading 4";

  function pick(level: 0 | 1 | 2 | 3 | 4) {
    if (level === 0) {
      editor.chain().focus().setParagraph().run();
    } else {
      editor.chain().focus().setHeading({ level }).run();
    }
    onClose();
  }

  return (
    <div className="relative">
      <DropdownTrigger
        open={isOpen}
        onClick={onToggle}
        label={label}
        widthClass="w-32"
      />
      {isOpen && (
        <DropdownMenu>
          <DropItem
            active={label === "Regular text"}
            onClick={() => pick(0)}
            sample="Regular text"
            sampleClass="text-sm"
          />
          <DropItem
            active={label === "Heading 1"}
            onClick={() => pick(1)}
            sample="Heading 1"
            sampleClass="text-xl font-bold"
          />
          <DropItem
            active={label === "Heading 2"}
            onClick={() => pick(2)}
            sample="Heading 2"
            sampleClass="text-lg font-bold"
          />
          <DropItem
            active={label === "Heading 3"}
            onClick={() => pick(3)}
            sample="Heading 3"
            sampleClass="text-base font-semibold"
          />
          <DropItem
            active={label === "Heading 4"}
            onClick={() => pick(4)}
            sample="Heading 4"
            sampleClass="text-sm font-semibold"
          />
        </DropdownMenu>
      )}
    </div>
  );
}

function FontFamilyDropdown({
  editor,
  isOpen,
  onToggle,
  onClose,
}: {
  editor: Editor;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const current =
    (editor.getAttributes("textStyle").fontFamily as string | undefined) ??
    null;
  const active =
    FONT_FAMILIES.find((f) => f.value === current) ?? FONT_FAMILIES[0];

  function pick(value: string | null) {
    if (value === null) {
      editor.chain().focus().unsetFontFamily().run();
    } else {
      editor.chain().focus().setFontFamily(value).run();
    }
    onClose();
  }

  return (
    <div className="relative">
      <DropdownTrigger
        open={isOpen}
        onClick={onToggle}
        label={active.label}
        widthClass="w-28"
      />
      {isOpen && (
        <div className="absolute left-0 top-full z-30 mt-1 max-h-64 w-52 overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          {FONT_FAMILIES.map((f) => (
            <DropItem
              key={f.label}
              active={f.value === current}
              onClick={() => pick(f.value)}
              sample={f.label}
              sampleClass="text-sm"
              style={f.value ? { fontFamily: f.value } : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FontSizeDropdown({
  editor,
  isOpen,
  onToggle,
  onClose,
}: {
  editor: Editor;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const current =
    (editor.getAttributes("textStyle").fontSize as string | undefined) ?? null;
  const active =
    FONT_SIZES.find((s) => s.value === current) ??
    FONT_SIZES.find((s) => s.value === null)!;

  function pick(value: string | null) {
    if (value === null) {
      editor.chain().focus().setMark("textStyle", { fontSize: null }).run();
    } else {
      editor.chain().focus().setMark("textStyle", { fontSize: value }).run();
    }
    onClose();
  }

  return (
    <div className="relative">
      <DropdownTrigger
        open={isOpen}
        onClick={onToggle}
        label={active.label}
        widthClass="w-16"
      />
      {isOpen && (
        <div className="absolute left-0 top-full z-30 mt-1 w-24 overflow-hidden rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          {FONT_SIZES.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => pick(s.value)}
              className={clsx(
                "flex w-full items-center justify-between px-3 py-1 text-left text-xs transition-colors",
                s.value === current
                  ? "bg-brand-green/10 text-brand-green-dark font-semibold"
                  : "text-brand-charcoal hover:bg-gray-50",
              )}
            >
              <span>{s.label}px</span>
              {s.value === current && <span>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TextColorDropdown({
  editor,
  isOpen,
  onToggle,
  onClose,
}: {
  editor: Editor;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const currentColor =
    (editor.getAttributes("textStyle").color as string | undefined) ?? null;

  function pick(color: string | null) {
    if (color === null) {
      editor.chain().focus().setMark("textStyle", { color: null }).run();
    } else {
      editor.chain().focus().setMark("textStyle", { color }).run();
    }
    onClose();
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        title="Text color"
        className={clsx(
          "flex h-8 items-center gap-1 rounded px-2 text-xs font-semibold transition-colors",
          isOpen ? "bg-gray-200" : "hover:bg-gray-100",
        )}
      >
        <span
          className="flex h-4 w-4 items-center justify-center rounded text-[11px] font-bold text-white shadow-xs"
          style={{ backgroundColor: currentColor ?? "#1f2937" }}
        >
          A
        </span>
        <ChevronDown />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-30 mt-1 w-44 rounded-md border border-gray-200 bg-white p-2 shadow-lg">
          <div className="text-[11px] font-semibold text-brand-muted uppercase mb-1.5 px-1">
            Text Color
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {TEXT_COLORS.map((c) => (
              <button
                key={c.label}
                type="button"
                onClick={() => pick(c.value)}
                title={c.label}
                className={clsx(
                  "h-6 w-6 rounded-md border border-gray-300 transition-transform hover:scale-110",
                  currentColor === c.value && "ring-2 ring-brand-green ring-offset-1",
                )}
                style={{ backgroundColor: c.hex }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => pick(null)}
            className="mt-2 w-full text-center text-[11px] font-medium text-brand-muted hover:text-brand-charcoal py-1 rounded bg-gray-50 hover:bg-gray-100"
          >
            Reset color
          </button>
        </div>
      )}
    </div>
  );
}

function HighlightDropdown({
  editor,
  isOpen,
  onToggle,
  onClose,
}: {
  editor: Editor;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const current =
    (editor.getAttributes("highlight").color as string | undefined) ?? null;

  function pick(color: string | null) {
    if (color === null) {
      editor.chain().focus().unsetHighlight().run();
    } else {
      editor.chain().focus().setHighlight({ color }).run();
    }
    onClose();
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        title="Highlight color"
        className={clsx(
          "flex h-8 items-center gap-1 rounded px-2 text-xs font-semibold transition-colors",
          isOpen ? "bg-gray-200" : "hover:bg-gray-100",
        )}
      >
        <span
          className="rounded px-1 text-[11px] font-semibold text-brand-charcoal"
          style={{ backgroundColor: current ?? "#fef08a" }}
        >
          H
        </span>
        <ChevronDown />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-30 mt-1 w-40 rounded-md border border-gray-200 bg-white p-2 shadow-lg">
          <div className="text-[11px] font-semibold text-brand-muted uppercase mb-1.5 px-1">
            Highlight
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {HIGHLIGHT_COLORS.map((h) => (
              <button
                key={h.label}
                type="button"
                onClick={() => pick(h.value)}
                title={h.label}
                className={clsx(
                  "h-6 w-6 rounded-md border border-gray-300 transition-transform hover:scale-110",
                  current === h.value && "ring-2 ring-brand-green ring-offset-1",
                )}
                style={{ backgroundColor: h.hex }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => pick(null)}
            className="mt-2 w-full text-center text-[11px] font-medium text-brand-muted hover:text-brand-charcoal py-1 rounded bg-gray-50 hover:bg-gray-100"
          >
            Clear highlight
          </button>
        </div>
      )}
    </div>
  );
}

function AlignDropdown({
  currentAlign,
  isOpen,
  onToggle,
  onSelect,
}: {
  currentAlign: string;
  isOpen: boolean;
  onToggle: () => void;
  onSelect: (alignment: string) => void;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        title={`Alignment: ${currentAlign}`}
        className={clsx(
          "flex h-8 items-center gap-1 rounded px-2 text-xs font-medium text-brand-charcoal transition-colors",
          isOpen ? "bg-gray-200" : "hover:bg-gray-100",
        )}
      >
        <AlignIcon align={currentAlign} />
        <ChevronDown />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-30 mt-1 w-32 overflow-hidden rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          {[
            { label: "Left", value: "left" },
            { label: "Center", value: "center" },
            { label: "Right", value: "right" },
            { label: "Justify", value: "justify" },
          ].map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => onSelect(item.value)}
              className={clsx(
                "flex w-full items-center justify-between px-3 py-1.5 text-xs transition-colors",
                currentAlign === item.value
                  ? "bg-brand-green/10 text-brand-green-dark font-semibold"
                  : "text-brand-charcoal hover:bg-gray-50",
              )}
            >
              <span className="flex items-center gap-2">
                <AlignIcon align={item.value} />
                {item.label}
              </span>
              {currentAlign === item.value && <span>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Primitive UI Helpers ───────────────────────────────────────────────────

function DropdownTrigger({
  open,
  onClick,
  label,
  widthClass,
}: {
  open: boolean;
  onClick: () => void;
  label: string;
  widthClass?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex h-8 items-center justify-between gap-1.5 rounded px-2 text-xs font-medium text-brand-charcoal transition-colors",
        widthClass,
        open ? "bg-gray-200" : "hover:bg-gray-100",
      )}
    >
      <span className="truncate">{label}</span>
      <ChevronDown />
    </button>
  );
}

function DropdownMenu({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute left-0 top-full z-30 mt-1 min-w-[12rem] overflow-hidden rounded-md border border-gray-200 bg-white py-1 shadow-lg">
      {children}
    </div>
  );
}

function DropItem({
  active,
  onClick,
  sample,
  sampleClass,
  style,
}: {
  active: boolean;
  onClick: () => void;
  sample: string;
  sampleClass: string;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left transition-colors",
        active ? "bg-brand-green/10" : "hover:bg-gray-50",
      )}
    >
      <span
        className={clsx(sampleClass, "text-brand-charcoal")}
        style={style}
      >
        {sample}
      </span>
      {active && (
        <span className="text-xs text-brand-green-dark">✓</span>
      )}
    </button>
  );
}

interface BtnProps {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}

function Btn({ active, disabled, onClick, label, children }: BtnProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={clsx(
        "inline-flex h-8 min-w-[2rem] items-center justify-center rounded px-2 text-brand-charcoal transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        active
          ? "bg-brand-green/15 text-brand-green-dark font-semibold"
          : "hover:bg-gray-100",
      )}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span className="mx-0.5 h-4 w-px bg-gray-300" />;
}

// ─── Icons ──────────────────────────────────────────────────────────────────

function ChevronDown() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path
        d="M2 4l3 3 3-3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ListIcon({ variant }: { variant: "bullet" | "ordered" }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      {variant === "bullet" ? (
        <>
          <circle cx="2" cy="3" r="1" fill="currentColor" />
          <circle cx="2" cy="7" r="1" fill="currentColor" />
          <circle cx="2" cy="11" r="1" fill="currentColor" />
        </>
      ) : (
        <>
          <text x="0" y="4.5" fontSize="4" fill="currentColor">
            1
          </text>
          <text x="0" y="8.5" fontSize="4" fill="currentColor">
            2
          </text>
          <text x="0" y="12.5" fontSize="4" fill="currentColor">
            3
          </text>
        </>
      )}
      <line x1="5" y1="3" x2="13" y2="3" stroke="currentColor" strokeWidth="1.4" />
      <line x1="5" y1="7" x2="13" y2="7" stroke="currentColor" strokeWidth="1.4" />
      <line x1="5" y1="11" x2="13" y2="11" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function CalloutIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <line x1="2.5" y1="2.5" x2="2.5" y2="11.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="5" y1="4" x2="12" y2="4" stroke="currentColor" strokeWidth="1.3" />
      <line x1="5" y1="7" x2="11" y2="7" stroke="currentColor" strokeWidth="1.3" />
      <line x1="5" y1="10" x2="12" y2="10" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function HrIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <line x1="2" y1="7" x2="12" y2="7" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M5.5 8.5L8.5 5.5M6 4l1-1a2.5 2.5 0 013.5 3.5l-1 1M8 10l-1 1a2.5 2.5 0 01-3.5-3.5l1-1"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1.5" y="2.5" width="11" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="5" cy="5.5" r="1" fill="currentColor" />
      <path d="M2 10l3-3 2.5 2.5L10 6l2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

function AlignIcon({ align }: { align: string }) {
  if (align === "center") {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <line x1="2" y1="3" x2="12" y2="3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <line x1="4" y1="6.5" x2="10" y2="6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <line x1="2" y1="10" x2="12" y2="10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }
  if (align === "right") {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <line x1="2" y1="3" x2="12" y2="3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <line x1="5" y1="6.5" x2="12" y2="6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <line x1="3" y1="10" x2="12" y2="10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }
  if (align === "justify") {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <line x1="2" y1="3" x2="12" y2="3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <line x1="2" y1="6.5" x2="12" y2="6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <line x1="2" y1="10" x2="12" y2="10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }
  // Left default
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <line x1="2" y1="3" x2="12" y2="3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="2" y1="6.5" x2="9" y2="6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="2" y1="10" x2="11" y2="10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function EraserIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M10.5 4.5l-6 6a1.5 1.5 0 01-2.12-2.12l6-6a1.5 1.5 0 012.12 2.12z"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <line x1="1.5" y1="12.5" x2="12.5" y2="12.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M3 5h5a3.5 3.5 0 013.5 3.5v0a3.5 3.5 0 01-3.5 3.5H4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M5 2.5L2.5 5 5 7.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M11 5H6a3.5 3.5 0 00-3.5 3.5v0A3.5 3.5 0 006 12h4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M9 2.5l2.5 2.5L9 7.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
