"use client";

import { useState } from "react";
import { LabeledSelect } from "@/components/prospects/labeled-select";
import { LostReasonDialog } from "@/components/prospects/lost-reason-dialog";
import { LOST_REASON_LABELS, STAGE_LABELS, toItems } from "@/components/prospects/labels";
import { useAction } from "@/components/common/use-action";
import { cn } from "@/lib/utils";
import { moveStage } from "@/server/actions/prospects";
import type { LostReason, Prospect, ProspectStage } from "@/lib/types";

const ITEMS = toItems(STAGE_LABELS);
/** The happy path, in order. Lost sits outside it. */
const PATH: ProspectStage[] = ["new", "contacted", "proposal_sent", "waiting_for_client", "negotiating", "won"];

/** Visual only: how far along the pipeline this prospect is. */
function Pipeline({ stage }: { stage: ProspectStage }) {
  const index = PATH.indexOf(stage);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-1" aria-hidden="true">
        {PATH.map((s, i) => (
          <span
            key={s}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors duration-300",
              stage === "lost" ? "bg-destructive/25" : i <= index ? (stage === "won" ? "bg-success" : "bg-primary") : "bg-muted",
            )}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {stage === "lost" ? "Closed as lost" : `Step ${index + 1} of ${PATH.length}: ${STAGE_LABELS[stage]}`}
      </p>
    </div>
  );
}

export function StageControl({ prospect }: { prospect: Prospect }) {
  const { pending, execute } = useAction();
  const [askLost, setAskLost] = useState(false);

  function change(stage: ProspectStage, reason: LostReason | null) {
    execute(() => moveStage(prospect.id, stage, reason), { success: "Stage updated" });
  }

  return (
    <div className="flex flex-col gap-3">
      <Pipeline stage={prospect.stage} />
      <LabeledSelect
        aria-label="Stage"
        className="w-full"
        value={prospect.stage}
        items={ITEMS}
        disabled={pending}
        onValueChange={(v) => {
          const stage = v as ProspectStage;
          if (stage === prospect.stage) return;
          if (stage === "lost") setAskLost(true);
          else change(stage, null);
        }}
      />
      {prospect.stage === "lost" && prospect.lostReason ? (
        <p className="text-sm text-muted-foreground">Lost reason: {LOST_REASON_LABELS[prospect.lostReason]}</p>
      ) : null}
      <LostReasonDialog
        open={askLost}
        name={prospect.name}
        pending={pending}
        onCancel={() => setAskLost(false)}
        onConfirm={(reason) => {
          setAskLost(false);
          change("lost", reason);
        }}
      />
    </div>
  );
}
