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

/**
 * A price written as plain text (Apple tickets): erased, then redrawn in the design's font at the same place.
 * `monthly` = cicilan per bulan (selling price / 24), `price` = selling price.
 */
export interface TextSlot {
  type: "text";
  key: string;
  label: string;
  field: "price" | "monthly";
  /** Value printed in the design (the monthly amount for a monthly slot). */
  canva: { price: number; strike?: number };
  /** Text start (left) and baseline, font size (frame px), bold, colour; text after the number ("/bln"). */
  x: number;
  y: number;
  size: number;
  bold: boolean;
  color: string;
  suffix: string;
  /** Width of the printed text in the design: its letter spacing is copied (Word spaces characters its own way). */
  w: number;
  erase: Array<[number, number, number, number]>;
  /** The text must end before this x; a longer text is made smaller to fit. */
  maxRight: number;
  strikeRoom: false;
}

export type AnySlot = TicketSlot | TextSlot;
export const isTextSlot = (s: AnySlot): s is TextSlot => (s as TextSlot).type === "text";

export interface TicketTemplate {
  id: string;
  brand: string;
  name: string;
  image: string;
  /** Printed size in mm [w, h]. */
  size: [number, number];
  /** Design frame in px [w, h] — the coordinate system of the slots (the image may be stored larger). */
  frame: [number, number];
  slots: AnySlot[];
  /** Price list the slots are matched in (default android). */
  kind?: "android" | "apple";
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
  /** Selling price behind a monthly value. */
  full?: number;
  /** Price list row used. */
  match?: string;
  /** Normal price of a promo that cannot be struck through (no room on the design). */
  strikeDropped?: number;
}
