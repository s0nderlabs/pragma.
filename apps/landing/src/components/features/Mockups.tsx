"use client";

// Video Mockup Component
function VideoMockup({ src }: { src: string }) {
  return (
    <video
      autoPlay
      muted
      loop
      playsInline
      className="w-full h-auto"
    >
      <source src={src} type="video/mp4" />
    </video>
  );
}

// Balances Flow - "Just say what you want"
export function ChatMockup() {
  return <VideoMockup src="/pragma-balances-flow.mp4" />;
}

// Swap Flow - "Swap"
export function SwapMockup() {
  return <VideoMockup src="/pragma-swap-flow.mp4" />;
}

// Stake Flow - "Stake"
export function StakeMockup() {
  return <VideoMockup src="/pragma-stake-flow.mp4" />;
}

// NFT Flow - "Buy NFTs"
export function NFTMockup() {
  return <VideoMockup src="/pragma-nft-flow.mp4" />;
}
