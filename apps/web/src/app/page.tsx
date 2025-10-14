"use client";

import Image from "next/image";

import { AppShell } from "../components/app-shell";
import { ChatConsole } from "../components/chat/chat-console";

export default function Page() {
  return (
    <AppShell>
      <section className="flex w-full flex-col items-center justify-center gap-6">
        <Image
          src="/pragma.svg"
          alt="Pragma"
          width={320}
          height={125}
          className="h-auto w-64 sm:w-72 md:w-80 drop-shadow-[0_12px_36px_rgba(var(--accent-rgb),0.25)]"
          priority
        />
        <div className="w-full max-w-5xl">
          <ChatConsole />
        </div>
      </section>
    </AppShell>
  );
}
