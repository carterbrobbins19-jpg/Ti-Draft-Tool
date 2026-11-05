import { GalaxyMap } from "@/components/galaxy-map";
import { Header, Shell } from "@/components/ui";
import { sampleSeats } from "@/lib/galaxy";

export default function Page() {
  return (
    <Shell wide>
      <Header detail="Sample galaxy with all six positions filled" />
      <GalaxyMap seats={sampleSeats()} />
    </Shell>
  );
}
