export function CasebookFlowLines() {
  return (
    <svg className="casebook-flow-lines" viewBox="0 0 1000 760" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="casebook-flow-gradient" x1="0%" x2="100%" y1="0%" y2="0%">
          <stop offset="0%" stopColor="#ebe6c9" stopOpacity="0" />
          <stop offset="24%" stopColor="#ebe6c9" stopOpacity=".22" />
          <stop offset="52%" stopColor="#ebe6c9" stopOpacity=".78" />
          <stop offset="76%" stopColor="#ebe6c9" stopOpacity=".22" />
          <stop offset="100%" stopColor="#ebe6c9" stopOpacity="0" />
        </linearGradient>
      </defs>

      <path
        d="M 272 226 C 342 226 372 186 448 186 S 558 170 620 170"
        className="casebook-flow-lines__path casebook-flow-lines__path--glow"
      />
      <path
        d="M 272 226 C 342 226 372 186 448 186 S 558 170 620 170"
        className="casebook-flow-lines__path casebook-flow-lines__path--flow"
        style={{ stroke: 'url(#casebook-flow-gradient)', strokeDasharray: '9 18' }}
      />

      <path
        d="M 500 264 C 500 340 500 375 500 446"
        className="casebook-flow-lines__path casebook-flow-lines__path--glow"
      />
      <path
        d="M 500 264 C 500 340 500 375 500 446"
        className="casebook-flow-lines__path casebook-flow-lines__path--flow"
        style={{ stroke: 'url(#casebook-flow-gradient)', strokeDasharray: '10 18' }}
      />

      <path
        d="M 562 212 C 650 202 708 182 778 182"
        className="casebook-flow-lines__path casebook-flow-lines__path--glow"
      />
      <path
        d="M 562 212 C 650 202 708 182 778 182"
        className="casebook-flow-lines__path casebook-flow-lines__path--flow"
        style={{ stroke: 'url(#casebook-flow-gradient)', strokeDasharray: '9 18' }}
      />

      <circle cx="272" cy="226" r="7" className="casebook-flow-lines__node casebook-flow-lines__node--left" />
      <circle cx="500" cy="170" r="8" className="casebook-flow-lines__node casebook-flow-lines__node--center" />
      <circle cx="778" cy="182" r="7" className="casebook-flow-lines__node casebook-flow-lines__node--right" />
      <circle cx="500" cy="446" r="7" className="casebook-flow-lines__node casebook-flow-lines__node--signal" />
    </svg>
  );
}
