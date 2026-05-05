import {useState} from "react";
import Icon from "@/components/ui/icon";
import IconButton from "@/components/ui/icon-button";
import SplitPageShell from "@/app/components/split-page-shell";
import ChatPanel from "@/features/chat/components/chat-panel";
import Sidebar from "@/features/sidebar/components/sidebar";

interface IHomePageProps {
  integratedTitleBar: boolean;
}

export default function HomePage(props: IHomePageProps) {
  const {integratedTitleBar} = props;
  const [sidebarVisible, setSidebarVisible] = useState(true);

  const handleToggleSidebar = (): void => {
    setSidebarVisible((visible) => !visible);
  };

  const titlebarActions = (
    <>
      <IconButton className="size-7" label="Toggle sidebar" onClick={handleToggleSidebar}>
        <Icon name="panel-left" size="sm" />
      </IconButton>
      <IconButton className="size-7" label="Go back">
        <Icon name="arrow-left" size="sm" />
      </IconButton>
      <IconButton className="size-7" label="Go forward">
        <Icon name="arrow-right" size="sm" />
      </IconButton>
    </>
  );

  return (
    <SplitPageShell integratedTitleBar={integratedTitleBar} sidebar={<Sidebar />} sidebarVisible={sidebarVisible} titlebarActions={titlebarActions}>
      <ChatPanel />
    </SplitPageShell>
  );
}
