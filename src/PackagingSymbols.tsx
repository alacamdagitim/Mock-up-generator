/** Original packaging pictograms, drawn here rather than taken from a vendor set. */
export const PACKAGING_SYMBOLS = [
  {
    id: "handle-with-care",
    name: "Handle with care",
    body: `<path d="m50 5 21 11-21 11-21-11Zm-23 15 20 11v22L27 42Zm26 11 20-11v22L53 53ZM6 48c5-1 8 2 10 8l9 16 9 5-7-11c-2-4-1-8 2-9 3-2 7 0 9 3l13 20v13H29L10 80 3 59c-2-6-1-10 3-11Zm88 0c-5-1-8 2-10 8l-9 16-9 5 7-11c2-4 1-8-2-9-3-2-7 0-9 3L49 80v13h22l19-13 7-21c2-6 1-10-3-11Z"/>`,
  },
  {
    id: "keep-dry",
    name: "Keep dry",
    body: `<path d="M49 15C27 15 9 29 5 51c8-7 15-7 23 0 8-7 15-7 22 0 8-7 15-7 22 0 8-7 15-7 23 0-4-22-22-36-44-36V8h-2ZM46 49h8v29c0 5 2 8 7 8s7-3 7-8v-5h8v5c0 10-5 16-15 16S46 88 46 78ZM13 3C11 8 7 12 7 16a6 6 0 0 0 12 0c0-4-4-8-6-13Zm21-1c-2 5-6 9-6 13a6 6 0 0 0 12 0c0-4-4-8-6-13Zm34 0c-2 5-6 9-6 13a6 6 0 0 0 12 0c0-4-4-8-6-13Zm21 1c-2 5-6 9-6 13a6 6 0 0 0 12 0c0-4-4-8-6-13Z"/>`,
  },
  {
    id: "fragile",
    name: "Fragile",
    body: `<path d="M22 6h30L41 25l12 8-15 20c-8-3-12-10-13-19Zm37 0h19l-3 28c-1 14-8 22-21 24v26h19v9H27v-9h19V58l12-28-10-7Z"/>`,
  },
  {
    id: "this-side-up",
    name: "This side up",
    body: `<path d="M7 34 28 6l21 28H35v42H21V34Zm44 0L72 6l21 28H79v42H65V34ZM7 85h86v9H7Z"/>`,
  },
  {
    id: "stacking-limit",
    name: "Stacking limit",
    body: `<path fill-rule="evenodd" d="M50 5c-15 0-25 7-25 20 0 8 4 13 10 17-8 4-13 11-13 19 0 15 11 24 28 24s28-9 28-24c0-8-5-15-13-19 6-4 10-9 10-17C75 12 65 5 50 5Zm0 10c8 0 12 4 12 10s-4 11-12 11-12-5-12-11 4-10 12-10Zm0 32c9 0 15 5 15 13s-6 13-15 13-15-5-15-13 6-13 15-13Z"/><path d="M8 87h84v5H8Zm0 9h84v4H8Z"/>`,
  },
  {
    id: "hand-truck",
    name: "Hand truck",
    body: `<path d="M10 5h16l24 66h37v8H44L20 13H10Zm25 9 23-8 9 25-23 8Zm12 30 30-11 11 30-30 11Z"/><path fill-rule="evenodd" d="M45 72a13 13 0 1 0 0 26 13 13 0 0 0 0-26Zm0 8a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z"/>`,
  },
  {
    id: "recycle",
    name: "Recycle",
    body: `<path d="M43 7h16l13 22 8-5-5 23-23-4 8-5-10-18-9 15-13-8Z"/><path d="M43 7h16l13 22 8-5-5 23-23-4 8-5-10-18-9 15-13-8Z" transform="rotate(120 50 50)"/><path d="M43 7h16l13 22 8-5-5 23-23-4 8-5-10-18-9 15-13-8Z" transform="rotate(240 50 50)"/>`,
  },
  {
    id: "dispose-properly",
    name: "Dispose properly",
    body: `<circle cx="40" cy="12" r="8"/><path d="M34 24h13l12 16 14-3 2 7-21 6-8-11v22l12 30H47L37 67l-7 24H19l10-34V32c0-4 1-6 5-8Zm37 25 8 2-2 8-8-2Z"/><path fill-rule="evenodd" d="M65 61h31l-5 31H70Zm7 6 3 19h11l3-19Z"/>`,
  },
  {
    id: "do-not-cut",
    name: "Do not cut",
    body: `<path d="m20 72 8-8 13 13-8 8c-4 4-8 4-12 0l-1-1c-4-4-4-8 0-12Zm11-13L69 8l13 13-35 45-6 4Z M60 63l9-9 27 27-9 9Zm0 18 27-27 9 9-27 27Z"/>`,
  },
  {
    id: "caution",
    name: "Caution",
    body: `<path fill-rule="evenodd" d="M46 7c2-4 6-4 8 0l43 77c3 5 1 10-5 10H8c-6 0-8-5-5-10Zm4 17L17 83h66Z"/><path d="M44 40h12l-2 24h-8Z"/><circle cx="50" cy="73" r="5"/>`,
  },
  {
    id: "food-contact",
    name: "Food contact",
    body: `<path d="M11 7h6v23h5V7h6v23h5V7h6v26c0 10-4 16-10 18v42H19V51c-5-2-8-8-8-18Zm41 0h39l-3 27c-1 11-5 17-14 20v29h15v9H49v-9h15V54c-8-3-12-9-13-20Z"/>`,
  },
  {
    id: "corrugated-recycling",
    name: "Corrugated recycling",
    body: `<path d="m49 5 36 16-34 17L16 22Zm-35 23 32 16v39L14 67Zm40 16 31-16v39L54 83Z"/><path d="m6 40 8 6v29l28 13-2-9 18 13-21 8 3-7L6 78Zm85-11 9 20-8-4v31L63 90l-4-8 24-12V41l-8 5Z"/>`,
  },
  {
    id: "keep-away-from-sunlight",
    name: "Keep away from sunlight",
    body: `<circle cx="73" cy="24" r="12"/><path d="M70 1h6v8h-6Zm0 38h6v8h-6ZM50 21h8v6h-8Zm38 0h9v6h-9ZM55 5l6 6-4 5-7-7Zm31 29 6 6-5 5-6-7Zm-1-23 7-7 4 5-7 7ZM42 32l49 39-6 8-44-34L7 71l-6-8Z"/><path d="M14 69h9v24h-9Zm57 0h9v24h-9ZM28 65h35v28H28Z"/>`,
  },
  {
    id: "temperature-limit",
    name: "Temperature limit",
    body: `<path fill-rule="evenodd" d="M29 5c-9 0-15 6-15 15v43a20 20 0 1 0 30 0V20c0-9-6-15-15-15Zm0 8c4 0 7 3 7 7v47l3 2a12 12 0 1 1-20 0l3-2V20c0-4 3-7 7-7Z"/><path d="M25 36h8v38h-8Zm32-21h29v7H57Zm0 14h18v6H57Zm0 15h29v7H57Zm0 15h18v6H57Zm0 15h29v7H57Z"/><circle cx="29" cy="79" r="8"/>`,
  },
] as const;

type PackagingSymbol = (typeof PACKAGING_SYMBOLS)[number];

export function packagingSvg(symbol: PackagingSymbol) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 100 100" fill="#000000">${symbol.body}</svg>`;
}

export function PackagingSymbols({
  onAdd,
}: {
  onAdd: (name: string, svg: string) => void;
}) {
  return (
    <div className="online-shape-grid symbol-grid packaging-symbol-grid">
      {PACKAGING_SYMBOLS.map((symbol) => (
        <button
          key={symbol.id}
          type="button"
          aria-label={symbol.name}
          title={symbol.name}
          onClick={() => onAdd(symbol.name, packagingSvg(symbol))}
        >
          <svg
            viewBox="0 0 100 100"
            fill="#000000"
            aria-hidden="true"
            style={{ width: "62%", height: "62%" }}
            dangerouslySetInnerHTML={{ __html: symbol.body }}
          />
        </button>
      ))}
    </div>
  );
}
