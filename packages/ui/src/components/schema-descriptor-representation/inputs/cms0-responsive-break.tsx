"use client";

import { useMemo, useState } from "react";
import { mergeAttributes, Node } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from "@tiptap/react";
import { X } from "lucide-react";
import { cn } from "../../../lib/utils";
import { Button } from "../../button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../dropdown-menu";

const BREAK_NAME = "cms0ResponsiveBreak";
const CMS0_RESPONSIVE_BREAK_ATTR = "data-cms0-break";

const CMS0_RESPONSIVE_BREAK_MODES = [
  "mobile-only",
  "tablet-only",
  "desktop-only",
  "sm-only",
  "md-only",
  "lg-only",
  "xl-only",
  "2xl-only",
] as const;

export type Cms0ResponsiveBreakMode =
  (typeof CMS0_RESPONSIVE_BREAK_MODES)[number];

const MODE_LABELS: Record<Cms0ResponsiveBreakMode, string> = {
  "mobile-only": "br:m-only",
  "tablet-only": "br:t-only",
  "desktop-only": "br:d-only",
  "sm-only": "br:sm-only",
  "md-only": "br:md-only",
  "lg-only": "br:lg-only",
  "xl-only": "br:xl-only",
  "2xl-only": "br:2xl-only",
};

type Cms0ResponsiveBreakAttrs = {
  mode: Cms0ResponsiveBreakMode;
};

type ModeOption = {
  mode: Cms0ResponsiveBreakMode;
  description: string;
};

const MODE_OPTIONS: ModeOption[] = [
  {
    mode: "mobile-only",
    description:
      "Applies on mobile screens (<768px). Hidden on tablet and desktop.",
  },
  {
    mode: "tablet-only",
    description:
      "Applies on tablet screens (768px-1023px). Hidden on mobile and desktop.",
  },
  {
    mode: "desktop-only",
    description:
      "Applies on desktop screens (>=1024px). Hidden on mobile and tablet.",
  },
  {
    mode: "sm-only",
    description:
      "Applies on the upper mobile band (640px-767px). Mobile only.",
  },
  {
    mode: "md-only",
    description:
      "Applies on the main tablet band (768px-1023px). Tablet only.",
  },
  {
    mode: "lg-only",
    description:
      "Applies on the lower desktop band (1024px-1279px). Desktop only.",
  },
  {
    mode: "xl-only",
    description:
      "Applies on large desktop screens (1280px-1535px). Desktop only.",
  },
  {
    mode: "2xl-only",
    description:
      "Applies on ultra-wide desktop screens (>=1536px). Desktop only.",
  },
];

export function normalizeCms0ResponsiveBreakMode(
  input: unknown,
): Cms0ResponsiveBreakMode {
  if (!input || typeof input !== "string") return "mobile-only";
  if ((CMS0_RESPONSIVE_BREAK_MODES as readonly string[]).includes(input)) {
    return input as Cms0ResponsiveBreakMode;
  }
  return "mobile-only";
}

export function formatCms0ResponsiveBreakLabel(mode: Cms0ResponsiveBreakMode) {
  return MODE_LABELS[mode];
}

export function buildCms0ResponsiveBreakHtmlAttributes(mode?: unknown) {
  const normalized = normalizeCms0ResponsiveBreakMode(mode);
  return {
    [CMS0_RESPONSIVE_BREAK_ATTR]: normalized,
    class: `cms0-rte-break cms0-rte-break--${normalized}`,
  };
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    cms0ResponsiveBreak: {
      setCms0ResponsiveBreak: (mode?: unknown) => ReturnType;
    };
  }
}

function normalizeBreakAttrs(input?: unknown): Cms0ResponsiveBreakAttrs {
  if (input && typeof input === "object" && "mode" in (input as Record<string, unknown>)) {
    return {
      mode: normalizeCms0ResponsiveBreakMode(
        (input as Record<string, unknown>).mode,
      ),
    };
  }

  return {
    mode: normalizeCms0ResponsiveBreakMode(input),
  };
}

function Cms0ResponsiveBreakNodeView(props: ReactNodeViewProps) {
  const [open, setOpen] = useState(false);
  const attrs = normalizeBreakAttrs(props.node.attrs);

  const selectedMode = attrs.mode;
  const selectedLabel = formatCms0ResponsiveBreakLabel(selectedMode);
  const options = useMemo(() => MODE_OPTIONS, []);

  const applyMode = (mode: Cms0ResponsiveBreakMode) => {
    props.updateAttributes({ mode });
    setOpen(false);
  };

  const removeNode = () => {
    const pos = props.getPos();
    if (typeof pos !== "number") return;

    const tr = props.editor.state.tr.delete(pos, pos + props.node.nodeSize);
    props.editor.view.dispatch(tr);
    setOpen(false);
  };

  return (
    <NodeViewWrapper
      as="span"
      contentEditable={false}
      className={cn(
        "mx-1 inline-flex align-middle",
        props.selected ? "ring-1 ring-ring rounded-sm" : "",
      )}
      data-testid="cms0-responsive-break-chip-wrapper"
      data-cms0-break-mode={selectedMode}
    >
      <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[11px] font-normal"
            data-testid="cms0-responsive-break-chip"
            data-cms0-break-mode={selectedMode}
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            {selectedLabel}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={6}
          className="w-80"
          data-testid="cms0-responsive-break-chip-menu"
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <DropdownMenuLabel>Responsive break</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {options.map((option) => {
            const label = formatCms0ResponsiveBreakLabel(option.mode);
            return (
              <DropdownMenuItem
                key={option.mode}
                onSelect={(event) => {
                  event.preventDefault();
                  applyMode(option.mode);
                }}
                data-testid={`cms0-responsive-break-chip-option-${option.mode}`}
              >
                <span className="inline-flex flex-col gap-0.5">
                  <span>
                    {selectedMode === option.mode ? "✓ " : ""}
                    {label}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {option.description}
                  </span>
                </span>
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={(event) => {
              event.preventDefault();
              removeNode();
            }}
            data-testid="cms0-responsive-break-chip-remove"
          >
            Remove break
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
        aria-label="Remove responsive break"
        title="Remove responsive break"
        data-testid="cms0-responsive-break-chip-remove-inline"
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          removeNode();
        }}
        onClick={() => {
          // Keep click quiet after mouse-down removal.
        }}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </NodeViewWrapper>
  );
}

export const Cms0ResponsiveBreak = Node.create({
  name: BREAK_NAME,
  priority: 1000,
  inline: true,
  group: "inline",
  atom: true,
  selectable: false,

  addAttributes() {
    return {
      mode: {
        default: "mobile-only",
        rendered: false,
        parseHTML: (element: HTMLElement) =>
          normalizeCms0ResponsiveBreakMode(
            element.getAttribute(CMS0_RESPONSIVE_BREAK_ATTR),
          ),
      },
    };
  },

  parseHTML() {
    return [{ tag: `br[${CMS0_RESPONSIVE_BREAK_ATTR}]`, priority: 1000 }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const attrs = normalizeBreakAttrs(node.attrs);
    return [
      "br",
      mergeAttributes(
        this.options.HTMLAttributes,
        HTMLAttributes,
        buildCms0ResponsiveBreakHtmlAttributes(attrs.mode),
      ),
    ];
  },

  addCommands() {
    return {
      setCms0ResponsiveBreak:
        (mode = "mobile-only") =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: normalizeBreakAttrs(mode),
          }),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(Cms0ResponsiveBreakNodeView);
  },
});

type ToolbarControlProps = {
  editor: Editor;
  disabled?: boolean;
};

export function Cms0ResponsiveBreakToolbarControl({
  editor,
  disabled,
}: Readonly<ToolbarControlProps>) {
  const [open, setOpen] = useState(false);
  const canInsert = editor.isEditable && !disabled;
  const options = useMemo(() => MODE_OPTIONS, []);

  const insertBreak = (mode: Cms0ResponsiveBreakMode) => {
    editor.chain().focus().setCms0ResponsiveBreak(mode).run();
    setOpen(false);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={!canInsert}
          data-testid="richtext-responsive-break-toolbar-trigger"
          onMouseDown={(event) => event.preventDefault()}
        >
          Responsive Break
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="w-80"
        data-testid="richtext-responsive-break-toolbar-menu"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <DropdownMenuLabel>Insert responsive break</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((option) => (
          <DropdownMenuItem
            key={option.mode}
            disabled={!canInsert}
            onSelect={(event) => {
              event.preventDefault();
              insertBreak(option.mode);
            }}
            data-testid={`richtext-responsive-break-toolbar-option-${option.mode}`}
          >
            <span className="inline-flex flex-col gap-0.5">
              <span>{formatCms0ResponsiveBreakLabel(option.mode)}</span>
              <span className="text-muted-foreground text-xs">
                {option.description}
              </span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { normalizeBreakAttrs as normalizeCms0ResponsiveBreakAttrs };
