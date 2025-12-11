import React from 'react'

export function CreditsPage() {
  return (
    <div className="info-page info-page--spaced">
      <h1>Credits &amp; Legal</h1>

      <section className="info-section">
        <h2>Project Credits</h2>
        <p>
          Dice Masters™ and all related logos, characters, and imagery are trademarks of WizKids/NECA LLC.
          This fan-made companion app is built to help the community browse cards, manage collections, and
          compare trades.
        </p>
        <ul className="info-list">
          <li>Card database compiled from official Dice Masters releases and curated community resources.</li>
          <li>Rules guidance sourced from official rulings, the Dice Masters Wiki, and community FAQs.</li>
          <li>Icons and energy symbols remain © WizKids; used here for identification under fair use.</li>
        </ul>
      </section>

      <section className="info-section">
        <h2>Legal Disclaimer</h2>
        <p>
          This project is not affiliated with, endorsed by, or sponsored by WizKids/NECA LLC or any other
          rights holders. All card art, trademarks, and product names belong to their respective owners. If
          you are a rights holder and would like something adjusted or removed, please reach out and we will
          respond promptly.
        </p>
      </section>
    </div>
  )
}
