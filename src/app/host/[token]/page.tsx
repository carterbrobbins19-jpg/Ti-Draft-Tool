import { Suspense } from "react";
import { ClaimScreen } from "@/components/claim-screen";
import { LoadingScreen } from "@/components/ui";

export default function Page() {
  return (
    <Suspense fallback={<LoadingScreen label="Restoring host controls" />}>
      <ClaimScreen kind="host" />
    </Suspense>
  );
}
