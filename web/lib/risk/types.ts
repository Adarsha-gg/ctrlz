export type VerdictTier = "red" | "yellow" | "green";

export type SignalCode =
  | "KNOWN_CONTACT"
  | "ADDRESS_LOOKALIKE"
  | "NAME_LOOKALIKE"
  | "NAME_HOMOGLYPH"
  | "ENS_MISMATCH"
  | "ENS_NAME_YOUNG"
  | "FLAGGED"
  | "FRAUD_RECALLS"
  | "NO_HISTORY"
  | "LIMITED_HISTORY"
  | "ESTABLISHED";

export type Signal = {
  code: SignalCode;
  tier: VerdictTier;
  message: string;
};

export type RiskVerdict = {
  tier: VerdictTier;
  reasons: string[];
  signals: Signal[];
};

export type AddressBookEntry = {
  /** ENS name the sender knows this contact by, e.g. "alice.ctrlz.eth" */
  name: string;
  address: string;
};

/** On-chain counters read from the escrow (P2.5 wires these; optional until then). */
export type RecipientHistory = {
  sealedCount: number;
  distinctSenders: number;
  flagCount: number;
  fraudRecallCount: number;
  firstSeenDaysAgo: number;
};

/** ENS resolution facts (P2.4 wires these; optional until then). */
export type EnsInfo = {
  /** name the recipient claims / resolves to, if any */
  name?: string;
  /** forward(name) == address && reverse(address) == name */
  forwardReverseMatch?: boolean;
  nameAgeDays?: number;
};

export type ScoreInput = {
  /** recipient as pasted/resolved — 0x address */
  address: string;
  /** recipient name as typed, if the user entered a name */
  typedName?: string;
  addressBook: AddressBookEntry[];
  /** well-known names to diff against (beyond the user's own book) */
  knownNames: string[];
  history?: RecipientHistory;
  ens?: EnsInfo;
};
