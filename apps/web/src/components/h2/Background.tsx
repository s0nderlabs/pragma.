import Iridescence from '@/components/Iridescence'

export default function Background() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 w-full h-full">
      <Iridescence
        color={[0.5, 0.6, 0.8]}
        speed={1.0}
        amplitude={0.1}
        mouseReact={true}
      />
    </div>
  )
}
