import {NodeViewWrapper} from "@tiptap/react";
import type {NodeViewProps} from "@tiptap/react";
import Icon from "@/components/ui/icon";

export default function ComposerReference(props: NodeViewProps) {
  const name = String(props.node.attrs.name ?? "");
  const kind = String(props.node.attrs.kind ?? "");
  const value = String(props.node.attrs.value ?? "");
  const iconName = kind === "skill" ? "skill" : value.endsWith("/") ? "folder" : "file";

  return (
    <NodeViewWrapper
      as="span"
      className="inline-flex select-none items-baseline gap-1 whitespace-nowrap align-baseline leading-[inherit] text-accent-ink"
      contentEditable={false}
      spellCheck={false}
    >
      <Icon className="relative top-px size-[1em] text-accent-ink" name={iconName} size="xs" />
      <span>{name}</span>
    </NodeViewWrapper>
  );
}
