import {createFileTreeIconResolver, getBuiltInSpriteSheet} from "@pierre/trees";
import {useMountEffect} from "@/lib/use-mount-effect";
import {cn} from "@/lib/cn";

const SPRITE_ID = "workspace-file-icon-sprite";
const resolver = createFileTreeIconResolver("complete");

/** The sprite is shared by every icon on the page, so it is injected once and referenced by id. */
function ensureSprite(): void {
  if (document.getElementById(SPRITE_ID)) return;
  const container = document.createElement("div");
  container.id = SPRITE_ID;
  container.setAttribute("aria-hidden", "true");
  container.className = "pointer-events-none absolute size-0 overflow-hidden";
  container.innerHTML = getBuiltInSpriteSheet("complete");
  document.body.prepend(container);
}

interface FileIconProps {
  readonly className?: string;
  readonly path: string;
}

export default function FileIcon(props: FileIconProps) {
  const {className, path} = props;
  useMountEffect(ensureSprite);

  return (
    <svg aria-hidden="true" className={cn("size-3.5 shrink-0", className)} viewBox="0 0 16 16">
      <use href={`#${resolver.resolveIcon("file-tree-icon-file", path).name}`} />
    </svg>
  );
}
