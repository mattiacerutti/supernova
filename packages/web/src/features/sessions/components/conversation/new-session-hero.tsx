import appIconLightUrl from "@assets/icon-black.png";
import appIconDarkUrl from "@assets/icon-white.png";
import {useSettingsStore} from "@/stores/settings-store";

interface NewSessionHeroProps {
  readonly projectName: string;
}

export default function NewSessionHero(props: NewSessionHeroProps) {
  const {projectName} = props;
  const resolvedMode = useSettingsStore((state) => state.resolvedMode);

  return (
    <div className="mb-8 flex flex-col items-center gap-3">
      <img src={resolvedMode === "light" ? appIconLightUrl : appIconDarkUrl} alt="Supernova" className="h-16 w-22 shrink-0" draggable={false} />
      <h1 className="text-center text-4xl font-normal tracking-tight text-ink-strong">
        What should we build in <i className="text-ink-muted">{projectName}</i>?
      </h1>
    </div>
  );
}
