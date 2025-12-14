import { Navbar } from "@/components/navbar";
import { Hero } from "@/components/hero";
import { Features } from "@/components/features";
import { Footer } from "@/components/footer";

export default function Home() {
  return (
    <main className="relative min-h-screen bg-[#FFFFFF]">
      <Navbar />
      <Hero />
      <Features />
      <Footer />
    </main>
  );
}
