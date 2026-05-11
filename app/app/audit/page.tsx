import { Card } from "@/components/ui/Card";

/**
 * /app/audit — empty-state stub. Periodic decision audit (Fm/D7) is
 * post-MVP. Linked from MobileBottomNav and DesktopSidebar.
 */
export default function AuditPage() {
  return (
    <main className="px-5 py-8 lg:px-8 lg:py-10 max-w-2xl mx-auto">
      <h1 className="text-[20px] font-bold text-text mb-4">Audit</h1>
      <Card className="text-center py-10 px-6">
        <p className="text-[16px] font-medium text-text mb-2">
          Periodic decision audits will live here.
        </p>
        <p className="text-[14px] text-mute leading-relaxed max-w-md mx-auto">
          Each shipped decision will surface here for a quarterly review —
          mark <span className="text-ok font-medium">keep</span> or{" "}
          <span className="text-red-700 font-medium">retire</span> based on
          how the call held up. Post-MVP.
        </p>
      </Card>
    </main>
  );
}
