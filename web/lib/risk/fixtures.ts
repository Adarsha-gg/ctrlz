/**
 * Demo fixtures (P2.1): the sender's address book + well-known names, and the
 * PLANTED POISONED LOOKALIKE demo beat 1 pastes. Keep alice's address in sync
 * with the seed script (P1.11, contracts lane) — the seeded history and this
 * book must describe the same alice.
 */

import type { AddressBookEntry } from "./types";

/** alice — trusted seller with seeded sealed history on Arc */
export const ALICE_ADDRESS = "0xA11cE0000000000000000000000000000000a5e1";
export const ALICE_NAME = "alice.ctrlz.eth";

/**
 * The attack: vanity-generated to match alice's visible prefix + suffix
 * (0xA11cE0…a5e1) with a different middle — what a poisoner plants in your
 * tx history hoping you copy it.
 */
export const POISONED_LOOKALIKE = "0xA11cE0ffee00000000000000000000000000a5e1";

export const DEMO_ADDRESS_BOOK: AddressBookEntry[] = [
  { name: ALICE_NAME, address: ALICE_ADDRESS },
  { name: "bob.ctrlz.eth", address: "0xB0B0000000000000000000000000000000000b0b" }
];

/** names worth defending beyond the user's own book (brand-y, commonly spoofed) */
export const KNOWN_NAMES: string[] = [
  ALICE_NAME,
  "bob.ctrlz.eth",
  "circle.eth",
  "ens.eth"
];
