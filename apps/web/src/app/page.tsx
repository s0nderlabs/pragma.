"use client";

import { AppShell } from "../components/app-shell";
import { ChatConsole } from "../components/chat/chat-console";
import { ConnectedAccount } from "../components/account/connected-account";

export default function Page() {
  return (
    <AppShell headerActions={<ConnectedAccount />}>
      <section className="flex w-full flex-1">
        <ChatConsole />
      </section>
    </AppShell>
  );
}
