"use client";

import { useEffect, useMemo, useRef } from "react";
import type { ComponentType } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import HardBreak from "@tiptap/extension-hard-break";
import Dropcursor from "@tiptap/extension-dropcursor";
import Gapcursor from "@tiptap/extension-gapcursor";
import { TextStyle } from "@tiptap/extension-text-style";
import ListItem from "@tiptap/extension-list-item";
import { RichTextProvider } from "reactjs-tiptap-editor";
import { Attachment, RichTextAttachment } from "reactjs-tiptap-editor/attachment";
import { Blockquote, RichTextBlockquote } from "reactjs-tiptap-editor/blockquote";
import { Bold, RichTextBold } from "reactjs-tiptap-editor/bold";
import { BulletList, RichTextBulletList } from "reactjs-tiptap-editor/bulletlist";
import { Callout, RichTextCallout } from "reactjs-tiptap-editor/callout";
import { Code, RichTextCode } from "reactjs-tiptap-editor/code";
import { CodeBlock, RichTextCodeBlock } from "reactjs-tiptap-editor/codeblock";
import { CodeView, RichTextCodeView } from "reactjs-tiptap-editor/codeview";
import { Color, RichTextColor } from "reactjs-tiptap-editor/color";
import { Column, RichTextColumn } from "reactjs-tiptap-editor/column";
import { Drawer, RichTextDrawer } from "reactjs-tiptap-editor/drawer";
import { Emoji, RichTextEmoji } from "reactjs-tiptap-editor/emoji";
import { Excalidraw, RichTextExcalidraw } from "reactjs-tiptap-editor/excalidraw";
import { ExportPdf, RichTextExportPdf } from "reactjs-tiptap-editor/exportpdf";
import { ExportWord, RichTextExportWord } from "reactjs-tiptap-editor/exportword";
import { FontFamily, RichTextFontFamily } from "reactjs-tiptap-editor/fontfamily";
import { FontSize, RichTextFontSize } from "reactjs-tiptap-editor/fontsize";
import { Heading, RichTextHeading } from "reactjs-tiptap-editor/heading";
import { Highlight, RichTextHighlight } from "reactjs-tiptap-editor/highlight";
import { History, RichTextRedo, RichTextUndo } from "reactjs-tiptap-editor/history";
import { HorizontalRule, RichTextHorizontalRule } from "reactjs-tiptap-editor/horizontalrule";
import { Iframe, RichTextIframe } from "reactjs-tiptap-editor/iframe";
import { Image, RichTextImage } from "reactjs-tiptap-editor/image";
import { ImageGif, RichTextImageGif } from "reactjs-tiptap-editor/imagegif";
import { Indent, RichTextIndent } from "reactjs-tiptap-editor/indent";
import { Italic, RichTextItalic } from "reactjs-tiptap-editor/italic";
import { Katex, RichTextKatex } from "reactjs-tiptap-editor/katex";
import { LineHeight, RichTextLineHeight } from "reactjs-tiptap-editor/lineheight";
import { Link, RichTextLink } from "reactjs-tiptap-editor/link";
import { Mention } from "reactjs-tiptap-editor/mention";
import { Mermaid, RichTextMermaid } from "reactjs-tiptap-editor/mermaid";
import { MoreMark, RichTextMoreMark } from "reactjs-tiptap-editor/moremark";
import { OrderedList, RichTextOrderedList } from "reactjs-tiptap-editor/orderedlist";
import { SearchAndReplace, RichTextSearchAndReplace } from "reactjs-tiptap-editor/searchandreplace";
import { SlashCommand } from "reactjs-tiptap-editor/slashcommand";
import { Strike, RichTextStrike } from "reactjs-tiptap-editor/strike";
import { Table, RichTextTable } from "reactjs-tiptap-editor/table";
import { TaskList, RichTextTaskList } from "reactjs-tiptap-editor/tasklist";
import { TextAlign, RichTextAlign } from "reactjs-tiptap-editor/textalign";
import { TextDirection, RichTextTextDirection } from "reactjs-tiptap-editor/textdirection";
import { TextUnderline, RichTextUnderline } from "reactjs-tiptap-editor/textunderline";
import { Twitter, RichTextTwitter } from "reactjs-tiptap-editor/twitter";
import { Video, RichTextVideo } from "reactjs-tiptap-editor/video";
import { createLowlight, common } from "lowlight";
import { Clear, RichTextClear } from "reactjs-tiptap-editor/clear";
import "reactjs-tiptap-editor/style.css";

import { Cms0ResponsiveBreak, Cms0ResponsiveBreakToolbarControl } from "./cms0-responsive-break";
import { CMS0_RICHTEXT_FLUSH_EVENT } from "../descriptor-form-workflow";

export type RichTextValue = {
  html: string;
  value: unknown;
};

type Props = {
  direction?: "auto" | "ltr" | "rtl";
  disabled?: boolean;
  onChange: (value: RichTextValue) => void;
  value: unknown;
};

type ToolbarComponent = ComponentType<Record<string, unknown>>;

const EMPTY_DOC = { type: "doc", content: [] };
const lowlight = createLowlight(common);
const unsupportedUpload = async (_file: File) => {
  throw new Error("Upload is not enabled in this editor surface.");
};

const isDocShape = (input: unknown): input is Record<string, unknown> =>
  Boolean(
    input &&
      typeof input === "object" &&
      (input as Record<string, unknown>).type === "doc" &&
      Array.isArray((input as Record<string, unknown>).content),
  );

const normalizeEditorDoc = (input: unknown) => (isDocShape(input) ? input : EMPTY_DOC);

const DEFAULT_TOOLBAR_COMPONENTS: ToolbarComponent[] = [
  RichTextUndo,
  RichTextRedo,
  RichTextHeading,
  RichTextFontFamily,
  RichTextFontSize,
  RichTextLineHeight,
  RichTextBold,
  RichTextItalic,
  RichTextUnderline,
  RichTextStrike,
  RichTextCode,
  RichTextCodeBlock,
  RichTextCodeView,
  RichTextBlockquote,
  RichTextBulletList,
  RichTextOrderedList,
  RichTextTaskList,
  RichTextAlign,
  RichTextIndent,
  RichTextTextDirection,
  RichTextColor,
  RichTextHighlight,
  RichTextHorizontalRule,
  RichTextLink,
  RichTextTable,
  RichTextColumn,
  RichTextCallout,
  RichTextEmoji,
  RichTextMoreMark,
  RichTextSearchAndReplace,
  RichTextMermaid,
  RichTextKatex,
  RichTextExcalidraw,
  RichTextTwitter,
  RichTextIframe,
  RichTextImage,
  RichTextImageGif,
  RichTextVideo,
  RichTextAttachment,
  RichTextDrawer,
  RichTextExportPdf,
  RichTextExportWord,
  RichTextClear,
];

export function RichTextEditor({
  direction = "auto",
  disabled,
  onChange,
  value,
}: Readonly<Props>) {
  const wrappedValue =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const sourceDoc = normalizeEditorDoc(wrappedValue.value);
  const initialDocRef = useRef<unknown>(sourceDoc);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const extensions = useMemo(
    () => [
      Document,
      Paragraph,
      Text,
      TextStyle,
      Cms0ResponsiveBreak,
      HardBreak,
      Dropcursor,
      Gapcursor,
      History,
      Heading,
      Bold,
      Italic,
      TextUnderline,
      Strike,
      Code,
      CodeBlock.configure({ lowlight }),
      CodeView,
      Blockquote,
      BulletList,
      OrderedList,
      ListItem,
      TaskList,
      Link,
      Color,
      Highlight,
      FontFamily,
      FontSize,
      LineHeight,
      TextAlign,
      TextDirection.configure({ direction }),
      Indent,
      HorizontalRule,
      Table,
      Column,
      Callout,
      MoreMark,
      Clear,
      SlashCommand,
      SearchAndReplace,
      Emoji,
      Katex,
      Mermaid.configure({ upload: unsupportedUpload }),
      Excalidraw,
      Twitter,
      Iframe,
      Drawer.configure({ upload: unsupportedUpload }),
      Image.configure({
        upload: unsupportedUpload,
        resourceImage: "both",
        acceptMimes: [
          "image/png",
          "image/jpeg",
          "image/jpg",
          "image/webp",
          "image/gif",
          "image/svg+xml",
          "image/avif",
        ],
      }),
      ImageGif,
      Video.configure({
        upload: unsupportedUpload,
        resourceVideo: "both",
        videoProviders: ["."],
      }),
      Attachment.configure({ upload: unsupportedUpload }),
      Mention,
      ExportPdf,
      ExportWord,
    ],
    [direction],
  );

  const editor = useEditor({
    extensions: extensions as any,
    content: initialDocRef.current as any,
    editable: !disabled,
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    autofocus: false,
    onUpdate: ({ editor: current }) => {
      onChangeRef.current({
        html: current.getHTML(),
        value: current.getJSON(),
      });
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  useEffect(() => {
    if (!editor) return;
    const current = editor.getJSON();
    const currentKey = JSON.stringify(current);
    const nextKey = JSON.stringify(sourceDoc);
    if (currentKey !== nextKey) {
      editor.commands.setContent(sourceDoc as any, { emitUpdate: false });
    }
  }, [editor, sourceDoc]);

  useEffect(() => {
    if (!editor || typeof window === "undefined") {
      return;
    }

    const flush = () => {
      onChangeRef.current({
        html: editor.getHTML(),
        value: editor.getJSON(),
      });
    };

    window.addEventListener(CMS0_RICHTEXT_FLUSH_EVENT, flush);
    return () => {
      window.removeEventListener(CMS0_RICHTEXT_FLUSH_EVENT, flush);
    };
  }, [editor]);

  if (!editor) {
    return <div className="rounded-md border bg-muted/30 p-3 text-sm">Loading…</div>;
  }

  return (
    <div className="max-h-[80vh] overflow-x-clip overflow-y-auto rounded-md border bg-background">
      <RichTextProvider editor={editor}>
        <div className="flex flex-wrap items-center gap-1 border-b p-2">
          {DEFAULT_TOOLBAR_COMPONENTS.map((Item, index) => (
            <Item key={`${Item.displayName || Item.name || "toolbar"}-${index}`} />
          ))}
          <Cms0ResponsiveBreakToolbarControl editor={editor} disabled={disabled} />
        </div>
        <EditorContent
          autoFocus={false}
          className="min-h-35 px-6 py-4 *:p-0!"
          data-testid="richtext-editor-content"
          dir={direction}
          editor={editor}
        />
      </RichTextProvider>
    </div>
  );
}
