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
import { TeamCoverage } from "./TeamCoverage";
import { SinceYesterday } from "./SinceYesterday";
import { Upcoming } from "./Upcoming";
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
  const { scope, ownerFilter, setOwnerFilter: setOwner, overlay, closeOverlays } = useToday();
  const { show, node: toast } = useToast();

  useEffect(() => { track("today_viewed", {}); }, []);

  // Apply the admin owner drill-in before the board reads.
  setOwnerFilter(ownerFilter);
  const cov = { scope, ownerFilter, onPick: (id: string) => setOwner(id), onClear: () => setOwner(null) };

  const drillToPriorities = () => document.getElementById("top-priorities")?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    // Each scope is its OWN page. My portfolio: personal driver (worklist + agenda
    // rail). My team: coverage workspace. Company: portfolio lens.
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6 lg:p-8">
      <TodayHeader />
      <PortfolioPulse onDrill={drillToPriorities} />

      {scope === "my_portfolio" ? (
        // Do-now (left) beside the agenda + what changed (right).
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)] lg:items-start">
          <TopPriorities id="top-priorities" />
          <div className="flex flex-col gap-4">
            <Upcoming />
            <SinceYesterday />
          </div>
        </div>
      ) : scope === "my_team" ? (
        // Team priorities → the full coverage workspace → what changed.
        <>
          <div className="max-w-3xl"><TopPriorities id="top-priorities" /></div>
          <TeamCoverage {...cov} full />
          <div className="max-w-3xl"><SinceYesterday /></div>
        </>
      ) : (
        // Company: material work → what changed + coverage concentration.
        <>
          <div className="max-w-3xl"><TopPriorities id="top-priorities" /></div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
            <SinceYesterday />
            <TeamCoverage {...cov} />
          </div>
        </>
      )}

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
