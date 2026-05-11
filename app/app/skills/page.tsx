import { Card } from "@/components/ui/Card";

/**
 * /app/skills — empty-state stub. Real skill catalog lands post-MVP.
 * Linked from MobileBottomNav and DesktopSidebar so the nav doesn't 404.
 */
export default function SkillsPage() {
  return (
    <main className="px-5 py-8 lg:px-8 lg:py-10 max-w-2xl mx-auto">
      <h1 className="text-[20px] font-bold text-text mb-4">Skills</h1>
      <Card className="text-center py-10 px-6">
        <p className="text-[16px] font-medium text-text mb-2">
          Workload-reducer skills will live here.
        </p>
        <p className="text-[14px] text-mute leading-relaxed max-w-md mx-auto">
          The recommendation pyramid attaches a relevant skill to every
          decision. A browsable catalog is post-MVP.
        </p>
      </Card>
    </main>
  );
}
