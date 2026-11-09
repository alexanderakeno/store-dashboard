/**
 * Price ticket designs: a capture of the Canva design + the geometry of each printed price, so a new price is drawn
 * in the design's own letter shapes and spacing. Coordinates are in the design frame (`TicketTemplate.frame`, px).
 */
export interface StrikeStyle {
  /** Digit top below the main digits' baseline and digit height, in main digit heights. */
  dy: number;
  h: number;
  /** "right": the strike group ends `dx`·H right of the main price's end; "left": its digits start `dx`·H right of the main digits. */
  align: "left" | "right";
  dx: number;
  /** Red line: start (from the strike "Rp." left) and end (from the group's right edge), x/y in strike digit heights; width. */
  line: [number, number, number, number, number];
}

export interface TicketSlot {
  /** Price list name ("REDMI 15C 6/128GB" or "WATCH GT 6 PRO 46MM TITANIUM"); matched on its words, see resolveSlot. */
  key: string;
  /** Variant shown in the app ("6/128GB"); empty for a single-price ticket. */
  label: string;
  /** Price printed in the Canva design. */
  canva: { price: number; strike?: number };
  /** Main digits: left edge, top, height; letter spacing in digit heights. */
  x: number;
  top: number;
  H: number;
  track: number;
  /** Superscript thousands: gap after the digits, top offset from the digit top, height, letter spacing (all px / ratio). */
  sup: { gap: number; dy: number; h: number; track: number };
  /** Areas holding the printed price (digits, superscript, strike price) — one per letter, so nearby text stays. */
  erase: Array<[number, number, number, number]>;
  /** The price must end before this x (next price / icons). */
  maxRight: number;
  /** Room under the price for a strike (normal) price. */
  strikeRoom: boolean;
  /** Strike style of this price in the design (else the template's). */
  strike?: StrikeStyle;
}

export interface TicketTemplate {
  id: string;
  brand: string;
  name: string;
  image: string;
  /** Printed size in mm [w, h]. */
  size: [number, number];
  /** Design frame in px [w, h] — the coordinate system of the slots (the image may be stored larger). */
  frame: [number, number];
  slots: TicketSlot[];
  /** Strike style for prices that had none in the design. */
  strikeStyle: StrikeStyle;
  /** Remark about the design itself (e.g. a name that differs from the price list). */
  note?: string;
}

/** same = design already shows the price list · updated = redrawn from the price list · missing = not in the price list (design price kept). */
export type TicketStatus = "same" | "updated" | "missing";

export interface ResolvedSlot {
  key: string;
  label: string;
  price: number;
  strike?: number;
  status: TicketStatus;
  /** Price list row used. */
  match?: string;
  /** Normal price of a promo that cannot be struck through (no room on the design). */
  strikeDropped?: number;
}
