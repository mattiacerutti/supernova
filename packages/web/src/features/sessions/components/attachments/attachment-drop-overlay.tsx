import Icon from "@/components/ui/icon";

export default function AttachmentDropOverlay() {
  return (
    <div className="pointer-events-none absolute -inset-x-4 inset-y-0 z-30 grid place-items-center bg-neutral-950/35 backdrop-blur-sm">
      <div className="flex items-center gap-3 text-sm font-medium text-neutral-400">
        <Icon name="paperclip" size="sm" />
        <span>Drop to attach</span>
      </div>
    </div>
  );
}
