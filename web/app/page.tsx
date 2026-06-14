import CtrlZConsole from "./CtrlZConsole";
import { ctrlzEscrowAddress } from "@/lib/contract";

export default function Home() {
  return <CtrlZConsole escrowAddress={ctrlzEscrowAddress} />;
}
