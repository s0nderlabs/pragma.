'use client'

import { useId } from 'react'
import { FILTER_MAP_DATA_URI } from '../ui/liquid-glass/filter-map'

type Theme = 'light' | 'dark'

interface ThemeSwitcherProps {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const LightIcon = () => (
  <svg
    className="switcher__icon"
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 36 36"
    aria-hidden="true"
  >
    <path
      fill="var(--c)"
      fillRule="evenodd"
      d="M18 12a6 6 0 1 1 0 12 6 6 0 0 1 0-12Zm0 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"
      clipRule="evenodd"
    />
    <path
      fill="var(--c)"
      d="M17 6.038a1 1 0 1 1 2 0v3a1 1 0 0 1-2 0v-3ZM24.244 7.742a1 1 0 1 1 1.618 1.176L24.1 11.345a1 1 0 1 1-1.618-1.176l1.763-2.427ZM29.104 13.379a1 1 0 0 1 .618 1.902l-2.854.927a1 1 0 1 1-.618-1.902l2.854-.927ZM29.722 20.795a1 1 0 0 1-.619 1.902l-2.853-.927a1 1 0 1 1 .618-1.902l2.854.927ZM25.862 27.159a1 1 0 0 1-1.618 1.175l-1.763-2.427a1 1 0 1 1 1.618-1.175l1.763 2.427ZM19 30.038a1 1 0 0 1-2 0v-3a1 1 0 1 1 2 0v3ZM11.755 28.334a1 1 0 0 1-1.618-1.175l1.764-2.427a1 1 0 1 1 1.618 1.175l-1.764 2.427ZM6.896 22.697a1 1 0 1 1-.618-1.902l2.853-.927a1 1 0 1 1 .618 1.902l-2.853.927ZM6.278 15.28a1 1 0 1 1 .618-1.901l2.853.927a1 1 0 1 1-.618 1.902l-2.853-.927ZM10.137 8.918a1 1 0 0 1 1.618-1.176l1.764 2.427a1 1 0 0 1-1.618 1.176l-1.764-2.427Z"
    />
  </svg>
)

const DarkIcon = () => (
  <svg
    className="switcher__icon"
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 36 36"
    aria-hidden="true"
  >
    <path
      fill="var(--c)"
      d="M12.5 8.473a10.968 10.968 0 0 1 8.785-.97 7.435 7.435 0 0 0-3.737 4.672l-.09.373A7.454 7.454 0 0 0 28.732 20.4a10.97 10.97 0 0 1-5.232 7.125l-.497.27c-5.014 2.566-11.175.916-14.234-3.813l-.295-.483C5.53 18.403 7.13 11.93 12.017 8.77l.483-.297Zm4.234.616a8.946 8.946 0 0 0-2.805.883l-.429.234A9 9 0 0 0 10.206 22.5l.241.395A9 9 0 0 0 22.5 25.794l.416-.255a8.94 8.94 0 0 0 2.167-1.99 9.433 9.433 0 0 1-2.782-.313c-5.043-1.352-8.036-6.535-6.686-11.578l.147-.491c.242-.745.573-1.44.972-2.078Z"
    />
  </svg>
)

export function ThemeSwitcher({ theme, setTheme }: ThemeSwitcherProps) {
  const componentId = useId().replace(/:/g, '')
  const filterId = `switcher-filter-${componentId}`

  return (
    <fieldset
      className="switcher"
      aria-label="Theme switcher"
      data-current={theme}
      style={{
        backdropFilter: `blur(8px) url(#${filterId}) saturate(var(--liquid-glass-saturation))`,
        WebkitBackdropFilter: `blur(8px) url(#${filterId}) saturate(var(--liquid-glass-saturation))`,
      }}
    >
      <legend className="switcher__legend">Choose theme</legend>

      {/* SVG Filter - MUST render BEFORE options for CSS to work */}
      <div className="switcher__filter" aria-hidden="true">
        <svg>
          <filter
            id={filterId}
            primitiveUnits="objectBoundingBox"
            colorInterpolationFilters="sRGB"
            x="0%"
            y="0%"
            width="100%"
            height="100%"
          >
            <feImage
              result="map"
              width="100%"
              height="100%"
              x="0"
              y="0"
              preserveAspectRatio="none"
              href={FILTER_MAP_DATA_URI}
            />
            <feGaussianBlur in="SourceGraphic" stdDeviation="0.04" result="blur" />
            <feDisplacementMap
              in="blur"
              in2="map"
              scale="0.5"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </svg>
      </div>

      {/* Theme Options */}
      <label className="switcher__option" aria-label="Activate Light theme">
        <input
          className="switcher__input"
          type="radio"
          name="theme"
          value="light"
          checked={theme === 'light'}
          onChange={() => setTheme('light')}
          data-option="1"
        />
        <LightIcon />
      </label>

      <label className="switcher__option" aria-label="Activate Dark theme">
        <input
          className="switcher__input"
          type="radio"
          name="theme"
          value="dark"
          checked={theme === 'dark'}
          onChange={() => setTheme('dark')}
          data-option="2"
        />
        <DarkIcon />
      </label>

      <style jsx>{`
        .switcher {
          position: fixed;
          z-index: 30;
          top: 40px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          align-items: center;
          gap: 8px;
          width: 160px;
          max-width: 160px;
          height: 70px;
          box-sizing: border-box;
          padding: 8px 12px 10px;
          margin: 0 auto;
          border: none;
          border-radius: 99em;
          background-color: color-mix(in srgb, var(--liquid-glass-color) 12%, transparent);
          box-shadow:
            inset 0 0 0 1px color-mix(in srgb, var(--liquid-glass-light) calc(var(--liquid-glass-reflex-light) * 10%), transparent),
            inset 1.8px 3px 0px -2px color-mix(in srgb, var(--liquid-glass-light) calc(var(--liquid-glass-reflex-light) * 90%), transparent),
            inset -2px -2px 0px -2px color-mix(in srgb, var(--liquid-glass-light) calc(var(--liquid-glass-reflex-light) * 80%), transparent),
            inset -3px -8px 1px -6px color-mix(in srgb, var(--liquid-glass-light) calc(var(--liquid-glass-reflex-light) * 60%), transparent),
            inset -0.3px -1px 4px 0px color-mix(in srgb, var(--liquid-glass-dark) calc(var(--liquid-glass-reflex-dark) * 12%), transparent),
            inset -1.5px 2.5px 0px -2px color-mix(in srgb, var(--liquid-glass-dark) calc(var(--liquid-glass-reflex-dark) * 20%), transparent),
            inset 0px 3px 4px -2px color-mix(in srgb, var(--liquid-glass-dark) calc(var(--liquid-glass-reflex-dark) * 20%), transparent),
            inset 2px -6.5px 1px -4px color-mix(in srgb, var(--liquid-glass-dark) calc(var(--liquid-glass-reflex-dark) * 10%), transparent),
            0px 1px 5px 0px color-mix(in srgb, var(--liquid-glass-dark) calc(var(--liquid-glass-reflex-dark) * 10%), transparent),
            0px 6px 16px 0px color-mix(in srgb, var(--liquid-glass-dark) calc(var(--liquid-glass-reflex-dark) * 8%), transparent);
          transition: background-color 400ms cubic-bezier(1, 0, 0.4, 1), box-shadow 400ms cubic-bezier(1, 0, 0.4, 1);
        }

        .switcher__legend {
          position: absolute;
          width: 1px;
          height: 1px;
          margin: -1px;
          border: 0;
          padding: 0;
          white-space: nowrap;
          clip-path: inset(100%);
          clip: rect(0 0 0 0);
          overflow: hidden;
        }

        .switcher__input {
          clip: rect(0 0 0 0);
          clip-path: inset(100%);
          height: 1px;
          width: 1px;
          overflow: hidden;
          position: absolute;
          white-space: nowrap;
        }

        .switcher__filter {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          opacity: 0;
          pointer-events: none;
          z-index: -1;
        }

        .switcher__option {
          --c: var(--liquid-glass-content);
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 0 16px;
          width: 68px;
          height: 100%;
          box-sizing: border-box;
          border-radius: 99em;
          opacity: 1;
          transition: all 160ms;
        }

        .switcher__option:not(:has(input:checked)) {
          cursor: pointer;
        }

        .switcher__option:not(:has(input:checked)):hover {
          --c: var(--liquid-glass-action, #0052f5);
        }

        .switcher__option:not(:has(input:checked)):hover :global(.switcher__icon) {
          scale: 1.2;
        }

        .switcher__option:has(input:checked) {
          --c: var(--liquid-glass-content);
          cursor: auto;
        }

        .switcher__option:has(input:checked) :global(.switcher__icon) {
          scale: 1;
        }

        :global(.switcher__icon) {
          display: block;
          width: 100%;
          transition: scale 200ms cubic-bezier(0.5, 0, 0, 1);
        }

        .switcher::after {
          content: '';
          position: absolute;
          left: 4px;
          top: 4px;
          display: block;
          width: 84px;
          height: calc(100% - 10px);
          border-radius: 99em;
          background-color: color-mix(in srgb, var(--liquid-glass-color) 36%, transparent);
          z-index: -1;
          box-shadow:
            inset 0 0 0 1px color-mix(in srgb, var(--liquid-glass-light) calc(var(--liquid-glass-reflex-light) * 10%), transparent),
            inset 2px 1px 0px -1px color-mix(in srgb, var(--liquid-glass-light) calc(var(--liquid-glass-reflex-light) * 90%), transparent),
            inset -1.5px -1px 0px -1px color-mix(in srgb, var(--liquid-glass-light) calc(var(--liquid-glass-reflex-light) * 80%), transparent),
            inset -2px -6px 1px -5px color-mix(in srgb, var(--liquid-glass-light) calc(var(--liquid-glass-reflex-light) * 60%), transparent),
            inset -1px 2px 3px -1px color-mix(in srgb, var(--liquid-glass-dark) calc(var(--liquid-glass-reflex-dark) * 20%), transparent),
            inset 0px -4px 1px -2px color-mix(in srgb, var(--liquid-glass-dark) calc(var(--liquid-glass-reflex-dark) * 10%), transparent),
            0px 3px 6px 0px color-mix(in srgb, var(--liquid-glass-dark) calc(var(--liquid-glass-reflex-dark) * 8%), transparent);
          transition: background-color 400ms cubic-bezier(1, 0, 0.4, 1), box-shadow 400ms cubic-bezier(1, 0, 0.4, 1),
            translate 400ms cubic-bezier(1, 0, 0.4, 1);
        }

        .switcher[data-current='light']::after {
          translate: 0 0;
          transform-origin: right;
          animation: scaleToggle 440ms ease;
        }

        .switcher[data-current='dark']::after {
          translate: 68px 0;
          transform-origin: left;
          animation: scaleToggle 440ms ease;
        }

        @keyframes scaleToggle {
          0% {
            scale: 1 1;
          }
          50% {
            scale: 1.1 1;
          }
          100% {
            scale: 1 1;
          }
        }
      `}</style>
    </fieldset>
  )
}
