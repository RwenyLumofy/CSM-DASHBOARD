"use client";

/* =========================================================================
   Today — workspace orchestrator. Initialises the store from the server-built
   snapshot, then renders the header + the categorized operating board, with
   the overlays (account drawer, user profile, Signal page, Ask Signal, create
   action, add task) driven by TodayContext.
   ========================================================================= */

import { useEffect } from "react";
import type { TodaySnapshot } from "@/lib/today/types";
import { initTodayStore, setOwnerFilter, getViewer } from "@/lib/today/repo";
import { track } from "@/lib/today/analytics";
import { TodayProvider, useToday } from "./TodayContext";
import { useToast } from "@/components/clients/projects/shared";
import { TodayHeader } from "./TodayHeader";
import { PortfolioPulse } from "./PortfolioPulse";
import { TopPriorities } from "./TopPriorities";
import { Projects } from "./Projects";
import { FocusAreaBoxes } from "./FocusAreaBoxes";
import { AccountSignalDrawer } from "./AccountSignalDrawer";
import { UserProfileDrawer } from "./UserProfileDrawer";
import { SignalPageDrawer } from "./SignalPageDrawer";
import { AskSignalDrawer } from "./AskSignalDrawer";
import { AddTaskModal } from "./AddTaskModal";

export function TodayWorkspace({ snapshot }: { snapshot: TodaySnapshot }) {
  initTodayStore(snapshot);
  return (
    <TodayProvider>
      <Inner />
    </TodayProvider>
  );
}

function Inner() {
  const { ownerFilter, overlay, closeOverlays } = useToday();
  const { show, node: toast } = useToast();

  useEffect(() => { track("today_viewed", {}); }, []);

  // Apply the admin owner drill-in (header CSM picker) before the board reads.
  setOwnerFilter(ownerFilter);

  const drillToPriorities = () => document.getElementById("top-priorities")?.scrollIntoView({ behavior: "smooth", block: "start" });

  // One composition for every scope — scope only changes what the modules
  // resolve (data) and the headline summary, never the grid.
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 p-4 sm:p-6 lg:p-8">
      {/* Row 1 — header */}
      <TodayHeader />

      {/* Row 2 — pulse strip (full content width) */}
      <PortfolioPulse onDrill={drillToPriorities} />

      {/* Row 3 — primary operating area: Focus now (8) + agenda rail (4).
          Tablet/mobile: Focus now full width, Your day drops below it. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
        <div className="min-w-0 lg:col-span-8">
          <TopPriorities id="top-priorities" />
        </div>
        <div className="min-w-0 lg:col-span-4">
          <Projects />
        </div>
      </div>

      {/* Row 4 — focus areas (where manual work is organised) */}
      <FocusAreaBoxes />

      {overlay.account && <AccountSignalDrawer accountId={overlay.account.id} initialTab={overlay.account.tab} onClose={closeOverlays} />}
      {overlay.user && <UserProfileDrawer userId={overlay.user} onClose={closeOverlays} />}
      {overlay.page && <SignalPageDrawer pageId={overlay.page} onClose={closeOverlays} />}
      {overlay.askSignal && <AskSignalDrawer prefill={overlay.askSignal.prefill} onClose={closeOverlays} />}
      {overlay.addTask && <AddTaskModal prefill={overlay.addTask} onClose={closeOverlays} onCreated={(title) => show(`Task created — ${title}`, "ok")} />}
      {toast}
    </div>
  );
}
