interface IChatPanelProps {
  sidebarVisible: boolean;
}

export default function ChatPanel(props: IChatPanelProps) {
  const {sidebarVisible} = props;

  return (
    <section className="chat-panel flex min-h-0 flex-1 flex-col bg-zinc-950/80 pt-14" data-sidebar-visible={sidebarVisible}>
      <div className="grid flex-1 place-items-center px-6 py-10">
        <p className="text-sm text-zinc-600">Select a chat or start a new one.</p>
      </div>
    </section>
  );
}
