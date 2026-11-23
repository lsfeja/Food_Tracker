import { NavBar } from "../../components/NavBar";
import { SheetScroll } from "../../components/Sheet";
import { EmptyState } from "../../components/ui";
import { FlowLeading } from "../add/flow";

export default function LabelScreen({ barcode }: { barcode: string | null }) {
  return (
    <>
      <NavBar inSheet title="Label Photo" leading={<FlowLeading />} />
      <SheetScroll>
        <EmptyState title="Label photos are coming next." message={barcode ?? undefined} />
      </SheetScroll>
    </>
  );
}
