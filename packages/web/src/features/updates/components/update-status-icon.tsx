import type {DesktopUpdateState} from "@supernova/contracts/desktop/api";
import Icon from "@/components/ui/icon";

const PROGRESS_RADIUS = 9;
const PROGRESS_CIRCUMFERENCE = 2 * Math.PI * PROGRESS_RADIUS;

interface UpdateStatusIconProps {
  readonly downloadPercent: number | null;
  readonly status: DesktopUpdateState["status"];
}

function DownloadProgressRing({percent}: {readonly percent: number}) {
  return (
    <svg aria-hidden="true" className="size-2.5 -rotate-90" viewBox="0 0 24 24">
      <circle className="stroke-current opacity-30" cx="12" cy="12" fill="none" r={PROGRESS_RADIUS} strokeWidth={5} />
      <circle
        className="stroke-current transition-[stroke-dashoffset] duration-160 ease-out"
        cx="12"
        cy="12"
        fill="none"
        r={PROGRESS_RADIUS}
        strokeDasharray={PROGRESS_CIRCUMFERENCE}
        strokeDashoffset={PROGRESS_CIRCUMFERENCE * (1 - percent / 100)}
        strokeLinecap="round"
        strokeWidth={5}
      />
    </svg>
  );
}

export default function UpdateStatusIcon(props: UpdateStatusIconProps) {
  const {downloadPercent, status} = props;
  const percent = Math.min(100, Math.max(0, downloadPercent ?? 0));

  return (
    <span className="grid size-4 place-items-center rounded-full bg-blue-500 text-white transition-colors duration-160 ease-out group-hover:bg-blue-400">
      {status === "downloading" ? <DownloadProgressRing percent={percent} /> : <Icon className="size-2.5" name={status === "downloaded" ? "restart" : "update"} size="xs" />}
    </span>
  );
}
