import {NodeViewWrapper} from "@tiptap/react";
import type {NodeViewProps} from "@tiptap/react";
import Icon from "@/components/ui/icon";

export default function ComposerReference(props: NodeViewProps) {
  const title = String(props.node.attrs.title ?? "");
  const kind = String(props.node.attrs.kind ?? "");

  return (
    <NodeViewWrapper as="span" className="mx-0.5 inline select-none whitespace-nowrap align-baseline leading-[inherit] text-sky-400" contentEditable={false} spellCheck={false}>
      {kind === "file" && <Icon className="mr-1 inline-block size-[1em] align-[-0.13em] text-sky-300" name="file" size="xs" />}
      <span>{title}</span>
    </NodeViewWrapper>
  );
}
