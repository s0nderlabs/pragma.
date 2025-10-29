'use client'

import { useState, useId } from 'react'
import { DM_Sans } from 'next/font/google'

import { FILTER_MAP_DATA_URI } from './filter-map'

type Theme = 'light' | 'dark' | 'dim'

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-dm-sans',
})

type ThemeOption = {
  value: Theme
  option: '1' | '2' | '3'
  label: string
  Icon: () => React.JSX.Element
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

const DimIcon = () => (
  <svg
    className="switcher__icon"
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 36 36"
    aria-hidden="true"
  >
    <path
      fill="var(--c)"
      d="M5 21a1 1 0 0 1 1-1h24a1 1 0 1 1 0 2H6a1 1 0 0 1-1-1ZM12 25a1 1 0 0 1 1-1h10a1 1 0 1 1 0 2H13a1 1 0 0 1-1-1ZM15 29a1 1 0 0 1 1-1h4a1 1 0 1 1 0 2h-4a1 1 0 0 1-1-1ZM18 13a6 6 0 0 1 5.915 7h-2.041A4.005 4.005 0 0 0 18 15a4 4 0 0 0-3.874 5h-2.041A6 6 0 0 1 18 13ZM17 7.038a1 1 0 1 1 2 0v3a1 1 0 0 1-2 0v-3ZM24.244 8.742a1 1 0 1 1 1.618 1.176L24.1 12.345a1 1 0 1 1-1.618-1.176l1.763-2.427ZM29.104 14.379a1 1 0 0 1 .618 1.902l-2.854.927a1 1 0 1 1-.618-1.902l2.854-.927ZM6.278 16.28a1 1 0 1 1 .618-1.901l2.853.927a1 1 0 1 1-.618 1.902l-2.853-.927ZM10.137 9.918a1 1 0 0 1 1.618-1.176l1.764 2.427a1 1 0 0 1-1.618 1.176l-1.764-2.427Z"
    />
  </svg>
)

const THEME_OPTIONS: ThemeOption[] = [
  { value: 'light', option: '1', label: 'Light', Icon: LightIcon },
  { value: 'dark', option: '2', label: 'Dark', Icon: DarkIcon },
  { value: 'dim', option: '3', label: 'Dim', Icon: DimIcon },
]

const THEME_TO_OPTION: Record<Theme, ThemeOption['option']> = {
  light: '1',
  dark: '2',
  dim: '3',
}

export default function H2Test2Page() {
  const [theme, setTheme] = useState<Theme>('light')
  const [previousTheme, setPreviousTheme] = useState<Theme>('light')
  const componentId = useId().replace(/:/g, '')
  const switcherFilterId = `switcher-filter-${componentId}`
  const togglerFilterId = `toggler-filter-${componentId}`
  const previousOption = THEME_TO_OPTION[previousTheme]

  const handleThemeChange = (nextTheme: Theme) => {
    if (nextTheme === theme) return
    setPreviousTheme(theme)
    setTheme(nextTheme)
  }

  return (
    <main className={dmSans.variable}>
      <div className="page" data-theme={theme}>
        <fieldset
          className="switcher"
          aria-label="Theme switcher"
          {...{ 'c-previous': previousOption }}
          style={{
            backdropFilter: `blur(8px) url(#${switcherFilterId}) saturate(var(--saturation))`,
            WebkitBackdropFilter: `blur(8px) url(#${switcherFilterId}) saturate(var(--saturation))`,
          }}
        >
          <legend className="switcher__legend">Choose theme</legend>

          {/* SVG Filter - MUST render BEFORE options for CSS to work */}
          <div className="switcher__filter" aria-hidden="true">
            <svg>
              <filter
                id={switcherFilterId}
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
              <filter
                id={togglerFilterId}
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
                <feGaussianBlur in="SourceGraphic" stdDeviation="0.01" result="blur" />
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

          {/* Theme Options - Render AFTER SVG filter */}
          {THEME_OPTIONS.map(({ value, option, label, Icon }) => (
            <label
              key={value}
              className="switcher__option"
              aria-label={`Activate ${label} theme`}
            >
              <input
                className="switcher__input"
                type="radio"
                name="theme"
                value={value}
                checked={theme === value}
                onChange={() => handleThemeChange(value)}
                {...{ 'c-option': option }}
              />
              <Icon />
            </label>
          ))}
        </fieldset>

        <article className="article">
          <h1>Liquid glass</h1>
          <p>
            Lorem ipsum dolor sit amet consectetur adipisicing elit. Qui maxime optio quam debitis autem, maiores odio
            tenetur dicta aperiam aliquam, iusto nisi ipsum tempore dolore doloremque facere non culpa sint sequi ducimus
            corporis veritatis cumque corrupti sed. Ipsa dolor quod alias dicta dolores. Ducimus pariatur nostrum quo,
            impedit <a href="">facilis voluptatibus</a>! Non doloremque, facere neque dolorem animi earum odio placeat quae
            voluptatem nisi nihil deleniti voluptatibus harum magnam adipisci tenetur. Ab aliquid reprehenderit accusamus id
            quae velit quasi nostrum possimus ipsa vel. Voluptate nisi impedit placeat nemo neque asperiores iure saepe, eius
            eligendi odit quisquam delectus veniam autem, sequi laborum atque.
          </p>
          <figure>
            <img
              src="https://images.unsplash.com/photo-1706720094773-d91e070e4b90?q=80&w=2515&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
              alt="Photo by Neeqolah Creative Works on Unsplash"
            />
            <figcaption>
              Photo by Neeqolah Creative Works on{' '}
              <a href="https://unsplash.com/photos/a-close-up-of-a-green-object-on-a-yellow-background-A2kyFEwh3zo">Unsplash</a>
            </figcaption>
          </figure>
          <p>
            Sit amet consectetur adipisicing elit. Quibusdam illum in voluptates omnis reprehenderit inventore perferendis
            dolores, architecto doloribus. Quam error qui nam quis! Dolorum, dolore saepe ipsam quae aliquam tenetur dolores
            dolor repellendus facere a quasi soluta voluptate provident earum cum. Nostrum consequuntur corporis quibusdam
            tempora amet, animi inventore dicta voluptas nisi placeat ut illum explicabo! Consequatur, accusamus. Labore quo
            perspiciatis quos est molestiae illo possimus deserunt sed amet maxime, dolorum praesentium nihil doloribus
            similique cumque eveniet qui vero eius magni reprehenderit aspernatur, et, quod voluptatum? Voluptatem, eveniet vel
            sunt nesciunt recusandae alias maiores optio labore, dolorum aut possimus iusto quia. Non quas excepturi ea, maxime
            mollitia fugit, animi alias ad repudiandae dolores facere molestiae id, nemo temporibus explicabo.
          </p>
          <blockquote>Et aliquam libero deserunt maxime! Perspiciatis neque deserunt sequi deleniti!</blockquote>
          <p>
            Recusandae doloribus, ullam inventore esse culpa cupiditate dignissimos qui ducimus possimus ipsum reprehenderit,
            suscipit debitis nihil sit. Animi eligendi sed molestiae. Repellat, est ut eos voluptates tempora quisquam corporis
            mollitia, excepturi commodi cum dolore asperiores eaque debitis fuga quidem! A laborum ab reiciendis saepe rerum
            iste. Nisi quos earum ex nulla neque <a href="">tempora explicabo reiciendis</a> vitae sapiente accusamus tempore
            consequatur nemo, placeat magni quasi corrupti nobis alias, rerum ipsam fuga quisquam tenetur repellendus! Sit
            laborum aut odit pariatur quos cupiditate iure maiores. Quis nemo dicta numquam autem debitis blanditiis, odio
            explicabo maxime officiis magni soluta dolor suscipit, quo nisi eaque deleniti dolorem aperiam deserunt. Animi
            dolor expedita consectetur deserunt, quae id ab.
          </p>
          <p>
            Lorem ipsum dolor sit amet consectetur adipisicing elit. Eligendi aperiam enim eos repellendus molestiae, ad ab
            maxime et, aut nam culpa eveniet. Eaque consequuntur laudantium ex dolore voluptas rem cumque, quos voluptatibus aut
            maxime. Animi enim odio ea porro molestiae laudantium ipsam nulla quia distinctio quod incidunt pariatur accusamus
            possimus laborum veritatis maxime, asperiores quasi!
          </p>
          <h2>Doloremque nisi eius quis</h2>
          <p>
            Magnam quo voluptate vitae voluptatem expedita vel illum ut. Tempore, sed? Sunt distinctio minus dolore,
            consequuntur eos qui eveniet error rerum tempora, autem et quaerat, ea repellendus unde iure. Fuga ad tempore
            cupiditate animi iste, eius nam beatae, aliquid quae id iusto perspiciatis. Quos quis cum itaque facilis libero
            sequi quaerat ipsam hic blanditiis doloribus modi sapiente tempora ipsum fugiat similique cupiditate beatae
            provident eos natus doloremque alias, sed praesentium.
          </p>
          <figure>
            <img
              src="https://images.unsplash.com/photo-1734606901283-489b25f7aa9b?q=80&w=2360&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
              alt="Photo by Neeqolah Creative Works on Unsplash"
            />
            <figcaption>
              Photo by Irene Demetri on{' '}
              <a href="https://unsplash.com/photos/a-close-up-of-a-green-object-on-a-yellow-background-A2kyFEwh3zo">Unsplash</a>
            </figcaption>
          </figure>
          <p>
            Quod iste recusandae sed labore corporis ea provident debitis hic maxime placeat alias rem cumque animi explicabo
            laboriosam, dicta molestias? Corporis quibusdam, aliquam asperiores quo officia reiciendis nemo aspernatur
            similique voluptatibus in tempora? Laborum temporibus ipsa at exercitationem ullam labore tempore neque. Porro
            earum distinctio rem perferendis amet nihil maiores ab id cumque quae nesciunt, velit fugiat in aspernatur unde. Ut
            dolor eaque, vero quo sunt sed exercitationem cum accusamus, beatae, quasi rerum. Id eius dolorem nihil porro,
            voluptatem exercitationem tenetur impedit laudantium odit aliquam vel, facilis eos quasi voluptatibus optio. Ipsum
            voluptatum labore consequatur dolorum veritatis qui placeat magnam aut expedita. Error facere tempora ratione
            sapiente illo laudantium, ut nihil. Mollitia vitae, eveniet blanditiis corrupti at molestias aliquam ipsa esse
            optio temporibus dolorem, fugiat obcaecati culpa fuga numquam sapiente libero. Impedit maiores doloremque iusto
            autem temporibus! Quam cupiditate officiis possimus, ratione quasi nobis rem quidem quibusdam? Ut earum possimus
            expedita culpa nobis suscipit, non minima at dignissimos aut optio eum? Cumque?
          </p>
          <p>
            Lorem ipsum dolor sit amet consectetur adipisicing elit. Excepturi, aut commodi aliquid, blanditiis doloribus
            suscipit perferendis hic assumenda dolorum magnam enim. Error minima magnam modi aliquam quia at obcaecati sunt quas
            velit numquam, voluptatem inventore blanditiis necessitatibus harum possimus nostrum vel expedita quam dignissimos
            tenetur maxime provident aspernatur nam iste. At veritatis nemo quisquam, facilis numquam nostrum veniam perferendis
            repudiandae cum ipsa eos eius est doloremque excepturi delectus quidem repellat suscipit et tenetur vitae porro nisi
            iure? Ipsa facere at blanditiis nobis temporibus labore architecto nulla deleniti quod hic minus consequuntur,
            unde, quasi eius consequatur est! Laborum neque illo ab.
          </p>
          <blockquote>Consequatur itaque sit amet consectetur adipisicing elit.</blockquote>
          <p>
            Ab eveniet recusandae incidunt id cumque porro? Dignissimos nostrum iure possimus mollitia sed provident esse optio
            odio consequatur! Recusandae dicta ab atque? Eveniet molestias autem accusantium vero, tenetur placeat ratione
            voluptates nesciunt, adipisci ullam cum quae eius eaque quibusdam nihil dolorem! Ab eveniet recusandae incidunt id
            cumque porro? Sit tenetur quasi odit, facere dolore quae voluptatibus fugiat, quibusdam vitae labore dignissimos.
            Unde, maiores cumque dolore quas repellat vel adipisci harum incidunt consequatur ad!
          </p>
          <p>
            Ipsum explicabo quod laborum non provident, consectetur sint unde hic dolor quisquam ullam nulla veniam! Sapiente
            impedit sint expedita officiis fugit est quia. Neque, ea aspernatur? Quod voluptas ab aliquid saepe id, eos
            suscipit, autem quae reiciendis omnis veritatis officiis culpa doloremque? Reiciendis ea modi quod ducimus culpa
            omnis aliquid non minus ipsam necessitatibus distinctio, aspernatur iure. Nihil cupiditate amet officiis eligendi
            nostrum harum labore porro optio obcaecati reiciendis blanditiis quae, perspiciatis voluptatibus suscipit enim.
          </p>
          <p className="box">
            Perspiciatis sapiente eum velit inventore illum accusamus eos at esse mollitia debitis quae rem odit, ipsam nam.
            Voluptas beatae, velit voluptatum dolor obcaecati a nobis consequuntur quis id eaque! Sapiente nostrum rerum esse
            quo laborum excepturi explicabo, perspiciatis dicta corporis atque?
          </p>
          <h2>Quod voluptas aliquid id saepe</h2>
          <p>
            Et minima quas amet! Debitis commodi consectetur laborum fugit voluptatum qui distinctio, natus odit obcaecati.
            Voluptate suscipit consectetur, aspernatur ratione impedit minus facilis voluptatum tempora nesciunt pariatur ipsa
            provident qui distinctio ad quasi magnam exercitationem itaque. Recusandae maiores dolor saepe commodi a eligendi
            aut adipisci neque dolorem tempora perspiciatis odio asperiores quos iusto animi quia tempore, molestiae deleniti
            vel. Earum, atque? Ipsa reiciendis cum laborum fugiat doloremque asperiores, voluptatem exercitationem in sequi!
          </p>
          <p>
            Dolor sit, amet consectetur adipisicing elit. Earum, amet ea quaerat, repellendus ipsum sunt blanditiis ab tempora
            doloribus quas voluptas magni ut perferendis unde dolor tenetur repudiandae, porro dolore et nisi eius. Eos, esse
            minus molestiae maiores praesentium dolorum dolor eaque repellendus laudantium provident adipisci alias inventore
            ratione distinctio libero facilis voluptas hic illum odio laboriosam quos minima officia natus. Maxime eveniet
            repellendus non iste exercitationem aliquam velit, corrupti ut, id provident reprehenderit accusamus nemo
            reiciendis fugiat saepe quas quasi ad tempora! Qui earum eligendi architecto delectus animi similique laborum
            dolorum, recusandae beatae voluptatibus! Maiores ad libero quibusdam temporibus, quis possimus perferendis corporis
            modi, culpa voluptatum maxime. Earum, rem.
          </p>
          <p>
            Eos dolore dicta delectus dolorum porro fuga modi, perferendis natus ratione repellendus sit harum sint! Numquam
            quas facere quod doloribus enim omnis earum maxime perferendis ipsam magnam quos culpa, vitae, tenetur quisquam,
            unde quis maiores. Eos quos earum illo animi exercitationem nemo, at asperiores soluta similique aliquid cum quam quo
            corrupti accusantium iure praesentium. Omnis aliquam harum reiciendis necessitatibus temporibus expedita voluptate,
            dignissimos ratione dolorem perferendis ut aliquid magni nam nisi deserunt eum nulla excepturi quos sunt accusamus
            earum cupiditate minus. Expedita, corporis suscipit mollitia qui repellendus harum cumque id quis architecto quidem,
            aliquid vero dolores necessitatibus animi eos optio? Perspiciatis!
          </p>
          <p>
            Maxime in officiis fugiat corporis cum doloremque atque, at architecto dicta quod inventore corrupti facilis
            repellendus pariatur possimus error! At aperiam aliquam fugiat eveniet sapiente soluta hic ab ipsam, corrupti
            temporibus tempore? Velit, sed quos mollitia deleniti fugiat tempora fuga reprehenderit neque tempore doloremque
            ducimus quasi? Sit facere porro esse vero accusantium praesentium odit. Quisquam sint nobis dolorum labore distinctio
            ducimus animi alias quod necessitatibus rem non error consectetur voluptate tempora libero facilis ratione voluptates
            expedita, unde a blanditiis odio. Nostrum sapiente dolor enim?
          </p>
          <p className="article__footer">
            Made with love by <a href="https://vadik.design">Vadik Matveev</a>
          </p>
        </article>
      </div>

      <style jsx>{`
        .page {
          --c-glass: #bbbbbc;
          --c-light: #fff;
          --c-dark: #000;
          --c-content: #224;
          --c-action: #0052f5;
          --c-bg: #e8e8e9;
          --glass-reflex-dark: 1;
          --glass-reflex-light: 1;
          --saturation: 150%;
          font-size: 20px;
          font-family: var(--font-dm-sans), 'DM Sans', sans-serif;
          font-optical-sizing: auto;
          background: var(--c-bg);
          color: var(--c-content);
          transition: background 400ms cubic-bezier(1, 0, 0.4, 1), color 400ms cubic-bezier(1, 0, 0.4, 1);
          min-height: 100vh;
        }

        .page[data-theme='dark'] {
          --c-glass: #bbbbbc;
          --c-light: #fff;
          --c-dark: #000;
          --c-content: #e1e1e1;
          --c-action: #03d5ff;
          --c-bg: #1b1b1d;
          --glass-reflex-dark: 2;
          --glass-reflex-light: 0.3;
          --saturation: 150%;
        }

        .page[data-theme='dim'] {
          --c-light: #99deff;
          --c-dark: #20001b;
          --c-glass: hsl(335 250% 74% / 1);
          --c-content: #d5dbe2;
          --c-action: #ff48a9;
          --c-bg: #152433;
          --glass-reflex-dark: 2;
          --glass-reflex-light: 0.7;
          --saturation: 200%;
        }

        .switcher {
          position: fixed;
          z-index: 10;
          top: 40px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          align-items: center;
          gap: 8px;
          width: 244px;
          max-width: 244px;
          height: 70px;
          box-sizing: border-box;
          padding: 8px 12px 10px;
          margin: 0 auto;
          border: none;
          border-radius: 99em;
          background-color: color-mix(in srgb, var(--c-glass) 12%, transparent);
          /* backdrop-filter moved to inline styles for proper dynamic ID handling */
          box-shadow:
            inset 0 0 0 1px color-mix(in srgb, var(--c-light) calc(var(--glass-reflex-light) * 10%), transparent),
            inset 1.8px 3px 0px -2px color-mix(in srgb, var(--c-light) calc(var(--glass-reflex-light) * 90%), transparent),
            inset -2px -2px 0px -2px color-mix(in srgb, var(--c-light) calc(var(--glass-reflex-light) * 80%), transparent),
            inset -3px -8px 1px -6px color-mix(in srgb, var(--c-light) calc(var(--glass-reflex-light) * 60%), transparent),
            inset -0.3px -1px 4px 0px color-mix(in srgb, var(--c-dark) calc(var(--glass-reflex-dark) * 12%), transparent),
            inset -1.5px 2.5px 0px -2px color-mix(in srgb, var(--c-dark) calc(var(--glass-reflex-dark) * 20%), transparent),
            inset 0px 3px 4px -2px color-mix(in srgb, var(--c-dark) calc(var(--glass-reflex-dark) * 20%), transparent),
            inset 2px -6.5px 1px -4px color-mix(in srgb, var(--c-dark) calc(var(--glass-reflex-dark) * 10%), transparent),
            0px 1px 5px 0px color-mix(in srgb, var(--c-dark) calc(var(--glass-reflex-dark) * 10%), transparent),
            0px 6px 16px 0px color-mix(in srgb, var(--c-dark) calc(var(--glass-reflex-dark) * 8%), transparent);
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

        .switcher__icon {
          display: block;
          width: 100%;
          transition: scale 200ms cubic-bezier(0.5, 0, 0, 1);
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
          --c: var(--c-content);
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
          --c: var(--c-action);
        }

        .switcher__option:not(:has(input:checked)):hover .switcher__icon {
          scale: 1.2;
        }

        .switcher__option:has(input:checked) {
          --c: var(--c-content);
          cursor: auto;
        }

        .switcher__option:has(input:checked) .switcher__icon {
          scale: 1;
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
          background-color: color-mix(in srgb, var(--c-glass) 36%, transparent);
          z-index: -1;
          box-shadow:
            inset 0 0 0 1px color-mix(in srgb, var(--c-light) calc(var(--glass-reflex-light) * 10%), transparent),
            inset 2px 1px 0px -1px color-mix(in srgb, var(--c-light) calc(var(--glass-reflex-light) * 90%), transparent),
            inset -1.5px -1px 0px -1px color-mix(in srgb, var(--c-light) calc(var(--glass-reflex-light) * 80%), transparent),
            inset -2px -6px 1px -5px color-mix(in srgb, var(--c-light) calc(var(--glass-reflex-light) * 60%), transparent),
            inset -1px 2px 3px -1px color-mix(in srgb, var(--c-dark) calc(var(--glass-reflex-dark) * 20%), transparent),
            inset 0px -4px 1px -2px color-mix(in srgb, var(--c-dark) calc(var(--glass-reflex-dark) * 10%), transparent),
            0px 3px 6px 0px color-mix(in srgb, var(--c-dark) calc(var(--glass-reflex-dark) * 8%), transparent);
          transition: background-color 400ms cubic-bezier(1, 0, 0.4, 1), box-shadow 400ms cubic-bezier(1, 0, 0.4, 1),
            translate 400ms cubic-bezier(1, 0, 0.4, 1);
        }

        .switcher:has(input[c-option='1']:checked)::after {
          translate: 0 0;
          transform-origin: right;
          animation: scaleToggle 440ms ease;
        }

        .switcher:has(input[c-option='2']:checked)::after {
          translate: 76px 0;
          animation: scaleToggle2 440ms ease;
        }

        .switcher[c-previous='1']:has(input[c-option='2']:checked)::after {
          transform-origin: left;
        }

        .switcher[c-previous='3']:has(input[c-option='2']:checked)::after {
          transform-origin: right;
        }

        .switcher:has(input[c-option='3']:checked)::after {
          translate: 152px 0;
          transform-origin: left;
          animation: scaleToggle3 440ms ease;
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

        @keyframes scaleToggle2 {
          0% {
            scale: 1 1;
          }
          50% {
            scale: 1.2 1;
          }
          100% {
            scale: 1 1;
          }
        }

        @keyframes scaleToggle3 {
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

        .article {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 5em 2em;
        }

        h1,
        h2,
        p,
        blockquote {
          width: 100%;
          max-width: 600px;
          box-sizing: border-box;
        }

        h1 {
          font-size: 3em;
          margin: 1.4em 0 0.6em;
        }

        h2 {
          font-size: 2em;
          margin: 1.4em 0 0.6em;
        }

        p {
          line-height: 160%;
          margin: 0 0 1em;
        }

        blockquote {
          margin-left: 0;
          margin-right: 0;
          font-size: 2em;
          padding-left: 1em;
          border-left: 0.1em solid currentColor;
        }

        figure {
          margin: 1em 0 2em;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        figcaption {
          max-width: 600px;
          margin-top: 1em;
          font-size: 0.8em;
          color: color-mix(in srgb, var(--c-content) 60%, var(--c-bg));
        }

        a {
          color: var(--c-action);
          text-decoration-thickness: 0.05em;
          text-underline-position: under;
          text-decoration-color: color-mix(in srgb, currentColor, transparent 70%);
          transition: color 160ms, text-decoration-color 160ms;
        }

        a:hover {
          color: color-mix(in srgb, var(--c-action), var(--c-content) 40%);
          text-decoration-color: color-mix(in srgb, currentColor, transparent 30%);
        }

        img {
          display: block;
          border-radius: 0.8em;
          width: 100%;
          max-width: 700px;
          aspect-ratio: 5 / 3;
          object-fit: cover;
        }

        .box {
          padding: 1em 1.4em;
          border-top: 4px solid color-mix(in srgb, var(--c-action) 50%, transparent);
          border-radius: 0.8em;
          background-color: color-mix(in srgb, var(--c-action) 8%, var(--c-bg));
          transition: background 400ms cubic-bezier(1, 0, 0.4, 1);
        }

        .article__footer {
          margin-top: 2em;
        }

        @media (max-width: 640px) {
          .switcher {
            top: 16px;
          }

          .article {
            padding: 4em 1.2em 2.4em;
          }
        }
      `}</style>
    </main>
  )
}
