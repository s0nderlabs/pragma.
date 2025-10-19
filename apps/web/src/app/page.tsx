"use client";

import Image from "next/image";

import { AppShell } from "../components/app-shell";
import { ChatConsole } from "../components/chat/chat-console";

export default function Page() {
  return (
    <AppShell>
      <section className="flex w-full flex-col items-center justify-center px-3 md:px-0">
        <div className="relative h-32 w-72 sm:w-80">
          <Image
            src="/pragma.svg"
            alt="Pragma"
            width={320}
            height={125}
            className="absolute inset-0 h-auto w-full drop-shadow-[0_12px_36px_rgba(var(--accent-rgb),0.25)] dark:hidden"
            priority
          />
          <Image
            src="/pragma-dark.svg"
            alt="Pragma"
            width={320}
            height={125}
            className="absolute inset-0 hidden h-auto w-full drop-shadow-[0_12px_36px_rgba(132,111,250,0.35)] dark:block"
            priority
          />
        </div>
        <ChatConsole />
      </section>
    </AppShell>
  );
}
