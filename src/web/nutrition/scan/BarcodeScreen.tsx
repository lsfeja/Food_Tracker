import { NavBar } from "../../components/NavBar";
import { SheetScroll } from "../../components/Sheet";
import { EmptyState } from "../../components/ui";
import { FlowLeading } from "../add/flow";

export default function BarcodeScreen() {
  return (
    <>
      <NavBar inSheet title="Scan Barcode" leading={<FlowLeading />} />
      <SheetScroll>
        <EmptyState title="Barcode scanning is coming next." />
      </SheetScroll>
    </>
  );
}
