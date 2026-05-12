import {useSessionStreamStore} from "@/features/sessions/stores/session-stream-store";
import {useMountEffect} from "@/lib/use-mount-effect";

interface SessionStreamsProviderProps {
  children: React.ReactNode;
}

export default function SessionStreamsProvider(props: SessionStreamsProviderProps) {
  const {children} = props;
  const stopAllStreams = useSessionStreamStore((state) => state.stopAllStreams);

  useMountEffect(() => {
    window.addEventListener("beforeunload", stopAllStreams);
    window.addEventListener("pagehide", stopAllStreams);

    return () => {
      window.removeEventListener("beforeunload", stopAllStreams);
      window.removeEventListener("pagehide", stopAllStreams);
      stopAllStreams();
    };
  });

  return children;
}
