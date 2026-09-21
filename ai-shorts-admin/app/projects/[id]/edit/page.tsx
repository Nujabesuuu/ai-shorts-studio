import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase";
import ProjectForm from "@/components/ProjectForm";
import { PageHeader } from "@/components/ui";
import type { Project } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .maybeSingle<Project>();

  if (error) throw new Error(error.message);
  if (!data) notFound();

  return (
    <>
      <PageHeader
        backHref={`/projects/${id}`}
        eyebrow="projects · edit"
        title="Редагування проєкту"
        subtitle={<span className="mono text-[12px] text-lo">{id}</span>}
      />
      <ProjectForm project={data} />
    </>
  );
}
