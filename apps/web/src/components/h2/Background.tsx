import Image from 'next/image'

export default function Background() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
    >
      <Image
        src="/4k-scenery.jpg"
        alt="4K Scenery Background"
        fill
        priority
        className="object-cover"
      />
    </div>
  )
}
