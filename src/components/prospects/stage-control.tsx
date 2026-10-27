"use client";

import { useState } from "react";
import { LabeledSelect } from "@/components/prospects/labeled-select";
import { LostReasonDialog } from "@/components/prospects/lost-reason-dialog";
import { LOST_REASON_LABELS, STAGE_LABELS, toItems } from "@/components/prospects/labels";
import { useAction } from "@/components/common/use-action";
import { moveStage } from "@/server/actions/prospects";
import type { LostReason, Prospect, ProspectStage } from "@/lib/types";

const ITEMS = toItems(STAGE_LABELS);

export function StageControl({ prospect }: { prospect: Prospect }) {
  const { pending, execute } = useAction();
  const [askLost, setAskLost] = useState(false);

  function change(stage: ProspectStage, reason: LostReason | null) {
    execute(() => moveStage(prospect.id, stage, reason), { success: "Stage updated" });
  }

  return (
    <div className="flex flex-col gap-2">
      <LabeledSelect
        aria-label="Stage"
        className="w-full sm:w-56"
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
