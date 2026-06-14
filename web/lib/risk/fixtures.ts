/**
 * Demo fixtures (P2.1): the sender's address book + well-known names, and the
 * PLANTED POISONED LOOKALIKE demo beat 1 pastes. Keep alice's address in sync
 * with the seed script (P1.11, contracts lane) — the seeded history and this
 * book must describe the same alice.
 */

import type { AddressBookEntry } from "./types";

/** alice — trusted seller with seeded sealed history on Hedera */
export const ALICE_ADDRESS = "0x3695f9A1A29b66ddbA90cD9069c65921C17b480C";
export const ALICE_NAME = "alice.ctrlz.eth";

/**
 * The attack: vanity-generated to match alice's visible prefix + suffix
 * (0x3695f9…7480C) with a different middle — what a poisoner plants in your
 * tx history hoping you copy it.
 */
export const POISONED_LOOKALIKE = "0x3695f9000000000000000000000000000007480C";

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
