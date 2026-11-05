import { Suspense } from "react";
import { DraftRoom } from "@/components/draft-room";
import { LoadingScreen } from "@/components/ui";

export default function Page() {
  return (
    <Suspense fallback={<LoadingScreen label="Opening the draft" />}>
      <DraftRoom />
    </Suspense>
  );
}
